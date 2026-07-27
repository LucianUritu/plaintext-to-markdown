const test = require("node:test");
const assert = require("node:assert/strict");

const panelModule = import("../js/publishReadinessPanel.js");

global.document = {
  createElement(tagName) {
    return {
      tagName,
      children: [],
      className: "",
      textContent: "",
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); }
    };
  }
};

function element() {
  const classes = new Set(["hidden"]);

  return {
    children: [],
    innerHTML: "",
    textContent: "",
    classList: {
      add(className) { classes.add(className); },
      remove(className) { classes.delete(className); },
      contains(className) { return classes.has(className); }
    },
    appendChild(child) { this.children.push(child); }
  };
}

function createPanelContext(book) {
  const statuses = [];
  const elements = {
    publishReadinessPanel: element(),
    publishReadinessTitle: element(),
    publishReadinessSummary: element(),
    publishReadinessList: element()
  };

  return panelModule.then(({ PublishReadinessPanel }) => ({
    elements,
    statuses,
    panel: new PublishReadinessPanel({
      elements,
      getCurrentBook: () => book,
      getPublishTarget: () => ({ owner: "alice", repo: "book", branch: "main" }),
      saveActiveEditorContent() {},
      setStatus(message) { statuses.push(message); }
    })
  }));
}

test("readiness panel renders blockers and opens the panel", async () => {
  const { elements, panel, statuses } = await createPanelContext({
    title: "Enter Book Title",
    chapters: []
  });

  panel.run();

  assert.equal(elements.publishReadinessPanel.classList.contains("hidden"), false);
  assert.equal(elements.publishReadinessTitle.textContent, "Not Ready Yet");
  assert.match(elements.publishReadinessSummary.textContent, /blocker/);
  assert.ok(elements.publishReadinessList.children.length > 0);
  assert.equal(statuses.at(-1), "Readiness check found items to fix.");
});

test("readiness panel hides when no book is open", async () => {
  const { elements, panel, statuses } = await createPanelContext(null);

  panel.run();

  assert.equal(elements.publishReadinessPanel.classList.contains("hidden"), true);
  assert.equal(statuses.at(-1), "Create a book first.");
});
