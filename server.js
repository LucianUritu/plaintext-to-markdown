const http = require("node:http");
const crypto = require("node:crypto");
const { loadEnvFile, removeTrailingSlash } = require("./server/env");
const {
  createStaticFileServer,
  readJsonRequest,
  redirect,
  sendJson
} = require("./server/httpUtils");
const { HttpRouter } = require("./server/router");
const { createRoutes } = require("./server/routes");
const { createSessionStore } = require("./server/sessionStore");

function createAppServer(options = {}) {
  const rootDirectory = options.rootDirectory || __dirname;

  loadEnvFile(rootDirectory);

  const port = Number(options.port || process.env.PORT || 3000);
  const host = options.host || process.env.HOST || "127.0.0.1";
  const appBaseUrl = removeTrailingSlash(
    options.appBaseUrl || process.env.APP_BASE_URL || "http://" + host + ":" + port
  );
  const appOrigin = new URL(appBaseUrl).origin;
  const allowedHost = new URL(appBaseUrl).host.toLowerCase();
  const sessionSecret = createSessionSecret(options.sessionSecret);
  const gitHubClientId =
    options.gitHubClientId || process.env.GITHUB_CLIENT_ID;

  const sessionStore = createSessionStore(sessionSecret, {
    secureCookie: appBaseUrl.startsWith("https://"),
    sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 8)
  });
  const serveStaticFile = createStaticFileServer(rootDirectory);
  const routes = createRoutes({
    appBaseUrl,
    gitHubClientId,
    rootDirectory,
    sessionStore,
    readJsonRequest,
    redirect,
    sendJson
  });
  const router = new HttpRouter();

router.get("/auth/github/start", routes.startGitHubLogin);
router.get("/auth/github/callback", routes.finishGitHubLogin);
router.get("/auth/github/device/status", routes.getGitHubDeviceLoginStatus);
  router.post("/auth/logout", routes.logout);
  router.get("/api/me", routes.getCurrentUser);
  router.get("/api/books", routes.getGitHubBooks);
  router.post("/api/publish-book", routes.publishBookToGitHub);
  router.post("/api/book-done", routes.markBookDone);
  router.get("/api/publish-book/status", routes.getPublishWorkflowStatus);
  router.get("/api/github/branches", routes.getVersionBranches);
  router.get("/api/github/commit", routes.getCommitInfo);
  router.getPrefix("/api/books/", routes.getGitHubBook);

  const server = http.createServer(async function (request, response) {
    try {
      const url = new URL(request.url, appBaseUrl);

      if (!isTrustedLocalRequest(request, appOrigin, allowedHost)) {
        sendJson(response, 403, {
          error: "Forbidden"
        });
        return;
      }

      if (await router.handle(request, response, url)) {
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

  return {
    appBaseUrl,
    host,
    port,
    server
  };
}

function startAppServer(options = {}) {
  const appServer = createAppServer(options);

  return new Promise(function (resolve, reject) {
    appServer.server.once("error", reject);
    appServer.server.listen(appServer.port, appServer.host, function () {
      appServer.server.off("error", reject);
      console.log("Book platform running at " + appServer.appBaseUrl);
      resolve(appServer);
    });
  });
}

if (require.main === module) {
  startAppServer().catch(function (error) {
    console.error(error);
    process.exit(1);
  });
}

function createSessionSecret(configuredSecret) {
  const secret = configuredSecret || process.env.SESSION_SECRET;

  if (secret) {
    return secret;
  }

  return crypto.randomBytes(32).toString("hex");
}

function isTrustedLocalRequest(request, appOrigin, allowedHost) {
  const requestHost = String(request.headers.host || "").toLowerCase();

  if (requestHost !== allowedHost) {
    return false;
  }

  const origin = request.headers.origin;

  if (origin && removeTrailingSlash(origin) !== appOrigin) {
    return false;
  }

  return true;
}

module.exports = {
  createAppServer,
  createSessionSecret,
  isTrustedLocalRequest,
  startAppServer
};
