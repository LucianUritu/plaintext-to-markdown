const test = require("node:test");
const assert = require("node:assert/strict");

function textarea(value, start, end = start) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
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

test("formatting toolbar creates numbered lines", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("one\ntwo", 0, 7);
  applyFormatting(field, "numbered");
  assert.equal(field.value, "1. one\n2. two");
});

test("formatting toolbar inserts a link placeholder", async () => {
  const { applyFormatting } = await import("../js/formattingToolbar.js");
  const field = textarea("Visit site", 6, 10);
  applyFormatting(field, "link");
  assert.equal(field.value, "Visit [site](https://example.com)");
});
