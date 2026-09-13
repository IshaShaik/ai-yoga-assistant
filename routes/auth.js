const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

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

module.exports = router;
