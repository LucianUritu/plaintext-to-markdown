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
  const value = textarea.value;

  if (
    start >= marker.length &&
    value.slice(start - marker.length, start) === marker &&
    value.slice(end, end + marker.length) === marker
  ) {
    const selected = value.slice(start, end);

    replaceRange(textarea, end, end + marker.length, "");
    replaceRange(textarea, start - marker.length, start, "");
    textarea.setSelectionRange(start - marker.length, end - marker.length);
    return;
  }

  if (
    end - start >= marker.length * 2 &&
    value.slice(start, start + marker.length) === marker &&
    value.slice(end - marker.length, end) === marker
  ) {
    const selected = value.slice(start + marker.length, end - marker.length);

    replaceRange(textarea, start, end, selected);
    textarea.setSelectionRange(start, start + selected.length);
    return;
  }

  const selected = value.slice(start, end) || placeholder;
  const replacement = marker + selected + marker;

  replaceRange(textarea, start, end, replacement);
  textarea.setSelectionRange(start + marker.length, start + marker.length + selected.length);
}

function insertLink(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selectedText = value.slice(start, end);
  const selectedLinkMatch = selectedText.match(/^\[([^\]]+)\]\([^)]+\)$/);

  if (selectedLinkMatch) {
    replaceRange(textarea, start, end, selectedLinkMatch[1]);
    textarea.setSelectionRange(start, start + selectedLinkMatch[1].length);
    return;
  }

  const surroundingLink = findSurroundingLink(value, start, end);

  if (surroundingLink) {
    replaceRange(textarea, surroundingLink.start, surroundingLink.end, surroundingLink.text);
    textarea.setSelectionRange(surroundingLink.start, surroundingLink.start + surroundingLink.text.length);
    return;
  }

  const selected = selectedText || "link text";
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
  const shouldRemove = selectedLines.every(function (line) {
    return numbered ? /^\d+[.)]\s+/.test(line) : line.startsWith(prefix);
  });
  const replacement = shouldRemove
    ? selectedLines
        .map(function (line) {
          return numbered
            ? line.replace(/^\d+[.)]\s+/, "")
            : line.slice(prefix.length);
        })
        .join("\n")
    : selectedLines
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

function findSurroundingLink(value, start, end) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextLineBreak = value.indexOf("\n", end);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const line = value.slice(lineStart, lineEnd);
  const linkPattern = /\[([^\]]+)\]\([^)]+\)/g;
  let match;

  while ((match = linkPattern.exec(line)) !== null) {
    const matchStart = lineStart + match.index;
    const matchEnd = matchStart + match[0].length;
    const textStart = matchStart + 1;
    const textEnd = textStart + match[1].length;

    if (start >= textStart && end <= textEnd) {
      return {
        start: matchStart,
        end: matchEnd,
        text: match[1]
      };
    }
  }

  return null;
}
