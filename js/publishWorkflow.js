import {
  loadPublishWorkflowStatus,
  publishBookPreview
} from "./githubApi.js";

export class PublishWorkflow {
  constructor({
    elements,
    getCurrentBook,
    getPublishTarget,
    rememberPublishConnection,
    saveActiveEditorContent,
    askChoice,
    publishProgress,
    setStatus,
    showPublishResult
  }) {
    this.elements = elements;
    this.getCurrentBook = getCurrentBook;
    this.getPublishTarget = getPublishTarget;
    this.rememberPublishConnection = rememberPublishConnection;
    this.saveActiveEditorContent = saveActiveEditorContent;
    this.askChoice = askChoice;
    this.publishProgress = publishProgress;
    this.setStatus = setStatus;
    this.showPublishResult = showPublishResult;
  }

  async publish() {
    this.saveActiveEditorContent();

    const currentBook = this.getCurrentBook();

    if (!currentBook) {
      this.setStatus("Create a book first.");
      return;
    }

    const publishTarget = this.getPublishTarget();
    let activeProgressStep = "repository";
    this.publishProgress.reset();
    this.publishProgress.activate(activeProgressStep);

    const repositoryVisibility = await this.chooseRepositoryVisibility(publishTarget);

    if (!repositoryVisibility) {
      this.publishProgress.hide();
      this.setStatus("Publish cancelled.");
      return;
    }

    try {
      this.setPublishBusy(true, "Uploading...");
      this.elements.publishResult.classList.add("hidden");
      this.setStatus("Uploading TeachBooks files to GitHub...", 0);
      this.publishProgress.complete("repository");
      activeProgressStep = "pages";
      this.publishProgress.activate(activeProgressStep);
      this.publishProgress.activate("upload");

      const result = await this.createPublish(
        currentBook,
        publishTarget,
        false,
        repositoryVisibility
      );

      this.rememberPublishConnection(result.repository);
      this.publishProgress.complete("pages");
      this.publishProgress.complete("upload");
      activeProgressStep = "action";
      this.publishProgress.activate(activeProgressStep);
      this.setPublishBusy(true, "Building...");
      this.setStatus("Files uploaded. Waiting for GitHub Actions to finish...", 0);

      const workflowRun = await this.waitForPublishWorkflow(result);

      if (workflowRun.conclusion !== "success") {
        throw new Error(createFailedWorkflowMessage(workflowRun));
      }

      this.publishProgress.complete("action");
      this.publishProgress.complete("published");
      this.showPublishResult(
        result.pagesUrl,
        "Files updated successfully. The real TeachBooks book preview is ready."
      );
    } catch (error) {
      if (error.code === "REPOSITORY_EXISTS") {
        await this.handleRepositoryExists(
          error,
          currentBook,
          publishTarget,
          repositoryVisibility
        );
        return;
      }

      console.error(error);
      this.publishProgress.fail(activeProgressStep);
      this.setStatus("Publish failed.");
      alert(error.message);
    } finally {
      this.setPublishBusy(false);
    }
  }

  async handleRepositoryExists(
    error,
    currentBook,
    publishTarget,
    repositoryVisibility
  ) {
    const repository = error.repository;
    const repositoryName = repository
      ? repository.owner + "/" + repository.repo
      : "that repository";
    const overwriteChoice = await this.askChoice({
      title: "Repository Exists",
      message:
        repositoryName +
        " already exists. Do you want to overwrite it with this book preview?",
      choices: [
        {
          label: "Overwrite",
          value: "overwrite"
        },
        {
          label: "Cancel",
          value: null,
          variant: "secondary"
        }
      ]
    });

    if (overwriteChoice !== "overwrite") {
      this.publishProgress.hide();
      this.setStatus("Publish cancelled.");
      return;
    }

    let activeProgressStep = "repository";

    try {
      this.setPublishBusy(true, "Uploading...");
      this.setStatus("Overwriting existing GitHub repository...", 0);
      this.publishProgress.complete("repository");
      activeProgressStep = "pages";
      this.publishProgress.activate(activeProgressStep);
      this.publishProgress.activate("upload");

      const result = await this.createPublish(
        currentBook,
        publishTarget,
        true,
        repositoryVisibility
      );

      this.rememberPublishConnection(result.repository);
      this.publishProgress.complete("pages");
      this.publishProgress.complete("upload");
      activeProgressStep = "action";
      this.publishProgress.activate(activeProgressStep);
      this.setPublishBusy(true, "Building...");
      this.setStatus("Files uploaded. Waiting for GitHub Actions to finish...", 0);

      const workflowRun = await this.waitForPublishWorkflow(result);

      if (workflowRun.conclusion !== "success") {
        throw new Error(createFailedWorkflowMessage(workflowRun));
      }

      this.publishProgress.complete("action");
      this.publishProgress.complete("published");
      this.showPublishResult(
        result.pagesUrl,
        "Files updated successfully. The real TeachBooks book preview is ready."
      );
    } catch (overwriteError) {
      console.error(overwriteError);
      this.publishProgress.fail(activeProgressStep);
      this.setStatus("Publish failed.");
      alert(overwriteError.message);
    } finally {
      this.setPublishBusy(false);
    }
  }

  async chooseRepositoryVisibility(publishTarget) {
    if (publishTarget.owner || publishTarget.repo) {
      return "existing";
    }

    return this.askChoice({
      title: "Create Repository",
      message: "Choose who can see the new GitHub repository for this book.",
      choices: [
        {
          label: "Private",
          value: "private"
        },
        {
          label: "Public",
          value: "public",
          variant: "secondary"
        }
      ]
    });
  }

  createPublish(
    currentBook,
    publishTarget,
    overwriteExistingRepository,
    repositoryVisibility
  ) {
    return publishBookPreview({
      owner: publishTarget.owner,
      repo: publishTarget.repo,
      branch: publishTarget.branch,
      bookTitle: currentBook.title,
      book: currentBook,
      commitMessage: "Update real TeachBooks preview",
      overwriteExistingRepository,
      repositoryVisibility
    });
  }

  setPublishBusy(isBusy, label) {
    this.elements.publishPreviewButton.disabled = isBusy;
    this.elements.publishPreviewButton.classList.toggle("is-loading", isBusy);
    this.elements.publishPreviewButton.textContent = isBusy
      ? label || "Publishing..."
      : "Publish Book Preview";
  }

  async waitForPublishWorkflow(publishResult) {
    const maxAttempts = 80;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const workflowRun = await loadPublishWorkflowStatus(publishResult);

      if (!workflowRun.found) {
        this.setStatus("Files uploaded. Waiting for GitHub Actions to start...", 0);
      } else if (workflowRun.status === "completed") {
        return workflowRun;
      } else {
        this.setStatus(
          "GitHub Actions is " + formatWorkflowStatus(workflowRun.status) + "...",
          0
        );
      }

      await delay(5000);
    }

    throw new Error("Timed out waiting for GitHub Actions to finish.");
  }
}

function createFailedWorkflowMessage(workflowRun) {
  const actionLink = workflowRun.htmlUrl
    ? "\n\nOpen the GitHub Actions run: " + workflowRun.htmlUrl
    : "";

  return (
    "GitHub Actions finished with conclusion: " +
    workflowRun.conclusion +
    "." +
    actionLink
  );
}

function formatWorkflowStatus(status) {
  if (status === "in_progress") {
    return "in progress";
  }

  return status || "starting";
}

function delay(milliseconds) {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}
