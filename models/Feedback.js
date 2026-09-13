const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  userName: { type: String, required: true, trim: true, maxlength: 80 },
  userEmail: { type: String, required: true, lowercase: true, trim: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 500, default: "" },
  poseId: { type: Number, default: null },
  poseName: { type: String, trim: true, maxlength: 100, default: "Yoga Session" },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Feedback", feedbackSchema);
