import { isMarkdownImage } from "./markdownConverter.js";
import { escapeAttribute, escapeHtml } from "./utils.js";

export function markdownToHtml(markdown, imagePreviewUrls = {}) {
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
      html += renderMarkdownImage(line, imagePreviewUrls);
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

  safeText = safeText.replace(
    /\{cite\}`([a-z0-9._:-]+)`/gi,
    '<span class="citation-preview" title="Citation: $1">[$1]</span>'
  );
  safeText = safeText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  safeText = safeText.replace(/\*(.+?)\*/g, "<em>$1</em>");

  return safeText;
}

function renderMarkdownImage(line, imagePreviewUrls) {
  const match = line.match(/^!\[(.*)\]\((.+)\)$/);

  if (!match) {
    return "<p>" + escapeHtml(line) + "</p>";
  }

  const altText = match[1];
  const markdownPath = match[2];
  const previewUrl = imagePreviewUrls[markdownPath] || markdownPath;

  return (
    "<figure>" +
    '<img src="' +
    escapeAttribute(previewUrl) +
    '" alt="' +
    escapeAttribute(altText) +
    '">' +
    "<figcaption>" +
    renderInlineMarkdown(altText) +
    "</figcaption>" +
    "</figure>"
  );
}
