const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const Order = require("../models/Order");
const { authRequired } = require("../middleware/auth");
const razorpay = require("../utils/razorpay");

const router = express.Router();

const SUBSCRIPTION_DAYS = 30;

// The ONLY place the price is defined. Never read an amount from req.body.
function premiumAmountPaise() {
  return Math.round(Number(process.env.PREMIUM_PRICE || 99) * 100);
}

// Applies a successful, verified order to its user's subscription exactly
// once. Safe to call repeatedly for the same order (checkout-signature
// verify + webhook + status-poll can all try to apply the same order —
// only the first one does anything).
async function applyOrderIfNeeded(order) {
  if (order.subscriptionApplied) return; // already applied — do nothing

  const user = await User.findById(order.userId);
  if (!user) return;

  user.activateSubscriptionDays(SUBSCRIPTION_DAYS);
  await user.save();

  order.subscriptionApplied = true;
  await order.save();
}

// POST /api/payment/create-order
// Creates a PENDING order for the logged-in user and a matching Razorpay
// order (UPI-only). The amount is fixed server-side — the frontend cannot
// influence it. Returns everything the frontend needs to open Razorpay
// Checkout (never a secret key — key_id is public/publishable by design).
router.post("/create-order", authRequired, async (req, res) => {
  try {
    const orderId = `AIYOGA_${req.user._id.toString().slice(-8)}_${crypto.randomBytes(6).toString("hex")}`;
    const amount = premiumAmountPaise();

    const order = await Order.create({
      userId: req.user._id,
      email: req.user.email,
      orderId,
      amount,
      status: "PENDING"
    });

    const rzpOrder = await razorpay.createOrder({
      merchantOrderId: orderId,
      amountPaise: amount,
      notes: { userId: req.user._id.toString(), email: req.user.email, orderId }
    });

    order.providerOrderId = rzpOrder.id;
    await order.save();

    res.json({
      orderId,
      razorpayOrderId: rzpOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID, // public key, safe for the browser
      amount,
      currency: "INR"
    });
  } catch (error) {
    console.error("create-order failed:", error.message);
    res.status(500).json({ message: "Could not start payment. Please try again." });
  }
});

// POST /api/payment/verify
// Called by the frontend right after Razorpay Checkout's success handler
// fires. This is NOT trusted on its own just because the frontend calls it
// — the (order_id, payment_id, signature) triple is cryptographically
// verified server-side (HMAC with our key_secret) before anything happens,
// and the captured amount is re-checked against what we expect. The webhook
// below is the durable backstop if this call never arrives (tab closed,
// network drop, etc).
router.post("/verify", authRequired, async (req, res) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing payment verification fields." });
    }

    const order = await Order.findOne({ orderId, userId: req.user._id });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.providerOrderId !== razorpayOrderId) {
      return res.status(400).json({ message: "Order mismatch." });
    }

    const signatureValid = razorpay.verifyCheckoutSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    });
    if (!signatureValid) {
      console.error(`Order ${order.orderId}: invalid Razorpay checkout signature.`);
      return res.status(400).json({ message: "Payment could not be verified." });
    }

    // Re-confirm directly with Razorpay's API that this specific payment was
    // actually captured for the exact expected amount, rather than trusting
    // the signature alone.
    const captured = await razorpay.findCapturedPayment(razorpayOrderId, order.amount);
    if (!captured) {
      console.error(`Order ${order.orderId}: signature valid but no captured payment found yet.`);
      return res.json({ message: "Payment received, confirming...", status: "PENDING", orderId: order.orderId });
    }

    order.providerPaymentId = captured.id;
    order.status = "SUCCESS";
    await order.save();
    await applyOrderIfNeeded(order); // idempotent

    const freshUser = await User.findById(req.user._id);
    res.json({
      orderId: order.orderId,
      status: "SUCCESS",
      subscriptionActive: freshUser.hasActiveSubscription(),
      subscriptionExpiryDate: freshUser.subscriptionExpiryDate
    });
  } catch (error) {
    console.error("verify failed:", error.message);
    res.status(500).json({ message: "Could not verify payment." });
  }
});

// GET /api/payment/status/:orderId
// The frontend polls this while the checkout modal/waiting screen is open,
// as a safety net alongside /verify and the webhook. Only the order's own
// user may read it. If still pending, we also ask Razorpay directly for any
// captured payment against this order before answering.
router.get("/status/:orderId", authRequired, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId, userId: req.user._id });
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (order.status === "PENDING" && order.providerOrderId) {
      try {
        const captured = await razorpay.findCapturedPayment(order.providerOrderId, order.amount);
        if (captured) {
          order.providerPaymentId = captured.id;
          order.status = "SUCCESS";
          await order.save();
          await applyOrderIfNeeded(order);
        }
      } catch (pollError) {
        // Non-fatal: webhook or /verify may still arrive; just report current DB state.
        console.error("Order status poll failed:", pollError.message);
      }
    }

    const freshUser = order.subscriptionApplied ? await User.findById(req.user._id) : null;

    res.json({
      orderId: order.orderId,
      status: order.status,
      subscriptionActive: freshUser ? freshUser.hasActiveSubscription() : undefined,
      subscriptionExpiryDate: freshUser ? freshUser.subscriptionExpiryDate : undefined
    });
  } catch (error) {
    console.error("status check failed:", error.message);
    res.status(500).json({ message: "Could not check payment status." });
  }
});

// POST /api/payment/webhook
// Called server-to-server by Razorpay. Mounted (in server.js) with a
// raw-body parser so the exact bytes are available for signature
// validation. This is the durable source of truth — it will still activate
// the subscription even if the user closed their browser right after
// paying and /verify never ran.
router.post("/webhook", async (req, res) => {
  try {
    const signatureHeader = req.headers["x-razorpay-signature"] || "";
    const rawBody = req.body.toString("utf8");

    const signatureValid = razorpay.verifyWebhookSignature(rawBody, signatureHeader);
    if (!signatureValid) {
      console.error("Webhook rejected: invalid signature.");
      return res.status(400).json({ message: "Invalid webhook signature." });
    }

    const event = JSON.parse(rawBody);
    const payment = event?.payload?.payment?.entity;

    // Only "payment.captured" (and the equivalent "order.paid") events ever
    // activate anything. Every other event is acknowledged and ignored.
    if ((event.event === "payment.captured" || event.event === "order.paid") && payment) {
      const razorpayOrderId = payment.order_id;
      const order = await Order.findOne({ providerOrderId: razorpayOrderId });
      if (!order) return res.status(404).json({ message: "Unknown order." });

      if (payment.status === "captured" && payment.amount === order.amount) {
        order.providerPaymentId = payment.id;
        order.status = "SUCCESS";
        await order.save();
        await applyOrderIfNeeded(order); // idempotent — safe if Razorpay retries this webhook
      } else {
        console.error(
          `Order ${order.orderId}: webhook amount/status mismatch (status=${payment.status}, amount=${payment.amount}, expected=${order.amount}). Refusing to activate.`
        );
      }
    } else if (event.event === "payment.failed" && payment) {
      const order = await Order.findOne({ providerOrderId: payment.order_id });
      if (order && order.status === "PENDING") {
        order.status = "FAILED";
        await order.save();
      }
    }

    res.json({ received: true });
  } catch (error) {
    // Invalid signature or malformed payload — reject, do NOT activate anything.
    console.error("Webhook rejected:", error.message);
    res.status(400).json({ message: "Invalid callback." });
  }
});

module.exports = router;
