import {
  addChapterReference,
  addReference,
  findReferenceById,
  removeChapterReference,
  removeReference,
  setChapterBibliography,
  updateReference
} from "./bookStorage.js";
import { escapeHtml } from "./utils.js";

export class BibliographyController {
  constructor({ elements, getBook, getActiveChapter, setStatus, onContentChanged }) {
    this.elements = elements;
    this.getBook = getBook;
    this.getActiveChapter = getActiveChapter || function () { return null; };
    this.setStatus = setStatus;
    this.onContentChanged = onContentChanged;
    this.bindEvents();
  }

  configureFor(editorType) {
    const isChapter = editorType === "chapter";
    const isBibliography = editorType === "bibliography";
    this.elements.chapterCitationTools.classList.toggle("hidden", !isChapter);
    this.elements.chapterBibliographyPanel.classList.toggle("hidden", !isChapter);
    this.elements.bibliographyManager.classList.toggle("hidden", !isBibliography);
    if (isChapter) {
      this.refreshCitationPicker();
      this.renderChapterReferences();
    }
    if (!isBibliography) this.resetForm();
  }

  refreshCitationPicker() {
    const references = this.getBook()?.bibliography?.references || [];
    const select = this.elements.citationReferenceSelect;
    select.innerHTML = "";

    if (references.length === 0) {
      const option = document.createElement("option");
      option.textContent = "Add references to your bibliography first";
      option.value = "";
      select.appendChild(option);
      select.disabled = true;
      this.elements.insertCitationButton.disabled = true;
      return;
    }

    references.forEach((reference) => {
      const option = document.createElement("option");
      option.value = reference.key;
      option.textContent = this.formatLabel(reference);
      select.appendChild(option);
    });
    select.disabled = false;
    this.elements.insertCitationButton.disabled = false;
  }

  renderReferenceList() {
    const references = this.getBook()?.bibliography?.references || [];
    const list = this.elements.referenceList;
    list.innerHTML = "";
    this.elements.referenceCount.textContent =
      references.length + " reference" + (references.length === 1 ? "" : "s");

    if (references.length === 0) {
      list.innerHTML = '<p class="reference-empty">No references yet. Add your first source above.</p>';
      return;
    }

    references.forEach((reference) => list.appendChild(this.createReferenceItem(reference)));
  }

  renderChapterReferences() {
    const chapter = this.getActiveChapter();
    const references = this.getBook()?.bibliography?.references || [];
    const list = this.elements.chapterReferenceList;
    list.innerHTML = "";

    this.elements.chapterBibliographyToggle.checked = Boolean(chapter?.showBibliography);

    if (!chapter) {
      list.innerHTML = '<p class="reference-empty">Open a chapter to choose its references.</p>';
      return;
    }

    if (references.length === 0) {
      list.innerHTML = '<p class="reference-empty">Add references to the book bibliography first.</p>';
      return;
    }

    references.forEach((reference) => {
      const label = document.createElement("label");
      label.className = "chapter-reference-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = chapter.referenceKeys.includes(reference.key);
      input.addEventListener("change", () => {
        if (input.checked) {
          addChapterReference(this.getBook(), chapter.id, reference.key);
        } else {
          removeChapterReference(this.getBook(), chapter.id, reference.key);
        }
        this.onContentChanged();
        this.renderChapterReferences();
      });

      const text = document.createElement("span");
      text.textContent = this.formatLabel(reference);

      label.append(input, text);
      list.appendChild(label);
    });
  }

  createReferenceItem(reference) {
    const item = document.createElement("article");
    item.className = "reference-item";
    item.innerHTML =
      '<div class="reference-item__details"><strong>' + escapeHtml(reference.title) +
      "</strong><span>" + escapeHtml(this.formatMeta(reference)) + "</span></div>" +
      '<code class="reference-item__key">' + escapeHtml(reference.key) + "</code>";

    const actions = document.createElement("div");
    actions.className = "reference-item__actions";
    actions.append(
      this.createActionButton("Edit", () => this.startEdit(reference.id)),
      this.createActionButton("Remove", () => this.confirmRemove(reference))
    );
    item.appendChild(actions);
    return item;
  }

  createActionButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  confirmRemove(reference) {
    if (!confirm('Remove "' + reference.title + '" from the bibliography?')) return;
    removeReference(this.getBook(), reference.id);
    this.resetForm();
    this.renderReferenceList();
    this.renderChapterReferences();
    this.onContentChanged();
    this.setStatus("Reference removed.");
  }

  startEdit(referenceId) {
    const reference = findReferenceById(this.getBook(), referenceId);
    if (!reference) return;
    this.elements.referenceIdInput.value = reference.id;
    this.elements.referenceAuthorsInput.value = reference.authors;
    this.elements.referenceTitleInput.value = reference.title;
    this.elements.referenceYearInput.value = reference.year;
    this.elements.referenceUrlInput.value = reference.url;
    this.elements.saveReferenceButton.textContent = "Save Reference";
    this.elements.cancelReferenceEditButton.classList.remove("hidden");
    this.elements.referenceTitleInput.focus();
  }

  resetForm() {
    this.elements.referenceForm.reset();
    this.elements.referenceIdInput.value = "";
    this.elements.saveReferenceButton.textContent = "Add Reference";
    this.elements.cancelReferenceEditButton.classList.add("hidden");
  }

  handleSubmit(event) {
    event.preventDefault();
    const data = this.readForm();
    const referenceId = this.elements.referenceIdInput.value;
    if (!data.title.trim()) {
      this.setStatus("Give the reference a title.");
      return;
    }
    if (referenceId) {
      updateReference(this.getBook(), referenceId, data);
      this.setStatus("Reference updated.");
    } else {
      addReference(this.getBook(), data);
      this.setStatus("Reference added. It is now available in every chapter.");
    }
    this.resetForm();
    this.renderReferenceList();
    this.renderChapterReferences();
    this.onContentChanged();
  }

  insertCitation() {
    const key = this.elements.citationReferenceSelect.value;
    if (!key) {
      this.setStatus("Choose a reference first.");
      return;
    }
    const reference = this.getBook()?.bibliography?.references.find((item) => item.key === key);
    if (!reference) {
      this.setStatus("That reference is no longer available.");
      return;
    }
    const textarea = this.elements.plainTextInput;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.charAt(start - 1);
    const after = textarea.value.charAt(end);
    const citation =
      (before && !/\s/.test(before) ? " " : "") +
      this.createCitationMarkup(reference) +
      (after && !/\s/.test(after) ? " " : "");
    textarea.setRangeText(citation, start, end, "end");
    textarea.focus();
    const chapter = this.getActiveChapter();
    if (chapter) {
      setChapterBibliography(this.getBook(), chapter.id, true);
      addChapterReference(this.getBook(), chapter.id, reference.key);
    }
    this.onContentChanged();
    this.renderChapterReferences();
    this.setStatus("Citation inserted.");
  }

  createCitationMarkup(reference) {
    const title = String(reference.title || "Untitled source").replace(/[<>`]/g, "");
    return "{ref}`" + title + " <reference-" + reference.key + ">`";
  }

  readForm() {
    return {
      authors: this.elements.referenceAuthorsInput.value,
      title: this.elements.referenceTitleInput.value,
      year: this.elements.referenceYearInput.value,
      url: this.elements.referenceUrlInput.value
    };
  }

  formatLabel(reference) {
    return (reference.authors || "Unknown author") +
      (reference.year ? " (" + reference.year + ")" : "") +
      " - " + reference.title;
  }

  formatMeta(reference) {
    return [reference.authors, reference.year, reference.url].filter(Boolean).join(" | ") ||
      "No additional details";
  }

  bindEvents() {
    this.elements.referenceForm.addEventListener("submit", (event) => this.handleSubmit(event));
    this.elements.cancelReferenceEditButton.addEventListener("click", () => this.resetForm());
    this.elements.insertCitationButton.addEventListener("click", () => this.insertCitation());
    this.elements.chapterBibliographyToggle.addEventListener("change", () => {
      const chapter = this.getActiveChapter();
      if (!chapter) return;
      setChapterBibliography(this.getBook(), chapter.id, this.elements.chapterBibliographyToggle.checked);
      this.onContentChanged();
    });
  }
}
