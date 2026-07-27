import {
  addBibliography,
  addChapter,
  addReference,
  createNewBook,
  findChapterById,
  loadBook,
  moveChapter,
  removeChapter,
  saveBook,
  setActiveBibliography,
  setActiveChapter,
  setActiveIntroduction,
  updateBibliographyContent,
  updateBibliographyTitle,
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

import { ChoiceModal } from "./choiceModal.js";
import { AppNavigation } from "./appNavigation.js";
import { BibliographyController } from "./bibliographyController.js";
import { exampleText } from "./examples.js";
import { copyMarkdown, downloadMarkdown } from "./fileActions.js";
import { loadGitHubBook } from "./githubApi.js";
import { GitHubBooksController } from "./githubBooksController.js";
import { setupImageHandler } from "./imageHandler.js";
import { plainTextToMarkdown } from "./markdownConverter.js";
import { markdownToHtml } from "./markdownRenderer.js";
import { PlatformTour } from "./platformTour.js";
import { PublishProgress } from "./publishProgress.js";
import { PublishMessagePanel } from "./publishMessagePanel.js";
import { PublishWorkflow } from "./publishWorkflow.js";
import { setupEditorShortcuts } from "./shortcuts.js";
import { setupFormattingToolbar } from "./formattingToolbar.js";
import {
  generateBibliographyMarkdown,
  generateChapterBibliographyMarkdown
} from "./teachbooksGenerator.js";
import { escapeHtml } from "./utils.js";
import { VersionHistoryPanel } from "./versionHistoryPanel.js";
import { VersionPickerModal } from "./versionPickerModal.js";

document.addEventListener("DOMContentLoaded", function () {
  const elements = getEditorElements();
  const imagePreviewUrls = {};
  const choiceModal = new ChoiceModal(elements);
  const versionPickerModal = new VersionPickerModal(elements);
  const publishProgress = new PublishProgress(elements);
  const publishMessagePanel = new PublishMessagePanel(elements);
  const platformTour = new PlatformTour({
    onBeforeStep: preparePlatformTourStep,
    onStop: closePlatformTour
  });
  const versionHistoryPanel = new VersionHistoryPanel({
    elements,
    getCurrentBook: function () {
      return currentBook;
    },
    onUseVersion: function (entry) {
      usePublishedVersion(entry);
    },
    setStatus: function (message) {
      setStatus(message);
    }
  });
  
  let publishResultTimer = null;

  let currentBook = loadBook();
  let activeChapter = null;
  let activeEditorType = null;
  let draggedChapterId = null;
  let suppressChapterClick = false;
  let chapterDeleteMode = false;

  const editorWorkspace = document.querySelector(".studio-workspace");
  const markdownPreviewToggle = document.getElementById("markdownPreviewToggle");
  const wordCount = document.getElementById("wordCount");

  const views = [
    elements.homeView,
    elements.bookView,
    elements.editorView
  ];
  const navigation = new AppNavigation({
    applyState: applyNavigationState,
    getFallbackState: function () {
      return { view: "home" };
    }
  });
  const bibliographyController = new BibliographyController({
    elements,
    getBook: function () {
      return currentBook;
    },
    getActiveChapter: function () {
      return activeChapter;
    },
    setStatus: function (message) {
      setStatus(message);
    },
    onContentChanged: updateOutputs
  });

  function setStatus(message, duration) {
    showStatus(elements.statusMessage, message, duration);
  }

  function setCurrentBook(book) {
    currentBook = book;
  }

  function preparePlatformTourStep(step) {
    if (!step) {
      return;
    }

    if ([
      "help",
      "github-auth",
      "home-new-book",
      "github-books"
    ].includes(step.id)) {
      navigation.navigate({ view: "home" });
      return;
    }

    if ([
      "book-title",
      "book-actions",
      "chapter-list",
      "version-history",
      "publish",
      "publishing-feedback"
    ].includes(step.id)) {
      ensureTourBook();
      navigation.navigate({ view: "book" });
      return;
    }

    if (step.id === "bibliography") {
      ensureTourBook();
      ensureTourBibliography();
      navigation.navigate({ view: "editor", type: "bibliography" });
      return;
    }

    if (step.id === "citations") {
      ensureTourBook();
      ensureTourBibliography();
      navigation.navigate({
        view: "editor",
        type: "chapter",
        chapterId: currentBook.chapters[0].id
      });
      return;
    }

    if ([
      "editor-topbar",
      "markdown-toggle",
      "formatting",
      "writing",
      "images",
      "markdown-preview"
    ].includes(step.id)) {
      ensureTourBook();
      navigation.navigate({
        view: "editor",
        type: "chapter",
        chapterId: currentBook.chapters[0].id
      });
    }
  }

  function ensureTourBook() {
    if (currentBook) {
      return;
    }

    currentBook = createNewBook();
    chapterDeleteMode = false;
    setEditorInactive();
    clearImagePreviewUrls();
    hidePublishResult();
  }

  function ensureTourBibliography() {
    if (!currentBook.bibliography) {
      addBibliography(currentBook);
    }

    if (currentBook.bibliography.references.length > 0) {
      return;
    }

    addReference(currentBook, {
      authors: "Jane Smith",
      title: "Example Open Education Source",
      year: "2026",
      url: "https://example.com/source"
    });
  }

  function closePlatformTour() {
    chapterDeleteMode = false;
    setEditorInactive();
    hidePublishResult();
    navigation.navigate({ view: "home" });
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

    let markdown = activeEditorType === "bibliography" && currentBook?.bibliography
      ? generateBibliographyMarkdown(currentBook.bibliography)
      : plainTextToMarkdown(elements.plainTextInput.value);

    if (activeEditorType === "chapter" && activeChapter && currentBook?.bibliography) {
      markdown += generateChapterBibliographyMarkdown(activeChapter, currentBook.bibliography);
    }

    elements.markdownOutput.textContent = markdown;
    elements.previewOutput.innerHTML = markdownToHtml(markdown, imagePreviewUrls);

    updateWritingStats();

    saveActiveEditorContent();
  }

  function updateWritingStats() {
    if (!wordCount) {
      return;
    }

    const text = elements.plainTextInput.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    wordCount.textContent = count + (count === 1 ? " word" : " words");
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

    if (activeEditorType === "bibliography" && currentBook.bibliography) {
      updateBibliographyContent(
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

  function loadImagePreviewUrlsFromCurrentBook() {
    clearImagePreviewUrls();
    refreshImagePreviewUrls();
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
      showHomeView();
      return;
    }

    elements.bookTitleInput.value = currentBook.title;
    elements.chapterList.innerHTML = "";
    elements.addBibliographyButton.disabled = Boolean(currentBook.bibliography);
    elements.addBibliographyButton.textContent = currentBook.bibliography
      ? "Bibliography Added"
      : "Add Bibliography";
    elements.removeChapterButton.classList.toggle("delete-mode-active", chapterDeleteMode);
    elements.removeChapterButton.textContent = chapterDeleteMode
      ? "Done Removing"
      : "Remove a Chapter";

    if (!currentBook.hideIntroductionCard) {
      const introductionCard = document.createElement("button");
      introductionCard.className = "chapter-card introduction-card";
      introductionCard.type = "button";
      introductionCard.draggable = false;
      introductionCard.setAttribute(
        "aria-label",
        "Open introduction. Introduction cannot be reordered."
      );

      introductionCard.innerHTML =
        "<strong>Introduction</strong>" +
        "<span>" +
        escapeHtml(currentBook.introduction.title || "Introduction") +
        "</span>";

      introductionCard.addEventListener("click", function () {
        navigation.navigate({
          view: "editor",
          type: "introduction"
        });
      });

      elements.chapterList.appendChild(introductionCard);
    }

    currentBook.chapters.forEach(function (chapter, index) {
      const chapterCard = document.createElement("button");
      chapterCard.className = "chapter-card";
      chapterCard.type = "button";
      chapterCard.draggable = !chapterDeleteMode;
      chapterCard.dataset.chapterId = chapter.id;
      chapterCard.dataset.chapterIndex = index;
      chapterCard.setAttribute(
        "aria-label",
        "Open or drag to reorder " + chapter.title
      );

      chapterCard.innerHTML =
        "<strong>" +
        escapeHtml(getChapterCardLabel(chapter, index)) +
        "</strong>" +
        "<span>" +
        escapeHtml(chapter.title) +
        "</span>" +
        (chapterDeleteMode && currentBook.chapters.length > 1
          ? '<span class="chapter-delete-button" role="button" tabindex="0" aria-label="Delete ' +
            escapeHtml(chapter.title) +
            '">&times;</span>'
          : "");

      const deleteButton = chapterCard.querySelector(".chapter-delete-button");

      if (deleteButton) {
        const requestDelete = function (event) {
          event.preventDefault();
          event.stopPropagation();
          requestChapterDeletion(chapter);
        };

        deleteButton.addEventListener("click", requestDelete);
        deleteButton.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            requestDelete(event);
          }
        });
      }

      chapterCard.addEventListener("click", function () {
        if (suppressChapterClick) {
          return;
        }

        navigation.navigate({
          view: "editor",
          type: "chapter",
          chapterId: chapter.id
        });
      });

      chapterCard.addEventListener("dragstart", function (event) {
        draggedChapterId = chapter.id;
        suppressChapterClick = true;
        chapterCard.classList.add("is-dragging");

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", chapter.id);
        }
      });

      chapterCard.addEventListener("dragover", function (event) {
        if (!draggedChapterId || draggedChapterId === chapter.id) {
          return;
        }

        event.preventDefault();

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }

        updateChapterDropHint(chapterCard, event);
      });

      chapterCard.addEventListener("dragleave", function () {
        clearChapterDropHint(chapterCard);
      });

      chapterCard.addEventListener("drop", function (event) {
        if (!draggedChapterId || draggedChapterId === chapter.id) {
          return;
        }

        event.preventDefault();

        const targetIndex = Number(chapterCard.dataset.chapterIndex);
        const insertionIndex =
          targetIndex + (shouldDropAfter(chapterCard, event) ? 1 : 0);
        const moved = moveChapter(
          currentBook,
          draggedChapterId,
          insertionIndex
        );

        draggedChapterId = null;
        clearAllChapterDropHints();

        if (moved) {
          renderBookView();
          setStatus("Chapter order updated.");
        }

        window.setTimeout(function () {
          suppressChapterClick = false;
        }, 0);
      });

      chapterCard.addEventListener("dragend", function () {
        draggedChapterId = null;
        chapterCard.classList.remove("is-dragging");
        clearAllChapterDropHints();

        window.setTimeout(function () {
          suppressChapterClick = false;
        }, 0);
      });

      elements.chapterList.appendChild(chapterCard);
    });

    if (currentBook.bibliography) {
      const bibliographyCard = document.createElement("button");
      bibliographyCard.className = "chapter-card bibliography-card";
      bibliographyCard.type = "button";
      bibliographyCard.innerHTML =
        "<strong>Bibliography</strong>" +
        "<span>" +
        escapeHtml(currentBook.bibliography.title) +
        "</span>" +
        "<small>" +
        currentBook.bibliography.references.length +
        " reference" +
        (currentBook.bibliography.references.length === 1 ? "" : "s") +
        "</small>";
      bibliographyCard.addEventListener("click", function () {
        navigation.navigate({ view: "editor", type: "bibliography" });
      });
      elements.chapterList.appendChild(bibliographyCard);
    }

    showView(elements.bookView, views);
    versionHistoryPanel.show();
  }

  function getChapterCardLabel(chapter, index) {
    return chapter.tocCaption || "Chapter " + (index + 1);
  }

  function shouldDropAfter(chapterCard, event) {
    const rect = chapterCard.getBoundingClientRect();
    const midpointY = rect.top + rect.height / 2;

    if (Math.abs(event.clientY - midpointY) > rect.height / 4) {
      return event.clientY > midpointY;
    }

    return event.clientX > rect.left + rect.width / 2;
  }

  function updateChapterDropHint(chapterCard, event) {
    clearChapterDropHint(chapterCard);

    if (shouldDropAfter(chapterCard, event)) {
      chapterCard.classList.add("is-drop-after");
      return;
    }

    chapterCard.classList.add("is-drop-before");
  }

  function clearChapterDropHint(chapterCard) {
    chapterCard.classList.remove("is-drop-before", "is-drop-after");
  }

  function clearAllChapterDropHints() {
    elements.chapterList
      .querySelectorAll(".chapter-card")
      .forEach(clearChapterDropHint);
  }

  function showHomeView() {
    versionHistoryPanel.hide();
    showView(elements.homeView, views);
  }

  function openIntroduction({ announce = true } = {}) {
    if (!currentBook) {
      return false;
    }

    activeEditorType = "introduction";
    activeChapter = null;

    setActiveIntroduction(currentBook);
    bibliographyController.configureFor("introduction");

    elements.chapterTitleInput.placeholder = "Introduction title";
    elements.chapterTitleInput.value =
      currentBook.introduction.title || "Introduction";

    elements.plainTextInput.value = currentBook.introduction.content || "";

    updateOutputs();
    versionHistoryPanel.hide();
    showView(elements.editorView, views);

    if (announce) {
      setStatus("Introduction opened.");
    }

    return true;
  }

  function openChapter(chapterId) {
    const chapter = findChapterById(currentBook, chapterId);

    if (!chapter) {
      setStatus("Could not open chapter.");
      return false;
    }

    activeEditorType = "chapter";
    activeChapter = chapter;

    setActiveChapter(currentBook, chapter.id);
    bibliographyController.configureFor("chapter");

    elements.chapterTitleInput.placeholder = "Chapter title";
    elements.chapterTitleInput.value = chapter.title;
    elements.plainTextInput.value = chapter.content;

    updateOutputs();
    versionHistoryPanel.hide();
    showView(elements.editorView, views);
    return true;
  }

  function openBibliography() {
    if (!currentBook || !currentBook.bibliography) {
      setStatus("Add a bibliography first.");
      return false;
    }

    activeEditorType = "bibliography";
    activeChapter = null;
    setActiveBibliography(currentBook);
    bibliographyController.configureFor("bibliography");

    elements.chapterTitleInput.placeholder = "Bibliography title";
    elements.chapterTitleInput.value = currentBook.bibliography.title;
    elements.plainTextInput.value = currentBook.bibliography.content;

    bibliographyController.renderReferenceList();
    updateOutputs();
    versionHistoryPanel.hide();
    showView(elements.editorView, views);
    return true;
  }

  async function requestChapterDeletion(chapterToRemove) {
    saveActiveEditorContent();
    const confirmed = await choiceModal.ask({
      title: "Delete chapter?",
      message: 'Are you sure you want to delete chapter "' + chapterToRemove.title + '"?',
      choices: [
        { label: "Delete chapter", value: true, variant: "danger" },
        { label: "Cancel", value: false, variant: "secondary" }
      ]
    });

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

    if (currentBook.chapters.length <= 1) {
      chapterDeleteMode = false;
    }

    renderBookView();
    setStatus(result.message);
  }

  function removeChapterFromBook() {
    if (!currentBook) {
      setStatus("Create a book first.");
      return;
    }

    if (currentBook.chapters.length <= 1) {
      chapterDeleteMode = false;
      renderBookView();
      setStatus("You must keep at least one chapter.");
      return;
    }

    chapterDeleteMode = !chapterDeleteMode;
    renderBookView();
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

  function rememberPublishConnection(repository, options = {}) {
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

    if (options.lastPublishedVersion) {
      currentBook.lastPublishedVersion = options.lastPublishedVersion;
    }

    saveBook(currentBook);
  }

  function hidePublishResult() {
    clearPublishResultTimer();
    elements.publishResult.classList.add("hidden");
  }

  function clearPublishResultTimer() {
    if (!publishResultTimer) {
      return;
    }

    clearTimeout(publishResultTimer);
    publishResultTimer = null;
  }

  function showPublishResult(pagesUrl, message) {
    clearPublishResultTimer();
    elements.publishResult.classList.remove("hidden");
    elements.publishResultMessage.textContent = message;
    elements.publishedUrlInput.value = pagesUrl;
    elements.openPublishedUrlLink.href = pagesUrl;

    elements.publishedUrlInput.focus();
    elements.publishedUrlInput.select();

    setStatus("Files updated successfully.");

    publishResultTimer = setTimeout(function () {
      hidePublishResult();
    }, 120000);
  }

  async function usePublishedVersion(entry) {
    const target = getPublishTarget();

    if (!target.owner || !target.repo || !entry.branch) {
      setStatus("Could not switch version.");
      return;
    }

    saveActiveEditorContent();
    setStatus("Opening version " + entry.version + "...", 0);

    try {
      const result = await loadGitHubBook({
        owner: target.owner,
        repo: target.repo,
        branch: entry.branch
      });

      currentBook = result.book;
      currentBook.lastPublishedVersion = entry.version;
      saveBook(currentBook);
      setEditorInactive();
      loadImagePreviewUrlsFromCurrentBook();
      hidePublishResult();
      navigateToBookView();
      setStatus("Now editing version " + entry.version + ".");
    } catch (error) {
      setStatus("Could not open that published version.");
    }
  }

  const githubBooksController = new GitHubBooksController({
    elements,
    clearImagePreviewUrls: loadImagePreviewUrlsFromCurrentBook,
    renderBookView: navigateToBookView,
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
    askChoice: function (options) {
      return choiceModal.ask(options);
    },
    askVersionLabel: function (options) {
      return versionPickerModal.ask(options);
    },
    publishProgress,
    publishMessagePanel,
    setStatus,
    showPublishResult
  });

  elements.newBookButton.addEventListener("click", function () {
    currentBook = createNewBook();
    chapterDeleteMode = false;
    setEditorInactive();
    clearImagePreviewUrls();

    hidePublishResult();
    navigateToBookView();
    setStatus("New book created.");
  });

  elements.closeBookButton.addEventListener("click", function () {
    hidePublishResult();
    chapterDeleteMode = false;
    activeChapter = null;
    activeEditorType = null;
    navigation.navigate({ view: "home" });
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

  elements.addBibliographyButton.addEventListener("click", function () {
    if (!currentBook || currentBook.bibliography) {
      return;
    }

    addBibliography(currentBook);
    navigation.navigate({ view: "editor", type: "bibliography" });
    setStatus("Bibliography added. Add your first reference.");
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

  elements.platformHelpButton.addEventListener("click", function () {
    platformTour.start();
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
    navigation.navigate({ view: "book" });
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

    if (activeEditorType === "bibliography" && currentBook.bibliography) {
      updateBibliographyTitle(
        currentBook,
        elements.chapterTitleInput.value
      );
      currentBook.bibliography.title =
        elements.chapterTitleInput.value.trim() || "Bibliography";
      updateOutputs();
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

  markdownPreviewToggle.addEventListener("change", function () {
    editorWorkspace.classList.toggle(
      "markdown-enabled",
      markdownPreviewToggle.checked
    );
  });

  setupEditorShortcuts({
    textarea: elements.plainTextInput,
    updateOutputs
  });

  setupFormattingToolbar({
    toolbar: document.getElementById("formattingToolbar"),
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

  elements.openPublishedUrlLink.addEventListener("click", hidePublishResult);

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
  navigation.start();

  githubBooksController.loadAuthState();

  function navigateToBookView() {
    navigation.navigate({ view: "book" });
  }

  function applyNavigationState(state) {
    if (!state || state.view === "home") {
      setEditorInactive();
      showHomeView();
      return;
    }

    if (!currentBook) {
      setEditorInactive();
      navigation.replace({ view: "home" });
      showHomeView();
      return;
    }

    if (state.view === "book") {
      setEditorInactive();
      renderBookView();
      return;
    }

    if (state.view === "editor" && state.type === "introduction") {
      if (currentBook.hideIntroductionCard) {
        navigation.replace({ view: "book" });
        renderBookView();
        return;
      }

      openIntroduction({ announce: false });
      return;
    }

    if (state.view === "editor" && state.type === "bibliography") {
      if (!openBibliography()) {
        navigation.replace({ view: "book" });
        renderBookView();
      }

      return;
    }

    if (state.view === "editor" && state.type === "chapter") {
      if (!openChapter(state.chapterId)) {
        navigation.replace({ view: "book" });
        renderBookView();
      }

      return;
    }

    navigation.replace({ view: "book" });
    renderBookView();
  }

  function getCurrentFileName() {
    if (activeEditorType === "introduction") {
      return "intro.md";
    }

    if (activeEditorType === "bibliography") {
      return "bibliography.md";
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
