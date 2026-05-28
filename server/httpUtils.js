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

function createStaticFileServer(rootDirectory) {
  return function serveStaticFile(urlPath, response) {
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

module.exports = {
  createStaticFileServer,
  readJsonRequest,
  redirect,
  sendJson
};
