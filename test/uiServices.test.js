const test = require("node:test");
const assert = require("node:assert/strict");
const errorMessages = import("../js/publishErrorMessages.js");
const githubApi = import("../js/githubApi.js");

const errorCases = [
  [{ status: 401, message: "Unauthorized" }, /GitHub is not connected/],
  [{ status: 403, message: "Forbidden" }, /one more permission/],
  [{ code: "VERSION_EXISTS", message: "exists" }, /version already exists/i],
  [{ message: "Could not create GitHub repository" }, /repository could not be created/],
  [{ message: "Could not enable GitHub Pages" }, /Pages could not be enabled/],
  [{ message: "Could not create git tree" }, /files could not be uploaded/],
  [{ message: "Could not start GitHub Actions workflow" }, /Action did not start/],
  [{ message: "Timed out waiting for GitHub Actions" }, /taking longer/],
  [{ message: "Failed to fetch" }, /could not reach the server/],
  [{ message: "mystery" }, /Publishing stopped/]
];
errorCases.forEach(([error, pattern], index) => test("publish error formatting case " + (index + 1), async () => {
  assert.match((await errorMessages).formatPublishError(error), pattern);
}));
test("workflow failures include the Actions URL", async () => {
  const output = (await errorMessages).formatPublishError({ workflowRun: { conclusion: "failure", htmlUrl: "https://github.com/run" } });
  assert.match(output, /book build failed/);
  assert.match(output, /https:\/\/github.com\/run/);
});
test("technical publish details are truncated", async () => {
  const output = (await errorMessages).formatPublishError({ message: "x".repeat(1000) });
  assert.ok(output.length < 1200);
  assert.match(output, /\.\.\.$/);
});
test("auth state reads JSON", async () => withFetch({ ok: true, json: async () => ({ authenticated: true }) }, async () => {
  assert.equal((await (await githubApi).loadGitHubAuthState()).authenticated, true);
}));
test("book list errors retain HTTP status", async () => withFetch({ ok: false, status: 503, json: async () => ({ error: "Unavailable" }) }, async () => {
  await assert.rejects(async () => (await githubApi).loadGitHubBooks(), (error) => error.status === 503 && error.message === "Unavailable");
}));
test("book URLs encode owner, repo, and branch", async () => {
  let requested = "";
  await withFetch((url) => { requested = url; return { ok: true, json: async () => ({}) }; }, async () => {
    await (await githubApi).loadGitHubBook({ owner: "a b", repo: "r/x", branch: "feature/x" });
  });
  assert.match(requested, /a%20b\/r%2Fx/);
  assert.match(requested, /feature%2Fx/);
});
test("publish preview sends JSON", async () => {
  let options;
  await withFetch((url, value) => { options = value; return { ok: true, json: async () => ({ csrfToken: "token", ok: true }) }; }, async () => {
    await (await githubApi).loadGitHubAuthState();
    await (await githubApi).publishBookPreview({ title: "Book" });
  });
  assert.equal(options.method, "POST");
  assert.equal(options.headers["X-CSRF-Token"], "token");
  assert.equal(options.body, '{"title":"Book"}');
});
test("publish preview exposes API error codes", async () => withFetch({ ok: false, status: 409, json: async () => ({ error: "Exists", code: "REPOSITORY_EXISTS" }) }, async () => {
  await assert.rejects(async () => (await githubApi).publishBookPreview({}), (error) => error.code === "REPOSITORY_EXISTS");
}));
test("logout uses POST", async () => {
  let options;
  await withFetch((url, value) => { options = value; return { ok: true, json: async () => ({ csrfToken: "logout-token" }) }; }, async () => {
    await (await githubApi).loadGitHubAuthState();
    await (await githubApi).logoutFromGitHub();
  });
  assert.equal(options.method, "POST");
  assert.equal(options.headers["X-CSRF-Token"], "logout-token");
});

async function withFetch(responseOrFactory, action) {
  const original = global.fetch;
  global.fetch = typeof responseOrFactory === "function" ? responseOrFactory : async () => responseOrFactory;
  try { return await action(); } finally { global.fetch = original; }
}
