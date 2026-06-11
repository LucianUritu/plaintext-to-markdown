import { loadVersionHistory } from "./versionManager.js";
import { escapeHtml } from "./utils.js";

export class VersionHistoryPanel {

  constructor({ elements, getCurrentBook }) {
    this.elements = elements;
    this.getCurrentBook = getCurrentBook;
    this.isLoading = false;

    this.elements.refreshVersionHistoryButton.addEventListener("click", () => {
      this.load();
    });
  }

  show() {
    this.elements.versionHistoryPanel.classList.remove("hidden");
    this.load();
  }

  hide() {
    this.elements.versionHistoryPanel.classList.add("hidden");
  }

  async load() {
    if (this.isLoading) return;

    const book = this.getCurrentBook();
    const { owner, repo } = resolveOwnerRepo(book);

    if (!owner || !repo) {
      this.renderEmpty("Open a GitHub-linked book to see its version history.");
      return;
    }

    this.isLoading = true;
    this.renderLoading();

    try {
      const versions = await loadVersionHistory({ owner, repo });
      this.renderVersions(versions, owner, repo);
    } catch (error) {
      this.renderError(error.message || "Could not load version history.");
    } finally {
      this.isLoading = false;
    }
  }

  renderLoading() {
    this.elements.versionHistoryError.classList.add("hidden");
    this.elements.versionHistoryList.innerHTML =
      '<p class="version-history-message">Loading published versions...</p>';
  }

  renderEmpty(message) {
    this.elements.versionHistoryError.classList.add("hidden");
    this.elements.versionHistoryList.innerHTML =
      '<p class="version-history-message">' + escapeHtml(message) + "</p>";
  }

  renderError(message) {
    this.elements.versionHistoryList.innerHTML = "";
    this.elements.versionHistoryError.textContent = message;
    this.elements.versionHistoryError.classList.remove("hidden");
  }

  renderVersions(versions, owner, repo) {
    this.elements.versionHistoryError.classList.add("hidden");

    if (versions.length === 0) {
      this.renderEmpty(
        "No published versions yet. Publish a version to see it here."
      );
      return;
    }

    this.elements.versionHistoryList.innerHTML = "";

    versions.forEach((entry, index) => {
      const card = this.buildVersionCard(entry, index === 0);
      this.elements.versionHistoryList.appendChild(card);
    });
  }
  
  buildVersionCard(entry, isLatest) {
    const card = document.createElement("article");
    card.className = "version-card" + (isLatest ? " version-card--latest" : "");

    const formattedDate = entry.committedAt
      ? formatDate(entry.committedAt)
      : "Date unknown";

    const shortSha = entry.commitSha
      ? entry.commitSha.slice(0, 7)
      : "";

    card.innerHTML =
      '<div class="version-card__header">' +
        '<span class="version-card__label">' +
          escapeHtml(entry.version) +
          (isLatest
            ? ' <span class="version-card__badge">Latest</span>'
            : "") +
        "</span>" +
        '<span class="version-card__date">' +
          escapeHtml(formattedDate) +
        "</span>" +
      "</div>" +
      '<div class="version-card__meta">' +
        '<span class="version-card__branch">' +
          escapeHtml(entry.branch) +
        "</span>" +
        (shortSha
          ? ' <span class="version-card__sha">' + escapeHtml(shortSha) + "</span>"
          : "") +
      "</div>" +
      '<div class="version-card__actions">' +
        '<a class="version-card__open" href="' +
          escapeHtml(entry.pagesUrl) +
          '" target="_blank" rel="noopener noreferrer">Open published version</a>' +
      "</div>";

    return card;
  }
}

function resolveOwnerRepo(book) {
  if (!book) return { owner: "", repo: "" };

  if (book.owner && book.repo) {
    return { owner: book.owner, repo: book.repo };
  }

  if (
    book.githubRepository &&
    book.githubRepository.owner &&
    book.githubRepository.repo
  ) {
    return {
      owner: book.githubRepository.owner,
      repo: book.githubRepository.repo
    };
  }

  return { owner: "", repo: "" };
}

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return isoString;
  }
}
