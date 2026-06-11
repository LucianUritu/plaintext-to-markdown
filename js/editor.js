export function getEditorElements() {
  return {
    homeView: document.getElementById("homeView"),
    bookView: document.getElementById("bookView"),
    editorView: document.getElementById("editorView"),

    githubAuthPanel: document.getElementById("githubAuthPanel"),
    githubAuthSummary: document.getElementById("githubAuthSummary"),
    githubLoginButton: document.getElementById("githubLoginButton"),
    githubLogoutButton: document.getElementById("githubLogoutButton"),
    githubBooksPanel: document.getElementById("githubBooksPanel"),
    githubBooksList: document.getElementById("githubBooksList"),
    refreshGithubBooksButton: document.getElementById("refreshGithubBooksButton"),

    closeBookButton: document.getElementById("closeBookButton"),
    newBookButton: document.getElementById("newBookButton"),
    addChapterButton: document.getElementById("addChapterButton"),
    removeChapterButton: document.getElementById("removeChapterButton"),
    publishPreviewButton: document.getElementById("publishPreviewButton"),
    backToBookButton: document.getElementById("backToBookButton"),

    bookTitleInput: document.getElementById("bookTitleInput"),
    chapterList: document.getElementById("chapterList"),
    chapterTitleInput: document.getElementById("chapterTitleInput"),

    plainTextInput: document.getElementById("plainTextInput"),
    markdownOutput: document.getElementById("markdownOutput"),
    previewOutput: document.getElementById("previewOutput"),
    statusMessage: document.getElementById("status"),

    copyButton: document.getElementById("copyButton"),
    downloadButton: document.getElementById("downloadButton"),
    loadExampleButton: document.getElementById("loadExampleButton"),
    clearButton: document.getElementById("clearButton"),

    imageInput: document.getElementById("imageInput"),
    imageAltInput: document.getElementById("imageAltInput"),

    publishResult: document.getElementById("publishResult"),
    publishResultMessage: document.getElementById("publishResultMessage"),
    publishProgressPanel: document.getElementById("publishProgressPanel"),
    publishStepRepository: document.getElementById("publishStepRepository"),
    publishStepPages: document.getElementById("publishStepPages"),
    publishStepUpload: document.getElementById("publishStepUpload"),
    publishStepAction: document.getElementById("publishStepAction"),
    publishStepPublished: document.getElementById("publishStepPublished"),
    publishMessagePanel: document.getElementById("publishMessagePanel"),
    publishMessageTitle: document.getElementById("publishMessageTitle"),
    publishMessageWhat: document.getElementById("publishMessageWhat"),
    publishMessageNext: document.getElementById("publishMessageNext"),
    publishMessageDetails: document.getElementById("publishMessageDetails"),
    publishMessageTechnical: document.getElementById("publishMessageTechnical"),
    publishMessageClose: document.getElementById("publishMessageClose"),
    publishedUrlInput: document.getElementById("publishedUrlInput"),
    copyPublishedUrlButton: document.getElementById("copyPublishedUrlButton"),
    openPublishedUrlLink: document.getElementById("openPublishedUrlLink"),

    choiceModalBackdrop: document.getElementById("choiceModalBackdrop"),
    choiceModal: document.getElementById("choiceModal"),
    choiceModalTitle: document.getElementById("choiceModalTitle"),
    choiceModalMessage: document.getElementById("choiceModalMessage"),
    choiceModalActions: document.getElementById("choiceModalActions"),
    choiceModalCloseButton: document.getElementById("choiceModalCloseButton"),
    versionPickerBackdrop: document.getElementById("versionPickerBackdrop"),
    versionPickerModal: document.getElementById("versionPickerModal"),
    versionPickerInput: document.getElementById("versionPickerInput"),
    versionPickerError: document.getElementById("versionPickerError"),
    versionPickerConfirm: document.getElementById("versionPickerConfirm"),
    versionPickerCancel: document.getElementById("versionPickerCancel"),
    versionPickerClose: document.getElementById("versionPickerClose"),
    versionPickerPreview: document.getElementById("versionPickerPreview"),

    versionHistoryPanel: document.getElementById("versionHistoryPanel"),
    versionHistoryList: document.getElementById("versionHistoryList"),
    refreshVersionHistoryButton: document.getElementById("refreshVersionHistoryButton"),
    versionHistoryError: document.getElementById("versionHistoryError")
  };
}

export function showView(viewToShow, allViews) {
  for (const view of allViews) {
    view.classList.add("hidden");
  }

  viewToShow.classList.remove("hidden");
}

export function showStatus(statusElement, message, duration = 4000) {
  statusElement.textContent = message;

  if (duration <= 0) {
    return;
  }

  setTimeout(function () {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, duration);
}
