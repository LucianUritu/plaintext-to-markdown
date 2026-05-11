export async function publishFilesToGitHub({
  owner,
  repo,
  branch = "main",
  token,
  files,
  commitMessage = "Update TeachBooks preview"
}) {
  owner = cleanInput(owner);
  repo = cleanInput(repo);
  branch = cleanInput(branch || "main");
  token = cleanInput(token);

  if (!owner || !repo || !branch || !token) {
    throw new Error("Missing GitHub owner, repo, branch, or token.");
  }

  await checkRepositoryAccess({
    owner,
    repo,
    branch,
    token
  });

  for (const file of files) {
    await createOrUpdateFile({
      owner,
      repo,
      branch,
      token,
      path: file.path,
      content: file.content,
      commitMessage
    });
  }
}

async function checkRepositoryAccess({ owner, repo, branch, token }) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo);

  const response = await safeFetch(url, {
    method: "GET",
    headers: createGitHubHeaders(token)
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not access repository.\n\n" +
      "Check owner, repo name, and token permissions.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  const branchUrl =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/branches/" +
    encodeURIComponent(branch);

  const branchResponse = await safeFetch(branchUrl, {
    method: "GET",
    headers: createGitHubHeaders(token)
  });

  if (!branchResponse.ok) {
    const errorText = await branchResponse.text();

    throw new Error(
      "Could not access branch '" +
      branch +
      "'.\n\n" +
      "Make sure the branch exists. Usually it should be 'main'.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }
}

async function createOrUpdateFile({
  owner,
  repo,
  branch,
  token,
  path,
  content,
  commitMessage
}) {
  const existingFile = await getExistingFile({
    owner,
    repo,
    branch,
    token,
    path
  });

  const body = {
    message: commitMessage + ": " + path,
    content: toBase64Unicode(content),
    branch
  };

  if (existingFile && existingFile.sha) {
    body.sha = existingFile.sha;
  }

  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/contents/" +
    encodeURIComponentPath(path);

  const response = await safeFetch(url, {
    method: "PUT",
    headers: createGitHubHeaders(token),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "GitHub upload failed for " +
      path +
      ".\n\n" +
      "If this file is inside .github/workflows, your token needs Workflows: Read and write.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  return response.json();
}

async function getExistingFile({ owner, repo, branch, token, path }) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/contents/" +
    encodeURIComponentPath(path) +
    "?ref=" +
    encodeURIComponent(branch);

  const response = await safeFetch(url, {
    method: "GET",
    headers: createGitHubHeaders(token)
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not check existing file " +
      path +
      ".\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  return response.json();
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(
      "Network request failed.\n\n" +
      "This usually means the browser could not reach GitHub API, or the request was blocked.\n\n" +
      "Try these:\n" +
      "- Open https://api.github.com in your browser.\n" +
      "- Disable ad blocker/privacy extensions for this local site.\n" +
      "- Check your internet/VPN/firewall.\n" +
      "- Make sure you are running the app through Live Server, not opening index.html directly.\n\n" +
      "Original browser error:\n" +
      error.message
    );
  }
}

function createGitHubHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function encodeURIComponentPath(path) {
  return path
    .split("/")
    .map(function (part) {
      return encodeURIComponent(part);
    })
    .join("/");
}

function toBase64Unicode(text) {
  const utf8Bytes = new TextEncoder().encode(text);
  let binary = "";

  utf8Bytes.forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function cleanInput(value) {
  return String(value || "").trim();
}