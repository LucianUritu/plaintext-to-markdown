const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { slugifyRepositoryName } = require("./githubClient");

class PublishService {
  constructor({ githubClient, rootDirectory }) {
    this.githubClient = githubClient;
    this.rootDirectory = rootDirectory;
    this.generatorPromise = null;
  }

  async publishBook({
    owner,
    repo,
    branch,
    files,
    book,
    bookTitle,
    commitMessage,
    overwriteExistingRepository,
    repositoryVisibility
  }) {
    let targetOwner = owner;
    let targetRepo = repo;
    let targetBranch = branch;
    let createdRepository = null;
    let publishFiles = files;

    if (!targetOwner || !targetRepo) {
      const currentUser = await this.githubClient.getCurrentUser();

      if (!currentUser.ok) {
        throw new Error("Could not read GitHub user.");
      }

      const repositoryName = slugifyRepositoryName(bookTitle || "book");
      const existingRepository = await this.githubClient.getRepository({
        owner: currentUser.user.login,
        repo: repositoryName
      });

      if (existingRepository && !overwriteExistingRepository) {
        return {
          error: "A repository named " + repositoryName + " already exists.",
          code: "REPOSITORY_EXISTS",
          repository: {
            owner: currentUser.user.login,
            repo: repositoryName,
            branch: existingRepository.default_branch || targetBranch
          }
        };
      }

      if (existingRepository) {
        targetOwner = currentUser.user.login;
        targetRepo = repositoryName;
        targetBranch = existingRepository.default_branch || targetBranch;
      } else {
        createdRepository = await this.githubClient.createRepository({
          name: repositoryName,
          isPrivate: repositoryVisibility === "private"
        });

        if (createdRepository.exists) {
          return {
            error: "A repository named " + repositoryName + " already exists.",
            code: "REPOSITORY_EXISTS",
            repository: {
              owner: currentUser.user.login,
              repo: repositoryName,
              branch: targetBranch
            }
          };
        }

        targetOwner = createdRepository.owner.login;
        targetRepo = createdRepository.name;
        targetBranch = createdRepository.default_branch || targetBranch;
      }
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

    await this.githubClient.ensurePagesSite({
      owner: targetOwner,
      repo: targetRepo
    });

    const result = await this.githubClient.publishFiles({
      owner: targetOwner,
      repo: targetRepo,
      branch: targetBranch,
      files: publishFiles,
      commitMessage
    });

    if (result.noChanges) {
      await this.githubClient.dispatchWorkflow({
        owner: targetOwner,
        repo: targetRepo,
        branch: targetBranch,
        workflowFileName: "call-deploy-book.yml"
      });
    }

    return {
      commitSha: result.commit.sha,
      commitUrl: result.commit.html_url || "",
      workflowDispatched: Boolean(result.noChanges),
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
