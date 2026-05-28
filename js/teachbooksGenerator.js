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
      branch
    })
  });

  files.push({
    path: "book/_toc.yml",
    content: generateToc(book)
  });

  files.push({
    path: "book/intro.md",
    content: generateIntro(book)
  });

  book.chapters.forEach(function (chapter, index) {
    files.push({
      path: "book/chapters/" + makeChapterFileName(chapter, index),
      content: generateChapterMarkdown(chapter, index)
    });
  });

  getBookImageFiles(book).forEach(function (imageFile) {
    files.push(imageFile);
  });

  return files;
}

function generateRequirements() {
  return `teachbooks
git+https://github.com/TeachBooks/TeachBooks-Favourites
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
    secrets: inherit
    permissions:
      contents: read
      pages: write
      id-token: write
`;
}

function generateConfig({ title, owner, repo, branch }) {
  return `title: ${quoteYaml(title)}
author: Generated with Plain Text to Markdown Converter

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
    html_baseurl: "https://${owner}.github.io/${repo}"
    html_theme_options:
      logo:
        text: ${quoteYaml(title)}
      repository_url: "https://github.com/${owner}/${repo}"
      path_to_docs: "book"
      repository_branch: "${branch}"
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
  const chapterLines = book.chapters
    .map(function (chapter, index) {
      return "      - file: chapters/" + removeExtension(makeChapterFileName(chapter, index));
    })
    .join("\n");

  return `format: jb-book
root: intro.md

parts:
  - caption: Chapters
    chapters:
${chapterLines}
`;
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

function generateChapterMarkdown(chapter, index) {
  const title = chapter.title || "Untitled Chapter";
  const body = convertBodyTextToMarkdown(chapter.content || "");

  if (body.length === 0) {
    return `# ${title}

`;
  }

  return `# ${title}

${body}
`;
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
