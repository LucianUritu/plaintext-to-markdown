const test = require("node:test");
const assert = require("node:assert/strict");

const modules = Promise.all([
  import("../js/domain/citationKeyGenerator.js"),
  import("../js/domain/bookNormalizer.js"),
  import("../js/domain/bookRepository.js"),
  import("../js/domain/bookService.js")
]);

function createContext() {
  let nextId = 0;
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
  return modules.then(([keys, normalizers, repositories, services]) => {
    const normalizer = new normalizers.BookNormalizer({ idGenerator: () => "id-" + (++nextId) });
    const repository = new repositories.LocalBookRepository({ storage, logger: { error() {} } });
    const service = new services.BookService({ repository, normalizer, citationKeys: new keys.CitationKeyGenerator() });
    return { data, keys, normalizer, repository, service, storage };
  });
}

test("citation keys use surname, year, and first title word", async () => {
  const { keys } = await createContext();
  assert.equal(new keys.CitationKeyGenerator().create({ authors: "Jane van Smith and John Doe", year: "2024", title: "Reliable Sources" }), "smith2024reliable");
});
test("citation keys support semicolon-separated authors", async () => {
  const { keys } = await createContext();
  assert.equal(new keys.CitationKeyGenerator().create({ authors: "Ada Lovelace; Alan Turing", year: "1843", title: "Notes" }), "lovelace1843notes");
});
test("citation keys have anonymous and no-date fallbacks", async () => {
  const { keys } = await createContext();
  assert.equal(new keys.CitationKeyGenerator().create({}), "anonymousndsource");
});
test("citation keys strip punctuation", async () => {
  const { keys } = await createContext();
  assert.equal(new keys.CitationKeyGenerator().create({ authors: "O'Neil", title: "C++", year: "In 2020" }), "oneil2020c");
});
test("unique citation keys add numeric suffixes", async () => {
  const { keys } = await createContext();
  const generator = new keys.CitationKeyGenerator();
  const data = { authors: "Jane Smith", year: "2024", title: "Book" };
  assert.equal(generator.createUnique([{ key: "smith2024book" }, { key: "smith2024book2" }], data), "smith2024book3");
});
test("repository returns null when empty", async () => {
  const { repository } = await createContext();
  assert.equal(repository.load(), null);
});
test("repository round-trips JSON", async () => {
  const { repository } = await createContext();
  repository.save({ title: "Book" });
  assert.deepEqual(repository.load(), { title: "Book" });
});
test("repository handles malformed JSON", async () => {
  const { repository, storage } = await createContext();
  storage.setItem("plainTextMarkdownCurrentBook", "{");
  assert.equal(repository.load(), null);
});
test("book service creates a complete default book", async () => {
  const { service } = await createContext();
  const book = service.create();
  assert.equal(book.title, "Enter Book Title");
  assert.equal(book.chapters.length, 1);
  assert.equal(book.activeItemType, "introduction");
});
test("book service loads and normalizes saved books", async () => {
  const { repository, service } = await createContext();
  repository.save({ title: "Legacy", chapters: [] });
  const book = service.load();
  assert.equal(book.chapters.length, 1);
  assert.equal(book.introduction.title, "Introduction");
});
test("normalizer removes invalid images and repositories", async () => {
  const { normalizer } = await createContext();
  const book = normalizer.normalize({ images: [null, { path: "x" }, { path: "x", dataUrl: "data" }], githubRepository: { owner: "me" } });
  assert.equal(book.images.length, 1);
  assert.equal(book.githubRepository, undefined);
});
test("normalizer preserves valid repository metadata", async () => {
  const { normalizer } = await createContext();
  const book = normalizer.normalize({ githubRepository: { owner: "me", repo: "book" } });
  assert.deepEqual(book.githubRepository, { owner: "me", repo: "book" });
});
test("normalizer activates first chapter when introduction is hidden", async () => {
  const { normalizer } = await createContext();
  const book = normalizer.normalize({ hideIntroductionCard: true, activeItemType: "introduction", chapters: [{ id: "c", title: "C", content: "" }] });
  assert.equal(book.activeItemType, "chapter");
  assert.equal(book.activeChapterId, "c");
});
test("normalizer prepares chapter bibliography settings", async () => {
  const { normalizer } = await createContext();
  const book = normalizer.normalize({
    chapters: [{
      id: "c",
      title: "C",
      content: "",
      showBibliography: true,
      referenceKeys: ["a", "a", "", "b"]
    }]
  });
  assert.equal(book.chapters[0].showBibliography, true);
  assert.deepEqual(book.chapters[0].referenceKeys, ["a", "b"]);
});
test("addChapter assigns sequential display title", async () => {
  const { service } = await createContext();
  const book = service.create();
  assert.equal(service.addChapter(book).title, "Chapter 2");
});
test("removeChapter refuses to remove the last chapter", async () => {
  const { service } = await createContext();
  const book = service.create();
  assert.equal(service.removeChapter(book, book.chapters[0].id).success, false);
});
test("removeChapter resets active editor", async () => {
  const { service } = await createContext();
  const book = service.create();
  const chapter = service.addChapter(book);
  service.setActiveChapter(book, chapter.id);
  assert.equal(service.removeChapter(book, chapter.id).success, true);
  assert.equal(book.activeItemType, "introduction");
});
test("removeChapter reports unknown ids", async () => {
  const { service } = await createContext();
  const book = service.create();
  service.addChapter(book);
  assert.equal(service.removeChapter(book, "missing").message, "Chapter not found.");
});
test("moveChapter moves forward and adjusts insertion index", async () => {
  const { service } = await createContext();
  const book = service.create();
  const second = service.addChapter(book);
  const third = service.addChapter(book);
  service.moveChapter(book, second.id, 3);
  assert.deepEqual(book.chapters.map((item) => item.id), [book.chapters[0].id, third.id, second.id]);
});
test("moveChapter clamps negative indices", async () => {
  const { service } = await createContext();
  const book = service.create();
  const second = service.addChapter(book);
  assert.equal(service.moveChapter(book, second.id, -10), true);
  assert.equal(book.chapters[0].id, second.id);
});
test("moveChapter returns false for missing or unchanged chapters", async () => {
  const { service } = await createContext();
  const book = service.create();
  assert.equal(service.moveChapter(book, "missing", 0), false);
  assert.equal(service.moveChapter(book, book.chapters[0].id, 0), false);
});
test("bibliography is a singleton", async () => {
  const { service } = await createContext();
  const book = service.create();
  assert.equal(service.addBibliography(book), service.addBibliography(book));
});
test("bibliographies and references survive repository reloads", async () => {
  const { service } = await createContext();
  const book = service.create();
  service.addReference(book, { authors: "Jane Smith", title: "Source", year: "2025" });
  const reloaded = service.load();
  assert.equal(reloaded.bibliography.title, "Bibliography");
  assert.equal(reloaded.bibliography.references[0].key, "smith2025source");
});
test("adding a reference creates a bibliography when absent", async () => {
  const { service } = await createContext();
  const book = service.create();
  const reference = service.addReference(book, { authors: "Jane Smith", title: "Source", year: "2025" });
  assert.equal(book.bibliography.references[0], reference);
  assert.equal(reference.key, "smith2025source");
});
test("duplicate references receive unique keys", async () => {
  const { service } = await createContext();
  const book = service.create();
  const data = { authors: "Jane Smith", title: "Source", year: "2025" };
  service.addReference(book, data);
  assert.equal(service.addReference(book, data).key, "smith2025source2");
});
test("editing reference metadata preserves its citation key", async () => {
  const { service } = await createContext();
  const book = service.create();
  const reference = service.addReference(book, { authors: "A B", title: "Old" });
  const key = reference.key;
  service.updateReference(book, reference.id, { authors: "C D", title: "New", year: "2026", url: "https://x" });
  assert.equal(reference.key, key);
  assert.equal(reference.title, "New");
});
test("editing a missing reference returns null", async () => {
  const { service } = await createContext();
  assert.equal(service.updateReference(service.create(), "missing", {}), null);
});
test("references can be removed", async () => {
  const { service } = await createContext();
  const book = service.create();
  const reference = service.addReference(book, { title: "Source" });
  assert.equal(service.removeReference(book, reference.id), true);
  assert.equal(service.removeReference(book, reference.id), false);
});
test("chapter bibliographies track selected reference keys", async () => {
  const { service } = await createContext();
  const book = service.create();
  const reference = service.addReference(book, { title: "Source" });
  const chapter = book.chapters[0];
  service.setChapterBibliography(book, chapter.id, true);
  service.addChapterReference(book, chapter.id, reference.key);
  service.addChapterReference(book, chapter.id, reference.key);
  assert.equal(chapter.showBibliography, true);
  assert.deepEqual(chapter.referenceKeys, [reference.key]);
  service.removeChapterReference(book, chapter.id, reference.key);
  assert.deepEqual(chapter.referenceKeys, []);
});
test("removing a reference removes it from chapter bibliographies", async () => {
  const { service } = await createContext();
  const book = service.create();
  const reference = service.addReference(book, { title: "Source" });
  const chapter = book.chapters[0];
  service.addChapterReference(book, chapter.id, reference.key);
  service.removeReference(book, reference.id);
  assert.deepEqual(chapter.referenceKeys, []);
});
test("title updates use safe fallbacks", async () => {
  const { service } = await createContext();
  const book = service.create();
  service.updateBookTitle(book, "  ");
  service.updateChapterTitle(book, book.chapters[0].id, " ");
  assert.equal(book.title, "Enter Book Title");
  assert.equal(book.chapters[0].title, "Untitled Chapter");
});
test("content and active editor updates are persisted", async () => {
  const { repository, service } = await createContext();
  const book = service.create();
  service.updateChapterContent(book, book.chapters[0].id, "Body");
  service.setActiveChapter(book, book.chapters[0].id);
  assert.equal(repository.load().chapters[0].content, "Body");
  assert.equal(repository.load().activeItemType, "chapter");
});
test("images are inserted and replaced by path", async () => {
  const { service } = await createContext();
  const book = service.create();
  service.upsertImage(book, { path: "images/a.png", dataUrl: "data:1" });
  service.upsertImage(book, { path: "images/a.png", dataUrl: "data:2", type: "image/png" });
  assert.equal(book.images.length, 1);
  assert.equal(book.images[0].dataUrl, "data:2");
});
