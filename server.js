require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const poseRoutes = require("./routes/poses");
const subscriptionRoutes = require("./routes/subscription");
const progressRoutes = require("./routes/progress");
const feedbackRoutes = require("./routes/feedback");
const paymentRoutes = require("./routes/payment");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:3000",
  "https://localhost",
  "capacitor://localhost"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      origin.endsWith(".onrender.com") ||
      (process.env.CLIENT_URL && origin === process.env.CLIENT_URL)
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Mobile app aur local testing dono allow karega
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// The Razorpay webhook must be verified against the exact raw bytes
// Razorpay sent (validateWebhookSignature checks an HMAC over the raw
// body), so this route gets a raw-body parser instead of the JSON parser
// below it.
app.use("/api/payment/webhook", express.raw({ type: "*/*", limit: "1mb" }));

app.use(express.json({ limit: "1mb" }));

// Static frontend. Serving through Express means the app is opened on
// localhost/HTTPS instead of file://, which is important for camera access.
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "AI Yoga Assistant API" });
});

// Public, no-auth config for the frontend (see public/js/poses.js). Only
// ever expose the Razorpay key_id here (it's publishable by design) —
// never RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET.
app.get("/api/config/public", (req, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    price: Number(process.env.PREMIUM_PRICE || 99)
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/poses", poseRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/feedback", feedbackRoutes);

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`AI Yoga Assistant running at http://localhost:${PORT}`);
  });
}

start();
