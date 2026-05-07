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
    wrapSelectionWithMarkdown(textarea, "**", updateOutputs);
  }

  if (key === "i") {
    event.preventDefault();
    wrapSelectionWithMarkdown(textarea, "*", updateOutputs);
  }
}

function wrapSelectionWithMarkdown(textarea, marker, updateOutputs) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  const selectedText = textarea.value.substring(start, end);
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);

  const insertedText = marker + selectedText + marker;

  textarea.value = before + insertedText + after;

  if (selectedText.length === 0) {
    const cursorPosition = start + marker.length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  } else {
    const selectionStart = start + marker.length;
    const selectionEnd = selectionStart + selectedText.length;
    textarea.setSelectionRange(selectionStart, selectionEnd);
  }

  textarea.focus();
  updateOutputs();
}