export function getEditorElements() {
  return {
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

export function showStatus(statusElement, message, duration = 2500) {
  statusElement.textContent = message;

  setTimeout(function () {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, duration);
}