const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

loadEnvFile();

const rootDirectory = __dirname;
const sessions = new Map();

const port = Number(process.env.PORT || 3000);
const appBaseUrl = removeTrailingSlash(
  process.env.APP_BASE_URL || "http://localhost:" + port
);
const sessionSecret =
  process.env.SESSION_SECRET || "development-session-secret-change-me";
let teachBooksGeneratorPromise = null;

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

    if (url.pathname === "/api/publish-book" && request.method === "POST") {
      await publishBookToGitHub(request, response);
      return;
    }

    if (url.pathname.startsWith("/api/books/")) {
      await getGitHubBook(request, response, url);
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

async function getGitHubBook(request, response, url) {
  const session = getSessionFromRequest(request);

  if (!session || !session.githubAccessToken) {
    sendJson(response, 401, {
      error: "Sign in with GitHub first."
    });
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

  const [configFile, tocFile, introFile] = await Promise.all([
    fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/_config.yml",
      token: session.githubAccessToken
    }),
    fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/_toc.yml",
      token: session.githubAccessToken
    }),
    fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/intro.md",
      token: session.githubAccessToken
    })
  ]);

  if (!configFile || !tocFile || !introFile) {
    sendJson(response, 404, {
      error: "This repository does not look like a TeachBooks project."
    });
    return;
  }

  const configText = decodeBase64Text(configFile.content);
  const tocText = decodeBase64Text(tocFile.content);
  const introMarkdown = decodeBase64Text(introFile.content);
  const chapterPaths = readChapterPathsFromToc(tocText);
  const chapters = [];

  for (let index = 0; index < chapterPaths.length; index += 1) {
    const chapterPath = chapterPaths[index];
    const chapterFile = await fetchRepositoryFile({
      owner,
      repo: repoName,
      branch,
      path: "book/" + chapterPath,
      token: session.githubAccessToken
    });

    if (!chapterFile) {
      continue;
    }

    const markdown = decodeBase64Text(chapterFile.content);

    chapters.push({
      id: "github-chapter-" + index,
      title: readMarkdownTitle(markdown) || "Chapter " + (index + 1),
      content: markdown
    });
  }

  if (chapters.length === 0) {
    chapters.push({
      id: "github-chapter-0",
      title: "Untitled Chapter",
      content: ""
    });
  }

  sendJson(response, 200, {
    book: {
      id: "github:" + owner + "/" + repoName,
      source: "github",
      owner,
      repo: repoName,
      branch,
      title: readYamlTitle(configText) || repoName,
      introduction: {
        title: readMarkdownTitle(introMarkdown) || "Introduction",
        content: introMarkdown
      },
      chapters,
      images: [],
      activeChapterId: null,
      activeItemType: "introduction"
    }
  });
}

async function publishBookToGitHub(request, response) {
  const session = getSessionFromRequest(request);

  if (!session || !session.githubAccessToken) {
    sendJson(response, 401, {
      error: "Sign in with GitHub first."
    });
    return;
  }

  const body = await readJsonRequest(request);
  let owner = cleanInput(body.owner);
  let repo = cleanInput(body.repo);
  let branch = cleanInput(body.branch || "main");
  let files = body.files;
  const book = body.book;
  const bookTitle = cleanInput(body.bookTitle || "Untitled Book");
  const commitMessage =
    cleanInput(body.commitMessage) || "Update real TeachBooks preview";

  if (!branch) {
    sendJson(response, 400, {
      error: "Missing GitHub branch."
    });
    return;
  }

  try {
    let createdRepository = null;

    if (!owner || !repo) {
      createdRepository = await createBookRepository({
        token: session.githubAccessToken,
        title: bookTitle
      });

      owner = createdRepository.owner.login;
      repo = createdRepository.name;
      branch = createdRepository.default_branch || branch;
    }

    if (book) {
      const generator = await loadTeachBooksGenerator();
      files = generator.generateTeachBooksFiles(book, {
        owner,
        repo,
        branch
      });
    }

    if (!Array.isArray(files) || files.length === 0) {
      sendJson(response, 400, {
        error: "No files were provided for publishing."
      });
      return;
    }

    const result = await publishFilesToGitHub({
      owner,
      repo,
      branch,
      token: session.githubAccessToken,
      files,
      commitMessage
    });

    sendJson(response, 200, {
      commitSha: result.commit.sha,
      commitUrl: result.commit.html_url || "",
      pagesUrl: "https://" + owner + ".github.io/" + repo + "/",
      repository: {
        owner,
        repo,
        branch,
        created: Boolean(createdRepository)
      }
    });
  } catch (error) {
    sendJson(response, 502, {
      error: error.message
    });
  }
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

async function createBookRepository({ token, title }) {
  const baseName = slugifyRepositoryName(title || "book");
  let counter = 1;

  while (counter <= 20) {
    const name = counter === 1 ? baseName : baseName + "-" + counter;
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: createGitHubJsonHeaders(token),
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

async function publishFilesToGitHub({
  owner,
  repo,
  branch,
  token,
  files,
  commitMessage
}) {
  await checkRepositoryAccess({
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
    baseTreeSha: latestCommit.tree.sha,
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

  const response = await fetch(url, {
    headers: createGitHubApiHeaders(token)
  });

  if (!response.ok) {
    throw new Error("Could not access GitHub repository.");
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

  const response = await fetch(url, {
    headers: createGitHubApiHeaders(token)
  });

  if (!response.ok) {
    throw new Error("Could not access GitHub branch.");
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

  const response = await fetch(url, {
    headers: createGitHubApiHeaders(token)
  });

  if (!response.ok) {
    throw new Error("Could not read latest GitHub commit.");
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

  const response = await fetch(url, {
    method: "POST",
    headers: createGitHubJsonHeaders(token),
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

async function createTree({ owner, repo, token, baseTreeSha, treeItems }) {
  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/git/trees";

  const response = await fetch(url, {
    method: "POST",
    headers: createGitHubJsonHeaders(token),
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

  const response = await fetch(url, {
    method: "POST",
    headers: createGitHubJsonHeaders(token),
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

  const response = await fetch(url, {
    method: "PATCH",
    headers: createGitHubJsonHeaders(token),
    body: JSON.stringify({
      sha: newCommitSha,
      force: false
    })
  });

  if (!response.ok) {
    throw new Error("Could not update GitHub branch.");
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

function createGitHubJsonHeaders(token) {
  return {
    ...createGitHubApiHeaders(token),
    "Content-Type": "application/json"
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

function readChapterPathsFromToc(tocText) {
  const paths = [];
  const lines = String(tocText || "").split(/\r?\n/);

  lines.forEach(function (line) {
    const match = line.match(/^\s*-\s*file:\s*(.+)\s*$/);

    if (!match) {
      return;
    }

    const filePath = match[1].trim().replace(/^["']|["']$/g, "");

    if (filePath === "intro" || filePath === "intro.md") {
      return;
    }

    paths.push(ensureMarkdownExtension(filePath));
  });

  return paths;
}

function ensureMarkdownExtension(filePath) {
  if (/\.md$/i.test(filePath)) {
    return filePath;
  }

  return filePath + ".md";
}

function readMarkdownTitle(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);

    if (match) {
      return match[1].trim();
    }
  }

  return "";
}

function readJsonRequest(request) {
  return new Promise(function (resolve, reject) {
    let body = "";

    request.on("data", function (chunk) {
      body += chunk;

      if (body.length > 25 * 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", function () {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function loadTeachBooksGenerator() {
  if (!teachBooksGeneratorPromise) {
    const generatorUrl = pathToFileURL(
      path.join(rootDirectory, "js", "teachbooksGenerator.js")
    ).href;

    teachBooksGeneratorPromise = import(generatorUrl);
  }

  return teachBooksGeneratorPromise;
}

function cleanInput(value) {
  return String(value || "").trim();
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
