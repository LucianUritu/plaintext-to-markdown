const http = require("node:http");
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

const rootDirectory = __dirname;

loadEnvFile(rootDirectory);

const port = Number(process.env.PORT || 3000);
const appBaseUrl = removeTrailingSlash(
  process.env.APP_BASE_URL || "http://localhost:" + port
);
const sessionSecret =
  process.env.SESSION_SECRET || "development-session-secret-change-me";

const sessionStore = createSessionStore(sessionSecret, {
  secureCookie: appBaseUrl.startsWith("https://"),
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
const router = new HttpRouter();

router.get("/auth/github/start", routes.startGitHubLogin);
router.get("/auth/github/callback", routes.finishGitHubLogin);
router.post("/auth/logout", routes.logout);
router.get("/api/me", routes.getCurrentUser);
router.get("/api/books", routes.getGitHubBooks);
router.post("/api/publish-book", routes.publishBookToGitHub);
router.get("/api/publish-book/status", routes.getPublishWorkflowStatus);
router.get("/api/github/branches", routes.getVersionBranches);
router.get("/api/github/commit", routes.getCommitInfo);
router.getPrefix("/api/books/", routes.getGitHubBook);

const server = http.createServer(async function (request, response) {
  try {
    const url = new URL(request.url, appBaseUrl);

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

server.listen(port, function () {
  console.log("Book platform running at " + appBaseUrl);
});
