const test = require("node:test");
const assert = require("node:assert/strict");

const modulePromise = import("../js/imageRecoveryService.js");

function createService({ restoredImages = [], savedImages = [], savedBooks = [] } = {}) {
  return modulePromise.then(({ ImageRecoveryService }) => {
    const service = new ImageRecoveryService({
      async loadBook(repository) {
        return {
          repository,
          book: {
            images: restoredImages
          }
        };
      },
      saveImage(book, image) {
        savedImages.push({ book, image });
        const index = book.images.findIndex((item) => item.path === image.path);
        if (index < 0) book.images.push(image);
        else book.images[index] = image;
      },
      saveBook(book) {
        savedBooks.push(book);
      },
      logger: {
        error() {}
      }
    });

    return { service, savedImages, savedBooks };
  });
}

test("image recovery restores missing image data from the published book", async () => {
  const book = {
    githubRepository: { owner: "alice", repo: "book", branch: "main" },
    images: [],
    chapters: [{ content: "![Diagram](images/diagram.png)" }]
  };
  const restoredImage = {
    path: "images/diagram.png",
    dataUrl: "data:image/png;base64,YQ=="
  };
  const { service, savedImages, savedBooks } = await createService({
    restoredImages: [restoredImage]
  });

  const result = await service.recover(book);

  assert.equal(result.recoveredCount, 1);
  assert.equal(savedImages[0].image, restoredImage);
  assert.equal(savedBooks[0], book);
});

test("image reference extractor finds missing local references only", async () => {
  const { MarkdownImageReferenceExtractor } = await modulePromise;
  const extractor = new MarkdownImageReferenceExtractor();
  const book = {
    images: [{ path: "images/kept.png", dataUrl: "data:image/png;base64,YQ==" }],
    introduction: {
      content:
        "![Missing](book/images/missing.png) ![Kept](images/kept.png) ![Remote](https://example.com/remote.png)"
    },
    bibliography: {
      content: "![Unsafe](../outside.png)"
    }
  };

  assert.deepEqual(extractor.getMissingImagePaths(book), ["images/missing.png"]);
});

test("image recovery ignores books without a GitHub repository", async () => {
  const book = {
    images: [],
    chapters: [{ content: "![Diagram](images/diagram.png)" }]
  };
  const { service, savedImages, savedBooks } = await createService({
    restoredImages: [{ path: "images/diagram.png", dataUrl: "data:image/png;base64,YQ==" }]
  });

  const result = await service.recover(book);

  assert.equal(result.recoveredCount, 0);
  assert.equal(savedImages.length, 0);
  assert.equal(savedBooks.length, 0);
});

test("image recovery does not restore external image references", async () => {
  const book = {
    githubRepository: { owner: "alice", repo: "book" },
    images: [],
    chapters: [{ content: "![Diagram](https://example.com/diagram.png)" }]
  };
  const { service, savedImages } = await createService();

  const result = await service.recover(book);

  assert.equal(result.recoveredCount, 0);
  assert.equal(savedImages.length, 0);
});
