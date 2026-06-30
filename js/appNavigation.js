export class AppNavigation {
  constructor({ applyState, getFallbackState }) {
    this.applyState = applyState;
    this.getFallbackState = getFallbackState;
    this.isRestoring = false;

    window.addEventListener("popstate", (event) => {
      const state = event.state || this.readStateFromUrl();
      this.restore(state);
    });
  }

  start() {
    const state = this.readStateFromUrl() || this.getFallbackState();
    this.replace(state);
    this.restore(state);
  }

  navigate(state) {
    if (this.isRestoring) {
      this.applyState(state);
      return;
    }

    history.pushState(state, "", this.createUrl(state));
    this.applyState(state);
  }

  replace(state) {
    history.replaceState(state, "", this.createUrl(state));
  }

  restore(state) {
    this.isRestoring = true;

    try {
      this.applyState(state || this.getFallbackState());
    } finally {
      this.isRestoring = false;
    }
  }

  readStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");

    if (view === "book") {
      return { view: "book" };
    }

    if (view === "editor") {
      const type = params.get("type");

      if (type === "introduction") {
        return { view: "editor", type: "introduction" };
      }

      if (type === "chapter") {
        return {
          view: "editor",
          type: "chapter",
          chapterId: params.get("chapter") || ""
        };
      }

      if (type === "bibliography") {
        return { view: "editor", type: "bibliography" };
      }
    }

    return view === "home" ? { view: "home" } : null;
  }

  createUrl(state) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";

    if (!state || state.view === "home") {
      url.searchParams.set("view", "home");
      return url.toString();
    }

    url.searchParams.set("view", state.view);

    if (state.view === "editor") {
      url.searchParams.set("type", state.type || "introduction");

      if (state.type === "chapter" && state.chapterId) {
        url.searchParams.set("chapter", state.chapterId);
      }
    }

    return url.toString();
  }
}
