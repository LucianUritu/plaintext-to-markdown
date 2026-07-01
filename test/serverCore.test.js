const test = require("node:test");
const assert = require("node:assert/strict");
const parser = require("../server/teachBooksParser");
const { HttpRouter } = require("../server/router");
const { PagesUrlResolver, VersionBranchPagesUrlStrategy, DefaultBranchPagesUrlStrategy } = require("../server/publishingTargets");
const { VersioningService } = require("../server/versioningService");
const { createSessionStore } = require("../server/sessionStore");
const { TeachBooksService } = require("../server/teachBooksService");

test("base64 text is decoded", () => assert.equal(parser.decodeBase64Text(Buffer.from("héllo").toString("base64")), "héllo"));
test("YAML titles are read and unquoted", () => assert.equal(parser.readYamlTitle('title: "My Book"'), "My Book"));
test("missing YAML titles return empty strings", () => assert.equal(parser.readYamlTitle("author: A"), ""));
test("markdown documents split title and body", () => assert.deepEqual(parser.parseMarkdownDocument("# Title\n\nBody"), { title: "Title", content: "Body" }));
test("markdown without a heading remains body content", () => assert.deepEqual(parser.parseMarkdownDocument("Body"), { title: "", content: "Body" }));
test("BibTeX references are parsed into editable reference models", () => {
  const [reference] = parser.parseBibTexReferences("@misc{smith2024source,\n  title = {Reliable \\& Useful},\n  author = {Jane Smith and John Doe},\n  year = {2024},\n  url = {https://example.com}\n}\n");
  assert.equal(reference.key, "smith2024source");
  assert.equal(reference.title, "Reliable & Useful");
  assert.equal(reference.authors, "Jane Smith; John Doe");
});
test("generated bibliography lists are removed from editable page content", () => {
  const markdown = "Intro text.\n\n<!-- bibliography-references:start -->\n## References\nEntry\n<!-- bibliography-references:end -->";
  assert.equal(parser.stripGeneratedBibliographyContent(markdown), "Intro text.");
});
test("TOC root defaults to intro.md", () => assert.equal(parser.readRootPathFromToc("format: jb-book"), "intro.md"));
test("TOC root receives markdown extension", () => assert.equal(parser.readRootPathFromToc("root: start"), "start.md"));
test("TOC chapter paths are read and deduplicated", () => {
  const toc = "root: intro\nparts:\n  - caption: Main\n    chapters:\n      - file: one\n      - file: one\n      - file: two.md";
  assert.deepEqual(parser.readChapterPathsFromToc(toc), ["one.md", "two.md"]);
});
test("TOC root is excluded from chapters", () => assert.deepEqual(parser.readChapterPathsFromToc("root: intro\nchapters:\n  - file: intro\n  - file: one"), ["one.md"]));
test("TOC section children are excluded", () => {
  const toc = "root: intro\nchapters:\n  - file: one\n    sections:\n      - file: nested";
  assert.deepEqual(parser.readChapterPathsFromToc(toc), ["one.md"]);
});
test("TOC entries retain captions", () => assert.equal(parser.readChapterEntriesFromToc("root: intro\nparts:\n  - caption: Part A\n    chapters:\n      - file: one")[0].caption, "Part A"));
test("router invokes matching GET routes", async () => {
  const router = new HttpRouter(); let called = false;
  router.get("/x", async () => { called = true; });
  assert.equal(await router.handle({ method: "GET" }, {}, new URL("http://x/x")), true);
  assert.equal(called, true);
});
test("router rejects wrong methods", async () => {
  const router = new HttpRouter(); router.get("/x", async () => {});
  assert.equal(await router.handle({ method: "POST" }, {}, new URL("http://x/x")), false);
});
test("router supports prefix routes", async () => {
  const router = new HttpRouter(); router.getPrefix("/assets/", async () => {});
  assert.equal(await router.handle({ method: "GET" }, {}, new URL("http://x/assets/a.js")), true);
});
test("default Pages URL targets repository root", () => assert.equal(new PagesUrlResolver().resolve({ owner: "a", repo: "b", branch: "main" }), "https://a.github.io/b/"));
test("version Pages URL includes normalized branch", () => assert.equal(new PagesUrlResolver().resolve({ owner: "a", repo: "b", branch: "version/v1" }), "https://a.github.io/b/version-v1/"));
test("version strategy only supports version branches", () => {
  const strategy = new VersionBranchPagesUrlStrategy();
  assert.equal(strategy.supports("version/x"), true); assert.equal(strategy.supports("main"), false);
});
test("default strategy is a fallback", () => assert.equal(new DefaultBranchPagesUrlStrategy().supports("anything"), true));
test("versioning service maps labels and page URLs", async () => {
  const githubClient = { async listBranches() { return [{ name: "version/v1", commitSha: "x" }]; } };
  const [version] = await new VersioningService(githubClient).listVersionBranches({ owner: "a", repo: "b" });
  assert.equal(version.version, "v1"); assert.match(version.pagesUrl, /version-v1/);
});
test("versioning service delegates commit lookup", async () => {
  const githubClient = { getCommitBySha(args) { return args; } };
  assert.deepEqual(new VersioningService(githubClient).getCommit({ owner: "a", repo: "b", sha: "c" }), { owner: "a", repo: "b", sha: "c" });
});
test("sessions are created and returned from signed cookies", () => {
  const store = createSessionStore("secret"); const response = fakeResponse();
  const session = store.getOrCreateSession({ headers: {} }, response);
  const cookie = response.header.split(";")[0];
  assert.equal(store.getSessionFromRequest({ headers: { cookie } }).id, session.id);
});
test("tampered session cookies are rejected", () => {
  const store = createSessionStore("secret");
  assert.equal(store.getSessionFromRequest({ headers: { cookie: "bookPlatformSession=id.bad" } }), null);
});
test("destroying a session expires its cookie", () => {
  const store = createSessionStore("secret"); const response = fakeResponse();
  store.destroySession({ headers: {} }, response);
  assert.match(response.header, /Max-Age=0/);
});
test("secure sessions set Secure cookies", () => {
  const store = createSessionStore("secret", { secureCookie: true }); const response = fakeResponse();
  store.getOrCreateSession({ headers: {} }, response);
  assert.match(response.header, /Secure/);
});
test("GitHub books restore bibliography pages and references", async () => {
  const files = {
    "book/_config.yml": "title: Book\nbibtex_bibfiles:\n  - references.bib\n",
    "book/_toc.yml": "format: jb-book\nroot: intro\nparts:\n  - caption: Chapters\n    chapters:\n      - file: chapters/one\n  - caption: References\n    chapters:\n      - file: bibliography\n",
    "book/intro.md": "# Introduction\n\nWelcome",
    "book/chapters/one.md": "# One\n\nBody",
    "book/bibliography.md": "# Bibliography\n\nNotes\n\n<!-- bibliography-references:start -->\n## References\nGenerated list\n<!-- bibliography-references:end -->",
    "book/references.bib": "@misc{smith2024source,\n  title = {Reliable Source},\n  author = {Jane Smith},\n  year = {2024}\n}\n"
  };
  const githubClient = {
    async fetchRepositoryFile({ path }) {
      return files[path] ? { content: Buffer.from(files[path]).toString("base64") } : null;
    }
  };
  const loaded = await new TeachBooksService(githubClient).loadBook({ owner: "alice", repoName: "book", branch: "main" });
  assert.equal(loaded.chapters.length, 1);
  assert.equal(loaded.chapters[0].title, "One");
  assert.equal(loaded.bibliography.content, "Notes");
  assert.equal(loaded.bibliography.references[0].title, "Reliable Source");
});

function fakeResponse() { return { header: "", setHeader(name, value) { if (name === "Set-Cookie") this.header = value; } }; }
