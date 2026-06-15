const crypto = require("node:crypto");
const { createGitHubClient } = require("./githubClient");
const { PublishService } = require("./publishService");
const { TeachBooksService } = require("./teachBooksService");
const { VersioningService } = require("./versioningService");

function createRoutes({
  appBaseUrl,
  rootDirectory,
  sessionStore,
  readJsonRequest,
  redirect,
  sendJson
}) {
  async function startGitHubLogin(request, response) {
    const clientId = process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
      sendJson(response, 500, {
        error: "Missing GITHUB_CLIENT_ID. Copy .env.example to .env and fill it in."
      });
      return;
    }

    const session = sessionStore.getOrCreateSession(request, response);
    const state = crypto.randomBytes(24).toString("hex");
    const scope =
      process.env.GITHUB_OAUTH_SCOPE || "read:user read:org repo workflow";

    session.githubOAuthState = state;

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", appBaseUrl + "/auth/github/callback");
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);

    redirect(response, authorizeUrl.toString());
  }

  async function finishGitHubLogin(request, response, url) {
    const session = sessionStore.getOrCreateSession(request, response);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state || state !== session.githubOAuthState) {
      redirect(response, "/?github=error");
      return;
    }

    delete session.githubOAuthState;

    const tokenData = await exchangeCodeForToken(code);

    if (!tokenData.access_token) {
      console.error("GitHub token response:", tokenData);
      redirect(response, "/?github=error");
      return;
    }

    session.githubAccessToken = tokenData.access_token;
    session.githubScope = tokenData.scope || "";

    redirect(response, "/?github=connected");
  }

  async function getCurrentUser(request, response) {
    const session = sessionStore.getSessionFromRequest(request);

    if (!session || !session.githubAccessToken) {
      sendJson(response, 200, {
        authenticated: false
      });
      return;
    }

    const result = await createGitHubClient(session.githubAccessToken).getCurrentUser();

    if (!result.ok) {
      sendJson(response, result.status, {
        authenticated: false,
        error: "Could not read GitHub user."
      });
      return;
    }

    const user = result.user;

    sendJson(response, 200, {
      authenticated: true,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      scope: session.githubScope
    });
  }

  async function getGitHubBooks(request, response) {
    const session = getRequiredGitHubSession(request, response);

    if (!session) {
      return;
    }

    const books = await createTeachBooksService(session).listBooks();

    if (!Array.isArray(books)) {
      sendJson(response, 502, {
        error: "Could not read GitHub repositories."
      });
      return;
    }

    sendJson(response, 200, {
      books
    });
  }

  async function getGitHubBook(request, response, url) {
    const session = getRequiredGitHubSession(request, response);

    if (!session) {
      return;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const owner = pathParts[2];
    const repoName = pathParts[3];
    const branch = url.searchParams.get("branch") || "main";

    if (!owner || !repoName) {
      sendJson(response, 400, {
        error: "Missing owner or repository name."
      });
      return;
    }

    const book = await createTeachBooksService(session).loadBook({
      owner,
      repoName,
      branch
    });

    if (!book) {
      sendJson(response, 404, {
        error: "This repository does not look like a TeachBooks project."
      });
      return;
    }

    sendJson(response, 200, {
      book
    });
  }

  async function publishBookToGitHub(request, response) {
    const session = getRequiredGitHubSession(request, response);

    if (!session) {
      return;
    }

    const body = await readJsonRequest(request);
    const owner = cleanInput(body.owner);
    const repo = cleanInput(body.repo);
    const branch = cleanInput(body.branch || "main");

    if (!branch) {
      sendJson(response, 400, {
        error: "Missing GitHub branch."
      });
      return;
    }

    try {
      const result = await createPublishService(session).publishBook({
        owner,
        repo,
        branch,
        files: body.files,
        book: body.book,
        bookTitle: cleanInput(body.bookTitle || "Untitled Book"),
        commitMessage:
          cleanInput(body.commitMessage) || "Update real TeachBooks preview",
        overwriteExistingRepository: Boolean(body.overwriteExistingRepository),
        repositoryVisibility: normalizeRepositoryVisibility(
          body.repositoryVisibility
        )
      });

      if (result.error) {
        sendJson(response, isConflictError(result.code) ? 409 : 400, {
          error: result.error,
          code: result.code,
          repository: result.repository
        });
        return;
      }

      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 502, {
        error: error.message
      });
    }
  }

  async function getPublishWorkflowStatus(request, response, url) {
    const session = getRequiredGitHubSession(request, response);

    if (!session) {
      return;
    }

    const owner = cleanInput(url.searchParams.get("owner"));
    const repo = cleanInput(url.searchParams.get("repo"));
    const branch = cleanInput(url.searchParams.get("branch") || "main");
    const commitSha = cleanInput(url.searchParams.get("commitSha"));

    if (!owner || !repo || !branch || !commitSha) {
      sendJson(response, 400, {
        error: "Missing repository, branch, or commit SHA."
      });
      return;
    }

    try {
      const workflowRun = await createGitHubClient(
        session.githubAccessToken
      ).findWorkflowRunForCommit({
        owner,
        repo,
        branch,
        commitSha
      });

      if (!workflowRun) {
        sendJson(response, 200, {
          found: false,
          status: "waiting",
          conclusion: null
        });
        return;
      }

      sendJson(response, 200, {
        found: true,
        id: workflowRun.id,
        name: workflowRun.name || "",
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        htmlUrl: workflowRun.html_url || ""
      });
    } catch (error) {
      sendJson(response, 502, {
        error: error.message
      });
    }
  }

  async function getVersionBranches(request, response, url) {
    const session = getRequiredGitHubSession(request, response);

    if (!session) {
      return;
    }

    const owner = cleanInput(url.searchParams.get("owner"));
    const repo = cleanInput(url.searchParams.get("repo"));
    const prefix = cleanInput(url.searchParams.get("prefix") || "version/");
    const perPage = Math.min(
      Number(url.searchParams.get("per_page") || 100),
      100
    );

    if (!owner || !repo) {
      sendJson(response, 400, {
        error: "Missing owner or repo."
      });
      return;
    }

    try {
      const branches = await createVersioningService(session, { prefix })
        .listVersionBranches({ owner, repo, perPage });
      sendJson(response, 200, { branches });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
  }

  async function getCommitInfo(request, response, url) {
    const session = getRequiredGitHubSession(request, response);

    if (!session) {
      return;
    }

    const owner = cleanInput(url.searchParams.get("owner"));
    const repo = cleanInput(url.searchParams.get("repo"));
    const sha = cleanInput(url.searchParams.get("sha"));

    if (!owner || !repo || !sha) {
      sendJson(response, 400, {
        error: "Missing owner, repo, or sha."
      });
      return;
    }

    try {
      const commit = await createVersioningService(session)
        .getCommit({ owner, repo, sha });
      sendJson(response, 200, commit);
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
  }
  
  function logout(request, response) {
    sessionStore.destroySession(request, response);
    sendJson(response, 200, {
      authenticated: false
    });
  }

  function getRequiredGitHubSession(request, response) {
    const session = sessionStore.getSessionFromRequest(request);

    if (!session || !session.githubAccessToken) {
      sendJson(response, 401, {
        error: "Sign in with GitHub first."
      });
      return null;
    }

    return session;
  }

  function createTeachBooksService(session) {
    return new TeachBooksService(createGitHubClient(session.githubAccessToken));
  }

  function createPublishService(session) {
    return new PublishService({
      githubClient: createGitHubClient(session.githubAccessToken),
      rootDirectory
    });
  }

  function createVersioningService(session, options) {
    return new VersioningService(
      createGitHubClient(session.githubAccessToken),
      options
    );
  }

  async function exchangeCodeForToken(code) {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: appBaseUrl + "/auth/github/callback"
      })
    });

    return response.json();
  }

  return {
    finishGitHubLogin,
    getCommitInfo,
    getCurrentUser,
    getGitHubBook,
    getGitHubBooks,
    getPublishWorkflowStatus,
    getVersionBranches,
    logout,
    publishBookToGitHub,
    startGitHubLogin
  };
}

function cleanInput(value) {
  return String(value || "").trim();
}

function normalizeRepositoryVisibility(value) {
  return value === "private" ? "private" : "public";
}

function isConflictError(code) {
  return code === "REPOSITORY_EXISTS" || code === "VERSION_EXISTS";
}

module.exports = {
  createRoutes
};
