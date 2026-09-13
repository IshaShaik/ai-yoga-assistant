const express = require("express");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

/*
  REMOVED: this route used to let the frontend unlock premium access by
  submitting any syntactically-valid "Transaction ID" string, gated only by
  a DEMO_PAYMENT_VERIFICATION env flag. That flag being left on (or the
  frontend accidentally still pointing here) is exactly the kind of thing
  that unlocks premium poses without a real, verified payment — so this
  bypass has been deleted outright rather than re-gated. The ONLY supported
  way to activate a subscription is the real Razorpay flow in
  routes/payment.js: create-order -> Razorpay Checkout -> /verify
  (cryptographic HMAC signature check + a direct "was this actually
  captured?" call to Razorpay's API) or the /webhook backstop. Nothing in
  routes/payment.js ever trusts client-supplied text as proof of payment.
*/
router.post("/verify", authRequired, (req, res) => {
  res.status(410).json({
    message: "This demo verification endpoint has been removed. Use the Razorpay payment flow (/api/payment/create-order) to activate real premium access."
  });
});

router.get("/status", authRequired, (req, res) => {
  const active = req.user.hasActiveSubscription();
  res.json({
    active,
    expiry: active ? req.user.subscriptionExpiryDate : null
  });
});

module.exports = router;
