const publishSteps = [
  
  "repository",
  "pages",
  "upload",
  "action",
  "published"
];

const stepElementKeys = {
  repository: "publishStepRepository",
  pages: "publishStepPages",
  upload: "publishStepUpload",
  action: "publishStepAction",
  published: "publishStepPublished"
};

export class PublishProgress {
  constructor(elements) {
    this.elements = elements;
  }

  reset() {
    this.elements.publishProgressPanel.classList.remove("hidden");

    publishSteps.forEach((step) => {
      this.setStepState(step, "pending");
    });
  }

  activate(step) {
    this.setStepState(step, "active");
  }

  complete(step) {
    this.setStepState(step, "done");
  }

  fail(step) {
    this.setStepState(step, "failed");
  }

  hide() {
    this.elements.publishProgressPanel.classList.add("hidden");
  }

  setStepState(step, state) {
    const element = this.elements[stepElementKeys[step]];

    if (!element) {
      return;
    }

    element.dataset.state = state;
  }
}
