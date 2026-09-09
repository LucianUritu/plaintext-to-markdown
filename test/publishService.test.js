const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { PublishService } = require("../server/publishService");

function client(overrides = {}) {
  const calls = [];
  return {
    calls,
    async getCurrentUser() { return { ok: true, user: { login: "alice" } }; },
    async getRepository() { return null; },
    async createRepository(args) { calls.push(["createRepository", args]); return { name: args.name, owner: { login: "alice" } }; },
    async inviteRepositoryCollaborator(args) { calls.push(["inviteRepositoryCollaborator", args]); return { status: "invited" }; },
    async getBranch() { return null; },
    async ensurePagesSite(args) { calls.push(["ensurePagesSite", args]); },
    async publishFiles(args) { calls.push(["publishFiles", args]); return { noChanges: false, commit: { sha: "abc", html_url: "https://commit" } }; },
    async dispatchWorkflow(args) { calls.push(["dispatchWorkflow", args]); },
    ...overrides
  };
}
function service(githubClient) { return new PublishService({ githubClient, rootDirectory: path.resolve(__dirname, "..") }); }

test("publish service publishes supplied files to an existing target", async () => {
  const github = client();
  const result = await service(github).publishBook({ owner: "alice", repo: "book", branch: "main", files: [{ path: "a", content: "b" }], commitMessage: "Publish" });
  assert.equal(result.commitSha, "abc");
  assert.equal(result.repository.created, false);
  assert.equal(github.calls.find(([name]) => name === "publishFiles")[1].commitMessage, "Publish");
});
test("publish service rejects empty files", async () => {
  const result = await service(client()).publishBook({ owner: "alice", repo: "book", branch: "main", files: [] });
  assert.match(result.error, /No files/);
});
test("publish service refuses existing version branches", async () => {
  const github = client({ async getBranch() { return { name: "version/first-draft" }; } });
  const result = await service(github).publishBook({ owner: "alice", repo: "book", branch: "version/first-draft", files: [{ path: "a" }] });
  assert.equal(result.code, "VERSION_EXISTS");
  assert.match(result.error, /first draft/);
});
test("no-change publishes dispatch the workflow", async () => {
  const github = client({ async publishFiles(args) { this.calls.push(["publishFiles", args]); return { noChanges: true, commit: { sha: "abc" } }; } });
  const result = await service(github).publishBook({ owner: "alice", repo: "book", branch: "main", files: [{ path: "a" }] });
  assert.equal(result.workflowDispatched, true);
  assert.ok(github.calls.some(([name]) => name === "dispatchWorkflow"));
});
test("new publishing creates a repository", async () => {
  const github = client();
  const result = await service(github).publishBook({ branch: "main", files: [{ path: "a" }], bookTitle: "My Great Book", repositoryVisibility: "private" });
  assert.equal(result.repository.repo, "my-great-book");
  assert.equal(result.repository.created, true);
  assert.equal(github.calls.find(([name]) => name === "createRepository")[1].isPrivate, true);
});
test("new publishing invites LucianUritu as a maintainer", async () => {
  const github = client();
  const result = await service(github).publishBook({ branch: "main", files: [{ path: "a" }], bookTitle: "My Great Book" });
  const invitation = github.calls.find(([name]) => name === "inviteRepositoryCollaborator");

  assert.deepEqual(invitation[1], {
    owner: "alice",
    repo: "my-great-book",
    username: "LucianUritu",
    permission: "maintain"
  });
  assert.deepEqual(result.collaboratorInvitations, [
    {
      username: "LucianUritu",
      permission: "maintain",
      status: "invited"
    }
  ]);
});
test("existing generated repository requires overwrite confirmation", async () => {
  const github = client({ async getRepository() { return { default_branch: "main" }; } });
  const result = await service(github).publishBook({ branch: "main", files: [{ path: "a" }], bookTitle: "Book" });
  assert.equal(result.code, "REPOSITORY_EXISTS");
});
test("existing generated repository can be overwritten", async () => {
  const github = client({ async getRepository() { return { default_branch: "main" }; } });
  const result = await service(github).publishBook({ branch: "main", files: [{ path: "a" }], bookTitle: "Book", overwriteExistingRepository: true });
  assert.equal(result.repository.repo, "book");
});
test("failed current-user lookup stops repository creation", async () => {
  const github = client({ async getCurrentUser() { return { ok: false }; } });
  await assert.rejects(() => service(github).publishBook({ branch: "main", files: [{ path: "a" }] }), /read GitHub user/);
});
test("book models are converted by the TeachBooks generator", async () => {
  const github = client();
  await service(github).publishBook({ owner: "alice", repo: "book", branch: "main", book: { title: "Book", introduction: { title: "Intro", content: "Welcome" }, chapters: [{ title: "One", content: "Body" }], images: [] } });
  const files = github.calls.find(([name]) => name === "publishFiles")[1].files;
  assert.ok(files.some((file) => file.path === "book/_config.yml"));
});
test("version publishing seeds the primary branch before the version branch", async () => {
  const github = client({
    async getDefaultBranch() { return "main"; }
  });

  await service(github).publishBook({
    owner: "alice",
    repo: "book",
    branch: "version/test",
    book: {
      title: "Book",
      introduction: { title: "Intro", content: "Welcome" },
      chapters: [{ title: "One", content: "Body" }],
      images: []
    }
  });

  const publishCalls = github.calls.filter(([name]) => name === "publishFiles");

  assert.equal(publishCalls.length, 2);
  assert.equal(publishCalls[0][1].branch, "main");
  assert.equal(publishCalls[1][1].branch, "version/test");
  assert.match(
    publishCalls[0][1].files.find((file) => file.path === "book/_config.yml").content,
    /repository_branch: "main"/
  );
  assert.match(
    publishCalls[1][1].files.find((file) => file.path === "book/_config.yml").content,
    /repository_branch: "version\/test"/
  );
});
