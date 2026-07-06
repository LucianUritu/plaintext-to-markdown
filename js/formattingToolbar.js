export function setupFormattingToolbar(options) {
  const { toolbar, textarea, updateOutputs } = options;

  toolbar.addEventListener("click", function (event) {
    const button = event.target.closest("[data-format]");

    if (!button) {
      return;
    }

    applyFormatting(textarea, button.dataset.format);
    updateOutputs();
  });
}

export function applyFormatting(textarea, format) {
  if (format === "bold") {
    wrapSelection(textarea, "**", "bold text");
  } else if (format === "italic") {
    wrapSelection(textarea, "*", "italic text");
  } else if (format === "link") {
    insertLink(textarea);
  } else {
    const prefixes = {
      heading: "## ",
      bullet: "- ",
      numbered: "1. ",
      quote: "> "
    };

    if (prefixes[format]) {
      prefixSelectedLines(textarea, prefixes[format], format === "numbered");
    }
  }

  textarea.focus();
}

function wrapSelection(textarea, marker, placeholder) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || placeholder;
  const replacement = marker + selected + marker;

  replaceRange(textarea, start, end, replacement);
  textarea.setSelectionRange(start + marker.length, start + marker.length + selected.length);
}

function insertLink(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || "link text";
  const replacement = "[" + selected + "](https://example.com)";

  replaceRange(textarea, start, end, replacement);
  textarea.setSelectionRange(start + 1, start + 1 + selected.length);
}

function prefixSelectedLines(textarea, prefix, numbered) {
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  const lineStart = textarea.value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextLineBreak = textarea.value.indexOf("\n", selectionEnd);
  const lineEnd = nextLineBreak === -1 ? textarea.value.length : nextLineBreak;
  const selectedLines = textarea.value.slice(lineStart, lineEnd).split("\n");
  const replacement = selectedLines
    .map(function (line, index) {
      return (numbered ? index + 1 + ". " : prefix) + line;
    })
    .join("\n");

  replaceRange(textarea, lineStart, lineEnd, replacement);
  textarea.setSelectionRange(lineStart, lineStart + replacement.length);
}

function replaceRange(textarea, start, end, replacement) {
  textarea.value =
    textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
}
