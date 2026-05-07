export async function copyMarkdown(markdown, showStatus) {
  try {
    await navigator.clipboard.writeText(markdown);
    showStatus("Markdown copied to clipboard.");
  } catch (error) {
    showStatus("Copy failed. You can select the Markdown text and copy it manually.");
  }
}

export function downloadMarkdown(markdown, showStatus, filename = "chapter.md") {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
  showStatus("Markdown file downloaded.");
}