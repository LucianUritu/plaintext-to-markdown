const crypto = require("node:crypto");
const { createGitHubClient } = require("./githubClient");
const { withSecurityHeaders } = require("./httpUtils");
const { PublishService } = require("./publishService");
const { TeachBooksService } = require("./teachBooksService");
const { VersioningService } = require("./versioningService");

function createRoutes({
  appBaseUrl,
  gitHubClientId,
  rootDirectory,
  sessionStore,
  readJsonRequest,
  redirect,
  sendJson
}) {
  async function startGitHubLogin(request, response) {
    const clientId = gitHubClientId || process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
      sendJson(response, 500, {
        error: "Missing GITHUB_CLIENT_ID. Set it in .env or desktop/config.json."
      });
      return;
    }

    if (!process.env.GITHUB_CLIENT_SECRET) {
      await startGitHubDeviceLogin(request, response, clientId);
      return;
    }

    const session = sessionStore.getOrCreateSession(request, response);
    const state = crypto.randomBytes(24).toString("hex");
    const scope = buildGitHubOAuthScope(process.env.GITHUB_OAUTH_SCOPE);

    session.githubOAuthState = state;

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", appBaseUrl + "/auth/github/callback");
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);

    redirect(response, authorizeUrl.toString());
  }

  async function startGitHubDeviceLogin(request, response, clientId) {
    const session = sessionStore.getOrCreateSession(request, response);
    const deviceData = await requestGitHubDeviceCode(clientId);

    if (!deviceData.device_code) {
      console.error("GitHub device code response:", deviceData);
      sendJson(response, 502, {
        error: deviceData.error_description || "Could not start GitHub device login."
      });
      return;
    }

    session.githubDeviceLogin = {
      deviceCode: deviceData.device_code,
      expiresAt: Date.now() + Number(deviceData.expires_in || 900) * 1000,
      intervalSeconds: Number(deviceData.interval || 5),
      lastPollAt: 0
    };

    const nonce = crypto.randomBytes(16).toString("base64");

    sendHtml(response, 200, renderGitHubDeviceLoginPage({
      nonce,
      userCode: deviceData.user_code,
      verificationUri: deviceData.verification_uri || "https://github.com/login/device"
    }), {
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'nonce-" +
        nonce +
        "'; script-src 'self' 'nonce-" +
        nonce +
        "'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
    });
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
    const session = sessionStore.getOrCreateSession(request, response);

    if (!session || !session.githubAccessToken) {
      sendJson(response, 200, {
        authenticated: false,
        csrfToken: session.csrfToken
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
      scope: session.githubScope,
      csrfToken: session.csrfToken,
      missingScopes: getMissingGitHubScopes(session.githubScope)
    });
  }

  async function getGitHubDeviceLoginStatus(request, response) {
    const session = sessionStore.getSessionFromRequest(request);

    if (!session || !session.githubDeviceLogin) {
      sendJson(response, 400, {
        status: "error",
        error: "No GitHub device login is active."
      });
      return;
    }

    const deviceLogin = session.githubDeviceLogin;

    if (Date.now() > deviceLogin.expiresAt) {
      delete session.githubDeviceLogin;
      sendJson(response, 400, {
        status: "expired",
        error: "GitHub login expired. Please try again."
      });
      return;
    }

    const waitMs = deviceLogin.intervalSeconds * 1000;

    if (Date.now() - deviceLogin.lastPollAt < waitMs) {
      sendJson(response, 200, {
        status: "pending",
        intervalSeconds: deviceLogin.intervalSeconds
      });
      return;
    }

    deviceLogin.lastPollAt = Date.now();

    const tokenData = await exchangeDeviceCodeForToken(deviceLogin.deviceCode);

    if (tokenData.error === "authorization_pending") {
      sendJson(response, 200, {
        status: "pending",
        intervalSeconds: deviceLogin.intervalSeconds
      });
      return;
    }

    if (tokenData.error === "slow_down") {
      deviceLogin.intervalSeconds += 5;
      sendJson(response, 200, {
        status: "pending",
        intervalSeconds: deviceLogin.intervalSeconds
      });
      return;
    }

    if (!tokenData.access_token) {
      console.error("GitHub device token response:", tokenData);
      delete session.githubDeviceLogin;
      sendJson(response, 400, {
        status: "error",
        error: tokenData.error_description || "GitHub login was not completed."
      });
      return;
    }

    delete session.githubDeviceLogin;
    session.githubAccessToken = tokenData.access_token;
    session.githubScope = tokenData.scope || "";

    sendJson(response, 200, {
      status: "connected"
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
      books,
      missingScopes: getMissingGitHubScopes(session.githubScope)
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

    if (!isSafeGitHubOwnerOrRepo(owner) || !isSafeGitHubOwnerOrRepo(repoName) || !isSafeGitHubBranch(branch)) {
      sendJson(response, 400, {
        error: "Invalid GitHub repository or branch."
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

    if (!verifyCsrfToken(request, response, session)) {
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

    if (
      (owner && !isSafeGitHubOwnerOrRepo(owner)) ||
      (repo && !isSafeGitHubOwnerOrRepo(repo)) ||
      !isSafeGitHubBranch(branch)
    ) {
      sendJson(response, 400, {
        error: "Invalid GitHub repository or branch."
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

    if (
      !isSafeGitHubOwnerOrRepo(owner) ||
      !isSafeGitHubOwnerOrRepo(repo) ||
      !isSafeGitHubBranch(branch) ||
      !/^[a-f0-9]{40}$/i.test(commitSha)
    ) {
      sendJson(response, 400, {
        error: "Invalid GitHub repository, branch, or commit SHA."
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

    if (!isSafeGitHubOwnerOrRepo(owner) || !isSafeGitHubOwnerOrRepo(repo) || !isSafeGitHubBranch(prefix)) {
      sendJson(response, 400, {
        error: "Invalid GitHub repository or branch prefix."
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

    if (
      !isSafeGitHubOwnerOrRepo(owner) ||
      !isSafeGitHubOwnerOrRepo(repo) ||
      !/^[a-f0-9]{40}$/i.test(sha)
    ) {
      sendJson(response, 400, {
        error: "Invalid GitHub repository or commit SHA."
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
    const session = sessionStore.getSessionFromRequest(request);

    if (session && !verifyCsrfToken(request, response, session)) {
      return;
    }

    sessionStore.destroySession(request, response);
    sendJson(response, 200, {
      authenticated: false
    });
  }

  function verifyCsrfToken(request, response, session) {
    const token = request.headers["x-csrf-token"];

    if (
      typeof token !== "string" ||
      typeof session.csrfToken !== "string" ||
      token.length !== session.csrfToken.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken))
    ) {
      sendJson(response, 403, {
        error: "Invalid security token."
      });
      return false;
    }

    return true;
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
        client_id: gitHubClientId || process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: appBaseUrl + "/auth/github/callback"
      })
    });

    return response.json();
  }

  async function requestGitHubDeviceCode(clientId) {
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: buildGitHubOAuthScope(process.env.GITHUB_OAUTH_SCOPE)
      })
    });

    return response.json();
  }

  async function exchangeDeviceCodeForToken(deviceCode) {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: gitHubClientId || process.env.GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });

    return response.json();
  }

  return {
    finishGitHubLogin,
    getCommitInfo,
    getCurrentUser,
    getGitHubDeviceLoginStatus,
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

function isSafeGitHubOwnerOrRepo(value) {
  return /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(String(value || ""));
}

function isSafeGitHubBranch(value) {
  const branch = String(value || "");

  return (
    branch.length > 0 &&
    branch.length <= 255 &&
    !/[\x00-\x20~^:?*\[\\\]]/.test(branch) &&
    !branch.includes("..") &&
    !branch.endsWith(".") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".lock")
  );
}

function sendHtml(response, statusCode, html, headers = {}) {
  response.writeHead(statusCode, withSecurityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    ...headers
  }));
  response.end(html);
}

function renderGitHubDeviceLoginPage({ nonce, userCode, verificationUri }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect GitHub</title>
  <style nonce="${escapeHtml(nonce)}">
    body {
      align-items: center;
      background: #f7f8fb;
      color: #1f2937;
      display: flex;
      font-family: Arial, sans-serif;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    main {
      background: white;
      border: 1px solid #d7dce5;
      border-radius: 8px;
      box-shadow: 0 16px 40px rgba(31, 41, 55, 0.12);
      max-width: 520px;
      padding: 32px;
      text-align: center;
    }
    code {
      background: #eef2f7;
      border-radius: 6px;
      display: inline-block;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 3px;
      margin: 16px 0;
      padding: 14px 18px;
    }
    a, button {
      background: #1f6feb;
      border: 0;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      display: inline-block;
      font-size: 15px;
      margin-top: 10px;
      padding: 10px 14px;
      text-decoration: none;
    }
    p {
      line-height: 1.5;
    }
    .status {
      color: #5f6b7a;
      min-height: 24px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Connect GitHub</h1>
    <p>Enter this code on GitHub to connect the desktop app.</p>
    <code>${escapeHtml(userCode)}</code>
    <p><a href="${escapeHtml(verificationUri)}" target="_blank" rel="noopener noreferrer">Open GitHub device login</a></p>
    <p class="status" id="status">Waiting for GitHub approval...</p>
  </main>
  <script nonce="${escapeHtml(nonce)}">
    async function poll() {
      const status = document.getElementById("status");

      try {
        const response = await fetch("/auth/github/device/status");
        const result = await response.json();

        if (result.status === "connected") {
          status.textContent = "Connected. Returning to the app...";
          window.location.href = "/?github=connected";
          return;
        }

        if (result.status === "expired" || result.status === "error") {
          status.textContent = result.error || "GitHub login failed.";
          return;
        }

        setTimeout(poll, Number(result.intervalSeconds || 5) * 1000);
      } catch (error) {
        status.textContent = "Could not check GitHub login status.";
      }
    }

    setTimeout(poll, 5000);
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildGitHubOAuthScope(configuredScope) {
  return mergeGitHubScopes(configuredScope, [
    "read:user",
    "read:org",
    "repo",
    "workflow"
  ]);
}

function getMissingGitHubScopes(scope) {
  const grantedScopes = parseGitHubScopes(scope);

  return ["read:org"].filter(function (requiredScope) {
    return !grantedScopes.has(requiredScope);
  });
}

function mergeGitHubScopes(configuredScope, requiredScopes) {
  const scopes = parseGitHubScopes(configuredScope || "read:user repo workflow");

  requiredScopes.forEach(function (scope) {
    scopes.add(scope);
  });

  return Array.from(scopes).join(" ");
}

function parseGitHubScopes(scope) {
  return new Set(
    String(scope || "")
      .split(/[,\s]+/)
      .map(function (value) {
        return value.trim();
      })
      .filter(Boolean)
  );
}

function isConflictError(code) {
  return code === "REPOSITORY_EXISTS" || code === "VERSION_EXISTS";
}

module.exports = {
  createRoutes
};
