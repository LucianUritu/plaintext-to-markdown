const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

loadEnvFile();

const rootDirectory = __dirname;
const sessions = new Map();

const port = Number(process.env.PORT || 3000);
const appBaseUrl = removeTrailingSlash(
  process.env.APP_BASE_URL || "http://localhost:" + port
);
const sessionSecret =
  process.env.SESSION_SECRET || "development-session-secret-change-me";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async function (request, response) {
  try {
    const url = new URL(request.url, appBaseUrl);

    if (url.pathname === "/auth/github/start") {
      await startGitHubLogin(request, response);
      return;
    }

    if (url.pathname === "/auth/github/callback") {
      await finishGitHubLogin(request, response, url);
      return;
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      logout(request, response);
      return;
    }

    if (url.pathname === "/api/me") {
      await getCurrentUser(request, response);
      return;
    }

    if (url.pathname === "/api/books") {
      await getGitHubBooks(request, response);
      return;
    }

    serveStaticFile(url.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: "Internal server error"
    });
  }
});

server.listen(port, function () {
  console.log("Book platform running at " + appBaseUrl);
});

async function startGitHubLogin(request, response) {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    sendJson(response, 500, {
      error: "Missing GITHUB_CLIENT_ID. Copy .env.example to .env and fill it in."
    });
    return;
  }

  const session = getOrCreateSession(request, response);
  const state = crypto.randomBytes(24).toString("hex");
  const scope = process.env.GITHUB_OAUTH_SCOPE || "read:user repo";

  session.githubOAuthState = state;

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", appBaseUrl + "/auth/github/callback");
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);

  redirect(response, authorizeUrl.toString());
}

async function finishGitHubLogin(request, response, url) {
  const session = getOrCreateSession(request, response);
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

async function getCurrentUser(request, response) {
  const session = getSessionFromRequest(request);

  if (!session || !session.githubAccessToken) {
    sendJson(response, 200, {
      authenticated: false
    });
    return;
  }

  const githubResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: "Bearer " + session.githubAccessToken,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!githubResponse.ok) {
    sendJson(response, githubResponse.status, {
      authenticated: false,
      error: "Could not read GitHub user."
    });
    return;
  }

  const user = await githubResponse.json();

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
  const session = getSessionFromRequest(request);

  if (!session || !session.githubAccessToken) {
    sendJson(response, 401, {
      error: "Sign in with GitHub first."
    });
    return;
  }

  const repos = await fetchGitHubRepos(session.githubAccessToken);

  if (!Array.isArray(repos)) {
    sendJson(response, 502, {
      error: "Could not read GitHub repositories."
    });
    return;
  }

  const books = [];

  for (const repo of repos) {
    const book = await detectTeachBookRepository(repo, session.githubAccessToken);

    if (book) {
      books.push(book);
    }
  }

  sendJson(response, 200, {
    books
  });
}

async function fetchGitHubRepos(token) {
  const repos = [];
  let page = 1;

  while (page <= 10) {
    const pageRepos = await fetchGitHubJson(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=" +
        page,
      token
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

async function detectTeachBookRepository(repo, token) {
  const owner = repo.owner && repo.owner.login;
  const repoName = repo.name;
  const branch = repo.default_branch || "main";

  if (!owner || !repoName) {
    return null;
  }

  const requiredFiles = await Promise.all([
    fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/_config.yml",
      token
    }),
    fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/_toc.yml",
      token
    }),
    fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/intro.md",
      token
    })
  ]);

  if (requiredFiles.some(function (file) { return !file; })) {
    return null;
  }

  const configText = decodeBase64Text(requiredFiles[0].content);
  const title = readYamlTitle(configText) || repoName;

  return {
    id: owner + "/" + repoName,
    owner,
    repo: repoName,
    title,
    branch,
    private: Boolean(repo.private),
    updatedAt: repo.updated_at,
    repoUrl: repo.html_url,
    pagesUrl: "https://" + owner + ".github.io/" + repoName + "/"
  };
}

async function fetchRepositoryFile({ owner, repo, branch, path: filePath, token }) {
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
    headers: createGitHubApiHeaders(token)
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function fetchGitHubJson(url, token) {
  const response = await fetch(url, {
    headers: createGitHubApiHeaders(token)
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function createGitHubApiHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function decodeBase64Text(content) {
  return Buffer.from(String(content || "").replace(/\s/g, ""), "base64").toString("utf8");
}

function readYamlTitle(configText) {
  const match = String(configText || "").match(/^title:\s*(.+)$/m);

  if (!match) {
    return "";
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

function logout(request, response) {
  const sessionId = readSessionId(request);

  if (sessionId) {
    sessions.delete(sessionId);
  }

  response.setHeader("Set-Cookie", createExpiredSessionCookie());
  sendJson(response, 200, {
    authenticated: false
  });
}

function serveStaticFile(urlPath, response) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const decodedPath = decodeURIComponent(cleanPath);
  const filePath = path.normalize(path.join(rootDirectory, decodedPath));

  const relativePath = path.relative(rootDirectory, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, function (error, contents) {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(contents);
  });
}

function getOrCreateSession(request, response) {
  const existingSession = getSessionFromRequest(request);

  if (existingSession) {
    return existingSession;
  }

  const sessionId = crypto.randomBytes(32).toString("hex");
  const session = {
    createdAt: Date.now()
  };

  sessions.set(sessionId, session);
  response.setHeader("Set-Cookie", createSessionCookie(sessionId));

  return session;
}

function getSessionFromRequest(request) {
  const sessionId = readSessionId(request);

  if (!sessionId) {
    return null;
  }

  return sessions.get(sessionId) || null;
}

function readSessionId(request) {
  const cookieHeader = request.headers.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(function (cookie) {
      const parts = cookie.trim().split("=");
      return [parts[0], parts.slice(1).join("=")];
    })
  );
  const cookieValue = cookies.bookPlatformSession;

  if (!cookieValue) {
    return "";
  }

  const separatorIndex = cookieValue.indexOf(".");

  if (separatorIndex === -1) {
    return "";
  }

  const sessionId = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  const expectedSignature = signValue(sessionId);

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return "";
  }

  return sessionId;
}

function createSessionCookie(sessionId) {
  return [
    "bookPlatformSession=" + sessionId + "." + signValue(sessionId),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=604800"
  ].join("; ");
}

function createExpiredSessionCookie() {
  return [
    "bookPlatformSession=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

function signValue(value) {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(value)
    .digest("hex");
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location
  });
  response.end();
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  lines.forEach(function (line) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }

    const equalsIndex = trimmedLine.indexOf("=");

    if (equalsIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, equalsIndex).trim();
    const value = trimmedLine.slice(equalsIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function removeTrailingSlash(value) {
  return String(value).replace(/\/$/, "");
}
