function createGitHubClient(token) {
  async function getCurrentUser() {
    const response = await fetch("https://api.github.com/user", {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status
      };
    }

    return {
      ok: true,
      user: await response.json()
    };
  }

  async function fetchRepos() {
    const repos = [];
    let page = 1;

    while (page <= 10) {
      const pageRepos = await fetchJson(
        "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=" +
          page
      );

      if (!Array.isArray(pageRepos)) {
        return null;
      }

      repos.push(...pageRepos);

      if (pageRepos.length < 100) {
        break;
      }

      page += 1;
    }

    return repos;
  }

  async function fetchRepositoryFile({ owner, repo, branch, path: filePath }) {
    const url =
      "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/contents/" +
      filePath
        .split("/")
        .map(encodeURIComponent)
        .join("/") +
      "?ref=" +
      encodeURIComponent(branch);

    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  async function createRepository({ title }) {
    const baseName = slugifyRepositoryName(title || "book");
    let counter = 1;

    while (counter <= 20) {
      const name = counter === 1 ? baseName : baseName + "-" + counter;
      const response = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: createGitHubJsonHeaders(),
        body: JSON.stringify({
          name,
          description: "TeachBooks book created with the book platform.",
          private: false,
          auto_init: true
        })
      });

      if (response.status === 201) {
        return response.json();
      }

      if (response.status !== 422) {
        const errorText = await response.text();
        throw new Error("Could not create GitHub repository.\n\n" + errorText);
      }

      counter += 1;
    }

    throw new Error("Could not find an available repository name.");
  }

  async function findWorkflowRunForCommit({ owner, repo, branch, commitSha }) {
    const url =
      "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/actions/runs?branch=" +
      encodeURIComponent(branch) +
      "&event=push&per_page=20";

    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      throw new Error("Could not read GitHub Actions workflow runs.");
    }

    const data = await response.json();
    const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
    const matchingRuns = runs.filter(function (run) {
      return run.head_sha === commitSha;
    });

    return (
      matchingRuns.find(isTeachBooksWorkflowRun) ||
      (matchingRuns.length === 1 ? matchingRuns[0] : null)
    );
  }

  async function publishFiles({ owner, repo, branch, files, commitMessage }) {
    await checkRepositoryAccess({ owner, repo });

    const branchData = await getBranch({ owner, repo, branch });
    const latestCommitSha = branchData.commit.sha;
    const latestCommit = await getCommit({
      owner,
      repo,
      commitSha: latestCommitSha
    });
    const treeItems = await createTreeItems({ owner, repo, files });
    const newTree = await createTree({
      owner,
      repo,
      baseTreeSha: latestCommit.tree.sha,
      treeItems
    });
    const newCommit = await createCommit({
      owner,
      repo,
      message: commitMessage,
      treeSha: newTree.sha,
      parentCommitSha: latestCommitSha
    });

    await updateBranchReference({
      owner,
      repo,
      branch,
      newCommitSha: newCommit.sha
    });

    return {
      commit: newCommit
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  async function createTreeItems({ owner, repo, files }) {
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

  async function checkRepositoryAccess({ owner, repo }) {
    const url = createRepositoryUrl(owner, repo);
    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      throw new Error("Could not access GitHub repository.");
    }

    return response.json();
  }

  async function getBranch({ owner, repo, branch }) {
    const url =
      createRepositoryUrl(owner, repo) +
      "/branches/" +
      encodeURIComponent(branch);

    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      throw new Error("Could not access GitHub branch.");
    }

    return response.json();
  }

  async function getCommit({ owner, repo, commitSha }) {
    const url =
      createRepositoryUrl(owner, repo) +
      "/git/commits/" +
      encodeURIComponent(commitSha);

    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      throw new Error("Could not read latest GitHub commit.");
    }

    return response.json();
  }

  async function createBlob({ owner, repo, content, encoding }) {
    const response = await fetch(createRepositoryUrl(owner, repo) + "/git/blobs", {
      method: "POST",
      headers: createGitHubJsonHeaders(),
      body: JSON.stringify({
        content,
        encoding
      })
    });

    if (!response.ok) {
      throw new Error("Could not upload image blob.");
    }

    return response.json();
  }

  async function createTree({ owner, repo, baseTreeSha, treeItems }) {
    const response = await fetch(createRepositoryUrl(owner, repo) + "/git/trees", {
      method: "POST",
      headers: createGitHubJsonHeaders(),
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });

    if (!response.ok) {
      throw new Error("Could not create Git tree.");
    }

    return response.json();
  }

  async function createCommit({
    owner,
    repo,
    message,
    treeSha,
    parentCommitSha
  }) {
    const response = await fetch(createRepositoryUrl(owner, repo) + "/git/commits", {
      method: "POST",
      headers: createGitHubJsonHeaders(),
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentCommitSha]
      })
    });

    if (!response.ok) {
      throw new Error("Could not create Git commit.");
    }

    return response.json();
  }

  async function updateBranchReference({ owner, repo, branch, newCommitSha }) {
    const response = await fetch(
      createRepositoryUrl(owner, repo) +
        "/git/refs/heads/" +
        encodeURIComponent(branch),
      {
        method: "PATCH",
        headers: createGitHubJsonHeaders(),
        body: JSON.stringify({
          sha: newCommitSha,
          force: false
        })
      }
    );

    if (!response.ok) {
      throw new Error("Could not update GitHub branch.");
    }

    return response.json();
  }

  function createRepositoryUrl(owner, repo) {
    return (
      "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo)
    );
  }

  function createGitHubApiHeaders() {
    return {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function createGitHubJsonHeaders() {
    return {
      ...createGitHubApiHeaders(),
      "Content-Type": "application/json"
    };
  }

  return {
    createRepository,
    fetchRepositoryFile,
    fetchRepos,
    findWorkflowRunForCommit,
    getCurrentUser,
    publishFiles
  };
}

function isTeachBooksWorkflowRun(run) {
  return (
    run.name === "call-deploy-book" ||
    run.path === ".github/workflows/call-deploy-book.yml"
  );
}

function slugifyRepositoryName(value) {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "book";
}

module.exports = {
  createGitHubClient
};
