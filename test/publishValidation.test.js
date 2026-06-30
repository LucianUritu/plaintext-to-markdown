const test = require("node:test");
const assert = require("node:assert/strict");
const validation = import("../js/publishValidation.js");

function validBook(overrides = {}) {
  return { title: "My Book", introduction: { content: "Intro" }, chapters: [{ title: "One", content: "Body" }], images: [], ...overrides };
}
async function errorsFor(book) { return (await validation).validateBookForPublish(book).errors; }

test("valid books pass validation", async () => assert.equal((await validation).validateBookForPublish(validBook()).valid, true));
test("default title is rejected", async () => assert.match((await errorsFor(validBook({ title: "Enter Book Title" }))).join(" "), /real book title/));
test("blank title is rejected", async () => assert.match((await errorsFor(validBook({ title: " " }))).join(" "), /real book title/));
test("books need a chapter", async () => assert.match((await errorsFor(validBook({ chapters: [] }))).join(" "), /at least one chapter/));
test("chapters need titles", async () => assert.match((await errorsFor(validBook({ chapters: [{ title: "", content: "Body" }] }))).join(" "), /needs a real title/));
test("chapters need content", async () => assert.match((await errorsFor(validBook({ chapters: [{ title: "One", content: "" }] }))).join(" "), /is empty/));
test("duplicate titles are case insensitive", async () => assert.match((await errorsFor(validBook({ chapters: [{ title: "Same", content: "A" }, { title: " same ", content: "B" }] }))).join(" "), /same title/));
test("valid saved images pass", async () => assert.equal((await errorsFor(validBook({ images: [{ path: "images/a.png", dataUrl: "data:image/png;base64,YQ==" }] }))).length, 0));
test("images require a path", async () => assert.match((await errorsFor(validBook({ images: [{ dataUrl: "data:image/png;base64,YQ==" }] }))).join(" "), /no file path/));
test("images require image data URLs", async () => assert.match((await errorsFor(validBook({ images: [{ path: "a.png", dataUrl: "nope" }] }))).join(" "), /valid image data/));
test("duplicate image paths are rejected", async () => assert.match((await errorsFor(validBook({ images: [{ path: "a.png", dataUrl: "data:image/png;base64,YQ==" }, { path: "a.png", dataUrl: "data:image/png;base64,Yg==" }] }))).join(" "), /more than once/));
test("unsafe image paths are rejected", async () => assert.match((await errorsFor(validBook({ images: [{ path: "../a.png", dataUrl: "data:image/png;base64,YQ==" }] }))).join(" "), /not safe/));
test("missing locally referenced images are rejected", async () => assert.match((await errorsFor(validBook({ chapters: [{ title: "One", content: "![A](images/missing.png)" }] }))).join(" "), /not saved/));
test("saved locally referenced images pass", async () => assert.equal((await errorsFor(validBook({ chapters: [{ title: "One", content: "![A](images/a.png)" }], images: [{ path: "images/a.png", dataUrl: "data:image/png;base64,YQ==" }] }))).length, 0));
test("external images do not require local data", async () => assert.equal((await errorsFor(validBook({ chapters: [{ title: "One", content: "![A](https://example.com/a.png)" }] }))).length, 0));
test("example image is allowed", async () => assert.equal((await errorsFor(validBook({ chapters: [{ title: "One", content: "![A](images/example.png)" }] }))).length, 0));
test("validation errors have actionable formatting", async () => {
  const message = (await validation).formatPublishValidationErrors(["Error one", "Error two"]);
  assert.match(message, /- Error one/);
  assert.match(message, /What to do next/);
});
