const path = require("node:path");
const { pathToFileURL } = require("node:url");

class PublishService {
  constructor({ githubClient, rootDirectory }) {
    this.githubClient = githubClient;
    this.rootDirectory = rootDirectory;
    this.generatorPromise = null;
  }

  async publishBook({ owner, repo, branch, files, book, bookTitle, commitMessage }) {
    let targetOwner = owner;
    let targetRepo = repo;
    let targetBranch = branch;
    let createdRepository = null;
    let publishFiles = files;

    if (!targetOwner || !targetRepo) {
      createdRepository = await this.githubClient.createRepository({
        title: bookTitle
      });

      targetOwner = createdRepository.owner.login;
      targetRepo = createdRepository.name;
      targetBranch = createdRepository.default_branch || targetBranch;
    }

    if (book) {
      const generator = await this.loadTeachBooksGenerator();
      publishFiles = generator.generateTeachBooksFiles(book, {
        owner: targetOwner,
        repo: targetRepo,
        branch: targetBranch
      });
    }

    if (!Array.isArray(publishFiles) || publishFiles.length === 0) {
      return {
        error: "No files were provided for publishing."
      };
    }

    const result = await this.githubClient.publishFiles({
      owner: targetOwner,
      repo: targetRepo,
      branch: targetBranch,
      files: publishFiles,
      commitMessage
    });

    return {
      commitSha: result.commit.sha,
      commitUrl: result.commit.html_url || "",
      pagesUrl: "https://" + targetOwner + ".github.io/" + targetRepo + "/",
      repository: {
        owner: targetOwner,
        repo: targetRepo,
        branch: targetBranch,
        created: Boolean(createdRepository)
      }
    };
  }

  loadTeachBooksGenerator() {
    if (!this.generatorPromise) {
      const generatorUrl = pathToFileURL(
        path.join(this.rootDirectory, "js", "teachbooksGenerator.js")
      ).href;

      this.generatorPromise = import(generatorUrl);
    }

    return this.generatorPromise;
  }
}

module.exports = {
  PublishService
};
