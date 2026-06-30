const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createGitHubClient,
  slugifyRepositoryName
} = require("../server/githubClient");

const API_URL = "https://github.test";

test("slugifyRepositoryName creates a GitHub-safe fallback name", () => {
  assert.equal(slugifyRepositoryName("  My Teacher's Book!  "), "my-teachers-book");
  assert.equal(slugifyRepositoryName("---"), "book");
  assert.equal(slugifyRepositoryName(), "book");
});

test("getCurrentUser uses the configured API and authentication headers", async () => {
  const requests = [];
  const client = createGitHubClient("secret", {
    apiUrl: API_URL + "/",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ login: "octocat" });
    }
  });

  assert.deepEqual(await client.getCurrentUser(), {
    ok: true,
    user: { login: "octocat" }
  });
  assert.equal(requests[0].url, API_URL + "/user");
  assert.equal(requests[0].options.headers.Authorization, "Bearer secret");
  assert.equal(
    requests[0].options.headers.Accept,
    "application/vnd.github+json"
  );
});

test("createRepository serializes JSON through the shared request helper", async () => {
  let request;
  const client = createGitHubClient("secret", {
    apiUrl: API_URL,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ id: 1, name: "course-book" }, 201);
    }
  });

  const repository = await client.createRepository({
    name: "course-book",
    isPrivate: true
  });

  assert.equal(request.url, API_URL + "/user/repos");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.options.body), {
    name: "course-book",
    description: "TeachBooks book created with the book platform.",
    private: true,
    auto_init: true
  });
  assert.equal(repository.name, "course-book");
});

test("fetchRepos combines, deduplicates, and sorts repository sources", async () => {
  const client = createGitHubClient("secret", {
    apiUrl: API_URL,
    fetchImpl: async (url) => {
      if (url.includes("/user/repos?")) {
        return jsonResponse([
          { full_name: "octo/older", updated_at: "2025-01-01T00:00:00Z" }
        ]);
      }
      if (url.includes("/user/orgs?")) {
        return jsonResponse([{ login: "Teach Books" }]);
      }
      if (url.includes("/orgs/Teach%20Books/repos?")) {
        return jsonResponse([
          { full_name: "OCTO/OLDER", updated_at: "2026-01-01T00:00:00Z" },
          { full_name: "Teach/newer", updated_at: "2025-06-01T00:00:00Z" }
        ]);
      }
      throw new Error("Unexpected URL: " + url);
    }
  });

  const repos = await client.fetchRepos();

  assert.deepEqual(
    repos.map((repo) => repo.full_name),
    ["OCTO/OLDER", "Teach/newer"]
  );
});

test("publishFiles creates a missing branch without fetching it twice", async () => {
  const requests = [];
  const client = createGitHubClient("secret", {
    apiUrl: API_URL,
    fetchImpl: async (url, options) => {
      const method = options.method || "GET";
      requests.push({ url, method, body: options.body });

      if (url.endsWith("/repos/owner/repo")) {
        return jsonResponse({ default_branch: "main" });
      }
      if (url.endsWith("/branches/draft")) {
        return jsonResponse({ message: "Not Found" }, 404);
      }
      if (url.endsWith("/branches/main")) {
        return jsonResponse({ commit: { sha: "base-commit" } });
      }
      if (url.endsWith("/git/refs") && method === "POST") {
        return jsonResponse({ ref: "refs/heads/draft" }, 201);
      }
      if (url.endsWith("/git/commits/base-commit")) {
        return jsonResponse({ sha: "base-commit", tree: { sha: "base-tree" } });
      }
      if (url.endsWith("/git/trees") && method === "POST") {
        return jsonResponse({ sha: "base-tree" }, 201);
      }
      throw new Error("Unexpected request: " + method + " " + url);
    }
  });

  const result = await client.publishFiles({
    owner: "owner",
    repo: "repo",
    branch: "draft",
    files: [{ path: "README.md", content: "Hello" }],
    commitMessage: "Publish"
  });

  assert.equal(result.noChanges, true);
  assert.equal(
    requests.filter((request) => request.url.endsWith("/branches/draft")).length,
    1
  );
  const createBranchRequest = requests.find((request) =>
    request.url.endsWith("/git/refs")
  );
  assert.deepEqual(JSON.parse(createBranchRequest.body), {
    ref: "refs/heads/draft",
    sha: "base-commit"
  });
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
