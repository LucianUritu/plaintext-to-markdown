function decodeBase64Text(content) {
  return Buffer.from(String(content || "").replace(/\s/g, ""), "base64").toString("utf8");
}

function readYamlTitle(configText) {
  const match = String(configText || "").match(/^title:\s*(.+)$/m);

  if (!match) {
    return "";
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

function readChapterPathsFromToc(tocText) {
  return readChapterEntriesFromToc(tocText).map(function (entry) {
    return entry.path;
  });
}

function readChapterEntriesFromToc(tocText) {
  const entries = [];
  const paths = [];
  const lines = String(tocText || "").split(/\r?\n/);
  const listStack = [];
  const rootPath = readRootPathFromToc(tocText);
  let currentCaption = "";

  lines.forEach(function (line) {
    if (!line.trim() || line.trim().startsWith("#")) {
      return;
    }

    const captionMatch = line.match(/^\s*-\s*caption:\s*(.+)\s*$/);

    if (captionMatch) {
      currentCaption = captionMatch[1].trim().replace(/^["']|["']$/g, "");
      return;
    }

    const listKeyMatch = line.match(/^(\s*)(?:-\s*)?(chapters|sections):\s*$/);

    if (listKeyMatch) {
      const indent = listKeyMatch[1].length;

      while (
        listStack.length &&
        listStack[listStack.length - 1].indent >= indent
      ) {
        listStack.pop();
      }

      listStack.push({
        indent,
        key: listKeyMatch[2]
      });

      return;
    }

    const match = line.match(/^(\s*)-\s*file:\s*(.+)\s*$/);

    if (!match) {
      return;
    }

    const indent = match[1].length;
    const parentList = findParentList(listStack, indent);

    if (parentList && parentList.key === "sections") {
      return;
    }

    if (parentList && parentList.key !== "chapters") {
      return;
    }

    const filePath = match[2].trim().replace(/^["']|["']$/g, "");

    const path = ensureMarkdownExtension(filePath);

    if (path === rootPath) {
      return;
    }

    if (paths.includes(path)) {
      return;
    }

    paths.push(path);
    entries.push({
      caption: currentCaption,
      path
    });
  });

  return entries;
}

function readRootPathFromToc(tocText) {
  const match = String(tocText || "").match(/^root:\s*(.+)\s*$/m);

  if (!match) {
    return "intro.md";
  }

  return ensureMarkdownExtension(match[1].trim().replace(/^["']|["']$/g, ""));
}

function findParentList(listStack, childIndent) {
  for (let index = listStack.length - 1; index >= 0; index -= 1) {
    if (listStack[index].indent <= childIndent) {
      return listStack[index];
    }
  }

  return null;
}

function parseMarkdownDocument(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let title = "";
  let bodyStartIndex = 0;

  if (lines.length > 0) {
    const titleMatch = lines[0].match(/^#\s+(.+)$/);

    if (titleMatch) {
      title = titleMatch[1].trim();
      bodyStartIndex = 1;
    }
  }

  while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === "") {
    bodyStartIndex += 1;
  }

  return {
    title,
    content: lines.slice(bodyStartIndex).join("\n").trim()
  };
}

function parseBibTexReferences(bibTex) {
  const references = [];
  const entryPattern = /@[a-z]+\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\s*\}/gi;
  let entryMatch = entryPattern.exec(String(bibTex || ""));

  while (entryMatch) {
    const fields = {};
    entryMatch[2].split(/\r?\n/).forEach(function (line) {
      const fieldMatch = line.match(/^\s*(title|author|year|url)\s*=\s*\{(.*)\}\s*,?\s*$/i);
      if (fieldMatch) {
        fields[fieldMatch[1].toLowerCase()] = unescapeBibTex(fieldMatch[2]);
      }
    });

    references.push({
      id: "github-reference-" + references.length,
      key: entryMatch[1],
      authors: String(fields.author || "").replace(/\s+and\s+/gi, "; "),
      title: fields.title || "Untitled source",
      year: fields.year || "",
      url: fields.url || ""
    });
    entryMatch = entryPattern.exec(String(bibTex || ""));
  }

  return references;
}

function stripGeneratedBibliographyContent(markdown) {
  return String(markdown || "")
    .replace(/<!-- bibliography-references:start -->[\s\S]*?<!-- bibliography-references:end -->/gi, "")
    .replace(/```\{bibliography\}[\s\S]*?```/gi, "")
    .trim();
}

function unescapeBibTex(value) {
  return String(value || "")
    .replace(/\\textbackslash\{\}/g, "\\")
    .replace(/\\([{}%&#_])/g, "$1");
}

function ensureMarkdownExtension(filePath) {
  if (/\.md$/i.test(filePath)) {
    return filePath;
  }

  return filePath + ".md";
}

module.exports = {
  decodeBase64Text,
  parseBibTexReferences,
  parseMarkdownDocument,
  readChapterEntriesFromToc,
  readChapterPathsFromToc,
  readRootPathFromToc,
  readYamlTitle,
  stripGeneratedBibliographyContent
};
