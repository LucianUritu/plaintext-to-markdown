const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(rootDirectory) {
  const envPath = path.join(rootDirectory, ".env");

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

module.exports = {
  loadEnvFile,
  removeTrailingSlash
};
