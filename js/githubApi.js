export async function loadGitHubAuthState() {
  const response = await fetch("/api/me");

  if (!response.ok) {
    throw new Error("GitHub auth is not available.");
  }

  return response.json();
}

export async function loadGitHubBooks() {
  const response = await fetch("/api/books");

  if (!response.ok) {
    throw new Error("Could not load GitHub books.");
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
    throw new Error("Could not open GitHub book.");
  }

  return response.json();
}

export async function logoutFromGitHub() {
  await fetch("/auth/logout", {
    method: "POST"
  });
}

export async function publishBookPreview(payload) {
  const response = await fetch("/api/publish-book", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (!response.ok) {
    const error = new Error(result.error || "Publish failed.");
    error.status = response.status;
    error.code = result.code || "";
    error.repository = result.repository || null;
    throw error;
  }

  return result;
}

export async function loadPublishWorkflowStatus(publishResult) {
  const params = new URLSearchParams({
    owner: publishResult.repository.owner,
    repo: publishResult.repository.repo,
    branch: publishResult.repository.branch,
    commitSha: publishResult.commitSha
  });

  const response = await fetch("/api/publish-book/status?" + params.toString());
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Could not read GitHub Actions status.");
  }

  return result;
}
