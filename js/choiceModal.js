export class ChoiceModal {
  constructor(elements) {
    this.elements = elements;
    this.resolveChoice = null;
    this.previousFocus = null;

    this.elements.choiceModalCloseButton.addEventListener("click", () => {
      this.close(null);
    });

    this.elements.choiceModalBackdrop.addEventListener("click", (event) => {
      if (event.target === this.elements.choiceModalBackdrop) {
        this.close(null);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !this.elements.choiceModalBackdrop.classList.contains("hidden")
      ) {
        this.close(null);
      }
    });
  }

  ask({ title, message, choices }) {
    this.previousFocus = document.activeElement;
    this.elements.choiceModalTitle.textContent = title;
    this.elements.choiceModalMessage.textContent = message;
    this.elements.choiceModalActions.innerHTML = "";

    choices.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice.label;
      button.className = choice.variant === "secondary" ? "secondary" : "";
      button.addEventListener("click", () => {
        this.close(choice.value);
      });

      this.elements.choiceModalActions.appendChild(button);
    });

    this.elements.choiceModalBackdrop.classList.remove("hidden");

    const firstButton = this.elements.choiceModalActions.querySelector("button");
    if (firstButton) {
      firstButton.focus();
    }

    return new Promise((resolve) => {
      this.resolveChoice = resolve;
    });
  }

  close(value) {
    if (!this.resolveChoice) {
      return;
    }

    const resolve = this.resolveChoice;
    this.resolveChoice = null;
    this.elements.choiceModalBackdrop.classList.add("hidden");
    this.elements.choiceModalActions.innerHTML = "";

    if (this.previousFocus && typeof this.previousFocus.focus === "function") {
      this.previousFocus.focus();
    }

    resolve(value);
  }
}
