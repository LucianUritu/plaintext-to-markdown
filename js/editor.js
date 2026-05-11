export function getEditorElements() {
  return {
    homeView: document.getElementById("homeView"),
    bookView: document.getElementById("bookView"),
    editorView: document.getElementById("editorView"),

    closeBookButton: document.getElementById("closeBookButton"),
    newBookButton: document.getElementById("newBookButton"),
    addChapterButton: document.getElementById("addChapterButton"),
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
    imageAltInput: document.getElementById("imageAltInput")
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

  setTimeout(function () {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, duration);
}