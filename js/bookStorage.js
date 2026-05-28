const STORAGE_KEY = "plainTextMarkdownCurrentBook";

export function loadBook() {
  const savedBook = localStorage.getItem(STORAGE_KEY);

  if (!savedBook) {
    return null;
  }

  try {
    const book = JSON.parse(savedBook);
    const normalizedBook = normalizeBook(book);

    saveBook(normalizedBook);

    return normalizedBook;
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
    title: "Enter Book Title",
    images: [],
    introduction: {
      title: "Introduction",
      content:
        "Introduction\n\nWrite the introduction of your book here.\n\nThis page appears before Chapter 1 in the published TeachBooks book."
    },
    chapters: [
      {
        id: crypto.randomUUID(),
        title: "Untitled Chapter",
        content: ""
      }
    ],
    activeChapterId: null,
    activeItemType: "introduction"
  };

  saveBook(book);
  return book;
}

export function addChapter(book) {
  normalizeBook(book);

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

export function removeChapter(book, chapterId) {
  normalizeBook(book);

  if (book.chapters.length <= 1) {
    return {
      success: false,
      message: "You must keep at least one chapter."
    };
  }

  const chapterIndex = book.chapters.findIndex(function (chapter) {
    return chapter.id === chapterId;
  });

  if (chapterIndex === -1) {
    return {
      success: false,
      message: "Chapter not found."
    };
  }

  const removedChapter = book.chapters.splice(chapterIndex, 1)[0];

  if (book.activeChapterId === removedChapter.id) {
    book.activeChapterId = null;
    book.activeItemType = "introduction";
  }

  saveBook(book);

  return {
    success: true,
    message: removedChapter.title + " removed.",
    removedChapter
  };
}

export function updateBookTitle(book, title) {
  normalizeBook(book);

  book.title = title.trim() || "Enter Book Title";
  saveBook(book);
}

export function updateIntroductionTitle(book, title) {
  normalizeBook(book);

  book.introduction.title = title.trim() || "Introduction";
  saveBook(book);
}

export function updateIntroductionContent(book, content) {
  normalizeBook(book);

  book.introduction.content = content;
  saveBook(book);
}

export function updateChapterContent(book, chapterId, content) {
  normalizeBook(book);

  const chapter = findChapterById(book, chapterId);

  if (!chapter) {
    return;
  }

  chapter.content = content;
  saveBook(book);
}

export function updateChapterTitle(book, chapterId, title) {
  normalizeBook(book);

  const chapter = findChapterById(book, chapterId);

  if (!chapter) {
    return;
  }

  chapter.title = title.trim() || "Untitled Chapter";
  saveBook(book);
}

export function upsertBookImage(book, image) {
  normalizeBook(book);

  if (!image || !image.path || !image.dataUrl) {
    return;
  }

  const existingIndex = book.images.findIndex(function (bookImage) {
    return bookImage.path === image.path;
  });

  const savedImage = {
    path: image.path,
    name: image.name || image.path.split("/").pop(),
    type: image.type || "application/octet-stream",
    dataUrl: image.dataUrl
  };

  if (existingIndex === -1) {
    book.images.push(savedImage);
  } else {
    book.images[existingIndex] = savedImage;
  }

  saveBook(book);
}

export function setActiveChapter(book, chapterId) {
  normalizeBook(book);

  book.activeItemType = "chapter";
  book.activeChapterId = chapterId;
  saveBook(book);
}

export function setActiveIntroduction(book) {
  normalizeBook(book);

  book.activeItemType = "introduction";
  book.activeChapterId = null;
  saveBook(book);
}

export function findChapterById(book, chapterId) {
  normalizeBook(book);

  return book.chapters.find(function (chapter) {
    return chapter.id === chapterId;
  });
}

export function normalizeBook(book) {
  if (!book) {
    return book;
  }

  if (!book.id) {
    book.id = crypto.randomUUID();
  }

  if (!book.title) {
    book.title = "Enter Book Title";
  }

  if (!Array.isArray(book.images)) {
    book.images = [];
  }

  book.images = book.images.filter(function (image) {
    return image && image.path && image.dataUrl;
  });

  if (
    book.githubRepository &&
    (!book.githubRepository.owner || !book.githubRepository.repo)
  ) {
    delete book.githubRepository;
  }

  if (!book.introduction) {
    book.introduction = {
      title: "Introduction",
      content:
        "Introduction\n\nWrite the introduction of your book here.\n\nThis page appears before Chapter 1 in the published TeachBooks book."
    };
  }

  if (!book.introduction.title) {
    book.introduction.title = "Introduction";
  }

  if (typeof book.introduction.content !== "string") {
    book.introduction.content = "";
  }

  if (!Array.isArray(book.chapters)) {
    book.chapters = [];
  }

  if (book.chapters.length === 0) {
    book.chapters.push({
      id: crypto.randomUUID(),
      title: "Untitled Chapter",
      content: ""
    });
  }

  book.chapters.forEach(function (chapter, index) {
    if (!chapter.id) {
      chapter.id = crypto.randomUUID();
    }

    if (!chapter.title) {
      chapter.title = "Chapter " + (index + 1);
    }

    if (typeof chapter.content !== "string") {
      chapter.content = "";
    }
  });

  if (!book.activeItemType) {
    book.activeItemType = book.activeChapterId ? "chapter" : "introduction";
  }

  return book;
}
