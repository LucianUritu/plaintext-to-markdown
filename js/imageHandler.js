import { insertTextAtCursor, makeSafeFileName } from "./utils.js";

export function setupImageHandler(options) {
  const {
    imageInput,
    imageAltInput,
    plainTextInput,
    imagePreviewUrls,
    updateOutputs,
    showStatus
  } = options;

  imageInput.addEventListener("change", function (event) {
    handleImageInput({
      event,
      imageInput,
      imageAltInput,
      plainTextInput,
      imagePreviewUrls,
      updateOutputs,
      showStatus
    });
  });
}

function handleImageInput(options) {
  const {
    event,
    imageInput,
    imageAltInput,
    plainTextInput,
    imagePreviewUrls,
    updateOutputs,
    showStatus
  } = options;

  const file = event.target.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    showStatus("Please select an image file.");
    return;
  }

  const safeFileName = makeSafeFileName(file.name);
  const markdownPath = "images/" + safeFileName;
  const previewUrl = URL.createObjectURL(file);

  imagePreviewUrls[markdownPath] = previewUrl;

  const altText =
    imageAltInput.value.trim() || file.name.replace(/\.[^/.]+$/, "");

  const imageMarkdown = "![" + altText + "](" + markdownPath + ")";

  insertTextAtCursor(plainTextInput, "\n\n" + imageMarkdown + "\n\n");

  imageInput.value = "";
  imageAltInput.value = "";

  updateOutputs();
  showStatus("Image inserted into Markdown.");
}