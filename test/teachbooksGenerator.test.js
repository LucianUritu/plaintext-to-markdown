const test = require("node:test");
const assert = require("node:assert/strict");
const generator = import("../js/teachbooksGenerator.js");

function book(overrides = {}) {
  return {
    title: "Test Book",
    introduction: { title: "Introduction", content: "Welcome." },
    chapters: [{ title: "First Chapter", content: "First Chapter\n\nBody." }],
    images: [],
    ...overrides
  };
}
async function filesFor(value, options) { return (await generator).generateTeachBooksFiles(value, options); }
function byPath(files, path) { return files.find((file) => file.path === path); }

test("generator creates the core TeachBooks files", async () => {
  const paths = (await filesFor(book())).map((file) => file.path);
  assert.deepEqual(paths.slice(0, 5), ["requirements.txt", ".github/workflows/call-deploy-book.yml", "book/_config.yml", "book/_toc.yml", "book/intro.md"]);
});
test("config uses publishing coordinates", async () => {
  const files = await filesFor(book(), { owner: "alice", repo: "manual", branch: "draft" });
  const config = byPath(files, "book/_config.yml").content;
  assert.match(config, /alice\.github\.io\/manual/);
  assert.match(config, /repository_branch: "draft"/);
});
test("config YAML-quotes titles", async () => {
  const config = byPath(await filesFor(book({ title: 'A "Book"' })), "book/_config.yml").content;
  assert.match(config, /title: "A \\"Book\\""/);
});
test("chapter filenames are numbered and slugged", async () => {
  const files = await filesFor(book({ chapters: [{ title: "Hello, World!", content: "" }] }));
  assert.ok(byPath(files, "book/chapters/01-hello-world.md"));
});
test("chapter output does not duplicate the first body heading", async () => {
  const chapter = byPath(await filesFor(book()), "book/chapters/01-first-chapter.md").content;
  assert.equal(chapter, "# First Chapter\n\nFirst Chapter\n\nBody.\n");
});
test("empty chapters still contain their title", async () => {
  const chapter = byPath(await filesFor(book({ chapters: [{ title: "Empty", content: "" }] })), "book/chapters/01-empty.md").content;
  assert.equal(chapter, "# Empty\n\n");
});
test("empty introductions receive useful fallback content", async () => {
  const intro = byPath(await filesFor(book({ introduction: { title: "Start", content: "" } })), "book/intro.md").content;
  assert.match(intro, /Welcome to \*\*Test Book\*\*/);
});
test("safe imported source paths are preserved", async () => {
  const files = await filesFor(book({ introduction: { title: "Intro", content: "x", sourcePath: "pages/start.md" }, chapters: [{ title: "C", content: "x", sourcePath: "topics/c.md" }] }));
  assert.ok(byPath(files, "book/pages/start.md"));
  assert.ok(byPath(files, "book/topics/c.md"));
});
test("unsafe imported source paths fall back", async () => {
  const files = await filesFor(book({ chapters: [{ title: "C", content: "x", sourcePath: "../escape.md" }] }));
  assert.ok(byPath(files, "book/chapters/01-c.md"));
});
test("source TOC is reused for compatible imported books", async () => {
  const sourceToc = "format: jb-book\nroot: start\n";
  const files = await filesFor(book({ teachBooksToc: { text: sourceToc }, chapters: [{ title: "C", content: "x", sourcePath: "c.md" }] }));
  assert.equal(byPath(files, "book/_toc.yml").content, sourceToc);
});
test("bibliographies add config, TOC, markdown, and BibTeX", async () => {
  const files = await filesFor(book({ bibliography: { title: "References", content: "Used sources.", references: [{ key: "smith2024source", authors: "Jane Smith", title: "Source", year: "2024", url: "https://example.com" }] } }));
  assert.match(byPath(files, "book/_config.yml").content, /bibtex_bibfiles/);
  assert.match(byPath(files, "book/_toc.yml").content, /caption: References/);
  assert.match(byPath(files, "book/bibliography.md").content, /\(reference-smith2024source\)=/);
  assert.match(byPath(files, "book/bibliography.md").content, /### Source/);
  assert.match(byPath(files, "book/references.bib").content, /@misc\{smith2024source/);
});
test("BibTeX converts semicolon author separators", async () => {
  const files = await filesFor(book({ bibliography: { references: [{ key: "k", authors: "A One; B Two", title: "T" }] } }));
  assert.match(byPath(files, "book/references.bib").content, /A One and B Two/);
});
test("BibTeX escapes reserved characters", async () => {
  const files = await filesFor(book({ bibliography: { references: [{ key: "k", title: "A & B_100%", authors: "A" }] } }));
  assert.match(byPath(files, "book/references.bib").content, /A \\& B\\_100\\%/);
});
test("empty bibliographies generate an empty BibTeX file", async () => {
  const files = await filesFor(book({ bibliography: { references: [] } }));
  assert.equal(byPath(files, "book/references.bib").content, "");
});
test("legacy numeric citations become readable title references", async () => {
  const files = await filesFor(book({
    chapters: [{ title: "Chapter", content: "Chapter\n\nSee {cite}`smith2024source`." }],
    bibliography: { references: [{ key: "smith2024source", title: "Reliable Source", authors: "Jane Smith", year: "2024" }] }
  }));
  assert.match(byPath(files, "book/chapters/01-chapter.md").content, /\{ref\}`Reliable Source <reference-smith2024source>`/);
});
test("valid base64 images are emitted for root and chapter paths", async () => {
  const files = await filesFor(book({ images: [{ path: "images/A File.PNG", dataUrl: "data:image/png;base64,YQ==" }] }));
  assert.equal(byPath(files, "book/images/a-file.png").encoding, "base64");
  assert.ok(byPath(files, "book/chapters/images/a-file.png"));
});
test("invalid image data is skipped", async () => {
  const files = await filesFor(book({ images: [{ path: "a.png", dataUrl: "bad" }] }));
  assert.equal(files.some((file) => file.path.endsWith("a.png")), false);
});
test("unsafe image paths are skipped", async () => {
  const files = await filesFor(book({ images: [{ path: "../a.png", dataUrl: "data:image/png;base64,YQ==" }] }));
  assert.equal(files.some((file) => file.path.endsWith("a.png")), false);
});
