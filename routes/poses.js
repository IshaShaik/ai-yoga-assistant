const express = require("express");
const Pose = require("../models/Pose");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { benefits: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const poses = await Pose.find(query).sort({ poseId: 1 });
    res.json({ poses });
  } catch (error) {
    res.status(500).json({ message: "Could not load poses." });
  }
});

router.get("/:id", async (req, res) => {
  const pose = await Pose.findOne({ poseId: Number(req.params.id) });
  if (!pose) return res.status(404).json({ message: "Pose not found." });

  res.json({ pose });
});

// Server-side gate: pose #1 is free, poses #2-25 need an active subscription.
router.get("/:id/access", authRequired, async (req, res) => {
  const pose = await Pose.findOne({ poseId: Number(req.params.id) });
  if (!pose) return res.status(404).json({ message: "Pose not found." });

  const allowed = !pose.premium || req.user.hasActiveSubscription();
  res.json({ allowed, premium: pose.premium, subscriptionActive: req.user.hasActiveSubscription() });
});

module.exports = router;
