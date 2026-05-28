const DEFAULT_BOOK_TITLE = "Enter Book Title";
const EXAMPLE_IMAGE_PATH = "images/example.png";
const LOCAL_IMAGE_PATH_PATTERN = /^[a-z0-9._/-]+$/i;

export function validateBookForPublish(book) {
  const errors = [];

  validateTitle(book, errors);
  validateChapters(book, errors);
  validateImages(book, errors);

  return {
    valid: errors.length === 0,
    errors
  };
}

export function formatPublishValidationErrors(errors) {
  return (
    "Please fix these before publishing:\n\n" +
    errors.map(function (error) {
      return "- " + error;
    }).join("\n")
  );
}

function validateTitle(book, errors) {
  const title = String((book && book.title) || "").trim();

  if (!title || title === DEFAULT_BOOK_TITLE) {
    errors.push("Add a real book title.");
  }
}

function validateChapters(book, errors) {
  const chapters = Array.isArray(book && book.chapters) ? book.chapters : [];

  if (chapters.length === 0) {
    errors.push("Add at least one chapter.");
    return;
  }

  const seenTitles = new Map();

  chapters.forEach(function (chapter, index) {
    const chapterNumber = index + 1;
    const title = String((chapter && chapter.title) || "").trim();
    const content = String((chapter && chapter.content) || "").trim();

    if (!title) {
      errors.push("Chapter " + chapterNumber + " needs a real title.");
    }

    if (!content) {
      errors.push("Chapter " + chapterNumber + " is empty.");
    }

    if (title) {
      addDuplicateTitleError({
        errors,
        seenTitles,
        title,
        chapterNumber
      });
    }
  });
}

function addDuplicateTitleError({ errors, seenTitles, title, chapterNumber }) {
  const normalizedTitle = normalizeTitle(title);

  if (!normalizedTitle) {
    return;
  }

  if (seenTitles.has(normalizedTitle)) {
    errors.push(
      "Chapter " +
        chapterNumber +
        " has the same title as chapter " +
        seenTitles.get(normalizedTitle) +
        ": " +
        title +
        "."
    );
    return;
  }

  seenTitles.set(normalizedTitle, chapterNumber);
}

function validateImages(book, errors) {
  const images = Array.isArray(book && book.images) ? book.images : [];
  const imagePaths = new Set();
  const seenImagePaths = new Set();

  images.forEach(function (image) {
    const path = String((image && image.path) || "").trim();

    if (!path) {
      errors.push("One saved image has no file path.");
      return;
    }

    if (!isSafeLocalImagePath(path)) {
      errors.push("Image path is not safe: " + path + ".");
      return;
    }

    if (!isImageDataUrl(image.dataUrl)) {
      errors.push("Image " + path + " is missing valid image data.");
      return;
    }

    if (seenImagePaths.has(path)) {
      errors.push("Image path is used more than once: " + path + ".");
      return;
    }

    seenImagePaths.add(path);
    imagePaths.add(path);
  });

  getBookTextSections(book).forEach(function (section) {
    extractMarkdownImagePaths(section.content).forEach(function (path) {
      validateMarkdownImagePath({
        errors,
        imagePaths,
        sectionName: section.name,
        path
      });
    });
  });
}

function validateMarkdownImagePath({ errors, imagePaths, sectionName, path }) {
  if (isExternalImagePath(path)) {
    return;
  }

  if (!isSafeLocalImagePath(path)) {
    errors.push(sectionName + " has an invalid image path: " + path + ".");
    return;
  }

  if (path === EXAMPLE_IMAGE_PATH) {
    return;
  }

  if (!imagePaths.has(path)) {
    errors.push(sectionName + " references an image that is not saved: " + path + ".");
  }
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

function extractMarkdownImagePaths(markdown) {
  const paths = [];
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match = imagePattern.exec(markdown || "");

  while (match) {
    paths.push(match[1].trim());
    match = imagePattern.exec(markdown || "");
  }

  return paths;
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
