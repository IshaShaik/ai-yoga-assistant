const mongoose = require("mongoose");

// One document per subscription payment attempt. The backend is the only
// thing that ever writes `status`/`providerTransactionId` — the frontend
// only ever reads this via /api/payment/status/:orderId.
const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true },

    // Our own unique order id (sent to Razorpay as the order "receipt").
    orderId: { type: String, required: true, unique: true, index: true },

    // Razorpay's own order id ("order_...") for this attempt, once known.
    providerOrderId: { type: String, default: null, index: true },
    // The specific successful payment id from Razorpay ("pay_...", for
    // audit / duplicate-webhook detection), once known.
    providerPaymentId: { type: String, default: null, index: true },

    paymentProvider: { type: String, default: "razorpay" },

    // Amount is stored in paise and is ALWAYS set by the backend from
    // PREMIUM_PRICE — never trust an amount from the client.
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true
    },

    // Set once, the first time a webhook/status-check activates a
    // subscription from this order — used to make activation idempotent
    // even if Razorpay sends the same "payment succeeded" event twice.
    subscriptionApplied: { type: Boolean, default: false },

    rawCallback: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
