const STORAGE_KEY = "plainTextMarkdownCurrentBook";

export function loadBook() {
  const savedBook = localStorage.getItem(STORAGE_KEY);

  if (!savedBook) {
    return null;
  }

  try {
    return JSON.parse(savedBook);
  } catch (error) {
    console.error("Could not load saved book:", error);
    return null;
  }
}

export function saveBook(book) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function createNewBook() {
  const book = {
    id: crypto.randomUUID(),
    title: "Untitled Book",
    chapters: [
      {
        id: crypto.randomUUID(),
        title: "Chapter 1",
        content: ""
      }
    ],
    activeChapterId: null
  };

  saveBook(book);
  return book;
}

export function addChapter(book) {
  const chapterNumber = book.chapters.length + 1;

  const newChapter = {
    id: crypto.randomUUID(),
    title: "Chapter " + chapterNumber,
    content: ""
  };

  book.chapters.push(newChapter);
  saveBook(book);

  return newChapter;
}

export function updateChapterContent(book, chapterId, content) {
  const chapter = findChapterById(book, chapterId);

  if (!chapter) {
    return;
  }

  chapter.content = content;
  saveBook(book);
}

export function updateChapterTitle(book, chapterId, title) {
  const chapter = findChapterById(book, chapterId);

  if (!chapter) {
    return;
  }

  chapter.title = title.trim() || "Untitled Chapter";
  saveBook(book);
}

  export function setActiveChapter(book, chapterId) {
    book.activeChapterId = chapterId;
    saveBook(book);
  }

  export function findChapterById(book, chapterId) {
    return book.chapters.find(function (chapter) {
    return chapter.id === chapterId;
  });

  export function updateBookTitle(book, title) {
    book.title = title.trim() || "Untitled Book";
    saveBook(book);
  }
}