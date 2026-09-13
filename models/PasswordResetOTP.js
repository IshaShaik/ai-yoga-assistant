const mongoose = require("mongoose");

// One active OTP document per email at a time (routes/auth.js deletes any
// previous one before creating a new one). We store a bcrypt HASH of the
// OTP, never the plaintext code, exactly like a password. `expiresAt` also
// backs a Mongo TTL index so stale/expired documents are removed
// automatically — no cron job needed.
const passwordResetOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    // Wrong-code guesses against this specific OTP. Capped in routes/auth.js
    // (MAX_OTP_ATTEMPTS) so a code can't be brute-forced (only 10^6 values).
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// TTL index: MongoDB's background task removes a document once its
// `expiresAt` is in the past (checked roughly every 60s). This is just
// storage cleanup — routes/auth.js still checks expiry explicitly on every
// verify, so a slightly-late TTL sweep is never a security issue.
passwordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordResetOTP", passwordResetOtpSchema);
