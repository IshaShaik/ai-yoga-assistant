const express = require("express");
const Feedback = require("../models/Feedback");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.post("/", authRequired, async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Please choose a rating from 1 to 5." });
    }

    const feedback = await Feedback.create({
      user: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      rating,
      comment: String(req.body.comment || "").trim().slice(0, 500),
      poseId: Number(req.body.poseId) || null,
      poseName: String(req.body.poseName || "Yoga Session").trim().slice(0, 100)
    });

    res.status(201).json({ feedback: serialize(feedback) });
  } catch (error) {
    res.status(500).json({ message: "Could not save feedback." });
  }
});

router.get("/mine", authRequired, async (req, res) => {
  try {
    const feedback = await Feedback.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).lean();
    const stats = await Feedback.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);
    res.json({
      feedback: feedback.map(serialize),
      average: stats[0] ? Math.round(stats[0].average * 10) / 10 : null,
      count: stats[0]?.count || 0
    });
  } catch (error) {
    res.status(500).json({ message: "Could not load your feedback." });
  }
});

router.get("/admin", authRequired, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access required." });
  try {
    const [items, stats, ratingBreakdown] = await Promise.all([
      Feedback.find().sort({ createdAt: -1 }).limit(500).lean(),
      Feedback.aggregate([
        { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } }
      ]),
      Feedback.aggregate([
        { $group: { _id: "$rating", count: { $sum: 1 } } },
        { $sort: { _id: -1 } }
      ])
    ]);

    res.json({
      feedback: items.map(serialize),
      average: stats[0] ? Math.round(stats[0].average * 10) / 10 : 0,
      count: stats[0]?.count || 0,
      breakdown: ratingBreakdown
    });
  } catch (error) {
    res.status(500).json({ message: "Could not load admin feedback." });
  }
});

function serialize(item) {
  return {
    id: item._id,
    userName: item.userName,
    userEmail: item.userEmail,
    rating: item.rating,
    comment: item.comment,
    poseId: item.poseId,
    poseName: item.poseName,
    createdAt: item.createdAt
  };
}

module.exports = router;
