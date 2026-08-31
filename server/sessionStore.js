const crypto = require("node:crypto");

const defaultSessionMaxAgeSeconds = 60 * 60 * 8;

function createSessionStore(sessionSecret, options = {}) {
  const sessions = new Map();
  const sessionMaxAgeSeconds =
    Number(options.sessionMaxAgeSeconds) || defaultSessionMaxAgeSeconds;
  const sessionMaxAgeMilliseconds = sessionMaxAgeSeconds * 1000;
  const secureCookie = Boolean(options.secureCookie);

  function getOrCreateSession(request, response) {
    const existingSession = getSessionFromRequest(request);

    if (existingSession) {
      refreshSession(existingSession, response);
      return existingSession;
    }

    pruneExpiredSessions();

    const sessionId = crypto.randomBytes(32).toString("hex");
    const session = {
      csrfToken: crypto.randomBytes(32).toString("hex"),
      createdAt: Date.now(),
      expiresAt: Date.now() + sessionMaxAgeMilliseconds,
      id: sessionId
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

    const session = sessions.get(sessionId) || null;

    if (!session) {
      return null;
    }

    if (isExpired(session)) {
      sessions.delete(sessionId);
      return null;
    }

    return session;
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

  function refreshSession(session, response) {
    session.expiresAt = Date.now() + sessionMaxAgeMilliseconds;
    response.setHeader("Set-Cookie", createSessionCookie(session.id));
  }

  function pruneExpiredSessions() {
    sessions.forEach(function (session, sessionId) {
      if (isExpired(session)) {
        sessions.delete(sessionId);
      }
    });
  }

  function isExpired(session) {
    return !session.expiresAt || session.expiresAt <= Date.now();
  }

  function createSessionCookie(sessionId) {
    const attributes = [
      "bookPlatformSession=" + sessionId + "." + signValue(sessionId),
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=" + sessionMaxAgeSeconds
    ];

    if (secureCookie) {
      attributes.push("Secure");
    }

    return attributes.join("; ");
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
