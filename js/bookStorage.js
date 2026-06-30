import { LocalBookRepository } from "./domain/bookRepository.js";
import { BookService } from "./domain/bookService.js";

const service = new BookService({ repository: new LocalBookRepository() });

export const loadBook = () => service.load();
export const saveBook = (book) => service.save(book);
export const createNewBook = () => service.create();
export const addChapter = (book) => service.addChapter(book);
export const addBibliography = (book) => service.addBibliography(book);
export const addReference = (book, data) => service.addReference(book, data);
export const updateReference = (book, id, data) => service.updateReference(book, id, data);
export const removeReference = (book, id) => service.removeReference(book, id);
export const removeChapter = (book, id) => service.removeChapter(book, id);
export const moveChapter = (book, id, index) => service.moveChapter(book, id, index);
export const updateBookTitle = (book, title) => service.updateBookTitle(book, title);
export const updateIntroductionTitle = (book, title) => service.updateIntroductionTitle(book, title);
export const updateIntroductionContent = (book, content) => service.updateIntroductionContent(book, content);
export const updateBibliographyTitle = (book, title) => service.updateBibliographyTitle(book, title);
export const updateBibliographyContent = (book, content) => service.updateBibliographyContent(book, content);
export const updateChapterContent = (book, id, content) => service.updateChapterContent(book, id, content);
export const updateChapterTitle = (book, id, title) => service.updateChapterTitle(book, id, title);
export const upsertBookImage = (book, image) => service.upsertImage(book, image);
export const setActiveChapter = (book, id) => service.setActiveChapter(book, id);
export const setActiveIntroduction = (book) => service.setActiveIntroduction(book);
export const setActiveBibliography = (book) => service.setActiveBibliography(book);
export const findChapterById = (book, id) => service.findChapter(book, id);
export const findReferenceById = (book, id) => service.findReference(book, id);
export const normalizeBook = (book) => service.normalize(book);

export { BookService, LocalBookRepository };
