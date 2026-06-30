const test = require("node:test");
const assert = require("node:assert/strict");
const versions = import("../js/versionManager.js");
const navigationModule = import("../js/appNavigation.js");

async function createNavigation(search = "") {
  const originalWindow = global.window;
  const originalHistory = global.history;
  const calls = [];
  global.window = {
    location: { href: "https://example.test/app" + search, search },
    addEventListener() {}
  };
  global.history = {
    pushState(state, unused, url) { calls.push({ method: "push", state, url }); },
    replaceState(state, unused, url) { calls.push({ method: "replace", state, url }); }
  };
  const applied = [];
  const { AppNavigation } = await navigationModule;
  const navigation = new AppNavigation({ applyState: (state) => applied.push(state), getFallbackState: () => ({ view: "home" }) });
  return { applied, calls, navigation, restore() { global.window = originalWindow; global.history = originalHistory; } };
}

test("navigation reads bibliography editor URLs", async () => {
  const context = await createNavigation("?view=editor&type=bibliography");
  try { assert.deepEqual(context.navigation.readStateFromUrl(), { view: "editor", type: "bibliography" }); }
  finally { context.restore(); }
});
test("navigation reads chapter ids", async () => {
  const context = await createNavigation("?view=editor&type=chapter&chapter=c1");
  try { assert.deepEqual(context.navigation.readStateFromUrl(), { view: "editor", type: "chapter", chapterId: "c1" }); }
  finally { context.restore(); }
});
test("navigation creates clean bibliography URLs", async () => {
  const context = await createNavigation("?old=yes#hash");
  try { assert.equal(context.navigation.createUrl({ view: "editor", type: "bibliography" }), "https://example.test/app?view=editor&type=bibliography"); }
  finally { context.restore(); }
});
test("navigation pushes and applies state", async () => {
  const context = await createNavigation();
  try {
    context.navigation.navigate({ view: "book" });
    assert.equal(context.calls[0].method, "push");
    assert.deepEqual(context.applied[0], { view: "book" });
  } finally { context.restore(); }
});
test("navigation restore always resets restoring flag", async () => {
  const context = await createNavigation();
  try { context.navigation.restore({ view: "home" }); assert.equal(context.navigation.isRestoring, false); }
  finally { context.restore(); }
});

test("version labels are normalized to branch names", async () => assert.equal(new (await versions).VersionBranchNaming().toBranchName(" Release 1! "), "version/release-1"));
test("valid version labels are accepted", async () => assert.equal(new (await versions).VersionBranchNaming().isValidLabel("v1.2.3"), true));
test("blank version labels are rejected", async () => assert.equal(new (await versions).VersionBranchNaming().isValidLabel(" "), false));
test("main and master labels are rejected", async () => {
  const naming = new (await versions).VersionBranchNaming();
  assert.equal(naming.isValidLabel("main"), false);
  assert.equal(naming.isValidLabel("MASTER"), false);
});
test("overlong labels are rejected", async () => assert.equal(new (await versions).VersionBranchNaming().isValidLabel("a".repeat(65)), false));
test("branch labels are extracted", async () => assert.equal(new (await versions).VersionBranchNaming().toVersionLabel("version/v2"), "v2"));
test("non-version branches return null labels", async () => assert.equal(new (await versions).VersionBranchNaming().toVersionLabel("main"), null));
test("version manager requires repository coordinates", async () => {
  const manager = new (await versions).VersionManager({ apiClient: {} });
  await assert.rejects(() => manager.loadHistory({ owner: "", repo: "" }), /required/);
});
test("version history is enriched and newest first", async () => {
  const apiClient = {
    async listBranches() { return [{ name: "version/v1", commitSha: "1" }, { name: "version/v2", commitSha: "2" }]; },
    async getCommit({ sha }) { return { commit: { author: { date: sha === "1" ? "2024-01-01" : "2025-01-01" } } }; }
  };
  const history = await new (await versions).VersionManager({ apiClient }).loadHistory({ owner: "a", repo: "b" });
  assert.deepEqual(history.map((item) => item.version), ["v2", "v1"]);
});
test("version history tolerates commit lookup failures", async () => {
  const apiClient = { async listBranches() { return [{ name: "version/v1", commitSha: "1" }]; }, async getCommit() { throw new Error("no"); } };
  const [item] = await new (await versions).VersionManager({ apiClient }).loadHistory({ owner: "a", repo: "b" });
  assert.equal(item.committedAt, null);
  assert.match(item.pagesUrl, /version-v1/);
});
test("version API client reports list errors", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, async json() { return { error: "Denied" }; } });
  try {
    const { VersionApiClient } = await versions;
    await assert.rejects(() => new VersionApiClient().listBranches({ owner: "a", repo: "b" }), /Denied/);
  }
  finally { global.fetch = originalFetch; }
});
test("version API client returns branches", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, async json() { return { branches: [{ name: "version/v1" }] }; } });
  try { assert.equal((await new (await versions).VersionApiClient().listBranches({ owner: "a", repo: "b" })).length, 1); }
  finally { global.fetch = originalFetch; }
});
