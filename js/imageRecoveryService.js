export class BookRepositoryResolver {
  resolve(book) {
    if (book.source === "github" && book.owner && book.repo) {
      return {
        owner: book.owner,
        repo: book.repo,
        branch: book.branch || "main"
      };
    }

    if (book.githubRepository && book.githubRepository.owner && book.githubRepository.repo) {
      return {
        owner: book.githubRepository.owner,
        repo: book.githubRepository.repo,
        branch: book.githubRepository.branch || "main"
      };
    }

    return null;
  }
}

export class MarkdownImageReferenceExtractor {
  getMissingImagePaths(book) {
    const savedImagesByPath = this.getSavedImagesByPath(book);
    const missingPaths = new Set();

    this.getTextContent(book).forEach((content) => {
      this.extractLocalImagePaths(content).forEach(function (path) {
        const savedImage = savedImagesByPath.get(path);

        if (!savedImage || !savedImage.dataUrl) {
          missingPaths.add(path);
        }
      });
    });

    return Array.from(missingPaths);
  }

  getSavedImagesByPath(book) {
    const savedImagesByPath = new Map();

    if (Array.isArray(book.images)) {
      book.images.forEach(function (image) {
        savedImagesByPath.set(image.path, image);
      });
    }

    return savedImagesByPath;
  }

  getTextContent(book) {
    const contents = [];

    if (book.introduction) {
      contents.push(book.introduction.content || "");
    }

    if (Array.isArray(book.chapters)) {
      book.chapters.forEach(function (chapter) {
        contents.push(chapter.content || "");
      });
    }

    if (book.bibliography) {
      contents.push(book.bibliography.content || "");
    }

    return contents;
  }

  extractLocalImagePaths(markdown) {
    const paths = [];
    const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match = imagePattern.exec(markdown || "");

    while (match) {
      const path = this.normalizeLocalImagePath(match[1]);

      if (path) {
        paths.push(path);
      }

      match = imagePattern.exec(markdown || "");
    }

    return paths;
  }

  normalizeLocalImagePath(path) {
    const normalizedPath = String(path || "").replace(/\\/g, "/").trim();

    if (
      !normalizedPath ||
      /^(https?:|data:image\/)/i.test(normalizedPath) ||
      normalizedPath.startsWith("/") ||
      normalizedPath.includes("../")
    ) {
      return "";
    }

    return normalizedPath.replace(/^book\//, "");
  }
}

export class ImageRecoveryService {
  constructor({
    loadBook,
    saveImage,
    saveBook,
    repositoryResolver = new BookRepositoryResolver(),
    imageReferenceExtractor = new MarkdownImageReferenceExtractor(),
    logger = console
  } = {}) {
    this.loadBook = loadBook;
    this.saveImage = saveImage;
    this.saveBook = saveBook;
    this.repositoryResolver = repositoryResolver;
    this.imageReferenceExtractor = imageReferenceExtractor;
    this.logger = logger;
    this.isRecovering = false;
  }

  async recover(book) {
    if (this.isRecovering || !book) {
      return { recoveredCount: 0 };
    }

    const repository = this.repositoryResolver.resolve(book);
    const missingImagePaths = this.imageReferenceExtractor.getMissingImagePaths(book);

    if (!repository || missingImagePaths.length === 0) {
      return { recoveredCount: 0 };
    }

    this.isRecovering = true;

    try {
      const restoredByPath = await this.loadRestoredImagesByPath(repository);
      const recoveredCount = this.restoreImages(book, missingImagePaths, restoredByPath);

      if (recoveredCount > 0) {
        this.saveBook(book);
      }

      return { recoveredCount };
    } catch (error) {
      this.logger.error(error);
      return { recoveredCount: 0, error };
    } finally {
      this.isRecovering = false;
    }
  }

  async loadRestoredImagesByPath(repository) {
    const result = await this.loadBook(repository);
    const restoredImages = Array.isArray(result.book && result.book.images)
      ? result.book.images
      : [];

    return new Map(
      restoredImages.map(function (image) {
        return [image.path, image];
      })
    );
  }

  restoreImages(book, missingImagePaths, restoredByPath) {
    let recoveredCount = 0;

    missingImagePaths.forEach((path) => {
      const restoredImage = restoredByPath.get(path);

      if (!restoredImage || !restoredImage.dataUrl) {
        return;
      }

      this.saveImage(book, restoredImage);
      recoveredCount += 1;
    });

    return recoveredCount;
  }
}
