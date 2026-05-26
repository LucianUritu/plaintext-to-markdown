import { insertTextAtCursor, makeSafeFileName } from "./utils.js";

export function setupImageHandler(options) {
  const {
    imageInput,
    imageAltInput,
    plainTextInput,
    imagePreviewUrls,
    saveImage,
    createImagePath,
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
      saveImage,
      createImagePath,
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
    saveImage,
    createImagePath,
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
  const markdownPath =
    typeof createImagePath === "function"
      ? createImagePath(safeFileName)
      : "images/" + safeFileName;

  if (!markdownPath) {
    showStatus("Could not create a safe image filename.");
    return;
  }

  readFileAsDataUrl(file)
    .then(function (dataUrl) {
      imagePreviewUrls[markdownPath] = dataUrl;

      if (typeof saveImage === "function") {
        saveImage({
          path: markdownPath,
          name: markdownPath.split("/").pop(),
          type: file.type,
          dataUrl
        });
      }

      const altText =
        imageAltInput.value.trim() || file.name.replace(/\.[^/.]+$/, "");

      const imageMarkdown = "![" + altText + "](" + markdownPath + ")";

      insertTextAtCursor(plainTextInput, "\n\n" + imageMarkdown + "\n\n");

      imageInput.value = "";
      imageAltInput.value = "";

      updateOutputs();
      showStatus("Image inserted into Markdown and saved with this book.");
    })
    .catch(function () {
      showStatus("Could not read the selected image.");
    });
}

function readFileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.addEventListener("load", function () {
      resolve(reader.result);
    });

    reader.addEventListener("error", function () {
      reject(reader.error);
    });

    reader.readAsDataURL(file);
  });
}
