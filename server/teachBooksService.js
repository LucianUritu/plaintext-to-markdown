const {
  decodeBase64Text,
  parseBibTexReferences,
  parseMarkdownDocument,
  readChapterEntriesFromToc,
  readChapterPathsFromToc,
  readRootPathFromToc,
  stripGeneratedBibliographyContent,
} = require("./teachBooksParser");

class TeachBooksService {
  constructor(githubClient) {
    this.githubClient = githubClient;
  }

  async listBooks() {
    const repos = await this.githubClient.fetchRepos();

    if (!Array.isArray(repos)) {
      return null;
    }

    const books = [];

    for (const repo of repos) {
      const book = await this.detectRepository(repo);

      if (book) {
        books.push(book);
      }
    }

    return books;
  }

  async loadBook({ owner, repoName, branch }) {
    const [configFile, tocFile] = await Promise.all([
      this.githubClient.fetchRepositoryFile({
        owner,
        repo: repoName,
        branch,
        path: "book/_config.yml"
      }),
      this.githubClient.fetchRepositoryFile({
        owner,
        repo: repoName,
        branch,
        path: "book/_toc.yml"
      })
    ]);

    if (!configFile || !tocFile) {
      return null;
    }

    const tocText = decodeBase64Text(tocFile.content);
    const rootPath = readRootPathFromToc(tocText);
    const introFile = await this.githubClient.fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/" + rootPath
    });

    if (!introFile) {
      return null;
    }

    const introDocument = parseMarkdownDocument(
      decodeBase64Text(introFile.content)
    );
    const chapterEntries = readChapterEntriesFromToc(tocText);
    const bibliographyEntry = chapterEntries.find(isBibliographyEntry);
    const contentChapterEntries = chapterEntries.filter(function (entry) {
      return entry !== bibliographyEntry;
    });
    const [bibliographyFile, referencesFile] = await Promise.all([
      bibliographyEntry
        ? this.githubClient.fetchRepositoryFile({
            owner,
            repo: repoName,
            branch,
            path: "book/" + bibliographyEntry.path
          })
        : null,
      this.githubClient.fetchRepositoryFile({
        owner,
        repo: repoName,
        branch,
        path: "book/references.bib"
      })
    ]);
    const bibliographyDocument = bibliographyFile
      ? parseMarkdownDocument(decodeBase64Text(bibliographyFile.content))
      : null;
    const bibliography = bibliographyDocument || referencesFile
      ? {
          id: "github-bibliography",
          title: (bibliographyDocument && bibliographyDocument.title) || "Bibliography",
          content: bibliographyDocument
            ? stripGeneratedBibliographyContent(bibliographyDocument.content)
            : "",
          references: referencesFile
            ? parseBibTexReferences(decodeBase64Text(referencesFile.content))
            : []
        }
      : null;
    const hideIntroductionCard =
      contentChapterEntries.length > 0 &&
      !isIntroductionTitle(introDocument.title);
    const chapters = await this.loadChapters({
      owner,
      repoName,
      branch,
      entries: contentChapterEntries
    });
    const images = await this.loadImages({
      owner,
      repoName,
      branch,
      sections: [
        {
          content: introDocument.content
        },
        ...chapters
      ]
    });

    return {
      id: "github:" + owner + "/" + repoName,
      source: "github",
      owner,
      repo: repoName,
      branch,
      title: repoName,
      hideIntroductionCard,
      teachBooksToc: {
        text: tocText
      },
      introduction: {
        title: introDocument.title || "Introduction",
        content: introDocument.content,
        sourcePath: rootPath
      },
      chapters: chapters.length > 0 ? chapters : [createFallbackChapter()],
      bibliography,
      images,
      activeChapterId: null,
      activeItemType: hideIntroductionCard ? "chapter" : "introduction"
    };
  }

  async detectRepository(repo) {
    const owner = repo.owner && repo.owner.login;
    const repoName = repo.name;
    const defaultBranch = repo.default_branch || "main";

    if (!owner || !repoName) {
      return null;
    }

    const latestVersionBranch = await this.findLatestVersionBranch({
      owner,
      repoName
    });
    const branchCandidates = uniqueBranches([latestVersionBranch, defaultBranch]);
    const branch = await this.findTeachBooksBranch({
      owner,
      repoName,
      branches: branchCandidates
    });

    if (!branch) {
      return null;
    }

    return {
      id: owner + "/" + repoName,
      owner,
      repo: repoName,
      title: repoName,
      branch,
      private: Boolean(repo.private),
      updatedAt: repo.updated_at,
      repoUrl: repo.html_url,
      pagesUrl: createPagesUrl({ owner, repoName, branch })
    };
  }

  async findTeachBooksBranch({ owner, repoName, branches }) {
    for (const branch of branches) {
      const requiredFiles = await Promise.all([
        this.githubClient.fetchRepositoryFile({
          owner,
          repo: repoName,
          branch,
          path: "book/_config.yml"
        }),
        this.githubClient.fetchRepositoryFile({
          owner,
          repo: repoName,
          branch,
          path: "book/_toc.yml"
        }),
        this.githubClient.fetchRepositoryFile({
          owner,
          repo: repoName,
          branch,
          path: "book/intro.md"
        })
      ]);

      if (requiredFiles.every(Boolean)) {
        return branch;
      }
    }

    return "";
  }

  async findLatestVersionBranch({ owner, repoName }) {
    let branches = [];

    try {
      branches = await this.githubClient.listBranches({
        owner,
        repo: repoName,
        prefix: "version/",
        perPage: 100
      });
    } catch (error) {
      return "";
    }

    if (!branches.length) {
      return "";
    }

    const branchesWithDates = await Promise.all(
      branches.map(async (branch) => {
        try {
          const commit = await this.githubClient.getCommitBySha({
            owner,
            repo: repoName,
            sha: branch.commitSha
          });
          const committedAt =
            commit &&
            commit.commit &&
            commit.commit.author &&
            commit.commit.author.date;

          return {
            name: branch.name,
            committedAt: committedAt || ""
          };
        } catch (error) {
          return {
            name: branch.name,
            committedAt: ""
          };
        }
      })
    );

    branchesWithDates.sort(function (a, b) {
      if (a.committedAt && b.committedAt) {
        return b.committedAt.localeCompare(a.committedAt);
      }

      return b.name.localeCompare(a.name);
    });

    return branchesWithDates[0].name;
  }

  async loadChapters({ owner, repoName, branch, tocText, entries }) {
    const chapterEntries = entries || readChapterPathsFromToc(tocText).map(
      function (path) {
        return {
          caption: "",
          path
        };
      }
    );
    const chapters = [];

    for (let index = 0; index < chapterEntries.length; index += 1) {
      const chapterEntry = chapterEntries[index];
      const chapterPath = chapterEntry.path;
      const chapterFile = await this.githubClient.fetchRepositoryFile({
        owner,
        repo: repoName,
        branch,
        path: "book/" + chapterPath
      });

      if (!chapterFile) {
        continue;
      }

      const chapterDocument = parseMarkdownDocument(
        decodeBase64Text(chapterFile.content)
      );

      chapters.push({
        id: "github-chapter-" + index,
        title: chapterDocument.title || "Chapter " + (index + 1),
        content: chapterDocument.content,
        sourcePath: chapterPath,
        tocCaption: chapterEntry.caption || ""
      });
    }

    return chapters;
  }

  async loadImages({ owner, repoName, branch, sections }) {
    const imagePaths = collectLocalImagePaths(sections);
    const images = [];

    for (const imagePath of imagePaths) {
      const imageFile = await this.githubClient.fetchRepositoryFile({
        owner,
        repo: repoName,
        branch,
        path: "book/" + imagePath
      });

      if (!imageFile || !imageFile.content) {
        continue;
      }

      images.push({
        path: imagePath,
        name: imagePath.split("/").pop(),
        type: inferImageMimeType(imagePath),
        dataUrl:
          "data:" +
          inferImageMimeType(imagePath) +
          ";base64," +
          String(imageFile.content || "").replace(/\s/g, "")
      });
    }

    return images;
  }
}

function createFallbackChapter() {
  return {
    id: "github-chapter-0",
    title: "Untitled Chapter",
    content: ""
  };
}

function isIntroductionTitle(title) {
  return String(title || "").trim().toLowerCase() === "introduction";
}

function isBibliographyEntry(entry) {
  return Boolean(entry) && (
    /(^|\/)bibliography\.md$/i.test(entry.path) ||
    /^references$/i.test(String(entry.caption || "").trim())
  );
}

function uniqueBranches(branches) {
  return Array.from(
    new Set(
      branches.filter(function (branch) {
        return Boolean(branch);
      })
    )
  );
}

function createPagesUrl({ owner, repoName, branch }) {
  const baseUrl = "https://" + owner + ".github.io/" + repoName + "/";

  if (String(branch || "").startsWith("version/")) {
    return baseUrl + branch.replace(/\//g, "-") + "/";
  }

  return baseUrl;
}

function collectLocalImagePaths(sections) {
  const imagePaths = new Set();

  sections.forEach(function (section) {
    const content = String((section && section.content) || "");
    const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match = imagePattern.exec(content);

    while (match) {
      const imagePath = normalizeLocalImagePath(match[1]);

      if (imagePath) {
        imagePaths.add(imagePath);
      }

      match = imagePattern.exec(content);
    }
  });

  return Array.from(imagePaths);
}

function normalizeLocalImagePath(path) {
  const normalizedPath = String(path || "").replace(/\\/g, "/").trim();

  if (
    !normalizedPath ||
    /^(https?:|data:image\/)/i.test(normalizedPath) ||
    normalizedPath.startsWith("/") ||
    normalizedPath.includes("../")
  ) {
    return "";
  }

  return normalizedPath.replace(/^book\//, "").replace(/^chapters\//, "");
}

function inferImageMimeType(path) {
  const extension = String(path || "").split(".").pop().toLowerCase();
  const mimeTypes = {
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp"
  };

  return mimeTypes[extension] || "image/png";
}

module.exports = {
  TeachBooksService
};
