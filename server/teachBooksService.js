const {
  decodeBase64Text,
  parseMarkdownDocument,
  readChapterPathsFromToc,
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
    const [configFile, tocFile, introFile] = await Promise.all([
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

    if (!configFile || !tocFile || !introFile) {
      return null;
    }

    const tocText = decodeBase64Text(tocFile.content);
    const introDocument = parseMarkdownDocument(
      decodeBase64Text(introFile.content)
    );
    const chapters = await this.loadChapters({
      owner,
      repoName,
      branch,
      tocText
    });

    return {
      id: "github:" + owner + "/" + repoName,
      source: "github",
      owner,
      repo: repoName,
      branch,
      title: repoName,
      introduction: {
        title: introDocument.title || "Introduction",
        content: introDocument.content
      },
      chapters: chapters.length > 0 ? chapters : [createFallbackChapter()],
      images: [],
      activeChapterId: null,
      activeItemType: "introduction"
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

  async loadChapters({ owner, repoName, branch, tocText }) {
    const chapterPaths = readChapterPathsFromToc(tocText);
    const chapters = [];

    for (let index = 0; index < chapterPaths.length; index += 1) {
      const chapterPath = chapterPaths[index];
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
        content: chapterDocument.content
      });
    }

    return chapters;
  }
}

function createFallbackChapter() {
  return {
    id: "github-chapter-0",
    title: "Untitled Chapter",
    content: ""
  };
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

module.exports = {
  TeachBooksService
};
