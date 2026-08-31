const fs = require("node:fs");
const path = require("node:path");

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

const defaultStaticAllowlist = [
  "index.html",
  "style.css",
  "assets/",
  "js/"
];

function createStaticFileServer(rootDirectory) {
  return function serveStaticFile(urlPath, response) {
    const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
    const decodedPath = decodeURIComponent(cleanPath);
    const filePath = path.normalize(path.join(rootDirectory, decodedPath));
    const relativePath = path.relative(rootDirectory, filePath);
    const normalizedRelativePath = relativePath.replace(/\\/g, "/");

    if (
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath) ||
      !isAllowedStaticPath(normalizedRelativePath)
    ) {
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

      response.writeHead(200, withSecurityHeaders({
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
      }));
      response.end(contents);
    });
  };
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

function redirect(response, location) {
  response.writeHead(302, withSecurityHeaders({
    Location: location
  }));
  response.end();
}

function sendJson(response, status, body) {
  response.writeHead(status, withSecurityHeaders({
    "Content-Type": "application/json; charset=utf-8"
  }));
  response.end(JSON.stringify(body));
}

function sendForbidden(response, message = "Forbidden") {
  response.writeHead(403, withSecurityHeaders({
    "Content-Type": "text/plain; charset=utf-8"
  }));
  response.end(message);
}

function isAllowedStaticPath(relativePath) {
  if (!relativePath || relativePath.split("/").some((part) => part.startsWith("."))) {
    return false;
  }

  return defaultStaticAllowlist.some(function (allowedPath) {
    return allowedPath.endsWith("/")
      ? relativePath.startsWith(allowedPath)
      : relativePath === allowedPath;
  });
}

function withSecurityHeaders(headers = {}) {
  return {
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...headers
  };
}

module.exports = {
  createStaticFileServer,
  isAllowedStaticPath,
  readJsonRequest,
  redirect,
  sendForbidden,
  sendJson,
  withSecurityHeaders
};
