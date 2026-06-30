export const BOOK_STORAGE_KEY = "plainTextMarkdownCurrentBook";

export class LocalBookRepository {
  constructor({ storage, key = BOOK_STORAGE_KEY, logger = console } = {}) {
    this.storage = storage;
    this.key = key;
    this.logger = logger;
  }

  load() {
    const savedBook = this.getStorage().getItem(this.key);
    if (!savedBook) return null;

    try {
      return JSON.parse(savedBook);
    } catch (error) {
      this.logger.error("Could not load saved book:", error);
      return null;
    }
  }

  save(book) {
    this.getStorage().setItem(this.key, JSON.stringify(book));
  }

  getStorage() {
    const storage = this.storage || globalThis.localStorage;
    if (!storage) throw new Error("A storage implementation is required.");
    return storage;
  }
}
