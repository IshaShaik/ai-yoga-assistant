const express = require("express");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

/*
  DEMO/MANUAL VERIFICATION FLOW
  --------------------------------
  A Transaction ID alone is NOT proof of payment. In production, use the
  real Razorpay flow in routes/payment.js (order + signature verification +
  webhook) instead of this route.

  This route is intentionally a safe placeholder:
  - user submits transactionId
  - backend stores no sensitive payment credentials
  - for local demo, set DEMO_PAYMENT_VERIFICATION=true in .env to activate
    the subscription after a syntactically valid transaction ID.
*/
router.post("/verify", authRequired, async (req, res) => {
  try {
    const transactionId = String(req.body.transactionId || "").trim();

    if (transactionId.length < 6) {
      return res.status(400).json({ message: "Please enter a valid Transaction ID." });
    }

    if (process.env.DEMO_PAYMENT_VERIFICATION !== "true") {
      return res.status(501).json({
        message: "Demo verification is disabled. Use the Razorpay payment flow (/api/payment) to activate real payments."
      });
    }

    const now = new Date();
    const base = req.user.hasActiveSubscription() && req.user.subscriptionExpiryDate > now
      ? req.user.subscriptionExpiryDate
      : now;

    const expiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

    req.user.subscriptionStatus = true;
    req.user.subscriptionExpiryDate = expiry;
    await req.user.save();

    res.json({
      message: "Demo payment verified. Premium access activated for 30 days.",
      subscriptionExpiryDate: expiry
    });
  } catch (error) {
    res.status(500).json({ message: "Payment verification failed." });
  }
});

router.get("/status", authRequired, (req, res) => {
  const active = req.user.hasActiveSubscription();
  res.json({
    active,
    expiry: active ? req.user.subscriptionExpiryDate : null
  });
});

module.exports = router;
