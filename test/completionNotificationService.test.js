const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CompletionNotificationService,
  cleanEmailText,
  readEmailConfig
} = require("../server/completionNotificationService");

const completeEnv = {
  COMPLETION_EMAIL_TO: "editor@example.com",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "sender@example.com",
  SMTP_PASS: "secret"
};

test("email config reports missing values", () => {
  assert.throws(
    () => readEmailConfig({}),
    (error) =>
      error.code === "EMAIL_NOT_CONFIGURED" &&
      /COMPLETION_EMAIL_TO/.test(error.message)
  );
});

test("email config defaults secure SMTP on port 465", () => {
  const config = readEmailConfig({
    ...completeEnv,
    SMTP_PORT: "465"
  });

  assert.equal(config.secure, true);
});

test("email config allows explicit secure override", () => {
  const config = readEmailConfig({
    ...completeEnv,
    SMTP_PORT: "465",
    SMTP_SECURE: "false"
  });

  assert.equal(config.secure, false);
});

test("completion email includes username and book title", async () => {
  let message;
  const service = new CompletionNotificationService({
    env: completeEnv,
    transporter: {
      async sendMail(value) {
        message = value;
      }
    }
  });

  const result = await service.sendBookFinishedEmail({
    username: "alice",
    bookTitle: "Library Guide"
  });

  assert.equal(result.notified, true);
  assert.equal(message.from, "sender@example.com");
  assert.equal(message.to, "editor@example.com");
  assert.match(message.subject, /alice finished writing Library Guide/);
  assert.match(message.text, /"alice"/);
  assert.match(message.text, /"Library Guide"/);
});

test("email text strips line breaks", () => {
  assert.equal(cleanEmailText("Alice\r\nBcc: bad@example.com"), "Alice Bcc: bad@example.com");
});
