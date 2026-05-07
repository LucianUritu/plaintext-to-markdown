export function plainTextToMarkdown(input) {
  const lines = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(function (line) {
      return line.trim();
    });

  const output = [];
  let titleUsed = false;

  for (const line of lines) {
    if (line === "") {
      addEmptyLine(output);
      continue;
    }

    if (isMarkdownImage(line)) {
      output.push(line);
      continue;
    }

    if (!titleUsed) {
      output.push("# " + line);
      titleUsed = true;
      continue;
    }

    if (isBullet(line)) {
      output.push(normalizeBullet(line));
      continue;
    }

    if (isNumbered(line)) {
      output.push(normalizeNumbered(line));
      continue;
    }

    if (isQuote(line)) {
      output.push(normalizeQuote(line));
      continue;
    }

    if (looksLikeHeading(line)) {
      output.push("## " + line);
      continue;
    }

    output.push(line);
  }

  return cleanMarkdown(output);
}

export function isMarkdownImage(line) {
  return /^!\[.*\]\(.+\)$/.test(line);
}

export function isBullet(line) {
  return /^[-*•]\s+/.test(line);
}

export function isNumbered(line) {
  return /^\d+[.)]\s+/.test(line);
}

export function isQuote(line) {
  return /^>\s?/.test(line);
}

function addEmptyLine(output) {
  if (output.length > 0 && output[output.length - 1] !== "") {
    output.push("");
  }
}

function normalizeBullet(line) {
  return line.replace(/^[-*•]\s+/, "- ");
}

function normalizeNumbered(line) {
  return line.replace(/^(\d+)[.)]\s+/, "$1. ");
}

function normalizeQuote(line) {
  if (line.startsWith("> ")) {
    return line;
  }

  return line.replace(/^>/, "> ");
}

function cleanMarkdown(output) {
  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeHeading(line) {
  if (!line) {
    return false;
  }

  if (
    isBullet(line) ||
    isNumbered(line) ||
    isQuote(line) ||
    isMarkdownImage(line)
  ) {
    return false;
  }

  if (line.endsWith(".") || line.endsWith(",")) {
    return false;
  }

  if (line.length > 80) {
    return false;
  }

  const words = line.split(/\s+/);
  return words.length <= 10;
}