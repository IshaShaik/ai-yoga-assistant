require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Pose = require("./models/Pose");

// ===============================
// YOGA POSE DATA
// ===============================

const poseNames = [

  ["Mountain Pose", ["Improves posture", "Builds body awareness"]],

  ["Tree Pose", ["Improves balance", "Strengthens legs", "Builds concentration"]],

  ["Warrior I", ["Builds strength", "Opens hips and chest"]],

  ["Warrior II", ["Improves stamina", "Strengthens legs"]],

  ["Triangle Pose", ["Stretches hamstrings", "Improves flexibility"]],

  ["Downward Dog", ["Full-body stretch", "Strengthens shoulders"]],

  ["Cobra Pose", ["Opens chest", "Strengthens back"]],

  ["Child's Pose", ["Relaxes the body", "Gentle back stretch"]],

  ["Cat-Cow Pose", ["Mobilizes the spine", "Supports flexibility"]],

  ["Boat Pose", ["Strengthens core", "Improves balance"]],

  ["Bridge Pose", ["Strengthens glutes", "Opens the chest"]],

  ["Plank Pose", ["Builds core strength", "Improves stability"]],

  ["Side Plank", ["Strengthens core", "Improves balance"]],

  ["Seated Forward Bend", ["Stretches hamstrings", "Calms the mind"]],

  ["Pigeon Pose", ["Opens hips", "Improves lower-body mobility"]],

  ["Eagle Pose", ["Improves balance", "Strengthens legs"]],

  ["Crescent Pose", ["Builds leg strength", "Opens hips"]],

  ["Crow Pose", ["Builds arm strength", "Improves focus"]],

  ["Half Moon Pose", ["Improves balance", "Strengthens legs"]],

  ["Corpse Pose", ["Deep relaxation", "Supports mindful breathing"]],

  ["Extended Side Angle", ["Opens hips", "Stretches side body"]],

  ["Revolved Triangle", ["Improves mobility", "Challenges balance"]],

  ["Chair Pose", ["Builds leg strength", "Engages the core"]],

  ["Warrior III", ["Improves balance", "Strengthens the posterior chain"]],

  ["Goddess Pose", ["Strengthens legs", "Opens hips"]],

  ["Lotus Pose", ["Calms the mind", "Improves focus", "Opens hips and knees"]]

];


// ===============================
// IMAGE PATHS
// ===============================

const imageMap = {

  "Mountain Pose": "/assets/images/Mountain Pose.png",

  "Tree Pose": "/assets/images/Tree Pose.png",

  "Warrior I": "/assets/images/Warrior I.png",

  "Warrior II": "/assets/images/Warrior II.png",

  "Triangle Pose": "/assets/images/Triangle Pose.png",

  "Downward Dog": "/assets/images/Downward Dog.png",

  "Cobra Pose": "/assets/images/Cobra Pose.png",

  "Child's Pose": "/assets/images/childs-pose.png",

  "Cat-Cow Pose": "/assets/images/cat-pose.png",

  "Boat Pose": "/assets/images/Boat Pose.png",

  "Bridge Pose": "/assets/images/Bridge Pose.png",

  "Plank Pose": "/assets/images/Plank Pose.png",

  "Side Plank": "/assets/images/pose-placeholder.svg",

  "Seated Forward Bend": "/assets/images/pose-placeholder.svg",

  "Pigeon Pose": "/assets/images/pose-placeholder.svg",

  "Eagle Pose": "/assets/images/pose-placeholder.svg",

  "Crescent Pose": "/assets/images/pose-placeholder.svg",

  "Crow Pose": "/assets/images/pose-placeholder.svg",

  "Half Moon Pose": "/assets/images/pose-placeholder.svg",

  "Corpse Pose": "/assets/images/pose-placeholder.svg",

  "Extended Side Angle": "/assets/images/pose-placeholder.svg",

  "Revolved Triangle": "/assets/images/pose-placeholder.svg",

  "Chair Pose": "/assets/images/pose-placeholder.svg",

  "Warrior III": "/assets/images/pose-placeholder.svg",

  "Goddess Pose": "/assets/images/pose-placeholder.svg",

  "Lotus Pose": "/assets/images/hero-yoga.png"

};


// ===============================
// SEED FUNCTION
// ===============================

async function seed() {

  try {

    await connectDB();

    console.log("MongoDB Connected");

    await Pose.deleteMany({});

    const docs = poseNames.map(([name, benefits], index) => ({

      poseId: index + 1,

      name,

      benefits,

      premium: index !== 0 && name !== "Lotus Pose",

      image: imageMap[name] || "/assets/images/pose-placeholder.svg"

    }));

    await Pose.insertMany(docs);

    console.log("25 Yoga Poses Inserted");

    mongoose.connection.close();

  } catch (error) {

    console.log(error);

    mongoose.connection.close();

  }

}

seed();
