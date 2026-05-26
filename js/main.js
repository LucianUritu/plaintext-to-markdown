import {
  addChapter,
  createNewBook,
  findChapterById,
  loadBook,
  removeChapter,
  setActiveChapter,
  setActiveIntroduction,
  updateBookTitle,
  updateChapterContent,
  updateChapterTitle,
  updateIntroductionContent,
  updateIntroductionTitle,
  upsertBookImage
} from "./bookStorage.js";

import {
  getEditorElements,
  showStatus,
  showView
} from "./editor.js";

import { exampleText } from "./examples.js";
import { copyMarkdown, downloadMarkdown } from "./fileActions.js";
import { setupImageHandler } from "./imageHandler.js";
import { plainTextToMarkdown } from "./markdownConverter.js";
import { markdownToHtml } from "./markdownRenderer.js";
import { setupEditorShortcuts } from "./shortcuts.js";
import { escapeHtml } from "./utils.js";
import { generateTeachBooksFiles } from "./teachbooksGenerator.js";
import { publishFilesToGitHub } from "./githubPublisher.js";

document.addEventListener("DOMContentLoaded", function () {
  const elements = getEditorElements();
  const imagePreviewUrls = {};

  let currentBook = loadBook();
  let activeChapter = null;
  let activeEditorType = null;

  const views = [
    elements.homeView,
    elements.bookView,
    elements.editorView
  ];

  function setStatus(message) {
    showStatus(elements.statusMessage, message);
  }

  async function loadGitHubAuthState() {
    try {
      const response = await fetch("/api/me");

      if (!response.ok) {
        throw new Error("GitHub auth is not available.");
      }

      const authState = await response.json();
      renderGitHubAuthState(authState);
    } catch (error) {
      elements.githubAuthSummary.textContent =
        "Run the Node server to enable GitHub login.";
      elements.githubLoginButton.classList.add("hidden");
      elements.githubLogoutButton.classList.add("hidden");
    }
  }

  function renderGitHubAuthState(authState) {
    if (!authState.authenticated) {
      elements.githubAuthSummary.textContent = "GitHub not connected";
      elements.githubLoginButton.classList.remove("hidden");
      elements.githubLogoutButton.classList.add("hidden");
      elements.githubBooksPanel.classList.add("hidden");
      elements.githubBooksList.innerHTML = "";
      return;
    }

    const displayName = authState.name || authState.login;

    elements.githubAuthSummary.textContent = "Signed in as " + displayName;
    elements.githubLoginButton.classList.add("hidden");
    elements.githubLogoutButton.classList.remove("hidden");
    elements.githubBooksPanel.classList.remove("hidden");
    loadGitHubBooks();
  }

  async function loadGitHubBooks() {
    elements.githubBooksList.innerHTML =
      '<p class="github-books-message">Scanning GitHub repositories...</p>';

    try {
      const response = await fetch("/api/books");

      if (!response.ok) {
        throw new Error("Could not load GitHub books.");
      }

      const result = await response.json();
      renderGitHubBooks(result.books || []);
    } catch (error) {
      elements.githubBooksList.innerHTML =
        '<p class="github-books-message">Could not load GitHub books.</p>';
    }
  }

  function renderGitHubBooks(books) {
    if (books.length === 0) {
      elements.githubBooksList.innerHTML =
        '<p class="github-books-message">No TeachBooks repositories found yet.</p>';
      return;
    }

    elements.githubBooksList.innerHTML = "";

    books.forEach(function (book) {
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
        " · " +
        escapeHtml(book.private ? "Private" : "Public") +
        " · Updated " +
        escapeHtml(updatedDate) +
        "</p>" +
        "</div>" +
        '<div class="github-book-actions">' +
        '<a href="' +
        escapeHtml(book.repoUrl) +
        '" target="_blank" rel="noopener noreferrer">Repo</a>' +
        '<a href="' +
        escapeHtml(book.pagesUrl) +
        '" target="_blank" rel="noopener noreferrer">Published</a>' +
        "</div>";

      elements.githubBooksList.appendChild(bookCard);
    });
  }

  async function logoutFromGitHub() {
    try {
      await fetch("/auth/logout", {
        method: "POST"
      });

      renderGitHubAuthState({
        authenticated: false
      });

      setStatus("Signed out of GitHub.");
    } catch (error) {
      setStatus("Could not sign out of GitHub.");
    }
  }

  function updateOutputs() {
    refreshImagePreviewUrls();

    const markdown = plainTextToMarkdown(elements.plainTextInput.value);

    elements.markdownOutput.textContent = markdown;
    elements.previewOutput.innerHTML = markdownToHtml(markdown, imagePreviewUrls);

    saveActiveEditorContent();
  }

  function saveActiveEditorContent() {
    if (!currentBook || !activeEditorType) {
      return;
    }

    if (activeEditorType === "introduction") {
      updateIntroductionContent(
        currentBook,
        elements.plainTextInput.value
      );

      return;
    }

    if (activeEditorType === "chapter" && activeChapter) {
      updateChapterContent(
        currentBook,
        activeChapter.id,
        elements.plainTextInput.value
      );
    }
  }

  function refreshImagePreviewUrls() {
    if (!currentBook || !Array.isArray(currentBook.images)) {
      return;
    }

    currentBook.images.forEach(function (image) {
      imagePreviewUrls[image.path] = image.dataUrl;
    });
  }

  function saveImageToCurrentBook(image) {
    if (!currentBook) {
      return;
    }

    upsertBookImage(currentBook, image);
    imagePreviewUrls[image.path] = image.dataUrl;
  }

  function createUniqueImagePath(fileName) {
    const cleanFileName = fileName || "image";
    const existingPaths = new Set();

    if (currentBook && Array.isArray(currentBook.images)) {
      currentBook.images.forEach(function (image) {
        existingPaths.add(image.path);
      });
    }

    let candidatePath = "images/" + cleanFileName;

    if (!existingPaths.has(candidatePath)) {
      return candidatePath;
    }

    const extensionMatch = cleanFileName.match(/(\.[a-z0-9]+)$/i);
    const extension = extensionMatch ? extensionMatch[1] : "";
    const baseName = extension
      ? cleanFileName.slice(0, -extension.length)
      : cleanFileName;

    let counter = 2;

    while (existingPaths.has(candidatePath)) {
      candidatePath = "images/" + baseName + "-" + counter + extension;
      counter += 1;
    }

    return candidatePath;
  }

  function renderBookView() {
    if (!currentBook) {
      showView(elements.homeView, views);
      return;
    }

    elements.bookTitleInput.value = currentBook.title;
    elements.chapterList.innerHTML = "";

    const introductionCard = document.createElement("button");
    introductionCard.className = "chapter-card introduction-card";

    introductionCard.innerHTML =
      "<strong>Introduction</strong>" +
      "<span>" +
      escapeHtml(currentBook.introduction.title || "Introduction") +
      "</span>";

    introductionCard.addEventListener("click", function () {
      openIntroduction();
    });

    elements.chapterList.appendChild(introductionCard);

    currentBook.chapters.forEach(function (chapter, index) {
      const chapterCard = document.createElement("button");
      chapterCard.className = "chapter-card";

      chapterCard.innerHTML =
        "<strong>" +
        escapeHtml("Chapter " + (index + 1)) +
        "</strong>" +
        "<span>" +
        escapeHtml(chapter.title) +
        "</span>";

      chapterCard.addEventListener("click", function () {
        openChapter(chapter.id);
      });

      elements.chapterList.appendChild(chapterCard);
    });

    showView(elements.bookView, views);
  }

  function openIntroduction() {
    if (!currentBook) {
      return;
    }

    activeEditorType = "introduction";
    activeChapter = null;

    setActiveIntroduction(currentBook);

    elements.chapterTitleInput.placeholder = "Introduction title";
    elements.chapterTitleInput.value =
      currentBook.introduction.title || "Introduction";

    elements.plainTextInput.value = currentBook.introduction.content || "";

    updateOutputs();
    showView(elements.editorView, views);
    setStatus("Introduction opened.");
  }

  function openChapter(chapterId) {
    const chapter = findChapterById(currentBook, chapterId);

    if (!chapter) {
      setStatus("Could not open chapter.");
      return;
    }

    activeEditorType = "chapter";
    activeChapter = chapter;

    setActiveChapter(currentBook, chapter.id);

    elements.chapterTitleInput.placeholder = "Chapter title";
    elements.chapterTitleInput.value = chapter.title;
    elements.plainTextInput.value = chapter.content;

    updateOutputs();
    showView(elements.editorView, views);
  }

  function removeChapterFromBook() {
    saveActiveEditorContent();

    if (!currentBook) {
      setStatus("Create a book first.");
      return;
    }

    if (currentBook.chapters.length <= 1) {
      setStatus("You must keep at least one chapter.");
      return;
    }

    const chapterListText = currentBook.chapters
      .map(function (chapter, index) {
        return index + 1 + ". " + chapter.title;
      })
      .join("\n");

    const answer = prompt(
      "Which chapter number do you want to remove?\n\n" + chapterListText
    );

    if (!answer) {
      return;
    }

    const chapterNumber = Number(answer.trim());

    if (
      !Number.isInteger(chapterNumber) ||
      chapterNumber < 1 ||
      chapterNumber > currentBook.chapters.length
    ) {
      setStatus("Invalid chapter number.");
      return;
    }

    const chapterToRemove = currentBook.chapters[chapterNumber - 1];

    const confirmed = confirm(
      "Remove this chapter?\n\nChapter " +
      chapterNumber +
      ": " +
      chapterToRemove.title
    );

    if (!confirmed) {
      return;
    }

    const result = removeChapter(currentBook, chapterToRemove.id);

    if (!result.success) {
      setStatus(result.message);
      return;
    }

    if (activeChapter && activeChapter.id === chapterToRemove.id) {
      activeChapter = null;
      activeEditorType = null;
    }

    renderBookView();
    setStatus(result.message);
  }

  async function publishRealBookPreview() {
    saveActiveEditorContent();

    if (!currentBook) {
      setStatus("Create a book first.");
      return;
    }

    const owner = prompt("GitHub username or organization:");
    if (!owner || !owner.trim()) {
      return;
    }

    const repo = prompt("GitHub repository name:");
    if (!repo || !repo.trim()) {
      return;
    }

    const branch = prompt("Branch:", "main") || "main";

    const token = prompt(
      "GitHub token with repo access. For this prototype only. Later this should use OAuth/backend."
    );

    if (!token || !token.trim()) {
      return;
    }

    const cleanOwner = owner.trim();
    const cleanRepo = repo.trim();
    const cleanBranch = branch.trim() || "main";
    const cleanToken = token.trim();

    const files = generateTeachBooksFiles(currentBook, {
      owner: cleanOwner,
      repo: cleanRepo,
      branch: cleanBranch
    });

    try {
      setStatus("Uploading TeachBooks files to GitHub...");

      await publishFilesToGitHub({
        owner: cleanOwner,
        repo: cleanRepo,
        branch: cleanBranch,
        token: cleanToken,
        files,
        commitMessage: "Update real TeachBooks preview"
      });

      const pagesUrl = "https://" + cleanOwner + ".github.io/" + cleanRepo + "/";

      setStatus("Files uploaded. GitHub Actions is building the real book preview.");

      showPublishResult(pagesUrl);
    } catch (error) {
      console.error(error);
      setStatus("Publish failed. Check the browser console.");
      alert(error.message);
    }
  }

  function showPublishResult(pagesUrl) {
    elements.publishResult.classList.remove("hidden");
    elements.publishedUrlInput.value = pagesUrl;
    elements.openPublishedUrlLink.href = pagesUrl;

    elements.publishedUrlInput.focus();
    elements.publishedUrlInput.select();

    setStatus("Files uploaded. Copy or open the preview URL below.");
  }

  elements.newBookButton.addEventListener("click", function () {
    currentBook = createNewBook();
    activeChapter = null;
    activeEditorType = null;
    Object.keys(imagePreviewUrls).forEach(function (path) {
      delete imagePreviewUrls[path];
    });

    elements.publishResult.classList.add("hidden");
    renderBookView();
    setStatus("New book created.");
  });

  elements.closeBookButton.addEventListener("click", function () {
    activeChapter = null;
    activeEditorType = null;
    showView(elements.homeView, views);
  });

  elements.bookTitleInput.addEventListener("input", function () {
    if (!currentBook) {
      return;
    }

    updateBookTitle(currentBook, elements.bookTitleInput.value);
  });

  elements.addChapterButton.addEventListener("click", function () {
    if (!currentBook) {
      return;
    }

    const chapter = addChapter(currentBook);
    renderBookView();
    setStatus(chapter.title + " added.");
  });

  elements.removeChapterButton.addEventListener("click", removeChapterFromBook);

  elements.publishPreviewButton.addEventListener("click", publishRealBookPreview);

  elements.githubLoginButton.addEventListener("click", function () {
    window.location.href = "/auth/github/start";
  });

  elements.githubLogoutButton.addEventListener("click", logoutFromGitHub);
  elements.refreshGithubBooksButton.addEventListener("click", loadGitHubBooks);

  elements.copyPublishedUrlButton.addEventListener("click", async function () {
    const url = elements.publishedUrlInput.value;

    try {
      await navigator.clipboard.writeText(url);
      setStatus("Preview URL copied.");
    } catch (error) {
      elements.publishedUrlInput.focus();
      elements.publishedUrlInput.select();
      setStatus("URL selected. Press Ctrl+C to copy.");
    }
  });

  elements.backToBookButton.addEventListener("click", function () {
    saveActiveEditorContent();
    activeChapter = null;
    activeEditorType = null;
    renderBookView();
  });

  elements.chapterTitleInput.addEventListener("input", function () {
    if (!currentBook || !activeEditorType) {
      return;
    }

    if (activeEditorType === "introduction") {
      updateIntroductionTitle(
        currentBook,
        elements.chapterTitleInput.value
      );

      currentBook.introduction.title =
        elements.chapterTitleInput.value.trim() || "Introduction";

      return;
    }

    if (activeEditorType === "chapter" && activeChapter) {
      updateChapterTitle(
        currentBook,
        activeChapter.id,
        elements.chapterTitleInput.value
      );

      activeChapter.title =
        elements.chapterTitleInput.value.trim() || "Untitled Chapter";
    }
  });

  elements.plainTextInput.addEventListener("input", updateOutputs);

  setupEditorShortcuts({
    textarea: elements.plainTextInput,
    updateOutputs
  });

  setupImageHandler({
    imageInput: elements.imageInput,
    imageAltInput: elements.imageAltInput,
    plainTextInput: elements.plainTextInput,
    imagePreviewUrls,
    saveImage: saveImageToCurrentBook,
    createImagePath: createUniqueImagePath,
    updateOutputs,
    showStatus: setStatus
  });

  elements.copyButton.addEventListener("click", function () {
    copyMarkdown(elements.markdownOutput.textContent, setStatus);
  });

  elements.downloadButton.addEventListener("click", function () {
    const filename = getCurrentFileName();
    downloadMarkdown(elements.markdownOutput.textContent, setStatus, filename);
  });

  elements.loadExampleButton.addEventListener("click", function () {
    elements.plainTextInput.value = exampleText;
    updateOutputs();
    setStatus("Example loaded.");
  });

  elements.clearButton.addEventListener("click", function () {
    elements.plainTextInput.value = "";
    updateOutputs();
    setStatus("Editor cleared.");
  });

  if (currentBook) {
    renderBookView();

    if (currentBook.activeItemType === "introduction") {
      openIntroduction();
    } else if (currentBook.activeChapterId) {
      openChapter(currentBook.activeChapterId);
    }
  } else {
    showView(elements.homeView, views);
  }

  loadGitHubAuthState();

  function getCurrentFileName() {
    if (activeEditorType === "introduction") {
      return "intro.md";
    }

    if (!activeChapter) {
      return "chapter.md";
    }

    return makeSlug(activeChapter.title || "chapter") + ".md";
  }
});

function makeSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}
