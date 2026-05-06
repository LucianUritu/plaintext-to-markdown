document.addEventListener("DOMContentLoaded", function () {
  const plainTextInput = document.getElementById("plainTextInput");
  const markdownOutput = document.getElementById("markdownOutput");
  const previewOutput = document.getElementById("previewOutput");
  const statusMessage = document.getElementById("status");

  const copyButton = document.getElementById("copyButton");
  const downloadButton = document.getElementById("downloadButton");
  const loadExampleButton = document.getElementById("loadExampleButton");
  const clearButton = document.getElementById("clearButton");

  const imageInput = document.getElementById("imageInput");
  const imageAltInput = document.getElementById("imageAltInput");

  const imagePreviewUrls = {};

  const exampleText = `How to use it

Important notice before you start

This is an early prototype. The platform automatically converts plain text into Markdown. The result may not always be perfect, so always check the Markdown output and the rendered preview before copying or downloading your file.

Main title

The first non-empty line is always used as the main title of the page.

Italic text

To create italic text, wrap the text with one star.

Example:

*text*

Bold text

To create bold text, wrap the text with two stars.

Example:

**text**

Bullet points

To create bullet points, start each line with - or *.

Example:

- First bullet point
- Second bullet point

Numbered lists

To create a numbered list, start each line with 1. or 1).

Example:

1. First item
2. Second item
3. Third item

Alternative example:

1) First item
2) Second item
3) Third item

Quotes

To create a quote, start the line with >.

Example:

> This is a quote.

Images

To add an image, click the Add Image button and choose an image file.

The platform will insert Markdown like this:

![Image description](images/example.png)

Section headings

Short standalone lines are usually detected as section headings.

Paragraphs

Normal sentences are treated as paragraph content.

Final check

Always review the rendered preview before downloading the Markdown file.`;

  plainTextInput.value = exampleText;
  updateOutputs();

  plainTextInput.addEventListener("input", updateOutputs);
  plainTextInput.addEventListener("keydown", handleEditorShortcuts);
  
  copyButton.addEventListener("click", copyMarkdown);
  downloadButton.addEventListener("click", downloadMarkdown);
  loadExampleButton.addEventListener("click", loadExample);
  clearButton.addEventListener("click", clearAll);
  imageInput.addEventListener("change", handleImageInput);

  function updateOutputs() {
    const markdown = plainTextToMarkdown(plainTextInput.value);

    markdownOutput.textContent = markdown;
    previewOutput.innerHTML = markdownToHtml(markdown);
  }

  function plainTextToMarkdown(input) {
    const lines = input
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      });

    const output = [];
    let titleUsed = false;

    for (const line of lines) {
      if (line === "") {
        addEmptyLine(output);
        continue;
      }

      if (isMarkdownImage(line)) {
        output.push(line);
        continue;
      }

      if (!titleUsed) {
        output.push("# " + line);
        titleUsed = true;
        continue;
      }

      if (isBullet(line)) {
        output.push(normalizeBullet(line));
        continue;
      }

      if (isNumbered(line)) {
        output.push(normalizeNumbered(line));
        continue;
      }

      if (isQuote(line)) {
        output.push(normalizeQuote(line));
        continue;
      }

      if (looksLikeHeading(line)) {
        output.push("## " + line);
        continue;
      }

      output.push(line);
    }

    return cleanMarkdown(output);
  }

  function addEmptyLine(output) {
    if (output.length > 0 && output[output.length - 1] !== "") {
      output.push("");
    }
  }

  function normalizeBullet(line) {
    return line.replace(/^[-*•]\s+/, "- ");
  }

  function normalizeNumbered(line) {
    return line.replace(/^(\d+)[.)]\s+/, "$1. ");
  }

  function normalizeQuote(line) {
    if (line.startsWith("> ")) {
      return line;
    }

    return line.replace(/^>/, "> ");
  }

  function cleanMarkdown(output) {
    return output
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isBullet(line) {
    return /^[-*•]\s+/.test(line);
  }

  function isNumbered(line) {
    return /^\d+[.)]\s+/.test(line);
  }

  function isQuote(line) {
    return /^>\s?/.test(line);
  }

  function isMarkdownImage(line) {
    return /^!\[.*\]\(.+\)$/.test(line);
  }

  function looksLikeHeading(line) {
    if (!line) {
      return false;
    }

    if (isBullet(line) || isNumbered(line) || isQuote(line) || isMarkdownImage(line)) {
      return false;
    }

    if (line.endsWith(".") || line.endsWith(",")) {
      return false;
    }

    if (line.length > 80) {
      return false;
    }

    const words = line.split(/\s+/);
    return words.length <= 10;
  }

  function markdownToHtml(markdown) {
    const lines = markdown.split("\n");

    let html = "";
    let inUnorderedList = false;
    let inOrderedList = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line === "") {
        closeLists();
        continue;
      }

      if (line.startsWith("# ")) {
        closeLists();
        html += "<h1>" + renderInlineMarkdown(line.substring(2)) + "</h1>";
        continue;
      }

      if (line.startsWith("## ")) {
        closeLists();
        html += "<h2>" + renderInlineMarkdown(line.substring(3)) + "</h2>";
        continue;
      }

      if (isMarkdownImage(line)) {
        closeLists();
        html += renderMarkdownImage(line);
        continue;
      }

      if (line.startsWith("- ")) {
        if (!inUnorderedList) {
          closeOrderedList();
          html += "<ul>";
          inUnorderedList = true;
        }

        html += "<li>" + renderInlineMarkdown(line.substring(2)) + "</li>";
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        if (!inOrderedList) {
          closeUnorderedList();
          html += "<ol>";
          inOrderedList = true;
        }

        html += "<li>" + renderInlineMarkdown(line.replace(/^\d+\.\s+/, "")) + "</li>";
        continue;
      }

      if (line.startsWith("> ")) {
        closeLists();
        html += "<blockquote>" + renderInlineMarkdown(line.substring(2)) + "</blockquote>";
        continue;
      }

      closeLists();
      html += "<p>" + renderInlineMarkdown(line) + "</p>";
    }

    closeLists();
    return html;

    function closeLists() {
      closeUnorderedList();
      closeOrderedList();
    }

    function closeUnorderedList() {
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }
    }

    function closeOrderedList() {
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
    }
  }

  function renderInlineMarkdown(text) {
    let safeText = escapeHtml(text);

    safeText = safeText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safeText = safeText.replace(/\*(.+?)\*/g, "<em>$1</em>");

    return safeText;
  }

  function renderMarkdownImage(line) {
    const match = line.match(/^!\[(.*)\]\((.+)\)$/);

    if (!match) {
      return "<p>" + escapeHtml(line) + "</p>";
    }

    const altText = match[1];
    const markdownPath = match[2];
    const previewUrl = imagePreviewUrls[markdownPath] || markdownPath;

    return (
      "<figure>" +
      '<img src="' + escapeAttribute(previewUrl) + '" alt="' + escapeAttribute(altText) + '">' +
      "<figcaption>" + renderInlineMarkdown(altText) + "</figcaption>" +
      "</figure>"
    );
  }

  function handleImageInput(event) {
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

  function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);

    textarea.value = before + text + after;

    const newCursorPosition = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(newCursorPosition, newCursorPosition);
  }

  function makeSafeFileName(fileName) {
    return fileName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "");
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(text) {
    return escapeHtml(text).replace(/`/g, "&#096;");
  }

  async function copyMarkdown() {
    const markdown = markdownOutput.textContent;

    try {
      await navigator.clipboard.writeText(markdown);
      showStatus("Markdown copied to clipboard.");
    } catch (error) {
      showStatus("Copy failed. You can select the Markdown text and copy it manually.");
    }
  }

  function downloadMarkdown() {
    const markdown = markdownOutput.textContent;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "chapter.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    showStatus("Markdown file downloaded.");
  }

  function loadExample() {
    plainTextInput.value = exampleText;
    updateOutputs();
    showStatus("Example loaded.");
  }

  function clearAll() {
    plainTextInput.value = "";
    updateOutputs();
    showStatus("Editor cleared.");
  }

  function showStatus(message) {
    statusMessage.textContent = message;

    setTimeout(function () {
      statusMessage.textContent = "";
    }, 2500);
  }

  function handleEditorShortcuts(event) {
  const isModifierPressed = event.ctrlKey || event.metaKey;

  if (!isModifierPressed) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "b") {
    event.preventDefault();
    wrapSelectionWithMarkdown("**");
  }

  if (key === "i") {
    event.preventDefault();
    wrapSelectionWithMarkdown("*");
  }
}

function wrapSelectionWithMarkdown(marker) {
  const start = plainTextInput.selectionStart;
  const end = plainTextInput.selectionEnd;

  const selectedText = plainTextInput.value.substring(start, end);
  const before = plainTextInput.value.substring(0, start);
  const after = plainTextInput.value.substring(end);

  const insertedText = marker + selectedText + marker;

  plainTextInput.value = before + insertedText + after;

  if (selectedText.length === 0) {
    const cursorPosition = start + marker.length;
    plainTextInput.setSelectionRange(cursorPosition, cursorPosition);
  } else {
    const selectionStart = start + marker.length;
    const selectionEnd = selectionStart + selectedText.length;
    plainTextInput.setSelectionRange(selectionStart, selectionEnd);
  }

  plainTextInput.focus();
  updateOutputs();
}
});