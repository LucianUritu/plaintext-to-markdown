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

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("No files were provided for publishing.");
  }

  const repository = await checkRepositoryAccess({
    owner,
    repo,
    token
  });

  const branchData = await getBranch({
    owner,
    repo,
    branch,
    token
  });

  const latestCommitSha = branchData.commit.sha;
  const latestCommit = await getCommit({
    owner,
    repo,
    commitSha: latestCommitSha,
    token
  });

  const baseTreeSha = latestCommit.tree.sha;

  const treeItems = await createTreeItems({
    owner,
    repo,
    token,
    files
  });

  const newTree = await createTree({
    owner,
    repo,
    token,
    baseTreeSha,
    treeItems
  });

  const newCommit = await createCommit({
    owner,
    repo,
    token,
    message: commitMessage,
    treeSha: newTree.sha,
    parentCommitSha: latestCommitSha
  });

  await updateBranchReference({
    owner,
    repo,
    branch,
    token,
    newCommitSha: newCommit.sha
  });

  return {
    repository,
    commit: newCommit
  };
}

async function createTreeItems({ owner, repo, token, files }) {
  const treeItems = [];

  for (const file of files) {
    const treeItem = {
      path: file.path,
      mode: "100644",
      type: "blob"
    };

    if (file.encoding === "base64") {
      const blob = await createBlob({
        owner,
        repo,
        token,
        content: file.content,
        encoding: "base64"
      });

      treeItem.sha = blob.sha;
    } else {
      treeItem.content = file.content;
    }

    treeItems.push(treeItem);
  }

  return treeItems;
}

async function checkRepositoryAccess({ owner, repo, token }) {
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

  return response.json();
}

async function getBranch({ owner, repo, branch, token }) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/branches/" +
    encodeURIComponent(branch);

  const response = await safeFetch(url, {
    method: "GET",
    headers: createGitHubHeaders(token)
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not access branch '" +
      branch +
      "'.\n\n" +
      "Make sure the branch exists. Usually it should be 'main'.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  return response.json();
}

async function getCommit({ owner, repo, commitSha, token }) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/git/commits/" +
    encodeURIComponent(commitSha);

  const response = await safeFetch(url, {
    method: "GET",
    headers: createGitHubHeaders(token)
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not read latest commit.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  return response.json();
}

async function createTree({ owner, repo, token, baseTreeSha, treeItems }) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/git/trees";

  const response = await safeFetch(url, {
    method: "POST",
    headers: createGitHubHeaders(token),
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not create Git tree.\n\n" +
      "If one of the files is inside .github/workflows, your token needs Workflows: Read and write.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  return response.json();
}

async function createBlob({ owner, repo, token, content, encoding }) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/git/blobs";

  const response = await safeFetch(url, {
    method: "POST",
    headers: createGitHubHeaders(token),
    body: JSON.stringify({
      content,
      encoding
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not upload image blob.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  return response.json();
}

async function createCommit({
  owner,
  repo,
  token,
  message,
  treeSha,
  parentCommitSha
}) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/git/commits";

  const response = await safeFetch(url, {
    method: "POST",
    headers: createGitHubHeaders(token),
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentCommitSha]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not create Git commit.\n\n" +
      "GitHub response:\n" +
      errorText
    );
  }

  return response.json();
}

async function updateBranchReference({
  owner,
  repo,
  branch,
  token,
  newCommitSha
}) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/git/refs/heads/" +
    encodeURIComponent(branch);

  const response = await safeFetch(url, {
    method: "PATCH",
    headers: createGitHubHeaders(token),
    body: JSON.stringify({
      sha: newCommitSha,
      force: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      "Could not update branch reference.\n\n" +
      "This can happen if the branch changed while publishing. Try again.\n\n" +
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

function cleanInput(value) {
  return String(value || "").trim();
}
