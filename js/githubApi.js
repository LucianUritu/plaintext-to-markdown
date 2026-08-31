let csrfToken = "";

export async function loadGitHubAuthState() {
  const response = await fetch("/api/me");

  if (!response.ok) {
    throw await createApiError(response, "GitHub auth is not available.");
  }

  const authState = await response.json();
  rememberCsrfToken(authState);
  return authState;
}

export async function loadGitHubBooks() {
  const response = await fetch("/api/books");

  if (!response.ok) {
    throw await createApiError(response, "Could not load GitHub books.");
  }

  return response.json();
}

export async function loadGitHubBook(book) {
  const response = await fetch(
    "/api/books/" +
      encodeURIComponent(book.owner) +
      "/" +
      encodeURIComponent(book.repo) +
      "?branch=" +
      encodeURIComponent(book.branch || "main")
  );

  if (!response.ok) {
    throw await createApiError(response, "Could not open GitHub book.");
  }

  return response.json();
}

export async function logoutFromGitHub() {
  await fetch("/auth/logout", {
    method: "POST",
    headers: createCsrfHeaders()
  });
}

export async function publishBookPreview(payload) {
  const response = await fetch("/api/publish-book", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createCsrfHeaders()
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    const error = new Error(result.error || "Publish failed.");
    error.status = response.status;
    error.code = result.code || "";
    error.repository = result.repository || null;
    throw error;
  }

  return result;
}

export async function markBookDone(payload) {
  const response = await fetch("/api/book-done", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createCsrfHeaders()
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    const error = new Error(result.error || "Could not send completion email.");
    error.status = response.status;
    throw error;
  }

  return result;
}

function rememberCsrfToken(body) {
  if (body && typeof body.csrfToken === "string") {
    csrfToken = body.csrfToken;
  }
}

function createCsrfHeaders() {
  return csrfToken
    ? {
        "X-CSRF-Token": csrfToken
      }
    : {};
}

export async function loadPublishWorkflowStatus(publishResult) {
  const params = new URLSearchParams({
    owner: publishResult.repository.owner,
    repo: publishResult.repository.repo,
    branch: publishResult.repository.branch,
    commitSha: publishResult.commitSha
  });

  const response = await fetch("/api/publish-book/status?" + params.toString());
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result.error || "Could not read GitHub Actions status.");
  }

  return result;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return {
      error: "The app server returned an unexpected response."
    };
  }
}

async function createApiError(response, fallbackMessage) {
  const result = await readJsonResponse(response);
  const error = new Error(result.error || fallbackMessage);

  error.status = response.status;
  error.code = result.code || "";

  return error;
}

export async function loadVersionBranches({ owner, repo }) {
  const params = new URLSearchParams({
    owner,
    repo,
    prefix: "version/",
    per_page: "100"
  });

  const response = await fetch("/api/github/branches?" + params.toString());

  if (!response.ok) {
    const result = await readJsonResponse(response);
    throw new Error(result.error || "Could not load version branches.");
  }

  return response.json();
}

export async function loadCommitInfo({ owner, repo, sha }) {
  const params = new URLSearchParams({ owner, repo, sha });

  const response = await fetch("/api/github/commit?" + params.toString());

  if (!response.ok) {
    const result = await readJsonResponse(response);
    throw new Error(result.error || "Could not load commit info.");
  }

  return response.json();
}
