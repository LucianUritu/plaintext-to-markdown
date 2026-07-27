const DEFAULT_SCROLL_MARGIN = 18;

export function createPlatformTourSteps() {
  return [
    {
      id: "help",
      target: "#platformHelpButton",
      title: "Help is always here",
      body: "Use this button any time you want a guided tour of the platform. The tour explains each main workflow without changing your book."
    },
    {
      id: "github-auth",
      target: "#githubAuthPanel",
      title: "Connect GitHub",
      body: "Sign in with GitHub when you want to load existing TeachBooks projects, publish a preview, or manage published versions."
    },
    {
      id: "home-new-book",
      target: "#newBookButton",
      title: "Start a book",
      body: "Create a fresh book from the home screen. After that, the book overview lets you name the book, add chapters, and publish."
    },
    {
      id: "github-books",
      target: "#githubBooksPanel",
      title: "Open GitHub books",
      body: "After GitHub is connected, this area lists repositories detected as TeachBooks projects. Refresh the list or open a book to continue editing it here.",
      fallbackTarget: "#githubAuthPanel"
    },
    {
      id: "book-title",
      target: "#bookTitleInput",
      title: "Name the book",
      body: "Edit the book title directly in the overview. Changes are saved automatically as you type.",
      fallbackTarget: "#newBookButton"
    },
    {
      id: "book-actions",
      target: ".book-actions",
      title: "Manage the book",
      body: "Use these actions to publish, close the current book, add chapters, add a bibliography, or enter chapter removal mode.",
      fallbackTarget: "#newBookButton"
    },
    {
      id: "chapter-list",
      target: "#chapterList",
      title: "Organize chapters",
      body: "Open a card to edit it. Drag chapter cards to reorder them. The Introduction and Bibliography cards stay fixed because TeachBooks treats them specially.",
      fallbackTarget: "#newBookButton"
    },
    {
      id: "version-history",
      target: "#versionHistoryPanel",
      title: "Use published versions",
      body: "Published versions appear here. You can open stable previews, copy links, refresh the list, or switch the editor to a previous published snapshot.",
      fallbackTarget: "#publishPreviewButton"
    },
    {
      id: "editor-topbar",
      target: ".editor-topbar",
      title: "Edit a section",
      body: "The editor top bar returns to the chapter overview and lets you rename the current introduction, chapter, or bibliography.",
      fallbackTarget: "#chapterList"
    },
    {
      id: "markdown-toggle",
      target: ".markdown-toggle",
      title: "Show Markdown source",
      body: "Turn on Markdown preview when you want to inspect the generated source beside the writing canvas and reader preview.",
      fallbackTarget: ".editor-topbar"
    },
    {
      id: "formatting",
      target: "#formattingToolbar",
      title: "Format text quickly",
      body: "The toolbar inserts headings, bold, italic, lists, quotes, and links into the writing canvas at the cursor.",
      fallbackTarget: "#plainTextInput"
    },
    {
      id: "writing",
      target: "#plainTextInput",
      title: "Write in plain text",
      body: "Write naturally here. The platform converts your text into Markdown, updates the word count, and saves your work automatically."
    },
    {
      id: "images",
      target: ".studio-toolbar",
      title: "Add images and file actions",
      body: "Add images with alt text, copy Markdown, download the current file, load an example, or clear the current section from the more menu.",
      fallbackTarget: "#imageAltInput"
    },
    {
      id: "citations",
      target: "#chapterCitationTools",
      title: "Cite references",
      body: "When a bibliography exists and you edit a chapter, choose a saved reference and insert a citation at the cursor.",
      fallbackTarget: "#addBibliographyButton"
    },
    {
      id: "bibliography",
      target: "#bibliographyManager",
      title: "Build the bibliography",
      body: "Add, edit, and remove references with authors, title, year, and URL. Bibliography Markdown is generated from the saved references.",
      fallbackTarget: "#addBibliographyButton"
    },
    {
      id: "markdown-preview",
      target: ".preview-panel",
      title: "Preview the reader view",
      body: "The reader preview renders headings, links, images, citations, and bibliography content so you can check the published shape while writing.",
      fallbackTarget: "#previewOutput"
    },
    {
      id: "publish",
      target: "#publishPreviewButton",
      title: "Publish the book",
      body: "Publishing prepares the repository, enables GitHub Pages, uploads TeachBooks files, waits for the GitHub Action, and then shows the preview URL.",
      fallbackTarget: ".book-actions"
    },
    {
      id: "publishing-feedback",
      target: "#publishProgressPanel",
      title: "Track publishing feedback",
      body: "Progress, success links, copyable URLs, and friendly error messages appear near the bottom of the workspace while publishing runs.",
      fallbackTarget: "#status"
    }
  ];
}

export class PlatformTour {
  constructor(options = {}) {
    this.steps = options.steps || createPlatformTourSteps();
    this.document = options.document || document;
    this.window = options.window || window;
    this.onBeforeStep = options.onBeforeStep || function () {};
    this.onStepChange = options.onStepChange || function () {};
    this.onStop = options.onStop || function () {};
    this.activeIndex = 0;
    this.previouslyFocusedElement = null;
    this.renderId = 0;

    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  mount() {
    if (this.overlay) {
      return;
    }

    this.overlay = this.document.createElement("div");
    this.overlay.className = "platform-tour hidden";
    this.overlay.setAttribute("role", "presentation");

    this.highlight = this.document.createElement("div");
    this.highlight.className = "platform-tour-highlight";
    this.highlight.setAttribute("aria-hidden", "true");

    this.card = this.document.createElement("section");
    this.card.className = "platform-tour-card";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-modal", "true");
    this.card.setAttribute("aria-labelledby", "platformTourTitle");
    this.card.setAttribute("aria-describedby", "platformTourBody");

    this.card.innerHTML =
      '<div class="platform-tour-card__header">' +
        '<span id="platformTourProgress" class="platform-tour-progress"></span>' +
        '<button id="platformTourClose" class="platform-tour-close" type="button" aria-label="Close tutorial">&times;</button>' +
      "</div>" +
      '<h2 id="platformTourTitle"></h2>' +
      '<p id="platformTourBody"></p>' +
      '<div class="platform-tour-actions">' +
        '<button id="platformTourPrevious" class="secondary" type="button">Back</button>' +
        '<button id="platformTourNext" type="button">Next</button>' +
      "</div>";

    this.overlay.append(this.highlight, this.card);
    this.document.body.appendChild(this.overlay);

    this.progressElement = this.card.querySelector("#platformTourProgress");
    this.titleElement = this.card.querySelector("#platformTourTitle");
    this.bodyElement = this.card.querySelector("#platformTourBody");
    this.previousButton = this.card.querySelector("#platformTourPrevious");
    this.nextButton = this.card.querySelector("#platformTourNext");
    this.closeButton = this.card.querySelector("#platformTourClose");

    this.previousButton.addEventListener("click", () => this.previous());
    this.nextButton.addEventListener("click", () => this.next());
    this.closeButton.addEventListener("click", () => this.stop());
  }

  async start(stepId) {
    this.mount();
    this.previouslyFocusedElement = this.document.activeElement;
    this.activeIndex = Math.max(0, this.findStepIndex(stepId));
    this.overlay.classList.remove("hidden");
    this.document.body.classList.add("platform-tour-active");
    this.document.addEventListener("keydown", this.handleKeydown);
    this.window.addEventListener("resize", this.handleResize);
    await this.render();
  }

  stop() {
    if (!this.overlay || this.overlay.classList.contains("hidden")) {
      return;
    }

    this.overlay.classList.add("hidden");
    this.document.body.classList.remove("platform-tour-active");
    this.document.removeEventListener("keydown", this.handleKeydown);
    this.window.removeEventListener("resize", this.handleResize);

    if (
      this.previouslyFocusedElement &&
      typeof this.previouslyFocusedElement.focus === "function"
    ) {
      this.previouslyFocusedElement.focus();
    }

    this.onStop();
  }

  async next() {
    if (this.activeIndex >= this.steps.length - 1) {
      this.stop();
      return;
    }

    this.activeIndex += 1;
    await this.render();
  }

  async previous() {
    if (this.activeIndex <= 0) {
      return;
    }

    this.activeIndex -= 1;
    await this.render();
  }

  findStepIndex(stepId) {
    if (!stepId) {
      return 0;
    }

    return this.steps.findIndex(function (step) {
      return step.id === stepId;
    });
  }

  async render() {
    const currentRenderId = this.renderId + 1;
    this.renderId = currentRenderId;

    const step = this.steps[this.activeIndex];
    await this.onBeforeStep(step);

    if (currentRenderId !== this.renderId) {
      return;
    }

    const target = this.findVisibleTarget(step);

    this.progressElement.textContent =
      "Step " + (this.activeIndex + 1) + " of " + this.steps.length;
    this.titleElement.textContent = step.title;
    this.bodyElement.textContent = step.body;
    this.previousButton.disabled = this.activeIndex === 0;
    this.nextButton.textContent =
      this.activeIndex === this.steps.length - 1 ? "Finish" : "Next";

    this.onStepChange(step, target);
    this.position(target);
    this.nextButton.focus();
  }

  findVisibleTarget(step) {
    const candidates = [step.target, step.fallbackTarget, "main", "body"]
      .filter(Boolean);

    for (const selector of candidates) {
      const element = this.document.querySelector(selector);

      if (element && this.isVisible(element)) {
        return element;
      }
    }

    return this.document.body;
  }

  isVisible(element) {
    if (element === this.document.body) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    const style = this.window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  }

  position(target) {
    target.scrollIntoView({
      behavior: "auto",
      block: "center",
      inline: "center"
    });

    this.window.requestAnimationFrame(() => {
      this.window.requestAnimationFrame(() => {
        this.placeAroundTarget(target);
      });
    });
  }

  placeAroundTarget(target) {
      const targetRect = target.getBoundingClientRect();
      const viewportWidth = this.window.innerWidth;
      const viewportHeight = this.window.innerHeight;
      const margin = DEFAULT_SCROLL_MARGIN;
      const highlightPadding = 8;
      const visibleTarget = {
        left: Math.max(margin, targetRect.left - highlightPadding),
        top: Math.max(margin, targetRect.top - highlightPadding),
        right: Math.min(viewportWidth - margin, targetRect.right + highlightPadding),
        bottom: Math.min(viewportHeight - margin, targetRect.bottom + highlightPadding)
      };
      const highlightWidth = Math.max(48, visibleTarget.right - visibleTarget.left);
      const highlightHeight = Math.max(40, visibleTarget.bottom - visibleTarget.top);

      this.highlight.style.left = visibleTarget.left + "px";
      this.highlight.style.top = visibleTarget.top + "px";
      this.highlight.style.width = highlightWidth + "px";
      this.highlight.style.height = highlightHeight + "px";

      const cardRect = this.card.getBoundingClientRect();
      const targetCenterX = visibleTarget.left + highlightWidth / 2;
      const spaceBelow = viewportHeight - visibleTarget.bottom;
      const placeAbove =
        spaceBelow < cardRect.height + 26 &&
        visibleTarget.top > cardRect.height + 26;
      const top = placeAbove
        ? visibleTarget.top - cardRect.height - 18
        : visibleTarget.bottom + 18;
      const left = Math.min(
        Math.max(margin, targetCenterX - cardRect.width / 2),
        viewportWidth - cardRect.width - margin
      );

      this.card.style.left = left + "px";
      this.card.style.top =
        Math.min(Math.max(margin, top), viewportHeight - cardRect.height - margin) + "px";
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      this.stop();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.next();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.previous();
    }
  }

  handleResize() {
    this.render();
  }
}
