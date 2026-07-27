const DEFAULT_BOOK_TITLE = "Enter Book Title";
const EXAMPLE_IMAGE_PATH = "images/example.png";
const LOCAL_IMAGE_PATH_PATTERN = /^[a-z0-9._/-]+$/i;
const BLOCKING = "blocking";
const WARNING = "warning";
const READY = "ready";

export function validateBookForPublish(book) {
  const readiness = validatePublishReadiness(book);
  const errors = readiness.blockers.map(function (item) {
    return item.message;
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validatePublishReadiness(book) {
  const items = [];

  validateTitle(book, items);
  validateChapters(book, items);
  validateImages(book, items);
  validateReferences(book, items);

  return {
    ready: items.every((item) => item.status !== BLOCKING),
    blockers: items.filter((item) => item.status === BLOCKING),
    warnings: items.filter((item) => item.status === WARNING),
    passed: items.filter((item) => item.status === READY),
    items
  };
}

export function formatPublishValidationErrors(errors) {
  return (
    "Please fix these before publishing:\n\n" +
    errors.map(function (error) {
      return "- " + error;
    }).join("\n") +
    "\n\nWhat to do next:\nFix the items above, then publish again."
  );
}

function validateTitle(book, items) {
  const title = String((book && book.title) || "").trim();

  if (!title || title === DEFAULT_BOOK_TITLE) {
    items.push(createItem(BLOCKING, "Title", "Add a real book title."));
    return;
  }

  items.push(createItem(READY, "Title", "Book title is ready."));
}

function validateChapters(book, items) {
  const chapters = Array.isArray(book && book.chapters) ? book.chapters : [];

  if (chapters.length === 0) {
    items.push(createItem(BLOCKING, "Chapters", "Add at least one chapter."));
    return;
  }

  items.push(createItem(READY, "Chapters", chapters.length + " chapter" + (chapters.length === 1 ? "" : "s") + " available."));

  const seenTitles = new Map();

  chapters.forEach(function (chapter, index) {
    const chapterNumber = index + 1;
    const title = String((chapter && chapter.title) || "").trim();
    const content = String((chapter && chapter.content) || "").trim();

    if (!title) {
      items.push(createItem(BLOCKING, "Chapters", "Chapter " + chapterNumber + " needs a real title."));
    }

    if (!content) {
      items.push(createItem(BLOCKING, "Chapters", "Chapter " + chapterNumber + " is empty."));
    }

    if (title) {
      addDuplicateTitleError({
        items,
        seenTitles,
        title,
        chapterNumber
      });
    }
  });
}

function addDuplicateTitleError({ items, seenTitles, title, chapterNumber }) {
  const normalizedTitle = normalizeTitle(title);

  if (!normalizedTitle) {
    return;
  }

  if (seenTitles.has(normalizedTitle)) {
    items.push(createItem(
      BLOCKING,
      "Chapters",
      "Chapter " +
        chapterNumber +
        " has the same title as chapter " +
        seenTitles.get(normalizedTitle) +
        ": " +
        title +
        "."
    ));
    return;
  }

  seenTitles.set(normalizedTitle, chapterNumber);
}

function validateImages(book, items) {
  const images = Array.isArray(book && book.images) ? book.images : [];
  const imagePaths = new Set();
  const seenImagePaths = new Set();

  if (images.length === 0) {
    items.push(createItem(READY, "Images", "No saved images need validation."));
  }

  images.forEach(function (image) {
    const path = String((image && image.path) || "").trim();

    if (!path) {
      items.push(createItem(BLOCKING, "Images", "One saved image has no file path."));
      return;
    }

    if (!isSafeLocalImagePath(path)) {
      items.push(createItem(BLOCKING, "Images", "Image path is not safe: " + path + "."));
      return;
    }

    if (!isImageDataUrl(image.dataUrl)) {
      items.push(createItem(BLOCKING, "Images", "Image " + path + " is missing valid image data."));
      return;
    }

    if (seenImagePaths.has(path)) {
      items.push(createItem(BLOCKING, "Images", "Image path is used more than once: " + path + "."));
      return;
    }

    seenImagePaths.add(path);
    imagePaths.add(path);
  });

  getBookTextSections(book).forEach(function (section) {
    extractMarkdownImages(section.content).forEach(function (image) {
      if (!String(image.alt || "").trim()) {
        items.push(createItem(WARNING, "Images", section.name + " has an image without alt text: " + image.path + "."));
      }

      validateMarkdownImagePath({
        items,
        imagePaths,
        sectionName: section.name,
        path: image.path
      });
    });
  });
}

function validateMarkdownImagePath({ items, imagePaths, sectionName, path }) {
  if (isExternalImagePath(path)) {
    return;
  }

  if (!isSafeLocalImagePath(path)) {
    items.push(createItem(BLOCKING, "Images", sectionName + " has an invalid image path: " + path + "."));
    return;
  }

  if (path === EXAMPLE_IMAGE_PATH) {
    return;
  }

  if (!imagePaths.has(path)) {
    items.push(createItem(BLOCKING, "Images", sectionName + " references an image that is not saved: " + path + "."));
  }
}

function validateReferences(book, items) {
  const references = Array.isArray(book?.bibliography?.references)
    ? book.bibliography.references
    : [];
  const referencesByKey = new Map(references.map((reference) => [reference.key, reference]));
  const citedKeys = new Set();
  const chapters = Array.isArray(book && book.chapters) ? book.chapters : [];

  getBookTextSections(book).forEach(function (section) {
    extractCitationKeys(section.content).forEach(function (key) {
      citedKeys.add(key);
      if (!referencesByKey.has(key)) {
        items.push(createItem(BLOCKING, "References", section.name + " cites a missing reference: " + key + "."));
      }
    });
  });

  if (citedKeys.size > 0 && references.length === 0) {
    items.push(createItem(BLOCKING, "References", "Add bibliography references before publishing cited chapters."));
  } else if (references.length === 0) {
    items.push(createItem(READY, "References", "No references are required for this book."));
  } else {
    items.push(createItem(READY, "References", references.length + " reference" + (references.length === 1 ? "" : "s") + " available."));
  }

  chapters.forEach(function (chapter, index) {
    validateChapterBibliography({
      chapter,
      chapterNumber: index + 1,
      referencesByKey,
      items
    });
  });
}

function validateChapterBibliography({ chapter, chapterNumber, referencesByKey, items }) {
  const referenceKeys = Array.isArray(chapter?.referenceKeys)
    ? chapter.referenceKeys
    : [];
  const uniqueKeys = new Set(referenceKeys);
  const sectionName = "Chapter " + chapterNumber;

  referenceKeys.forEach(function (key) {
    if (!referencesByKey.has(key)) {
      items.push(createItem(BLOCKING, "References", sectionName + " includes a missing chapter bibliography reference: " + key + "."));
    }
  });

  if (chapter?.showBibliography && uniqueKeys.size === 0) {
    items.push(createItem(WARNING, "References", sectionName + " has chapter references enabled but no references selected."));
  }

  if (!chapter?.showBibliography && uniqueKeys.size > 0) {
    items.push(createItem(WARNING, "References", sectionName + " has selected chapter references, but the chapter reference list is hidden."));
  }

  const citedKeys = extractCitationKeys(chapter?.content || "");
  citedKeys.forEach(function (key) {
    if (
      referencesByKey.has(key) &&
      chapter?.showBibliography &&
      !uniqueKeys.has(key)
    ) {
      items.push(createItem(WARNING, "References", sectionName + " cites " + key + " but does not include it in the chapter reference list."));
    }
  });
}

function getBookTextSections(book) {
  const sections = [];

  if (book && book.introduction) {
    sections.push({
      name: "Introduction",
      content: book.introduction.content || ""
    });
  }

  const chapters = Array.isArray(book && book.chapters) ? book.chapters : [];

  chapters.forEach(function (chapter, index) {
    sections.push({
      name: "Chapter " + (index + 1),
      content: (chapter && chapter.content) || ""
    });
  });

  return sections;
}

function extractMarkdownImages(markdown) {
  const images = [];
  const imagePattern = /!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match = imagePattern.exec(markdown || "");

  while (match) {
    images.push({
      alt: match[1].trim(),
      path: match[2].trim()
    });
    match = imagePattern.exec(markdown || "");
  }

  return images;
}

function extractCitationKeys(markdown) {
  const keys = [];
  const text = String(markdown || "");
  const citePattern = /\{cite\}`([a-z0-9._:-]+)`/gi;
  const refPattern = /\{ref\}`[^`<]*<reference-([a-z0-9._:-]+)>`/gi;
  let match = citePattern.exec(text);

  while (match) {
    keys.push(match[1]);
    match = citePattern.exec(text);
  }

  match = refPattern.exec(text);

  while (match) {
    keys.push(match[1]);
    match = refPattern.exec(text);
  }

  return keys;
}

function isExternalImagePath(path) {
  return /^(https?:|data:image\/)/i.test(path);
}

function isSafeLocalImagePath(path) {
  const normalizedPath = String(path || "").replace(/\\/g, "/");

  return (
    normalizedPath === path &&
    normalizedPath.length > 0 &&
    !normalizedPath.startsWith("/") &&
    !normalizedPath.includes("../") &&
    !normalizedPath.includes("./") &&
    !normalizedPath.split("/").some(function (part) {
      return part.length === 0 || part === "." || part === "..";
    }) &&
    LOCAL_IMAGE_PATH_PATTERN.test(normalizedPath)
  );
}

function isImageDataUrl(dataUrl) {
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(
    String(dataUrl || "")
  );
}

function normalizeTitle(title) {
  return String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function createItem(status, category, message) {
  return { status, category, message };
}
