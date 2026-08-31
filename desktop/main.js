const { app, BrowserWindow, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { startAppServer } = require("../server");

const DEFAULT_DESKTOP_PORT = 3000;

let mainWindow;
let localServer;

async function createMainWindow() {
  const port = Number(process.env.PORT || process.env.DESKTOP_PORT || DEFAULT_DESKTOP_PORT);
  const host = process.env.HOST || "127.0.0.1";
  const appBaseUrl =
    process.env.APP_BASE_URL || "http://" + host + ":" + port;
  const desktopConfig = loadDesktopConfig();

  localServer = await startAppServer({
    appBaseUrl,
    gitHubClientId: desktopConfig.githubClientId,
    host,
    port,
    rootDirectory: path.join(__dirname, "..")
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    title: "Plaintext to Markdown",
    backgroundColor: "#f7f8fb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(function ({ url }) {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(localServer.appBaseUrl);
}

app.whenReady().then(function () {
  createMainWindow().catch(function (error) {
    console.error(error);
    app.quit();
  });

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", function () {
  if (localServer) {
    localServer.server.close();
  }
});

function loadDesktopConfig() {
  const configPath = path.join(__dirname, "config.json");

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error("Could not read desktop config:", error);
    return {};
  }
}
