import { applyFormatting } from "./formattingToolbar.js";

export function setupEditorShortcuts(options) {
  const { textarea, updateOutputs } = options;

  textarea.addEventListener("keydown", function (event) {
    handleEditorShortcuts({
      event,
      textarea,
      updateOutputs
    });
  });
}

function handleEditorShortcuts(options) {
  const { event, textarea, updateOutputs } = options;

  const isModifierPressed = event.ctrlKey || event.metaKey;

  if (!isModifierPressed) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "b") {
    event.preventDefault();
    applyFormatting(textarea, "bold");
    updateOutputs();
  }

  if (key === "i") {
    event.preventDefault();
    applyFormatting(textarea, "italic");
    updateOutputs();
  }
}
