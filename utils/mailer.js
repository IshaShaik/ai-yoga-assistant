const nodemailer = require("nodemailer");

// Lazily built + cached so a missing/incomplete SMTP config only breaks the
// forgot-password feature (with a clear error) instead of crashing the
// whole server at boot.
let cachedTransporter = null;

function buildTransporter() {
  const { EMAIL_SERVICE, EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;

  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error(
      "Email is not configured. Set EMAIL_USER and EMAIL_PASS (and EMAIL_SERVICE or EMAIL_HOST/EMAIL_PORT) in .env."
    );
  }

  // Shorthand path: EMAIL_SERVICE=gmail lets Nodemailer fill in Gmail's
  // host/port/secure settings for you. Use a 16-character Gmail "App
  // Password" for EMAIL_PASS, not your normal account password.
  if (EMAIL_SERVICE) {
    return nodemailer.createTransport({
      service: EMAIL_SERVICE,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
  }

  // Generic SMTP path for any other provider (SendGrid, Mailgun, your own
  // mail server, etc).
  const port = Number(EMAIL_PORT || 587);
  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port,
    secure: port === 465, // true for port 465 (implicit TLS), false for 587/25 (STARTTLS)
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });
}

function getTransporter() {
  if (!cachedTransporter) cachedTransporter = buildTransporter();
  return cachedTransporter;
}

// Sends the 6-digit password-reset OTP to `to`. Called only from
// routes/auth.js's /forgot-password handler, and only after the OTP has
// already been hashed and saved — so a failed send here just means the
// user can safely request another one.
async function sendOTPEmail(to, otp) {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  await getTransporter().sendMail({
    from: `"AI Yoga Assistant" <${from}>`,
    to,
    subject: "Your AI Yoga Assistant password reset code",
    text:
      `Your password reset code is ${otp}.\n\n` +
      `This code expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email.`,
    html: `
      <div style="font-family:'DM Sans',Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#f4fbff;border-radius:16px;">
        <h2 style="color:#12385f;margin:0 0 12px;">Reset your password</h2>
        <p style="color:#3e6581;font-size:14px;line-height:1.5;margin:0 0 20px;">
          Use the code below to reset your AI Yoga Assistant password. It expires in 10 minutes.
        </p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#159765;background:#fff;border-radius:12px;padding:16px;text-align:center;">
          ${otp}
        </div>
        <p style="color:#7890a5;font-size:12px;margin:20px 0 0;">
          If you didn't request this, you can safely ignore this email — your password will not change.
        </p>
      </div>`
  });
}

module.exports = { sendOTPEmail };
