const mongoose = require("mongoose");

const poseSchema = new mongoose.Schema(
  {
    poseId: { type: Number, unique: true, required: true },
    name: { type: String, required: true },
    benefits: [{ type: String }],
    image: { type: String, default: "/assets/images/pose-placeholder.svg" },
    premium: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pose", poseSchema);
