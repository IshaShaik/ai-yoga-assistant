const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ message: "Authentication required." });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);

    if (!user) return res.status(401).json({ message: "User no longer exists." });

    // Revert expired subscription immediately.
    if (user.subscriptionStatus && (!user.subscriptionExpiryDate || user.subscriptionExpiryDate <= new Date())) {
      user.subscriptionStatus = false;
      user.subscriptionExpiryDate = null;
      await user.save();
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = { authRequired };
