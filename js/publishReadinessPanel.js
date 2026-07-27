import { generateTeachBooksFiles } from "./teachbooksGenerator.js";
import { validatePublishReadiness } from "./publishValidation.js";

export class PublishReadinessPanel {
  constructor({
    elements,
    getCurrentBook,
    getPublishTarget,
    saveActiveEditorContent,
    setStatus
  }) {
    this.elements = elements;
    this.getCurrentBook = getCurrentBook;
    this.getPublishTarget = getPublishTarget;
    this.saveActiveEditorContent = saveActiveEditorContent;
    this.setStatus = setStatus;
  }

  run() {
    this.saveActiveEditorContent();

    const book = this.getCurrentBook();

    if (!book) {
      this.hide();
      this.setStatus("Create a book first.");
      return;
    }

    const report = validatePublishReadiness(book);
    const generationItem = this.createGenerationItem(book);
    const items = report.items.concat(generationItem);
    const blockers = items.filter((item) => item.status === "blocking");
    const warnings = items.filter((item) => item.status === "warning");

    this.render({
      ready: blockers.length === 0,
      blockers,
      warnings,
      passed: items.filter((item) => item.status === "ready"),
      items
    });

    this.setStatus(
      blockers.length
        ? "Readiness check found items to fix."
        : "Readiness check passed."
    );
  }

  hide() {
    this.elements.publishReadinessPanel.classList.add("hidden");
  }

  createGenerationItem(book) {
    try {
      const target = this.getPublishTarget();
      const files = generateTeachBooksFiles(book, {
        owner: target.owner || "YOUR_GITHUB_USERNAME",
        repo: target.repo || "YOUR_REPOSITORY_NAME",
        branch: target.branch || "main"
      });

      return {
        status: files.length > 0 ? "ready" : "blocking",
        category: "TeachBooks",
        message: files.length > 0
          ? "TeachBooks files can be generated."
          : "No TeachBooks files were generated."
      };
    } catch (error) {
      return {
        status: "blocking",
        category: "TeachBooks",
        message: "TeachBooks files could not be generated: " + error.message
      };
    }
  }

  render(report) {
    this.elements.publishReadinessPanel.classList.remove("hidden");
    this.elements.publishReadinessTitle.textContent = report.ready
      ? "Ready to Publish"
      : "Not Ready Yet";
    this.elements.publishReadinessSummary.textContent = this.createSummary(report);
    this.elements.publishReadinessList.innerHTML = "";

    report.items.forEach((item) => {
      this.elements.publishReadinessList.appendChild(this.createItemElement(item));
    });
  }

  createSummary(report) {
    if (report.blockers.length > 0) {
      return report.blockers.length +
        " blocker" +
        (report.blockers.length === 1 ? "" : "s") +
        " must be fixed before publishing.";
    }

    if (report.warnings.length > 0) {
      return "No blockers found. Review " +
        report.warnings.length +
        " warning" +
        (report.warnings.length === 1 ? "" : "s") +
        " before publishing.";
    }

    return "No blockers or warnings found.";
  }

  createItemElement(item) {
    const row = document.createElement("li");
    row.className = "readiness-item readiness-item--" + item.status;

    const marker = document.createElement("span");
    marker.className = "readiness-item__marker";
    marker.textContent = this.getMarkerText(item.status);

    const body = document.createElement("div");
    const category = document.createElement("strong");
    category.textContent = item.category;
    const message = document.createElement("p");
    message.textContent = item.message;
    body.append(category, message);

    row.append(marker, body);
    return row;
  }

  getMarkerText(status) {
    if (status === "blocking") return "!";
    if (status === "warning") return "?";
    return "OK";
  }
}
