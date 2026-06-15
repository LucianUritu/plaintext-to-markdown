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
    const reposByFullName = new Map();
    const userRepos = await fetchPaginatedJson(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member"
    );

    if (!Array.isArray(userRepos)) {
      return null;
    }

    addRepositories(reposByFullName, userRepos);

    const organizations = await fetchPaginatedJson(
      "https://api.github.com/user/orgs?per_page=100"
    );

    if (Array.isArray(organizations)) {
      for (const organization of organizations) {
        const organizationLogin = organization && organization.login;

        if (!organizationLogin) {
          continue;
        }

        const organizationRepos = await fetchPaginatedJson(
          "https://api.github.com/orgs/" +
            encodeURIComponent(organizationLogin) +
            "/repos?per_page=100&type=all&sort=updated"
        );

        if (Array.isArray(organizationRepos)) {
          addRepositories(reposByFullName, organizationRepos);
        }
      }
    }

    return Array.from(reposByFullName.values()).sort(compareReposByUpdatedAt);
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

  async function createRepository({ name, isPrivate }) {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: createGitHubJsonHeaders(),
      body: JSON.stringify({
        name,
        description: "TeachBooks book created with the book platform.",
        private: Boolean(isPrivate),
        auto_init: true
      })
    });

    if (response.status === 201) {
      return response.json();
    }

    if (response.status === 422) {
      return {
        exists: true,
        name
      };
    }

    const errorText = await response.text();
    throw new Error("Could not create GitHub repository.\n\n" + errorText);
  }

  async function getRepository({ owner, repo }) {
    const response = await fetch(createRepositoryUrl(owner, repo), {
      headers: createGitHubApiHeaders()
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Could not read GitHub repository.");
    }

    return response.json();
  }

  async function findWorkflowRunForCommit({ owner, repo, branch, commitSha }) {
    const url =
      "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/actions/runs?branch=" +
      encodeURIComponent(branch) +
      "&per_page=20";

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

  async function ensurePagesSite({ owner, repo }) {
    const existingSite = await getPagesSite({ owner, repo });

    if (existingSite) {
      return existingSite;
    }

    const response = await fetch(createRepositoryUrl(owner, repo) + "/pages", {
      method: "POST",
      headers: createGitHubJsonHeaders(),
      body: JSON.stringify({
        build_type: "workflow"
      })
    });

    if (response.status === 201) {
      return response.json();
    }

    if (response.status === 409) {
      return getPagesSite({ owner, repo });
    }

    throw new Error(
      "Could not enable GitHub Pages.\n\n" + (await readGitHubError(response))
    );
  }

  async function getPagesSite({ owner, repo }) {
    const response = await fetch(createRepositoryUrl(owner, repo) + "/pages", {
      headers: createGitHubApiHeaders()
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        "Could not read GitHub Pages settings.\n\n" +
          (await readGitHubError(response))
      );
    }

    return response.json();
  }

  async function publishFiles({ owner, repo, branch, files, commitMessage }) {
    await checkRepositoryAccess({ owner, repo });

    let branchData = await getBranch({ owner, repo, branch });

    if (!branchData) {
      const defaultBranchName = await getDefaultBranch({ owner, repo });
      const defaultBranchData = await getBranch({ owner, repo, branch: defaultBranchName });
      await createBranch({ owner, repo, branch, fromSha: defaultBranchData.commit.sha });
      branchData = await getBranch({ owner, repo, branch });
    }
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
    if (newTree.sha === latestCommit.tree.sha) {
      return {
        commit: {
          sha: latestCommitSha,
          html_url:
            "https://github.com/" +
            owner +
            "/" +
            repo +
            "/commit/" +
            latestCommitSha
        },
        noChanges: true
      };
    }

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
      commit: newCommit,
      noChanges: false
    };
  }

  async function dispatchWorkflow({ owner, repo, branch, workflowFileName }) {
    const response = await fetch(
      createRepositoryUrl(owner, repo) +
        "/actions/workflows/" +
        encodeURIComponent(workflowFileName) +
        "/dispatches",
      {
        method: "POST",
        headers: createGitHubJsonHeaders(),
        body: JSON.stringify({
          ref: branch
        })
      }
    );

    if (response.status === 204) {
      return;
    }

    throw new Error(
      "Could not start GitHub Actions workflow.\n\n" +
        (await readGitHubError(response))
    );
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

  async function fetchPaginatedJson(baseUrl) {
    const items = [];
    let page = 1;

    while (page <= 10) {
      const separator = baseUrl.includes("?") ? "&" : "?";
      const pageItems = await fetchJson(baseUrl + separator + "page=" + page);

      if (!Array.isArray(pageItems)) {
        return null;
      }

      items.push(...pageItems);

      if (pageItems.length < 100) {
        break;
      }

      page += 1;
    }

    return items;
  }

  function addRepositories(reposByFullName, repos) {
    repos.forEach(function (repo) {
      if (!repo || !repo.full_name) {
        return;
      }

      reposByFullName.set(repo.full_name.toLowerCase(), repo);
    });
  }

  function compareReposByUpdatedAt(firstRepo, secondRepo) {
    return (
      Date.parse(secondRepo.updated_at || "") -
      Date.parse(firstRepo.updated_at || "")
    );
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

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Could not access GitHub branch.");
    }

    return response.json();
  }

  async function getDefaultBranch({ owner, repo }) {
    const response = await fetch(createRepositoryUrl(owner, repo), {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      throw new Error("Could not read repository default branch.");
    }

    const data = await response.json();
    return data.default_branch || "main";
  }

  async function createBranch({ owner, repo, branch, fromSha }) {
    const response = await fetch(
      createRepositoryUrl(owner, repo) + "/git/refs",
      {
        method: "POST",
        headers: createGitHubJsonHeaders(),
        body: JSON.stringify({
          ref: "refs/heads/" + branch,
          sha: fromSha
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        "Could not create branch '" + branch + "'.\n\n" +
        (await readGitHubError(response))
      );
    }

    return response.json();
  }

  async function listBranches({ owner, repo, prefix, perPage = 100 }) {
    const url =
      createRepositoryUrl(owner, repo) +
      "/branches?per_page=" + encodeURIComponent(perPage);

    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      throw new Error("Could not list branches.\n\n" + (await readGitHubError(response)));
    }

    const branches = await response.json();

    if (!Array.isArray(branches)) {
      return [];
    }

    return branches
      .filter(function (b) {
        return !prefix || String(b.name || "").startsWith(prefix);
      })
      .map(function (b) {
        return {
          name: b.name,
          commitSha: b.commit && b.commit.sha ? b.commit.sha : ""
        };
      });
  }

  async function getCommitBySha({ owner, repo, sha }) {
    const url =
      createRepositoryUrl(owner, repo) +
      "/commits/" +
      encodeURIComponent(sha);

    const response = await fetch(url, {
      headers: createGitHubApiHeaders()
    });

    if (!response.ok) {
      throw new Error("Could not read commit " + sha + ".\n\n" + (await readGitHubError(response)));
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
      throw new Error(
        "Could not create Git tree.\n\n" + (await readGitHubError(response))
      );
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

  async function readGitHubError(response) {
    const text = await response.text();

    if (!text) {
      return "GitHub returned HTTP " + response.status + ".";
    }

    try {
      const body = JSON.parse(text);
      const errors = Array.isArray(body.errors)
        ? "\n" +
          body.errors
            .map(function (error) {
              return "- " + (error.message || JSON.stringify(error));
            })
            .join("\n")
        : "";

      return (body.message || text) + errors;
    } catch (error) {
      return text;
    }
  }

  function isTeachBooksWorkflowRun(run) {
    return (
      run.name === "call-deploy-book" ||
      run.path === ".github/workflows/call-deploy-book.yml"
    );
  }

  return {
    createRepository,
    createBranch,
    dispatchWorkflow,
    ensurePagesSite,
    fetchRepositoryFile,
    fetchRepos,
    findWorkflowRunForCommit,
    getBranch,
    getCommitBySha,
    getDefaultBranch,
    getCurrentUser,
    getRepository,
    listBranches,
    publishFiles
  };
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
  createGitHubClient,
  slugifyRepositoryName
};
