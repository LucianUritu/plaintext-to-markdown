export function formatPublishError(error) {
  const message = String((error && error.message) || "");
  const status = error && error.status;
  const workflowRun = error && error.workflowRun;

  if (workflowRun) {
    return formatWorkflowFailure(workflowRun);
  }

  if (status === 401 || /sign in|bad credentials|unauthorized/i.test(message)) {
    return buildMessage({
      title: "GitHub is not connected.",
      whatHappened:
        "The app could not publish because the GitHub session is missing or expired.",
      nextStep:
        "Sign in with GitHub again, then press Publish Book Preview one more time.",
      technical: message
    });
  }

  if (
    status === 403 ||
    /resource not accessible|workflow|scope|permission|forbidden/i.test(message)
  ) {
    return buildMessage({
      title: "GitHub needs one more permission.",
      whatHappened:
        "GitHub blocked the publish request. This usually happens when the login session does not include repository workflow permission.",
      nextStep:
        "Sign out of GitHub in the app, sign in again, and approve the requested permissions.",
      technical: message
    });
  }

  if (/could not create github repository/i.test(message)) {
    return buildMessage({
      title: "The repository could not be created.",
      whatHappened:
        "GitHub did not create the new book repository. The name may be unavailable, or the GitHub account may not allow repository creation right now.",
      nextStep:
        "Try a slightly different book title. If that still fails, sign in with GitHub again.",
      technical: message
    });
  }

  if (/could not enable github pages|could not read github pages/i.test(message)) {
    return buildMessage({
      title: "GitHub Pages could not be enabled.",
      whatHappened:
        "The files may have uploaded, but GitHub did not accept the request to turn on Pages for this repository.",
      nextStep:
        "Wait a minute and publish again. If it keeps happening, open the repository settings and check that Pages is allowed.",
      technical: message
    });
  }

  if (/could not create git tree|could not upload image blob|could not create git commit|could not update github branch/i.test(message)) {
    return buildMessage({
      title: "The book files could not be uploaded.",
      whatHappened:
        "GitHub rejected one of the file upload steps before the book build started.",
      nextStep:
        "Publish again. If the message mentions workflows or permissions, sign out and sign back in with GitHub first.",
      technical: message
    });
  }

  if (/could not start github actions workflow/i.test(message)) {
    return buildMessage({
      title: "The GitHub Action did not start.",
      whatHappened:
        "The book files were uploaded, but GitHub did not start the build workflow.",
      nextStep:
        "Publish again. If it still does not start, open the repository Actions tab and check that Actions are enabled.",
      technical: message
    });
  }

  if (/timed out waiting for github actions/i.test(message)) {
    return buildMessage({
      title: "The build is taking longer than expected.",
      whatHappened:
        "The book files were uploaded, but GitHub Actions did not finish within the waiting time.",
      nextStep:
        "Open the repository Actions tab to check whether the build is still running, then refresh the published page when it finishes.",
      technical: message
    });
  }

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return buildMessage({
      title: "The app could not reach the server.",
      whatHappened:
        "The browser lost contact with the local app server while publishing.",
      nextStep:
        "Make sure the local server is still running, then try publishing again.",
      technical: message
    });
  }

  return buildMessage({
    title: "Publishing stopped.",
    whatHappened:
      "Something unexpected happened before the book could be published.",
    nextStep:
      "Try publishing again. If it happens again, use the technical details below to debug the exact GitHub response.",
    technical: message
  });
}

function formatWorkflowFailure(workflowRun) {
  const actionLink = workflowRun.htmlUrl
    ? "\n\nGitHub Actions run:\n" + workflowRun.htmlUrl
    : "";

  return buildMessage({
    title: "The book build failed.",
    whatHappened:
      "The files were uploaded to GitHub, but GitHub Actions could not build the TeachBooks preview.",
    nextStep:
      "Open the GitHub Actions run and read the failed step. It usually points to a broken page, invalid book configuration, or a TeachBooks build error.",
    technical:
      "GitHub Actions conclusion: " +
      (workflowRun.conclusion || "failure") +
      actionLink
  });
}

function buildMessage({ title, whatHappened, nextStep, technical }) {
  const sections = [
    title,
    "",
    "What happened:",
    whatHappened,
    "",
    "What to do next:",
    nextStep
  ];

  if (technical) {
    sections.push("", "Technical details:", trimTechnicalDetails(technical));
  }

  return sections.join("\n");
}

function trimTechnicalDetails(details) {
  const maxLength = 900;
  const text = String(details || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength) + "...";
}
