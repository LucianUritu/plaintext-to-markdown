import {
  loadGitHubAuthState,
  loadGitHubBook,
  loadGitHubBooks,
  logoutFromGitHub
} from "./githubApi.js";
import { saveBook } from "./bookStorage.js";
import { escapeHtml } from "./utils.js";

export class GitHubBooksController {
  constructor({
    elements,
    clearImagePreviewUrls,
    renderBookView,
    setCurrentBook,
    setEditorInactive,
    setStatus
  }) {
    this.elements = elements;
    this.clearImagePreviewUrls = clearImagePreviewUrls;
    this.renderBookView = renderBookView;
    this.setCurrentBook = setCurrentBook;
    this.setEditorInactive = setEditorInactive;
    this.setStatus = setStatus;
    this.isOpeningBook = false;
  }

  async loadAuthState() {
    try {
      const authState = await loadGitHubAuthState();
      this.renderAuthState(authState);
    } catch (error) {
      this.elements.githubAuthSummary.textContent =
        "Run the Node server to enable GitHub login.";
      this.elements.githubLoginButton.classList.add("hidden");
      this.elements.githubLogoutButton.classList.add("hidden");
    }
  }

  renderAuthState(authState) {
    if (!authState.authenticated) {
      this.elements.githubAuthSummary.textContent = "GitHub not connected";
      this.elements.githubLoginButton.classList.remove("hidden");
      this.elements.githubLogoutButton.classList.add("hidden");
      this.elements.githubBooksPanel.classList.add("hidden");
      this.elements.githubBooksList.innerHTML = "";
      return;
    }

    const displayName = authState.name || authState.login;

    this.elements.githubAuthSummary.textContent = "Signed in as " + displayName;
    this.elements.githubLoginButton.classList.add("hidden");
    this.elements.githubLogoutButton.classList.remove("hidden");
    this.elements.githubBooksPanel.classList.remove("hidden");
    this.loadBooks();
  }

  async loadBooks() {
    this.elements.githubBooksList.innerHTML =
      '<p class="github-books-message">Scanning GitHub repositories...</p>';

    try {
      const result = await loadGitHubBooks();
      this.renderBooks(result.books || []);
    } catch (error) {
      if (this.handleExpiredSession(error)) {
        return;
      }

      this.elements.githubBooksList.innerHTML =
        '<p class="github-books-message">Could not load GitHub books.</p>';
    }
  }

  async openBook(book) {
    if (this.isOpeningBook) {
      return;
    }

    this.isOpeningBook = true;
    this.setBookActionsDisabled(true);
    this.setStatus("Opening " + book.title + " from GitHub...");

    try {
      const result = await loadGitHubBook(book);
      const currentBook = result.book;

      this.setCurrentBook(currentBook);
      saveBook(currentBook);
      this.setEditorInactive();
      this.clearImagePreviewUrls();
      this.renderBookView();
      this.setStatus("Opened " + currentBook.title + " from GitHub.");
    } catch (error) {
      if (this.handleExpiredSession(error)) {
        return;
      }

      this.setStatus("Could not open GitHub book.");
    } finally {
      this.isOpeningBook = false;
      this.setBookActionsDisabled(false);
    }
  }

  renderBooks(books) {
    if (books.length === 0) {
      this.elements.githubBooksList.innerHTML =
        '<p class="github-books-message">No TeachBooks repositories found yet.</p>';
      return;
    }

    this.elements.githubBooksList.innerHTML = "";

    books.forEach((book) => {
      const bookCard = document.createElement("article");
      bookCard.className = "github-book-card";

      const updatedDate = book.updatedAt
        ? new Date(book.updatedAt).toLocaleDateString()
        : "Unknown";

      bookCard.innerHTML =
        "<div>" +
        "<h3>" +
        escapeHtml(book.title) +
        "</h3>" +
        "<p>" +
        escapeHtml(book.owner + "/" + book.repo) +
        " - " +
        escapeHtml(book.private ? "Private" : "Public") +
        " - Updated " +
        escapeHtml(updatedDate) +
        "</p>" +
        "</div>" +
        '<div class="github-book-actions">' +
        '<button type="button" data-action="edit-github-book">Edit</button>' +
        '<a href="' +
        escapeHtml(book.repoUrl) +
        '" target="_blank" rel="noopener noreferrer">Repo</a>' +
        '<a href="' +
        escapeHtml(book.pagesUrl) +
        '" target="_blank" rel="noopener noreferrer">Published</a>' +
        "</div>";

      bookCard
        .querySelector('[data-action="edit-github-book"]')
        .addEventListener("click", () => {
          this.openBook(book);
        });

      this.elements.githubBooksList.appendChild(bookCard);
    });
  }

  async logout() {
    try {
      await logoutFromGitHub();

      this.renderAuthState({
        authenticated: false
      });

      this.setStatus("Signed out of GitHub.");
    } catch (error) {
      this.setStatus("Could not sign out of GitHub.");
    }
  }

  handleExpiredSession(error) {
    if (!error || error.status !== 401) {
      return false;
    }

    this.renderAuthState({
      authenticated: false
    });
    this.setStatus("GitHub session expired. Please sign in again.");
    return true;
  }

  setBookActionsDisabled(isDisabled) {
    this.elements.githubBooksList
      .querySelectorAll('[data-action="edit-github-book"]')
      .forEach(function (button) {
        button.disabled = isDisabled;
      });
  }
}
