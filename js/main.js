import { getEditorElements, showStatus } from "./editor.js";
import { exampleText } from "./examples.js";
import { copyMarkdown, downloadMarkdown } from "./fileActions.js";
import { setupImageHandler } from "./imageHandler.js";
import { plainTextToMarkdown } from "./markdownConverter.js";
import { markdownToHtml } from "./markdownRenderer.js";
import { setupEditorShortcuts } from "./shortcuts.js";

document.addEventListener("DOMContentLoaded", function () {
  const elements = getEditorElements();
  const imagePreviewUrls = {};

  function updateOutputs() {
    const markdown = plainTextToMarkdown(elements.plainTextInput.value);

    elements.markdownOutput.textContent = markdown;
    elements.previewOutput.innerHTML = markdownToHtml(markdown, imagePreviewUrls);
  }

  function setStatus(message) {
    showStatus(elements.statusMessage, message);
  }

  elements.plainTextInput.value = exampleText;
  updateOutputs();

  elements.plainTextInput.addEventListener("input", updateOutputs);

  setupEditorShortcuts({
    textarea: elements.plainTextInput,
    updateOutputs
  });

  setupImageHandler({
    imageInput: elements.imageInput,
    imageAltInput: elements.imageAltInput,
    plainTextInput: elements.plainTextInput,
    imagePreviewUrls,
    updateOutputs,
    showStatus: setStatus
  });

  elements.copyButton.addEventListener("click", function () {
    copyMarkdown(elements.markdownOutput.textContent, setStatus);
  });

  elements.downloadButton.addEventListener("click", function () {
    downloadMarkdown(elements.markdownOutput.textContent, setStatus);
  });

  elements.loadExampleButton.addEventListener("click", function () {
    elements.plainTextInput.value = exampleText;
    updateOutputs();
    setStatus("Example loaded.");
  });

  elements.clearButton.addEventListener("click", function () {
    elements.plainTextInput.value = "";
    updateOutputs();
    setStatus("Editor cleared.");
  });
});