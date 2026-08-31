import { plainTextToMarkdown } from "./markdownConverter.js";

export function generateTeachBooksFiles(book, options = {}) {
  const owner = options.owner || "YOUR_GITHUB_USERNAME";
  const repo = options.repo || "YOUR_REPOSITORY_NAME";
  const branch = options.branch || "main";

  const safeTitle = book.title || "Untitled Book";
  const files = [];

  files.push({
    path: "requirements.txt",
    content: generateRequirements()
  });

  files.push({
    path: ".github/workflows/call-deploy-book.yml",
    content: generateWorkflow()
  });

  files.push({
    path: "book/_config.yml",
    content: generateConfig({
      title: safeTitle,
      owner,
      repo,
      branch,
      hasBibliography: Boolean(book.bibliography)
    })
  });

  files.push({
    path: "book/_toc.yml",
    content: generateToc(book)
  });

  files.push({
    path: "book/" + getIntroductionPath(book),
    content: generateIntro(book)
  });

  book.chapters.forEach(function (chapter, index) {
    files.push({
      path: "book/" + getChapterPath(chapter, index),
      content: generateChapterMarkdown(chapter, index, book.bibliography)
    });
  });

  if (book.bibliography) {
    files.push({
      path: "book/bibliography.md",
      content: generateBibliographyMarkdown(book.bibliography)
    });
    files.push({
      path: "book/references.bib",
      content: generateBibTex(book.bibliography.references)
    });
  }

  getBookImageFiles(book).forEach(function (imageFile) {
    files.push(imageFile);
  });

  return files;
}

function generateRequirements() {
  return `teachbooks==0.2.4
git+https://github.com/TeachBooks/TeachBooks-Favourites@ad0f301f83effb9322a5460f444d88878b30a75b
`;
}

function generateWorkflow() {
  return `name: call-deploy-book

on:
  push:
    branches:
    - '**'
    paths:
    - book/**
    - requirements.txt
    - .github/workflows/call-deploy-book.yml
  workflow_dispatch:

concurrency:
  group: pages-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  call-workflow:
    uses: TeachBooks/deploy-book-workflow/.github/workflows/deploy-book.yml@v1
    permissions:
      contents: read
      pages: write
      id-token: write
`;
}

function generateConfig({ title, owner, repo, branch, hasBibliography }) {
  const bibliographyConfig = hasBibliography
    ? "\nbibtex_bibfiles:\n  - references.bib\n"
    : "";

  return `title: ${quoteYaml(title)}
author: Generated with Plain Text to Markdown Converter
${bibliographyConfig}
execute:
  execute_notebooks: "off"
  exclude_patterns: []
  timeout: 30
  allow_errors: false

html:
  use_multitoc_numbering: true

sphinx:
  extra_extensions:
    - teachbooks_favourites
  config:
    language: en
    html_baseurl: ${quoteYaml("https://" + owner + ".github.io/" + repo)}
    html_theme_options:
      logo:
        text: ${quoteYaml(title)}
      repository_url: ${quoteYaml("https://github.com/" + owner + "/" + repo)}
      path_to_docs: "book"
      repository_branch: ${quoteYaml(branch)}
      use_edit_page_button: true
      use_repository_button: true
      use_issues_button: true
    html_show_copyright: false
    html_last_updated_fmt: ''
    external_toc_path: "_toc.yml"
    external_toc_exclude_missing: true
    git_untracked_check_dependencies: false
    git_untracked_show_sourcelink: true

parse:
  myst_enable_extensions:
    - colon_fence
    - dollarmath
    - linkify
    - substitution
    - tasklist
  myst_url_schemes: [mailto, http, https]
  myst_links_external_new_tab: true
`;
}

function generateToc(book) {
  if (canReuseSourceToc(book)) {
    return book.teachBooksToc.text;
  }

  const chapterLines = book.chapters
    .map(function (chapter, index) {
      return "      - file: " + removeExtension(getChapterPath(chapter, index));
    })
    .join("\n");
  const bibliographyPart = book.bibliography
    ? `
  - caption: References
    chapters:
      - file: bibliography
`
    : "";

  return `format: jb-book
root: intro.md

parts:
  - caption: Chapters
    chapters:
${chapterLines}
${bibliographyPart}
`;
}

function canReuseSourceToc(book) {
  return (
    book &&
    book.teachBooksToc &&
    book.teachBooksToc.text &&
    !book.bibliography &&
    Array.isArray(book.chapters) &&
    book.chapters.every(function (chapter) {
      return Boolean(getSafeBookPath(chapter.sourcePath));
    })
  );
}

export function generateBibliographyMarkdown(bibliography) {
  const title = bibliography.title || "Bibliography";
  const body = convertBodyTextToMarkdown(bibliography.content || "");
  const introduction = body ? "\n\n" + body : "";
  const references = Array.isArray(bibliography.references)
    ? bibliography.references
    : [];
  const referenceList = references.length
    ? references.map(generateReferenceMarkdown).join("\n\n")
    : "No references have been added yet.";

  return `# ${title}${introduction}

<!-- bibliography-references:start -->
## References

${referenceList}
<!-- bibliography-references:end -->
`;
}

export function generateChapterBibliographyMarkdown(chapter, bibliography) {
  const references = getChapterBibliographyReferences(chapter, bibliography);

  if (references.length === 0) {
    return "";
  }

  return "\n\n## References\n\n" +
    references.map(generateReferenceSummaryMarkdown).join("\n\n");
}

function generateReferenceMarkdown(reference) {
  const title = reference.title || "Untitled source";
  const authors = reference.authors || "Unknown author";
  const year = reference.year ? " (" + reference.year + ")" : "";
  const sourceLink = reference.url ? " [Open source](" + reference.url + ")" : "";

  return `(reference-${reference.key})=
### ${title}

${authors}${year}.${sourceLink}`;
}

function generateReferenceSummaryMarkdown(reference) {
  const title = reference.title || "Untitled source";
  const authors = reference.authors || "Unknown author";
  const year = reference.year ? " (" + reference.year + ")" : "";
  const sourceLink = reference.url ? " [Open source](" + reference.url + ")" : "";

  return "### " + title + "\n\n" + authors + year + "." + sourceLink;
}

function generateBibTex(references) {
  const entries = (Array.isArray(references) ? references : []).map(
    function (reference) {
      const fields = [
        "  title = {" + escapeBibTex(reference.title || "Untitled source") + "}",
        "  author = {" +
          escapeBibTex(normalizeBibTexAuthors(reference.authors)) +
          "}"
      ];

      if (reference.year) {
        fields.push("  year = {" + escapeBibTex(reference.year) + "}");
      }
      if (reference.url) {
        fields.push("  url = {" + escapeBibTex(reference.url) + "}");
      }

      return "@misc{" + reference.key + ",\n" + fields.join(",\n") + "\n}";
    }
  );

  return entries.length ? entries.join("\n\n") + "\n" : "";
}

function normalizeBibTexAuthors(authors) {
  return String(authors || "Unknown author").replace(/\s*;\s*/g, " and ");
}

function escapeBibTex(value) {
  return String(value || "").replace(/[\\{}%&#_]/g, function (character) {
    return character === "\\" ? "\\textbackslash{}" : "\\" + character;
  });
}

function generateIntro(book) {
  const introduction = book.introduction || {
    title: "Introduction",
    content: ""
  };

  const introTitle = introduction.title || "Introduction";
  const introContent = introduction.content || "";

  const markdown = convertBodyTextToMarkdown(introContent);

  if (markdown.length === 0) {
    return `# ${introTitle}

Welcome to **${book.title || "Untitled Book"}**.

Use the table of contents on the left to navigate through the chapters.
`;
  }

  return `# ${introTitle}

${markdown}
`;
}

function generateChapterMarkdown(chapter, index, bibliography) {
  const body = migrateLegacyCitations(
    plainTextToMarkdown(chapter.content || ""),
    bibliography
  );
  const chapterBibliography = generateChapterBibliographyMarkdown(chapter, bibliography);

  if (body.length === 0 && chapterBibliography.length === 0) {
    return "";
  }

  if (body.length === 0) {
    return chapterBibliography.trimStart() + "\n";
  }

  return body + chapterBibliography + "\n";
}

function getChapterBibliographyReferences(chapter, bibliography) {
  if (!chapter?.showBibliography || !bibliography?.references) {
    return [];
  }

  const referenceKeys = new Set(
    Array.isArray(chapter.referenceKeys) ? chapter.referenceKeys : []
  );

  if (referenceKeys.size === 0) {
    return [];
  }

  return bibliography.references.filter((reference) => referenceKeys.has(reference.key));
}

function convertBodyTextToMarkdown(text) {
  const lines = plainTextToMarkdown(text).trim().replace(/\r\n/g, "\n").split("\n");

  if (!/^#\s+/.test(lines[0] || "")) {
    return lines.join("\n").trim();
  }

  lines[0] = lines[0].replace(/^(#\s+)+/, "");

  return lines.join("\n").trim();
}

function makeChapterFileName(chapter, index) {
  const title = chapter.title || "chapter-" + (index + 1);
  return String(index + 1).padStart(2, "0") + "-" + slugify(title) + ".md";
}

function migrateLegacyCitations(markdown, bibliography) {
  const references = bibliography && Array.isArray(bibliography.references)
    ? bibliography.references
    : [];
  const referencesByKey = new Map(references.map(function (reference) {
    return [reference.key, reference];
  }));

  return String(markdown || "").replace(
    /\{cite\}`([a-z0-9._:-]+)`/gi,
    function (match, key) {
      const reference = referencesByKey.get(key);
      if (!reference) return match;
      const readableTitle = String(reference.title || "Untitled source").replace(/[<>`]/g, "");
      return "{ref}`" + readableTitle + " <reference-" + key + ">`";
    }
  );
}

function getIntroductionPath(book) {
  const sourcePath = getSafeBookPath(
    book && book.introduction && book.introduction.sourcePath
  );

  return sourcePath || "intro.md";
}

function getChapterPath(chapter, index) {
  const sourcePath = getSafeBookPath(chapter && chapter.sourcePath);

  return sourcePath || "chapters/" + makeChapterFileName(chapter, index);
}

function getSafeBookPath(path) {
  const normalizedPath = String(path || "").replace(/\\/g, "/").trim();

  if (
    !normalizedPath ||
    normalizedPath.startsWith("/") ||
    normalizedPath.includes("../")
  ) {
    return "";
  }

  return ensureMarkdownExtension(normalizedPath.replace(/^book\//, ""));
}

function ensureMarkdownExtension(path) {
  if (/\.md$/i.test(path)) {
    return path;
  }

  return path + ".md";
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "chapter"
  );
}

function removeExtension(fileName) {
  return fileName.replace(/\.md$/, "");
}

function getBookImageFiles(book) {
  if (!Array.isArray(book.images)) {
    return [];
  }

  const imageFiles = [];

  book.images.forEach(function (image) {
    const parsedImage = parseDataUrl(image.dataUrl);

    if (!image.path || !parsedImage) {
      return;
    }

    const relativePath = normalizeImagePath(image.path);

    if (!relativePath) {
      return;
    }

    imageFiles.push({
      path: "book/" + relativePath,
      content: parsedImage.base64,
      encoding: "base64"
    });

    imageFiles.push({
      path: "book/chapters/" + relativePath,
      content: parsedImage.base64,
      encoding: "base64"
    });
  });

  return imageFiles;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/);

  if (!match) {
    return null;
  }

  return {
    base64: match[1]
  };
}

function normalizeImagePath(path) {
  const normalizedPath = String(path || "").replace(/\\/g, "/");

  if (
    !normalizedPath ||
    normalizedPath.startsWith("/") ||
    normalizedPath.includes("../")
  ) {
    return "";
  }

  return normalizedPath
    .split("/")
    .map(slugifyPathPart)
    .filter(Boolean)
    .join("/");
}

function slugifyPathPart(pathPart) {
  return String(pathPart || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}

function quoteYaml(value) {
  return '"' + String(value).replace(/"/g, '\\"') + '"';
}
