const express = require("express");
const User = require("../models/User");
const Pose = require("../models/Pose");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// Called when a user holds a pose correctly for the required 25 seconds.
router.post("/complete", authRequired, async (req, res) => {
  try {
    const { poseId, poseName, durationSeconds, accuracy } = req.body;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (req.user.lastPracticeDate) {
      const last = new Date(req.user.lastPracticeDate);
      const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
      const diffDays = Math.round((today - lastDay) / 86400000);

      if (diffDays === 1) req.user.dailyStreak += 1;
      else if (diffDays > 1) req.user.dailyStreak = 1;
      // diffDays === 0 (already practiced today): streak stays the same.
    } else {
      req.user.dailyStreak = 1;
    }

    req.user.lastPracticeDate = now;
    req.user.completedPoses += 1;
    req.user.totalPracticeSeconds += Math.max(0, Number(durationSeconds) || 0);

    req.user.history.push({
      poseId: Number(poseId) || null,
      poseName: String(poseName || "").slice(0, 80),
      durationSeconds: Math.max(0, Number(durationSeconds) || 0),
      accuracy: Math.max(0, Math.min(100, Number(accuracy) || 0)),
      completedAt: now
    });

    // Keep the history array from growing without bound.
    if (req.user.history.length > 500) {
      req.user.history = req.user.history.slice(-500);
    }

    await req.user.save();

    res.json({
      dailyStreak: req.user.dailyStreak,
      completedPoses: req.user.completedPoses
    });
  } catch (error) {
    res.status(500).json({ message: "Could not update progress." });
  }
});

// Real dashboard data: totals, accuracy average and a real last-7-days chart.
router.get("/summary", authRequired, async (req, res) => {
  try {
    const user = req.user;
    const history = user.history || [];

    const recentForAccuracy = history.slice(-20);
    const averageAccuracy = recentForAccuracy.length
      ? Math.round(recentForAccuracy.reduce((sum, h) => sum + (h.accuracy || 0), 0) / recentForAccuracy.length)
      : null;

    // Build the last 7 calendar days (oldest -> newest), matching Mon..Sun style bars on the frontend.
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({ date: d, seconds: 0, sessions: 0 });
    }

    history.forEach((h) => {
      const d = new Date(h.completedAt);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const match = days.find((day) => day.date.getTime() === dayStart.getTime());
      if (match) {
        match.seconds += h.durationSeconds || 0;
        match.sessions += 1;
      }
    });

    res.json({
      completedPoses: user.completedPoses,
      dailyStreak: user.dailyStreak,
      totalPracticeMinutes: Math.round((user.totalPracticeSeconds || 0) / 60),
      averageAccuracy,
      weekly: days.map((d) => ({ seconds: d.seconds, sessions: d.sessions })),
      feedback: await buildFeedback(user, now)
    });
  } catch (error) {
    res.status(500).json({ message: "Could not load dashboard summary." });
  }
});

// Builds the "how am I doing" feedback block: today's summary + a friendly
// message + one improvement tip + a day-by-day list for the last 2 weeks
// (practiced days show minutes + a benefit; empty days are flagged
// `missed: true` so the frontend can show them in yellow as
// "You just missed today's yoga").
const FEEDBACK_WINDOW_DAYS = 14;
const RECOMMENDED_DAYS_PER_WEEK = 5;

async function buildFeedback(user, now) {
  const history = user.history || [];

  const poses = await Pose.find({}, "poseId benefits").lean();
  const benefitsByPoseId = {};
  poses.forEach((p) => { benefitsByPoseId[p.poseId] = p.benefits || []; });

  const days = [];
  for (let i = FEEDBACK_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ date: d, seconds: 0, sessions: 0, poseIds: new Set() });
  }

  history.forEach((h) => {
    const d = new Date(h.completedAt);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const match = days.find((day) => day.date.getTime() === dayStart.getTime());
    if (match) {
      match.seconds += h.durationSeconds || 0;
      match.sessions += 1;
      if (h.poseId) match.poseIds.add(h.poseId);
    }
  });

  const today = days[days.length - 1];
  const todayMinutes = Math.round(today.seconds / 60);
  const practicedDaysInWindow = days.filter((d) => d.sessions > 0).length;

  let todayMessage = null;
  let tip = null;
  if (today.sessions > 0) {
    todayMessage = todayMinutes >= 1
      ? `Great job! You practiced yoga for ${todayMinutes} minute${todayMinutes === 1 ? "" : "s"} today across ${today.sessions} pose${today.sessions === 1 ? "" : "s"}.`
      : `Nice start! You completed ${today.sessions} pose${today.sessions === 1 ? "" : "s"} today.`;
    tip = practicedDaysInWindow >= RECOMMENDED_DAYS_PER_WEEK
      ? "You're on a great routine — try adding one more challenging pose to keep progressing."
      : "One thing to improve: try to hold each pose a little longer and keep your breathing slow and even.";
  }

  const dayList = days.map((day) => {
    const iso = day.date.toISOString().slice(0, 10);
    const label = day.date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const benefits = [...day.poseIds].flatMap((id) => benefitsByPoseId[id] || []).slice(0, 2);
    return {
      date: iso,
      label,
      minutes: Math.round(day.seconds / 60),
      sessions: day.sessions,
      missed: day.sessions === 0,
      benefits
    };
  });

  return {
    todayMinutes,
    todayMessage,
    tip,
    recommendedDaysPerWeek: RECOMMENDED_DAYS_PER_WEEK,
    practicedDaysInWindow,
    windowDays: FEEDBACK_WINDOW_DAYS,
    days: dayList
  };
}

module.exports = router;
