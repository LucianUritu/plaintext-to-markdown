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

//test
function readChapterPathsFromToc(tocText) {
  const paths = [];
  const lines = String(tocText || "").split(/\r?\n/);
  const listStack = [];

  lines.forEach(function (line) {
    if (!line.trim() || line.trim().startsWith("#")) {
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

    if (filePath === "intro" || filePath === "intro.md") {
      return;
    }

    paths.push(ensureMarkdownExtension(filePath));
  });

  return paths;
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

function ensureMarkdownExtension(filePath) {
  if (/\.md$/i.test(filePath)) {
    return filePath;
  }

  return filePath + ".md";
}

module.exports = {
  decodeBase64Text,
  parseMarkdownDocument,
  readChapterPathsFromToc,
  readYamlTitle
};
