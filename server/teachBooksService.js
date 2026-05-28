const {
  decodeBase64Text,
  parseMarkdownDocument,
  readChapterPathsFromToc,
  readYamlTitle
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

    const configText = decodeBase64Text(configFile.content);
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
      title: readYamlTitle(configText) || repoName,
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
    const branch = repo.default_branch || "main";

    if (!owner || !repoName) {
      return null;
    }

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

    if (requiredFiles.some(function (file) { return !file; })) {
      return null;
    }

    const configText = decodeBase64Text(requiredFiles[0].content);
    const title = readYamlTitle(configText) || repoName;

    return {
      id: owner + "/" + repoName,
      owner,
      repo: repoName,
      title,
      branch,
      private: Boolean(repo.private),
      updatedAt: repo.updated_at,
      repoUrl: repo.html_url,
      pagesUrl: "https://" + owner + ".github.io/" + repoName + "/"
    };
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

module.exports = {
  TeachBooksService
};
