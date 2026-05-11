export async function publishFilesToGitHub({
  owner,
  repo,
  branch = "main",
  token,
  files,
  commitMessage = "Update TeachBooks preview"
}) {
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

  const response = await fetch(
    "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/contents/" +
      encodeURIComponentPath(path),
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("GitHub upload failed for " + path + ": " + errorText);
  }

  return response.json();
}

async function getExistingFile({ owner, repo, branch, token, path }) {
  const response = await fetch(
    "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/contents/" +
      encodeURIComponentPath(path) +
      "?ref=" +
      encodeURIComponent(branch),
    {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Could not check existing file " + path + ": " + errorText);
  }

  return response.json();
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