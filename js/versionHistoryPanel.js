import { loadVersionHistory } from "./versionManager.js";
import { escapeHtml } from "./utils.js";

export class VersionHistoryPanel {

  constructor({
    elements,
    getCurrentBook,
    onUseVersion = function () {},
    setStatus = function () {}
  }) {
    this.elements = elements;
    this.getCurrentBook = getCurrentBook;
    this.onUseVersion = onUseVersion;
    this.setStatus = setStatus;
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
      this.renderVersions(versions);
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

  renderVersions(versions) {
    this.elements.versionHistoryError.classList.add("hidden");

    if (versions.length === 0) {
      this.renderEmpty("No published versions yet. Publish a version to save a shareable snapshot.");
      return;
    }

    this.elements.versionHistoryList.innerHTML = "";

    versions.forEach((entry, index) => {
      const card = this.buildVersionCard(entry, {
        isLatest: index === 0,
        isActive: entry.branch === resolveActiveBranch(this.getCurrentBook())
      });
      this.elements.versionHistoryList.appendChild(card);
    });
  }
  
  buildVersionCard(entry, { isLatest, isActive }) {
    const card = document.createElement("article");
    card.className =
      "version-card" +
      (isLatest ? " version-card--latest" : "") +
      (isActive ? " version-card--active" : "");

    const formattedDate = entry.committedAt
      ? formatDate(entry.committedAt)
      : "Publication date unknown";

    const shortSha = entry.commitSha
      ? entry.commitSha.slice(0, 7)
      : "";

    card.innerHTML =
      '<div class="version-card__header">' +
        '<div>' +
          '<h3 class="version-card__label">' +
          escapeHtml(entry.version) +
          "</h3>" +
          '<p class="version-card__date">Published ' +
            escapeHtml(formattedDate) +
          "</p>" +
        "</div>" +
        '<div class="version-card__badges">' +
          (isActive
            ? '<span class="version-card__badge version-card__badge--active">Editing</span>'
            : "") +
          (isLatest
            ? '<span class="version-card__badge">Latest</span>'
            : "") +
        "</div>" +
      "</div>" +
      '<div class="version-card__actions">' +
        '<a class="version-card__open" href="' +
          escapeHtml(entry.pagesUrl) +
          '" target="_blank" rel="noopener noreferrer">Open</a>' +
        (isActive
          ? '<button class="version-card__use secondary" type="button" disabled>Editing</button>'
          : '<button class="version-card__use secondary" type="button">Use for editing</button>') +
        '<button class="version-card__copy secondary" type="button">Copy link</button>' +
      "</div>" +
      '<details class="version-card__details">' +
        "<summary>Technical details</summary>" +
        '<dl class="version-card__meta">' +
          "<div>" +
            "<dt>Branch</dt>" +
            "<dd>" + escapeHtml(entry.branch) + "</dd>" +
          "</div>" +
          (shortSha
            ? "<div><dt>Commit</dt><dd>" + escapeHtml(shortSha) + "</dd></div>"
            : "") +
        "</dl>" +
      "</details>";

    card
      .querySelector(".version-card__copy")
      .addEventListener("click", () => {
        this.copyVersionLink(entry.pagesUrl);
      });

    const useButton = card.querySelector(".version-card__use");

    if (useButton && !isActive) {
      useButton.addEventListener("click", () => {
        this.onUseVersion(entry);
      });
    }

    return card;
  }

  async copyVersionLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      this.setStatus("Published version link copied.");
    } catch (error) {
      this.setStatus("Could not copy the link automatically.");
    }
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

function resolveActiveBranch(book) {
  if (!book) return "";

  if (book.source === "github" && book.branch) {
    return book.branch;
  }

  if (book.githubRepository && book.githubRepository.branch) {
    return book.githubRepository.branch;
  }

  return "";
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
