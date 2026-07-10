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
