const nodemailer = require("nodemailer");

const requiredEmailConfigKeys = [
  "COMPLETION_EMAIL_TO",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS"
];

class CompletionNotificationService {
  constructor({ env = process.env, transporter = null } = {}) {
    this.env = env;
    this.transporter = transporter;
  }

  async sendBookFinishedEmail({ username, bookTitle }) {
    const config = readEmailConfig(this.env);
    const safeUsername = cleanEmailText(username || "Unknown user");
    const safeBookTitle = cleanEmailText(bookTitle || "Untitled Book");
    const mailer = this.transporter || createTransporter(config);

    await mailer.sendMail({
      from: config.from,
      to: config.to,
      subject: safeUsername + " finished writing " + safeBookTitle,
      text:
        'User "' +
        safeUsername +
        '" finished writing the book "' +
        safeBookTitle +
        '".'
    });

    return {
      notified: true
    };
  }
}

function readEmailConfig(env) {
  const missingKeys = requiredEmailConfigKeys.filter(function (key) {
    return !String(env[key] || "").trim();
  });

  if (missingKeys.length > 0) {
    const error = new Error(
      "Email notifications are not configured. Missing: " +
        missingKeys.join(", ") +
        "."
    );
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  const port = Number(env.SMTP_PORT);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    const error = new Error("SMTP_PORT must be a valid TCP port.");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  return {
    from: String(env.SMTP_FROM || env.SMTP_USER).trim(),
    host: String(env.SMTP_HOST).trim(),
    pass: String(env.SMTP_PASS),
    port,
    secure: readBoolean(env.SMTP_SECURE, port === 465),
    to: String(env.COMPLETION_EMAIL_TO).trim(),
    user: String(env.SMTP_USER).trim()
  };
}

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

function cleanEmailText(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

module.exports = {
  CompletionNotificationService,
  cleanEmailText,
  readEmailConfig
};
