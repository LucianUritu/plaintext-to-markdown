const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { slugifyRepositoryName } = require("./githubClient");
const { PagesUrlResolver } = require("./publishingTargets");
const { RepositoryCollaboratorService } = require("./repositoryCollaboratorService");

class PublishService {
  constructor({
    githubClient,
    rootDirectory,
    pagesUrlResolver = new PagesUrlResolver(),
    collaboratorService = new RepositoryCollaboratorService({ githubClient })
  }) {
    this.githubClient = githubClient;
    this.rootDirectory = rootDirectory;
    this.pagesUrlResolver = pagesUrlResolver;
    this.collaboratorService = collaboratorService;
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
    let collaboratorInvitations = [];
    let publishFiles = files;
    let primaryBranch = "main";

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
        primaryBranch = existingRepository.default_branch || primaryBranch;
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
        primaryBranch = createdRepository.default_branch || primaryBranch;
        collaboratorInvitations =
          await this.collaboratorService.inviteDefaultCollaborators({
            owner: targetOwner,
            repo: targetRepo
          });
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

    if (isVersionBranch(targetBranch)) {
      const existingVersionBranch = await this.githubClient.getBranch({
        owner: targetOwner,
        repo: targetRepo,
        branch: targetBranch
      });

      if (existingVersionBranch) {
        return {
          error:
            "A published version named \"" +
            branchNameToVersionName(targetBranch) +
            "\" already exists.",
          code: "VERSION_EXISTS",
          repository: {
            owner: targetOwner,
            repo: targetRepo,
            branch: targetBranch
          }
        };
      }
    }

    await this.githubClient.ensurePagesSite({
      owner: targetOwner,
      repo: targetRepo
    });

    if (book && isVersionBranch(targetBranch)) {
      primaryBranch = await this.resolvePrimaryBranch({
        owner: targetOwner,
        repo: targetRepo,
        fallbackBranch: primaryBranch
      });

      if (primaryBranch && primaryBranch !== targetBranch) {
        const generator = await this.loadTeachBooksGenerator();
        const primaryFiles = generator.generateTeachBooksFiles(book, {
          owner: targetOwner,
          repo: targetRepo,
          branch: primaryBranch
        });

        await this.githubClient.publishFiles({
          owner: targetOwner,
          repo: targetRepo,
          branch: primaryBranch,
          files: primaryFiles,
          commitMessage: "Update primary TeachBooks preview"
        });
      }
    }

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
    const pagesUrl = this.pagesUrlResolver.resolve({
      owner: targetOwner,
      repo: targetRepo,
      branch: targetBranch
    });
    
    return {
      commitSha: result.commit.sha,
      commitUrl: result.commit.html_url || "",
      workflowDispatched: Boolean(result.noChanges),
      pagesUrl,
      repository: {
        owner: targetOwner,
        repo: targetRepo,
        branch: targetBranch,
        created: Boolean(createdRepository)
      },
      collaboratorInvitations
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

  async resolvePrimaryBranch({ owner, repo, fallbackBranch }) {
    if (typeof this.githubClient.getDefaultBranch === "function") {
      return this.githubClient.getDefaultBranch({ owner, repo });
    }

    return fallbackBranch || "main";
  }
}

module.exports = {
  PublishService
};

function isVersionBranch(branch) {
  return String(branch || "").startsWith("version/");
}

function branchNameToVersionName(branch) {
  return String(branch || "")
    .replace(/^version\//, "")
    .replace(/-/g, " ");
}
