const test = require("node:test");
const assert = require("node:assert/strict");

function textarea(value, start, end = start) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    dispatchKeydown(event) {
      this.listeners.keydown(event);
    },
    focus() {},
    setSelectionRange(nextStart, nextEnd) {
      this.selectionStart = nextStart;
      this.selectionEnd = nextEnd;
    }
  };
}

test("formatting toolbar wraps selected text", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("make this bold", 5, 9);
  applyFormatting(field, "bold");
  assert.equal(field.value, "make **this** bold");
});

test("formatting toolbar removes bold from wrapped selected text", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("make **this** bold", 7, 11);
  applyFormatting(field, "bold");
  assert.equal(field.value, "make this bold");
  assert.equal(field.selectionStart, 5);
  assert.equal(field.selectionEnd, 9);
});

test("formatting toolbar removes italic from selected markdown", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("make *this* italic", 5, 11);
  applyFormatting(field, "italic");
  assert.equal(field.value, "make this italic");
  assert.equal(field.selectionStart, 5);
  assert.equal(field.selectionEnd, 9);
});

test("formatting toolbar creates numbered lines", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("one\ntwo", 0, 7);
  applyFormatting(field, "numbered");
  assert.equal(field.value, "1. one\n2. two");
});

test("formatting toolbar removes numbered lines", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("1. one\n2. two", 0, 13);
  applyFormatting(field, "numbered");
  assert.equal(field.value, "one\ntwo");
});

test("formatting toolbar toggles headings and quotes", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("Title\nLine", 0, 10);

  applyFormatting(field, "heading");
  assert.equal(field.value, "## Title\n## Line");

  field.setSelectionRange(0, field.value.length);
  applyFormatting(field, "heading");
  assert.equal(field.value, "Title\nLine");

  field.setSelectionRange(6, 10);
  applyFormatting(field, "quote");
  assert.equal(field.value, "Title\n> Line");

  field.setSelectionRange(6, field.value.length);
  applyFormatting(field, "quote");
  assert.equal(field.value, "Title\nLine");
});

test("formatting toolbar inserts a link placeholder", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("Visit site", 6, 10);
  applyFormatting(field, "link");
  assert.equal(field.value, "Visit [site](https://example.com)");
});

test("formatting toolbar removes selected links", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("Visit [site](https://example.com)", 6, 33);
  applyFormatting(field, "link");
  assert.equal(field.value, "Visit site");
});

test("keyboard shortcuts toggle bold and italic", async () => {
  const { setupEditorShortcuts } = await import("../js/shortcuts.js");
  const field = textarea("make this styled", 5, 9);
  let updateCount = 0;
  const event = (key) => ({
    key,
    ctrlKey: true,
    metaKey: false,
    preventDefault() {
      this.prevented = true;
    }
  });

  setupEditorShortcuts({
    textarea: field,
    updateOutputs() {
      updateCount += 1;
    }
  });

  field.dispatchKeydown(event("b"));
  assert.equal(field.value, "make **this** styled");

  field.dispatchKeydown(event("b"));
  assert.equal(field.value, "make this styled");

  field.setSelectionRange(10, 16);
  field.dispatchKeydown(event("i"));
  assert.equal(field.value, "make this *styled*");

  field.dispatchKeydown(event("i"));
  assert.equal(field.value, "make this styled");
  assert.equal(updateCount, 4);
});
