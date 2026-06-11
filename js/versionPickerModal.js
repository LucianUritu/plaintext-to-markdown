import { isValidVersionLabel, versionToBranchName } from "./versionManager.js";

export class VersionPickerModal {
  constructor(elements) {
    this.elements = elements;
    this.resolveVersion = null;
    this.previousFocus = null;

    this.elements.versionPickerClose.addEventListener("click", () => {
      this._close(null);
    });

    this.elements.versionPickerCancel.addEventListener("click", () => {
      this._close(null);
    });
    
    this.elements.versionPickerBackdrop.addEventListener("click", (event) => {
      if (event.target === this.elements.versionPickerBackdrop) {
        this._close(null);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !this.elements.versionPickerBackdrop.classList.contains("hidden")
      ) {
        this._close(null);
      }
    });

    this.elements.versionPickerInput.addEventListener("input", () => {
      this._updatePreview();
    });

    this.elements.versionPickerConfirm.addEventListener("click", () => {
      this._submit();
    });

    this.elements.versionPickerInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._submit();
      }
    });
  }

  ask({ suggestedVersion = "" } = {}) {
    this.previousFocus = document.activeElement;

    this.elements.versionPickerInput.value = suggestedVersion;
    this.elements.versionPickerError.textContent = "";
    this.elements.versionPickerError.classList.add("hidden");
    this._updatePreview();

    this.elements.versionPickerBackdrop.classList.remove("hidden");
    this.elements.versionPickerInput.focus();
    this.elements.versionPickerInput.select();

    return new Promise((resolve) => {
      this.resolveVersion = resolve;
    });
  }

  _updatePreview() {
    const raw = this.elements.versionPickerInput.value.trim();

    if (!raw) {
      this.elements.versionPickerPreview.textContent = "version/...";
      return;
    }

    const branch = versionToBranchName(raw);
    this.elements.versionPickerPreview.textContent = branch;
  }

  _submit() {
    const raw = this.elements.versionPickerInput.value.trim();

    if (!isValidVersionLabel(raw)) {
      this._showError(
        "Please enter a valid version name. " +
        "Spaces are okay; the app will turn them into hyphens. " +
        '"main" and "master" are not allowed.'
      );
      this.elements.versionPickerInput.focus();
      return;
    }

    this._close(raw);
  }

  _showError(message) {
    this.elements.versionPickerError.textContent = message;
    this.elements.versionPickerError.classList.remove("hidden");
  }

  _close(value) {
    if (!this.resolveVersion) return;

    const resolve = this.resolveVersion;
    this.resolveVersion = null;

    this.elements.versionPickerBackdrop.classList.add("hidden");
    this.elements.versionPickerError.textContent = "";
    this.elements.versionPickerError.classList.add("hidden");

    if (this.previousFocus && typeof this.previousFocus.focus === "function") {
      this.previousFocus.focus();
    }

    resolve(value);
  }
}
