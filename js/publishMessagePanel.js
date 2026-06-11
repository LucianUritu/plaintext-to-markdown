export class PublishMessagePanel {
  constructor(elements) {
    this.elements = elements;

    this.elements.publishMessageClose.addEventListener("click", () => {
      this.hide();
    });
  }

  show(message) {
    const parsedMessage = parsePublishMessage(message);

    this.elements.publishMessageTitle.textContent = parsedMessage.title;
    this.elements.publishMessageWhat.textContent = parsedMessage.whatHappened;
    this.elements.publishMessageNext.textContent = parsedMessage.nextStep;
    this.renderIssues(parsedMessage.issues);

    if (parsedMessage.technical) {
      this.elements.publishMessageTechnical.textContent = parsedMessage.technical;
      this.elements.publishMessageDetails.classList.remove("hidden");
    } else {
      this.elements.publishMessageTechnical.textContent = "";
      this.elements.publishMessageDetails.classList.add("hidden");
    }

    this.elements.publishMessagePanel.classList.remove("hidden");
    this.elements.publishMessagePanel.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  hide() {
    this.elements.publishMessagePanel.classList.add("hidden");
  }

  renderIssues(issues) {
    this.elements.publishMessageList.innerHTML = "";

    if (!issues.length) {
      this.elements.publishMessageList.classList.add("hidden");
      return;
    }

    issues.forEach((issue) => {
      const item = document.createElement("li");
      item.textContent = issue;
      this.elements.publishMessageList.appendChild(item);
    });

    this.elements.publishMessageList.classList.remove("hidden");
  }
}

function parsePublishMessage(message) {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    });
  const title = lines.find(Boolean) || "Publishing stopped.";

  return {
    title,
    whatHappened:
      readSection(lines, "What happened:") ||
      readIntroBeforeBullets(lines) ||
      "The book could not be published.",
    nextStep:
      readSection(lines, "What to do next:") ||
      "Review the issue and try publishing again.",
    technical: readSection(lines, "Technical details:"),
    issues: readBulletItems(lines)
  };
}

function readIntroBeforeBullets(lines) {
  const introLines = [];

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line) {
      continue;
    }

    if (line.startsWith("- ")) {
      break;
    }

    introLines.push(line);
  }

  return introLines.join(" ");
}

function readBulletItems(lines) {
  return lines
    .filter(function (line) {
      return line.startsWith("- ");
    })
    .map(function (line) {
      return line.slice(2).trim();
    })
    .filter(Boolean);
}

function readSection(lines, heading) {
  const start = lines.indexOf(heading);

  if (start === -1) {
    return "";
  }

  const sectionLines = [];

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (isHeading(line)) {
      break;
    }

    if (line) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n");
}

function isHeading(line) {
  return (
    line === "What happened:" ||
    line === "What to do next:" ||
    line === "Technical details:"
  );
}
