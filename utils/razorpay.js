// Thin wrapper around Razorpay's official Node.js SDK, published on the
// public npm registry as "razorpay" (github.com/razorpay/razorpay-node).
//
// Why Razorpay and not "Google Pay" directly: Google Pay Business is a
// consumer/merchant UPI app (QR codes, P2P-style collect requests) — it has
// no server-side order-creation API, no webhook, and no SDK for website
// checkout. "Google Pay API for Web" is only a payment-method UI; it still
// needs a licensed Payment Aggregator underneath to actually process and
// verify the transaction. Razorpay is that aggregator, and its Standard
// Checkout already lets the customer pay via UPI using whichever UPI app
// they have installed — including Google Pay — so the user-facing result
// ("pay with Google Pay") is unchanged even though PhonePe's SDK is gone.
//
// Docs: https://github.com/razorpay/razorpay-node
//       https://razorpay.com/docs/payments/server-integration/nodejs/
//
// This file intentionally contains NO merchant secrets — those live only in
// process.env / .env (never committed, never sent to the frontend). Only
// RAZORPAY_KEY_ID (not the secret) is ever safe to expose to the browser.

const Razorpay = require("razorpay");
const { validatePaymentVerification, validateWebhookSignature } = require("razorpay/dist/utils/razorpay-utils");

let client = null;

function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getClient() {
  if (!isConfigured()) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.");
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return client;
}

// Creates a Razorpay Order restricted to UPI at the API level (the frontend
// Checkout is also restricted to UPI — see public/js/poses.js — but the
// order itself is created UPI-only so a payment can't be captured any other
// way even if the client-side restriction is bypassed).
async function createOrder({ merchantOrderId, amountPaise, notes }) {
  return getClient().orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: merchantOrderId,
    method: "upi",
    notes: notes || {}
  });
}

// Authoritative fallback check: asks Razorpay directly for every payment
// attempt made against this order, and returns true only if at least one of
// them is genuinely "captured" for the exact expected amount. Used by the
// status-poll endpoint so we never depend on the frontend alone, and as a
// safety net if a webhook is delayed.
async function findCapturedPayment(razorpayOrderId, expectedAmountPaise) {
  const result = await getClient().orders.fetchPayments(razorpayOrderId);
  const items = result?.items || [];
  return items.find((p) => p.status === "captured" && p.amount === expectedAmountPaise) || null;
}

// Verifies the (order_id, payment_id, signature) trio Razorpay Checkout
// hands back to the frontend on success. This is a genuine cryptographic
// check (HMAC-SHA256 with the merchant's key_secret) — NOT a "frontend says
// success" flag. Still, this alone is only used to unlock the UI faster;
// the webhook below is the durable source of truth.
function verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  return validatePaymentVerification(
    { order_id: razorpayOrderId, payment_id: razorpayPaymentId },
    razorpaySignature,
    process.env.RAZORPAY_KEY_SECRET
  );
}

// Verifies a webhook body is genuinely from Razorpay (HMAC-SHA256 over the
// exact raw request bytes, keyed with the webhook secret configured in the
// Razorpay Dashboard). Returns true/false — never throws for a bad
// signature, so callers can reject cleanly.
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  return validateWebhookSignature(rawBody, signatureHeader, process.env.RAZORPAY_WEBHOOK_SECRET);
}

module.exports = { isConfigured, createOrder, findCapturedPayment, verifyCheckoutSignature, verifyWebhookSignature };
