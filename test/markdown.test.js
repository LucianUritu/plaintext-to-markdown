const test = require("node:test");
const assert = require("node:assert/strict");
const converter = import("../js/markdownConverter.js");
const renderer = import("../js/markdownRenderer.js");
const utils = import("../js/utils.js");

const conversionCases = [
  ["", ""],
  ["Title", "# Title"],
  ["Title\n\nBody.", "# Title\n\nBody."],
  ["Title\n- item", "# Title\n- item"],
  ["Title\n* item", "# Title\n- item"],
  ["Title\n1) item", "# Title\n1. item"],
  ["Title\n>quote", "# Title\n> quote"],
  ["Title\nSection\nText.", "# Title\n## Section\nText."],
  ["Title\n\\Short line", "# Title\nShort line"],
  ["Title\n\n\nBody.", "# Title\n\nBody."],
  ["Title\r\nBody.", "# Title\nBody."],
  ["![alt](images/a.png)\nTitle", "![alt](images/a.png)\n# Title"]
];
conversionCases.forEach(([input, expected], index) => test("plain text conversion case " + (index + 1), async () => {
  assert.equal((await converter).plainTextToMarkdown(input), expected);
}));

test("converter recognizes bullets", async () => assert.equal((await converter).isBullet("• item"), true));
test("converter recognizes numbered items", async () => assert.equal((await converter).isNumbered("12. item"), true));
test("converter recognizes quotes", async () => assert.equal((await converter).isQuote("> quote"), true));
test("converter recognizes markdown images", async () => assert.equal((await converter).isMarkdownImage("![a](b.png)"), true));
test("renderer escapes unsafe HTML", async () => assert.match((await renderer).markdownToHtml("# <script>"), /&lt;script&gt;/));
test("renderer renders headings and paragraphs", async () => {
  const html = (await renderer).markdownToHtml("# Title\n\nText");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<p>Text<\/p>/);
});
test("renderer renders unordered lists", async () => assert.match((await renderer).markdownToHtml("- one\n- two"), /<ul>[\s\S]*<li>one<\/li>/));
test("renderer renders ordered lists", async () => assert.match((await renderer).markdownToHtml("1. one\n2. two"), /<ol>/));
test("renderer renders blockquotes", async () => assert.match((await renderer).markdownToHtml("> quote"), /<blockquote>quote<\/blockquote>/));
test("renderer renders bold and italic", async () => {
  const html = (await renderer).markdownToHtml("**bold** and *italic*");
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
});
test("renderer decorates citations", async () => assert.match((await renderer).markdownToHtml("{cite}`smith2024book`"), /citation-preview/));
test("renderer shows readable reference titles", async () => {
  const html = (await renderer).markdownToHtml("{ref}`Reliable Source <reference-smith2024book>`");
  assert.match(html, />Reliable Source<\/span>/);
});
test("renderer formats bibliography targets and entries", async () => {
  const html = (await renderer).markdownToHtml("<!-- bibliography-references:start -->\n(reference-source)=\n### Source title\n\n[Open source](https://example.com)\n<!-- bibliography-references:end -->");
  assert.match(html, /id="reference-source"/);
  assert.match(html, /<h3>Source title<\/h3>/);
  assert.match(html, /<a href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /bibliography-references:start/);
});
test("renderer uses image preview URLs", async () => assert.match((await renderer).markdownToHtml("![A](images/a.png)", { "images/a.png": "blob:test" }), /src="blob:test"/));
test("renderer escapes image attributes", async () => assert.match((await renderer).markdownToHtml("![A & B](x.png)"), /A &amp; B/));
test("safe filename strips unsupported characters", async () => assert.equal((await utils).makeSafeFileName(" A Weird/File?.PNG "), "a-weirdfile.png"));
test("escapeHtml escapes all significant characters", async () => assert.equal((await utils).escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#039;"));
test("escapeAttribute delegates safe escaping", async () => assert.equal((await utils).escapeAttribute('a"b'), "a&quot;b"));
test("insertTextAtCursor replaces selection", async () => {
  const textarea = { value: "hello world", selectionStart: 6, selectionEnd: 11, focus() {}, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  (await utils).insertTextAtCursor(textarea, "book");
  assert.equal(textarea.value, "hello book");
  assert.equal(textarea.selectionStart, 10);
});
