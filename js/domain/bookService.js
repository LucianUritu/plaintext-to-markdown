import {
  BookNormalizer,
  DEFAULT_BOOK_TITLE,
  DEFAULT_INTRODUCTION_CONTENT
} from "./bookNormalizer.js";
import { CitationKeyGenerator } from "./citationKeyGenerator.js";

export class BookService {
  constructor({ repository, normalizer = new BookNormalizer(), citationKeys = new CitationKeyGenerator() }) {
    this.repository = repository;
    this.normalizer = normalizer;
    this.citationKeys = citationKeys;
  }

  load() {
    const book = this.repository.load();
    if (!book) return null;
    this.normalizer.normalize(book);
    this.save(book);
    return book;
  }

  save(book) {
    this.repository.save(book);
    return book;
  }

  create() {
    const book = {
      id: this.normalizer.idGenerator(),
      title: DEFAULT_BOOK_TITLE,
      images: [],
      introduction: { title: "Introduction", content: DEFAULT_INTRODUCTION_CONTENT },
      chapters: [this.normalizer.createChapter()],
      activeChapterId: null,
      activeItemType: "introduction"
    };
    return this.save(book);
  }

  normalize(book) {
    return this.normalizer.normalize(book);
  }

  addChapter(book) {
    this.normalize(book);
    const chapter = this.normalizer.createChapter("Chapter " + (book.chapters.length + 1));
    book.chapters.push(chapter);
    this.save(book);
    return chapter;
  }

  addBibliography(book) {
    this.normalize(book);
    if (book.bibliography) return book.bibliography;
    book.bibliography = {
      id: this.normalizer.idGenerator(),
      title: "Bibliography",
      content: "Sources and further reading for this book.",
      references: []
    };
    this.save(book);
    return book.bibliography;
  }

  addReference(book, data) {
    this.normalize(book);
    if (!book.bibliography) this.addBibliography(book);
    const reference = this.normalizer.normalizeReference({
      ...data,
      id: this.normalizer.idGenerator(),
      key: this.citationKeys.createUnique(book.bibliography.references, data)
    });
    book.bibliography.references.push(reference);
    this.save(book);
    return reference;
  }

  updateReference(book, referenceId, data) {
    const reference = this.findReference(book, referenceId);
    if (!reference) return null;
    Object.assign(reference, {
      authors: String(data.authors || "").trim(),
      title: String(data.title || "").trim(),
      year: String(data.year || "").trim(),
      url: String(data.url || "").trim()
    });
    this.save(book);
    return reference;
  }

  removeReference(book, referenceId) {
    this.normalize(book);
    if (!book.bibliography) return false;
    const index = book.bibliography.references.findIndex((item) => item.id === referenceId);
    if (index < 0) return false;
    const [removedReference] = book.bibliography.references.splice(index, 1);
    book.chapters.forEach((chapter) => {
      chapter.referenceKeys = chapter.referenceKeys.filter((key) => key !== removedReference.key);
    });
    this.save(book);
    return true;
  }

  removeChapter(book, chapterId) {
    this.normalize(book);
    if (book.chapters.length <= 1) return { success: false, message: "You must keep at least one chapter." };
    const index = book.chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index < 0) return { success: false, message: "Chapter not found." };
    const removedChapter = book.chapters.splice(index, 1)[0];
    if (book.activeChapterId === removedChapter.id) {
      book.activeChapterId = null;
      book.activeItemType = "introduction";
    }
    this.save(book);
    return { success: true, message: removedChapter.title + " removed.", removedChapter };
  }

  moveChapter(book, chapterId, insertionIndex) {
    this.normalize(book);
    const index = book.chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index < 0) return false;
    let target = Math.max(0, Math.min(insertionIndex, book.chapters.length));
    if (index < target) target -= 1;
    if (index === target) return false;
    const [chapter] = book.chapters.splice(index, 1);
    book.chapters.splice(target, 0, chapter);
    this.save(book);
    return true;
  }

  updateBookTitle(book, title) { this.normalize(book); book.title = title.trim() || DEFAULT_BOOK_TITLE; this.save(book); }
  updateIntroductionTitle(book, title) { this.normalize(book); book.introduction.title = title.trim() || "Introduction"; this.save(book); }
  updateIntroductionContent(book, content) { this.normalize(book); book.introduction.content = content; this.save(book); }
  updateBibliographyTitle(book, title) { this.normalize(book); if (book.bibliography) { book.bibliography.title = title.trim() || "Bibliography"; this.save(book); } }
  updateBibliographyContent(book, content) { this.normalize(book); if (book.bibliography) { book.bibliography.content = content; this.save(book); } }

  updateChapterContent(book, chapterId, content) {
    const chapter = this.findChapter(book, chapterId);
    if (chapter) { chapter.content = content; this.save(book); }
  }

  updateChapterTitle(book, chapterId, title) {
    const chapter = this.findChapter(book, chapterId);
    if (chapter) { chapter.title = title.trim() || "Untitled Chapter"; this.save(book); }
  }

  setChapterBibliography(book, chapterId, enabled) {
    const chapter = this.findChapter(book, chapterId);
    if (!chapter) return null;
    chapter.showBibliography = Boolean(enabled);
    this.save(book);
    return chapter;
  }

  addChapterReference(book, chapterId, referenceKey) {
    const chapter = this.findChapter(book, chapterId);
    const key = String(referenceKey || "");
    if (!chapter || !key) return null;
    if (!chapter.referenceKeys.includes(key)) chapter.referenceKeys.push(key);
    this.save(book);
    return chapter;
  }

  removeChapterReference(book, chapterId, referenceKey) {
    const chapter = this.findChapter(book, chapterId);
    const key = String(referenceKey || "");
    if (!chapter || !key) return null;
    chapter.referenceKeys = chapter.referenceKeys.filter((item) => item !== key);
    this.save(book);
    return chapter;
  }

  upsertImage(book, image) {
    this.normalize(book);
    if (!image?.path || !image?.dataUrl) return;
    const saved = {
      path: image.path,
      name: image.name || image.path.split("/").pop(),
      type: image.type || "application/octet-stream",
      dataUrl: image.dataUrl
    };
    const index = book.images.findIndex((item) => item.path === image.path);
    if (index < 0) book.images.push(saved); else book.images[index] = saved;
    this.save(book);
  }

  setActiveChapter(book, chapterId) { this.normalize(book); book.activeItemType = "chapter"; book.activeChapterId = chapterId; this.save(book); }
  setActiveIntroduction(book) { this.normalize(book); book.activeItemType = "introduction"; book.activeChapterId = null; this.save(book); }
  setActiveBibliography(book) { this.normalize(book); if (book.bibliography) { book.activeItemType = "bibliography"; book.activeChapterId = null; this.save(book); } }
  findChapter(book, id) { this.normalize(book); return book.chapters.find((chapter) => chapter.id === id); }
  findReference(book, id) { this.normalize(book); return book.bibliography?.references.find((reference) => reference.id === id) || null; }
}
