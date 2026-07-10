const test = require("node:test");
const assert = require("node:assert/strict");

test("platform tour covers the main platform workflows", async () => {
  const { createPlatformTourSteps } = await import("../js/platformTour.js");
  const steps = createPlatformTourSteps();
  const stepText = steps.map((step) => step.title + " " + step.body).join(" ");

  assert.ok(steps.length >= 15);
  assert.equal(new Set(steps.map((step) => step.id)).size, steps.length);

  [
    /GitHub/i,
    /fresh book|Start a book/i,
    /chapters/i,
    /reorder/i,
    /published versions/i,
    /Markdown/i,
    /headings, bold, italic, lists, quotes, and links/i,
    /images/i,
    /citations?/i,
    /bibliography/i,
    /preview/i,
    /publish/i,
    /error messages/i
  ].forEach((pattern) => {
    assert.match(stepText, pattern);
  });
});

test("platform tour steps declare usable targets", async () => {
  const { createPlatformTourSteps } = await import("../js/platformTour.js");

  createPlatformTourSteps().forEach((step) => {
    assert.equal(typeof step.id, "string");
    assert.equal(typeof step.target, "string");
    assert.equal(typeof step.title, "string");
    assert.equal(typeof step.body, "string");
    assert.ok(step.id.length > 0);
    assert.ok(step.target.length > 0);
    assert.ok(step.title.length > 0);
    assert.ok(step.body.length > 0);
  });
});

test("platform tour prepares a step before choosing the target", async () => {
  const { PlatformTour } = await import("../js/platformTour.js");
  const calls = [];
  const target = createElement({
    selector: "#after-navigation",
    visibleAfterPrepare: true
  });
  const fakeDocument = createFakeDocument(target);
  const tour = new PlatformTour({
    document: fakeDocument,
    window: createFakeWindow(),
    steps: [{
      id: "book-title",
      target: "#after-navigation",
      title: "Name the book",
      body: "Edit the title."
    }],
    onBeforeStep: (step) => {
      calls.push("prepare:" + step.id);
      target.visible = true;
    },
    onStepChange: () => calls.push("position")
  });

  await tour.start();

  assert.deepEqual(calls, ["prepare:book-title", "position"]);
  assert.equal(target.scrolled, true);
});

function createFakeDocument(target) {
  const body = createElement({ selector: "body", visibleAfterPrepare: true });
  body.appendChild = () => {};
  body.classList = createClassList();

  return {
    activeElement: null,
    body,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tagName) => createElement({ selector: tagName, visibleAfterPrepare: true }),
    querySelector: (selector) => selector === target.selector ? target : body
  };
}

function createFakeWindow() {
  return {
    innerWidth: 1000,
    innerHeight: 700,
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: (element) => ({
      display: element.visible ? "block" : "none",
      visibility: "visible"
    }),
    requestAnimationFrame: (callback) => callback()
  };
}

function createElement({ selector, visibleAfterPrepare }) {
  const element = {
    selector,
    visible: Boolean(visibleAfterPrepare),
    scrolled: false,
    style: {},
    classList: createClassList(),
    setAttribute: () => {},
    append: () => {},
    appendChild: () => {},
    addEventListener: () => {},
    focus: () => {},
    querySelector: (query) => createElement({ selector: query, visibleAfterPrepare: true }),
    getBoundingClientRect: () => ({
      left: 100,
      top: 100,
      right: 260,
      bottom: 160,
      width: 160,
      height: 60
    }),
    scrollIntoView: () => {
      element.scrolled = true;
    }
  };

  return element;
}

function createClassList() {
  const classes = new Set(["hidden"]);

  return {
    add: (className) => classes.add(className),
    remove: (className) => classes.delete(className),
    contains: (className) => classes.has(className)
  };
}
