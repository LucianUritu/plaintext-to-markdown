const test = require("node:test");
const assert = require("node:assert/strict");
const controllerModule = import("../js/bibliographyController.js");

global.document = {
  createElement(tagName) {
    return {
      tagName,
      children: [],
      checked: false,
      className: "",
      textContent: "",
      type: "",
      addEventListener() {},
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); }
    };
  }
};
global.localStorage = {
  getItem() { return null; },
  setItem() {}
};

function field(value = "") { return { value, innerHTML: "", checked: false, children: [], addEventListener() {}, appendChild(child) { this.children.push(child); }, classList: { add() {}, remove() {}, toggle() {} }, focus() {} }; }
function context() {
  const statuses = [];
  let changed = 0;
  const elements = {
    chapterCitationTools: field(), bibliographyManager: field(), citationReferenceSelect: field(),
    insertCitationButton: field(), chapterBibliographyPanel: field(), chapterBibliographyToggle: field(),
    chapterReferenceList: field(), referenceForm: { ...field(), reset() {} }, referenceIdInput: field(),
    referenceAuthorsInput: field(), referenceTitleInput: field(), referenceYearInput: field(),
    referenceUrlInput: field(), saveReferenceButton: field(), cancelReferenceEditButton: field(),
    referenceList: field(), referenceCount: field(), plainTextInput: field()
  };
  const book = {
    chapters: [{ id: "chapter-1", title: "Chapter", content: "", showBibliography: false, referenceKeys: [] }],
    bibliography: {
      references: [{ key: "smith2025source", title: "Reliable Source" }]
    }
  };
  return controllerModule.then(({ BibliographyController }) => ({
    elements, statuses,
    book,
    controller: new BibliographyController({ elements, getBook: () => book, getActiveChapter: () => book.chapters[0], setStatus: (message) => statuses.push(message), onContentChanged: () => changed++ }),
    changed: () => changed
  }));
}

test("reference labels include author, year, and title", async () => {
  const { controller } = await context();
  assert.equal(controller.formatLabel({ authors: "Jane Smith", year: "2025", title: "Source" }), "Jane Smith (2025) - Source");
});
test("reference labels use an unknown-author fallback", async () => {
  const { controller } = await context();
  assert.equal(controller.formatLabel({ title: "Source" }), "Unknown author - Source");
});
test("reference metadata omits empty values", async () => {
  const { controller } = await context();
  assert.equal(controller.formatMeta({ authors: "Jane", year: "", url: "https://x" }), "Jane | https://x");
});
test("empty reference metadata has a fallback", async () => {
  const { controller } = await context();
  assert.equal(controller.formatMeta({}), "No additional details");
});
test("reference forms are read into a value object", async () => {
  const { controller, elements } = await context();
  elements.referenceAuthorsInput.value = "A"; elements.referenceTitleInput.value = "T";
  elements.referenceYearInput.value = "2024"; elements.referenceUrlInput.value = "U";
  assert.deepEqual(controller.readForm(), { authors: "A", title: "T", year: "2024", url: "U" });
});
test("inserting citations replaces selected text and reports success", async () => {
  const { book, controller, elements, statuses, changed } = await context();
  elements.citationReferenceSelect.value = "smith2025source";
  elements.plainTextInput = {
    value: "Read source now", selectionStart: 5, selectionEnd: 11, focus() {},
    setRangeText(value, start, end) { this.value = this.value.slice(0, start) + value + this.value.slice(end); }
  };
  controller.insertCitation();
  assert.equal(elements.plainTextInput.value, "Read {ref}`Reliable Source <reference-smith2025source>` now");
  assert.equal(book.chapters[0].showBibliography, true);
  assert.deepEqual(book.chapters[0].referenceKeys, ["smith2025source"]);
  assert.equal(changed(), 1);
  assert.equal(statuses.at(-1), "Citation inserted.");
});
test("inserting without a citation key reports an error", async () => {
  const { controller, statuses } = await context();
  controller.insertCitation();
  assert.equal(statuses.at(-1), "Choose a reference first.");
});
test("resetForm restores add mode", async () => {
  const { controller, elements } = await context();
  elements.referenceIdInput.value = "id"; elements.saveReferenceButton.textContent = "Save Reference";
  controller.resetForm();
  assert.equal(elements.referenceIdInput.value, "");
  assert.equal(elements.saveReferenceButton.textContent, "Add Reference");
});
