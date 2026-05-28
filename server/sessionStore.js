const crypto = require("node:crypto");

function createSessionStore(sessionSecret) {
  const sessions = new Map();

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

  function destroySession(request, response) {
    const sessionId = readSessionId(request);

    if (sessionId) {
      sessions.delete(sessionId);
    }

    response.setHeader("Set-Cookie", createExpiredSessionCookie());
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

  return {
    destroySession,
    getOrCreateSession,
    getSessionFromRequest
  };
}

module.exports = {
  createSessionStore
};
