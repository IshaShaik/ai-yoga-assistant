const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Admins get every pose for free, forever, without ever needing an
    // active paid subscription — see routes/auth.js for how this is set.
    isAdmin: { type: Boolean, default: false },
    subscriptionStatus: { type: Boolean, default: false },
    subscriptionStartDate: { type: Date, default: null },
    subscriptionExpiryDate: { type: Date, default: null },
    dailyStreak: { type: Number, default: 0 },
    lastPracticeDate: { type: Date, default: null },
    completedPoses: { type: Number, default: 0 },
    totalPracticeSeconds: { type: Number, default: 0 },
    history: [
      {
        poseId: Number,
        poseName: String,
        durationSeconds: Number,
        accuracy: Number,
        completedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

// Automatically treat an expired subscription as free — unless the account
// is an admin account, which always has full access.
userSchema.methods.hasActiveSubscription = function () {
  if (this.isAdmin) return true;
  return Boolean(
    this.subscriptionStatus &&
    this.subscriptionExpiryDate &&
    this.subscriptionExpiryDate.getTime() > Date.now()
  );
};

// Extends the current subscription by `days` from a verified payment.
// If the user still has time left, the new period is added on top of the
// remaining time instead of the extra days being lost; if it has already
// expired (or never existed), the new period starts now. This is the ONLY
// place that should ever set subscriptionStatus = true — always call it
// from server-verified payment code, never from a client-supplied flag.
userSchema.methods.activateSubscriptionDays = function (days) {
  const now = new Date();
  const base =
    this.subscriptionStatus && this.subscriptionExpiryDate && this.subscriptionExpiryDate.getTime() > now.getTime()
      ? this.subscriptionExpiryDate
      : now;

  if (!this.subscriptionStartDate || base.getTime() === now.getTime()) {
    this.subscriptionStartDate = now;
  }
  this.subscriptionExpiryDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  this.subscriptionStatus = true;
};

module.exports = mongoose.model("User", userSchema);
