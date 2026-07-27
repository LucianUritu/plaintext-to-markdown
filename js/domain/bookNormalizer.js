import { CitationKeyGenerator } from "./citationKeyGenerator.js";

export const DEFAULT_BOOK_TITLE = "Enter Book Title";
export const DEFAULT_INTRODUCTION_CONTENT =
  "Introduction\n\nWrite the introduction of your book here.\n\n" +
  "This page appears before Chapter 1 in the published TeachBooks book.";

export class BookNormalizer {
  constructor({ idGenerator = defaultIdGenerator, citationKeys = new CitationKeyGenerator() } = {}) {
    this.idGenerator = idGenerator;
    this.citationKeys = citationKeys;
  }

  normalize(book) {
    if (!book) return book;

    book.id ||= this.idGenerator();
    book.title ||= DEFAULT_BOOK_TITLE;
    book.images = Array.isArray(book.images)
      ? book.images.filter((image) => image && image.path && image.dataUrl)
      : [];

    if (book.githubRepository && (!book.githubRepository.owner || !book.githubRepository.repo)) {
      delete book.githubRepository;
    }

    book.introduction ||= {
      title: "Introduction",
      content: DEFAULT_INTRODUCTION_CONTENT
    };
    book.introduction.title ||= "Introduction";
    if (typeof book.introduction.content !== "string") book.introduction.content = "";

    if (!Array.isArray(book.chapters)) book.chapters = [];
    if (book.chapters.length === 0) {
      book.chapters.push(this.createChapter("Untitled Chapter"));
    }
    book.chapters.forEach((chapter, index) => {
      chapter.id ||= this.idGenerator();
      chapter.title ||= "Chapter " + (index + 1);
      if (typeof chapter.content !== "string") chapter.content = "";
      chapter.showBibliography = Boolean(chapter.showBibliography);
      chapter.referenceKeys = Array.isArray(chapter.referenceKeys)
        ? Array.from(new Set(chapter.referenceKeys.map(String).filter(Boolean)))
        : [];
    });

    if (book.bibliography) this.normalizeBibliography(book.bibliography);

    book.activeItemType ||= book.activeChapterId ? "chapter" : "introduction";
    if (book.hideIntroductionCard && book.activeItemType === "introduction") {
      book.activeItemType = "chapter";
      book.activeChapterId = book.chapters[0]?.id || null;
    }
    return book;
  }

  normalizeBibliography(bibliography) {
    bibliography.id ||= this.idGenerator();
    bibliography.title ||= "Bibliography";
    if (typeof bibliography.content !== "string") bibliography.content = "";
    const references = Array.isArray(bibliography.references)
      ? bibliography.references.filter((reference) => reference && reference.title)
      : [];
    bibliography.references = references.map((reference) => this.normalizeReference(reference));
  }

  normalizeReference(reference) {
    reference.id ||= this.idGenerator();
    reference.key ||= this.citationKeys.create(reference);
    reference.authors = String(reference.authors || "").trim();
    reference.title = String(reference.title || "").trim();
    reference.year = String(reference.year || "").trim();
    reference.url = String(reference.url || "").trim();
    return reference;
  }

  createChapter(title = "Untitled Chapter") {
    return { id: this.idGenerator(), title, content: "" };
  }
}

function defaultIdGenerator() {
  return globalThis.crypto.randomUUID();
}
