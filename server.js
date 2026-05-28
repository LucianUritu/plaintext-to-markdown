const http = require("node:http");
const { loadEnvFile, removeTrailingSlash } = require("./server/env");
const {
  createStaticFileServer,
  readJsonRequest,
  redirect,
  sendJson
} = require("./server/httpUtils");
const { createRoutes } = require("./server/routes");
const { createSessionStore } = require("./server/sessionStore");

const rootDirectory = __dirname;

loadEnvFile(rootDirectory);

const port = Number(process.env.PORT || 3000);
const appBaseUrl = removeTrailingSlash(
  process.env.APP_BASE_URL || "http://localhost:" + port
);
const sessionSecret =
  process.env.SESSION_SECRET || "development-session-secret-change-me";

const sessionStore = createSessionStore(sessionSecret, {
  sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 8)
});
const serveStaticFile = createStaticFileServer(rootDirectory);
const routes = createRoutes({
  appBaseUrl,
  rootDirectory,
  sessionStore,
  readJsonRequest,
  redirect,
  sendJson
});

const server = http.createServer(async function (request, response) {
  try {
    const url = new URL(request.url, appBaseUrl);

    if (url.pathname === "/auth/github/start") {
      await routes.startGitHubLogin(request, response);
      return;
    }

    if (url.pathname === "/auth/github/callback") {
      await routes.finishGitHubLogin(request, response, url);
      return;
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      routes.logout(request, response);
      return;
    }

    if (url.pathname === "/api/me") {
      await routes.getCurrentUser(request, response);
      return;
    }

    if (url.pathname === "/api/books") {
      await routes.getGitHubBooks(request, response);
      return;
    }

    if (url.pathname === "/api/publish-book" && request.method === "POST") {
      await routes.publishBookToGitHub(request, response);
      return;
    }

    if (url.pathname === "/api/publish-book/status") {
      await routes.getPublishWorkflowStatus(request, response, url);
      return;
    }

    if (url.pathname.startsWith("/api/books/")) {
      await routes.getGitHubBook(request, response, url);
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
