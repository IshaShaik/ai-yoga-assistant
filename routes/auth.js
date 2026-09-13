const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PasswordResetOTP = require("../models/PasswordResetOTP");
const { authRequired } = require("../middleware/auth");
const { sendOTPEmail } = require("../utils/mailer");

const router = express.Router();

// ---- Forgot-password OTP settings -----------------------------------------
const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5; // after this many wrong guesses, the OTP is burned

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    subscriptionStatus: user.hasActiveSubscription(),
    subscriptionExpiryDate: user.subscriptionExpiryDate,
    dailyStreak: user.dailyStreak,
    completedPoses: user.completedPoses
  };
}

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, adminCode } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ message: "Name, email and a password of at least 6 characters are required." });
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: "An account with this email already exists." });

    // Optional admin bypass: if the correct ADMIN_ACCESS_CODE (set in .env)
    // is supplied at signup, this account gets every pose for free forever,
    // while every other account keeps the normal free/premium rules.
    const isAdmin = Boolean(
      adminCode &&
      process.env.ADMIN_ACCESS_CODE &&
      adminCode === process.env.ADMIN_ACCESS_CODE
    );

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, isAdmin });

    res.status(201).json({ token: signToken(user._id.toString()), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Signup failed.", error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || "").toLowerCase().trim() });

    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Keep expiry accurate on login.
    if (user.subscriptionStatus && (!user.subscriptionExpiryDate || user.subscriptionExpiryDate <= new Date())) {
      user.subscriptionStatus = false;
      user.subscriptionExpiryDate = null;
      await user.save();
    }

    res.json({ token: signToken(user._id.toString()), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Login failed.", error: error.message });
  }
});

router.get("/me", authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// POST /api/auth/forgot-password
// Step 1 of the reset flow: looks up the account, generates a random
// 6-digit numeric OTP, stores only its bcrypt HASH (with a 10-minute
// expiry), and emails the plaintext code via Nodemailer. Never returns the
// OTP itself in the response.
router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email address." });
    }

    // Simple resend cooldown so the same inbox can't be spammed with codes.
    const existing = await PasswordResetOTP.findOne({ email }).sort({ createdAt: -1 });
    if (existing) {
      const elapsedMs = Date.now() - existing.createdAt.getTime();
      if (elapsedMs < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
        return res.status(429).json({ message: `Please wait ${waitSeconds}s before requesting another code.` });
      }
    }

    // crypto.randomInt is a CSPRNG — safe for a security code, unlike
    // Math.random(). Range gives a full 6-digit code, 100000-999999.
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Only one active OTP per email at a time — any older one for this
    // address is now invalid.
    await PasswordResetOTP.deleteMany({ email });
    await PasswordResetOTP.create({ email, otpHash, expiresAt });

    await sendOTPEmail(email, otp);

    res.json({ message: `A 6-digit code has been sent to ${email}. It expires in ${OTP_TTL_MINUTES} minutes.` });
  } catch (error) {
    console.error("forgot-password failed:", error.message);
    res.status(500).json({ message: "Could not send the reset code. Please try again shortly." });
  }
});

// POST /api/auth/reset-password
// Step 2: verifies the OTP against its stored hash (not the plaintext —
// bcrypt.compare) and, only if it's correct and unexpired, hashes the new
// password with bcrypt and updates the user. The OTP document is deleted
// immediately afterwards so it can never be reused.
router.post("/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email || !otp || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Email, the 6-digit code and a new password of at least 6 characters are required." });
    }

    const record = await PasswordResetOTP.findOne({ email }).sort({ createdAt: -1 });
    if (!record || record.expiresAt.getTime() <= Date.now()) {
      if (record) await PasswordResetOTP.deleteOne({ _id: record._id });
      return res.status(400).json({ message: "That code has expired or was not found. Please request a new one." });
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await PasswordResetOTP.deleteOne({ _id: record._id });
      return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
    }

    const otpValid = await bcrypt.compare(otp, record.otpHash);
    if (!otpValid) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ message: "Incorrect code. Please try again." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      await PasswordResetOTP.deleteOne({ _id: record._id });
      return res.status(404).json({ message: "This account no longer exists." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    // Burn the OTP the moment it's used — one code, one reset, ever.
    await PasswordResetOTP.deleteOne({ _id: record._id });

    res.json({ message: "Password reset successful. Please log in with your new password." });
  } catch (error) {
    console.error("reset-password failed:", error.message);
    res.status(500).json({ message: "Could not reset the password. Please try again." });
  }
});

module.exports = router;
