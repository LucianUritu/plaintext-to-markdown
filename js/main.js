import {
  addChapter,
  createNewBook,
  findChapterById,
  loadBook,
  removeChapter,
  saveBook,
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
import { GitHubBooksController } from "./githubBooksController.js";
import { setupImageHandler } from "./imageHandler.js";
import { plainTextToMarkdown } from "./markdownConverter.js";
import { markdownToHtml } from "./markdownRenderer.js";
import { PublishWorkflow } from "./publishWorkflow.js";
import { setupEditorShortcuts } from "./shortcuts.js";
import { escapeHtml } from "./utils.js";

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

  function setStatus(message, duration) {
    showStatus(elements.statusMessage, message, duration);
  }

  function setCurrentBook(book) {
    currentBook = book;
  }

  function setEditorInactive() {
    activeChapter = null;
    activeEditorType = null;
  }

  function clearImagePreviewUrls() {
    Object.keys(imagePreviewUrls).forEach(function (path) {
      delete imagePreviewUrls[path];
    });
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

  function getPublishTarget() {
    if (currentBook.source === "github") {
      return {
        owner: currentBook.owner,
        repo: currentBook.repo,
        branch: currentBook.branch || "main"
      };
    }

    if (currentBook.githubRepository) {
      return {
        owner: currentBook.githubRepository.owner,
        repo: currentBook.githubRepository.repo,
        branch: currentBook.githubRepository.branch || "main"
      };
    }

    return {
      owner: "",
      repo: "",
      branch: "main"
    };
  }

  function rememberPublishConnection(repository) {
    if (!repository || !repository.owner || !repository.repo) {
      return;
    }

    currentBook.githubRepository = {
      owner: repository.owner,
      repo: repository.repo,
      branch: repository.branch || "main"
    };

    if (currentBook.source === "github") {
      currentBook.owner = repository.owner;
      currentBook.repo = repository.repo;
      currentBook.branch = repository.branch || "main";
    }

    saveBook(currentBook);
  }

  function showPublishResult(pagesUrl, message) {
    elements.publishResult.classList.remove("hidden");
    elements.publishResultMessage.textContent = message;
    elements.publishedUrlInput.value = pagesUrl;
    elements.openPublishedUrlLink.href = pagesUrl;

    elements.publishedUrlInput.focus();
    elements.publishedUrlInput.select();

    setStatus("Files updated successfully.");
  }

  const githubBooksController = new GitHubBooksController({
    elements,
    clearImagePreviewUrls,
    renderBookView,
    setCurrentBook,
    setEditorInactive,
    setStatus
  });

  const publishWorkflow = new PublishWorkflow({
    elements,
    getCurrentBook: function () {
      return currentBook;
    },
    getPublishTarget,
    rememberPublishConnection,
    saveActiveEditorContent,
    setStatus,
    showPublishResult
  });

  elements.newBookButton.addEventListener("click", function () {
    currentBook = createNewBook();
    setEditorInactive();
    clearImagePreviewUrls();

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

  elements.publishPreviewButton.addEventListener("click", function () {
    publishWorkflow.publish();
  });

  elements.githubLoginButton.addEventListener("click", function () {
    window.location.href = "/auth/github/start";
  });

  elements.githubLogoutButton.addEventListener("click", function () {
    githubBooksController.logout();
  });
  elements.refreshGithubBooksButton.addEventListener("click", function () {
    githubBooksController.loadBooks();
  });

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

  activeChapter = null;
  activeEditorType = null;
  showView(elements.homeView, views);

  githubBooksController.loadAuthState();

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
