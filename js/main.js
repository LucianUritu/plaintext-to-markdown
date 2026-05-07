import {
  addChapter,
  createNewBook,
  findChapterById,
  loadBook,
  saveBook,
  setActiveChapter,
  updateBookTitle,
  updateChapterContent,
  updateChapterTitle
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

document.addEventListener("DOMContentLoaded", function () {
  const elements = getEditorElements();
  const imagePreviewUrls = {};

  let currentBook = loadBook();
  let activeChapter = null;

  const views = [
    elements.homeView,
    elements.bookView,
    elements.editorView
  ];

  function setStatus(message) {
    showStatus(elements.statusMessage, message);
  }

  function updateOutputs() {
    const markdown = plainTextToMarkdown(elements.plainTextInput.value);

    elements.markdownOutput.textContent = markdown;
    elements.previewOutput.innerHTML = markdownToHtml(markdown, imagePreviewUrls);

    saveActiveChapterContent();
  }

  function saveActiveChapterContent() {
    if (!currentBook || !activeChapter) {
      return;
    }

    updateChapterContent(
      currentBook,
      activeChapter.id,
      elements.plainTextInput.value
    );
  }

  function renderBookView() {
    if (!currentBook) {
      showView(elements.homeView, views);
      return;
    }

    elements.bookTitleInput.value = currentBook.title;
    elements.chapterList.innerHTML = "";

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

  function openChapter(chapterId) {
    const chapter = findChapterById(currentBook, chapterId);

    if (!chapter) {
      setStatus("Could not open chapter.");
      return;
    }

    activeChapter = chapter;
    setActiveChapter(currentBook, chapter.id);

    elements.chapterTitleInput.value = chapter.title;
    elements.plainTextInput.value = chapter.content;

    updateOutputs();
    showView(elements.editorView, views);
  }

  elements.newBookButton.addEventListener("click", function () {
    currentBook = createNewBook();
    activeChapter = null;

    renderBookView();
    setStatus("New book created.");
  });

  elements.closeBookButton.addEventListener("click", function () {
    activeChapter = null;
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

  elements.backToBookButton.addEventListener("click", function () {
    saveActiveChapterContent();
    activeChapter = null;
    renderBookView();
  });

  elements.chapterTitleInput.addEventListener("input", function () {
    if (!currentBook || !activeChapter) {
      return;
    }

    updateChapterTitle(
      currentBook,
      activeChapter.id,
      elements.chapterTitleInput.value
    );

    activeChapter.title = elements.chapterTitleInput.value.trim() || "Untitled Chapter";
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
    updateOutputs,
    showStatus: setStatus
  });

  elements.copyButton.addEventListener("click", function () {
    copyMarkdown(elements.markdownOutput.textContent, setStatus);
  });

  elements.downloadButton.addEventListener("click", function () {
    const filename = getChapterFileName();
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

    if (currentBook.activeChapterId) {
      openChapter(currentBook.activeChapterId);
    }
  } else {
    showView(elements.homeView, views);
  }

  function getChapterFileName() {
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

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}