/*
  pose-templates.js
  --------------------------------------------------------------------------
  This file builds the "target structure" (guide skeleton) for each of the
  25 yoga poses, scores how well the person's live body matches it, and
  produces trainer-style spoken correction cues.

  HOW THE GUIDE STRUCTURE ADAPTS TO ANY BODY TYPE
  --------------------------------------------------------------------------
  Instead of drawing a fixed-size silhouette, every target joint (elbow,
  wrist, knee, ankle) is calculated live, every frame, as an offset from the
  person's OWN shoulder mid-point / hip mid-point, measured in units of
  their OWN shoulder width (SW). Because the unit of measurement is the
  person's own body, the guide automatically grows or shrinks for a taller,
  shorter, thinner or heavier person, and re-centers itself as they move
  closer to or further from the camera.

  HONEST LIMITATION
  --------------------------------------------------------------------------
  These offsets are reasonable approximations of each pose's shape, not
  motion-captured biomechanical data. They work best for standing poses in
  front of a webcam. Floor poses (Cobra, Bridge, Plank, Child's Pose, etc.)
  are inherently harder to verify from a front-facing standing camera; the
  README explains how to improve this further (e.g. side-on camera, a real
  angle-calibration pass per pose).
*/

// ---- MediaPipe Pose landmark indices we care about -------------------
export const LANDMARK_INDEX = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28
};

const TRACKED_JOINTS = [
  "left_elbow", "right_elbow", "left_wrist", "right_wrist",
  "left_knee", "right_knee", "left_ankle", "right_ankle"
];

// ---- Arm presets: offsets from shoulder mid-point, in shoulder-width (SW) units
const ARM_PRESETS = {
  down: { left_elbow: [-0.25, 1.3], left_wrist: [-0.3, 2.5], right_elbow: [0.25, 1.3], right_wrist: [0.3, 2.5] },
  tPose: { left_elbow: [-1.2, 0.05], left_wrist: [-2.2, 0.05], right_elbow: [1.2, 0.05], right_wrist: [2.2, 0.05] },
  overheadV: { left_elbow: [-0.7, -1.2], left_wrist: [-1.0, -2.3], right_elbow: [0.7, -1.2], right_wrist: [1.0, -2.3] },
  prayerChest: { left_elbow: [-0.5, 0.6], left_wrist: [-0.05, 0.9], right_elbow: [0.5, 0.6], right_wrist: [0.05, 0.9] },
  forwardReach: { left_elbow: [-0.9, 0.15], left_wrist: [-1.8, 0.15], right_elbow: [0.9, 0.15], right_wrist: [1.8, 0.15] },
  diagonalVUp: { left_elbow: [-0.9, -1.1], left_wrist: [-1.3, -2.1], right_elbow: [0.35, 1.1], right_wrist: [0.15, 2.1] },
  cactusArms: { left_elbow: [-1.1, -0.1], left_wrist: [-0.9, -1.1], right_elbow: [1.1, -0.1], right_wrist: [0.9, -1.1] },
  handsOnHips: { left_elbow: [-1.0, 0.7], left_wrist: [-0.4, 1.3], right_elbow: [1.0, 0.7], right_wrist: [0.4, 1.3] },
  // Meditation mudra: elbows relaxed near the sides, wrists resting out on the knees.
  restOnKnees: { left_elbow: [-0.75, 0.85], left_wrist: [-1.35, 1.35], right_elbow: [0.75, 0.85], right_wrist: [1.35, 1.35] }
};

// ---- Leg presets: offsets from hip mid-point, in shoulder-width (SW) units
const LEG_PRESETS = {
  stacked: { left_knee: [-0.35, 1.6], left_ankle: [-0.35, 3.1], right_knee: [0.35, 1.6], right_ankle: [0.35, 3.1] },
  wideStraight: { left_knee: [-1.3, 1.6], left_ankle: [-1.9, 3.1], right_knee: [1.3, 1.6], right_ankle: [1.9, 3.1] },
  lungeLeftFront: { left_knee: [-0.9, 1.2], left_ankle: [-1.3, 1.7], right_knee: [1.0, 1.6], right_ankle: [2.2, 3.0] },
  lungeRightFront: { left_knee: [-1.0, 1.6], left_ankle: [-2.2, 3.0], right_knee: [0.9, 1.2], right_ankle: [1.3, 1.7] },
  chairBend: { left_knee: [-0.55, 1.4], left_ankle: [-0.5, 2.6], right_knee: [0.55, 1.4], right_ankle: [0.5, 2.6] },
  wideSquat: { left_knee: [-1.3, 1.1], left_ankle: [-1.5, 2.1], right_knee: [1.3, 1.1], right_ankle: [1.5, 2.1] },
  treeRightUp: { left_knee: [-0.35, 1.6], left_ankle: [-0.35, 3.1], right_knee: [0.8, 0.5], right_ankle: [0.2, 0.2] },
  treeLeftUp: { left_knee: [-0.8, 0.5], left_ankle: [-0.2, 0.2], right_knee: [0.35, 1.6], right_ankle: [0.35, 3.1] },
  backLegLiftRight: { left_knee: [-0.35, 1.6], left_ankle: [-0.35, 3.1], right_knee: [1.3, -0.3], right_ankle: [2.4, -0.5] },
  kneelFold: { left_knee: [-0.4, 1.0], left_ankle: [-0.4, 0.2], right_knee: [0.4, 1.0], right_ankle: [0.4, 0.2] },
  // Cross-legged sit (Lotus / Easy Pose): knees splayed wide, ankles pulled
  // back in close to the hips/floor.
  crossedSit: { left_knee: [-1.35, 1.0], left_ankle: [-0.5, 1.5], right_knee: [1.35, 1.0], right_ankle: [0.5, 1.5] }
};

// ---- Pose library: maps every seeded pose name to an arm/leg preset + trainer cues.
// `cues` = English coaching lines. `cuesHi` = natural Hinglish versions of the
// same coaching lines (used when the AI voice assistant is switched to Hinglish).
export const POSE_LIBRARY = {
  "Mountain Pose": { arms: "down", legs: "stacked", seated: false, cues: [
    "Stand tall, feet hip-width apart.", "Relax your shoulders down and away from your ears.", "Breathe evenly through your nose." ],
    cuesHi: [ "Sidhe khade ho jaiye, pair kandhon jitni doori par.", "Kandhon ko dheela chhodiye, kaano se door.", "Naak se aaram se saans lijiye." ] },
  "Tree Pose": { arms: "prayerChest", legs: "treeRightUp", seated: false, cues: [
    "Fix your gaze on one point to steady your balance.", "Press your foot into your inner thigh, not your knee.", "Keep your standing leg strong and straight." ],
    cuesHi: [ "Balance ke liye ek point par nazar tikaiye.", "Pair ko jaangh par rakhiye, ghutne par nahi.", "Khadi hui taang ko mazboot aur seedhi rakhiye." ] },
  "Warrior I": { arms: "overheadV", legs: "lungeLeftFront", seated: false, cues: [
    "Square your hips toward the front of the mat.", "Bend your front knee to a right angle.", "Reach strongly through your fingertips." ],
    cuesHi: [ "Kulhe mat ke aage ki taraf seedhe rakhiye.", "Aage wale ghutne ko 90 degree tak modiye.", "Ungliyon se upar ki taraf poori taakat se stretch kijiye." ] },
  "Warrior II": { arms: "tPose", legs: "lungeLeftFront", seated: false, cues: [
    "Keep your front knee stacked over your ankle.", "Reach actively through both fingertips.", "Keep your back foot grounded and firm." ],
    cuesHi: [ "Aage wala ghutna ankle ke seedha upar rakhiye.", "Dono haath ko poori tarah stretch kijiye.", "Peechhe wala pair zameen par mazbooti se jamaiye." ] },
  "Triangle Pose": { arms: "diagonalVUp", legs: "wideStraight", seated: false, cues: [
    "Lengthen your spine before you tilt.", "Stack your shoulders on top of each other.", "Keep both legs strong and straight." ],
    cuesHi: [ "Jhukne se pehle reedh ki haddi lambi kijiye.", "Kandhon ko ek dusre ke seedha upar rakhiye.", "Dono taangein mazboot aur seedhi rakhiye." ] },
  "Downward Dog": { arms: "forwardReach", legs: "wideStraight", seated: false, cues: [
    "Push the floor away and lengthen your spine.", "Keep a gentle bend in the knees if your hamstrings feel tight.", "Relax your neck and let your head hang." ],
    cuesHi: [ "Zameen ko haathon se dhakeliye aur reedh lambi kariye.", "Agar tight lage to ghutno mein halka sa mod rakhiye.", "Gardan dheeli chhodiye, sar neeche latakne dijiye." ] },
  "Cobra Pose": { arms: "handsOnHips", legs: "stacked", seated: false, cues: [
    "Keep your elbows close to your body.", "Lift your chest, not just your chin.", "Keep your shoulders away from your ears." ],
    cuesHi: [ "Kohniyaan body ke paas rakhiye.", "Chest upar uthaiye, sirf thoda mat.", "Kandhe kaano se door rakhiye." ] },
  "Child's Pose": { arms: "forwardReach", legs: "kneelFold", seated: true, cues: [
    "Sit your hips back toward your heels.", "Let your forehead rest and breathe deeply.", "Relax your shoulders toward the floor." ],
    cuesHi: [ "Kulhe ko eediyon ki taraf peeche le jaiye.", "Maathe ko rest kariye aur gehri saans lijiye.", "Kandhon ko zameen ki taraf dheela chhodiye." ] },
  "Cat-Cow Pose": { arms: "forwardReach", legs: "kneelFold", seated: true, cues: [
    "Move slowly with your breath.", "Round and arch through your whole spine.", "Keep your wrists under your shoulders." ],
    cuesHi: [ "Saans ke saath dheere dheere move kijiye.", "Poori reedh ko round aur arch kijiye.", "Kalaiyaan kandhon ke seedha neeche rakhiye." ] },
  "Boat Pose": { arms: "forwardReach", legs: "chairBend", seated: true, cues: [
    "Keep your chest lifted and spine long.", "Engage your core rather than gripping your hips.", "Keep your shoulders relaxed, away from your ears." ],
    cuesHi: [ "Chest upar aur reedh lambi rakhiye.", "Core engage kijiye, kulhe mat pakdiye.", "Kandhe relaxed rakhiye, kaano se door." ] },
  "Bridge Pose": { arms: "down", legs: "chairBend", seated: false, cues: [
    "Press evenly through both feet.", "Lift your hips without over-arching your lower back.", "Keep your knees in line with your ankles." ],
    cuesHi: [ "Dono pairon se barabar dabaav dijiye.", "Kulhe upar uthaiye, kamar ko zyada mat modiye.", "Ghutne ankle ki seedhi line mein rakhiye." ] },
  "Plank Pose": { arms: "down", legs: "stacked", seated: false, cues: [
    "Keep your body in one straight line.", "Engage your core and squeeze your legs.", "Keep your shoulders stacked over your wrists." ],
    cuesHi: [ "Poori body ek seedhi line mein rakhiye.", "Core engage kijiye aur taangein tight kijiye.", "Kandhe kalaiyon ke seedha upar rakhiye." ] },
  "Side Plank": { arms: "overheadV", legs: "stacked", seated: false, cues: [
    "Stack your hips and shoulders in one line.", "Press firmly through your supporting hand.", "Keep your core engaged to stay steady." ],
    cuesHi: [ "Kulhe aur kandhe ek line mein rakhiye.", "Support wale haath se mazbooti se dabaiye.", "Steady rehne ke liye core tight rakhiye." ] },
  "Seated Forward Bend": { arms: "forwardReach", legs: "stacked", seated: true, cues: [
    "Hinge from your hips, not your lower back.", "Keep a soft bend in your knees if needed.", "Relax your neck and let it fold gently." ],
    cuesHi: [ "Kulhon se jhukiye, kamar se nahi.", "Zaroorat ho to ghutno mein halka mod rakhiye.", "Gardan dheeli chhodiye, aaram se fold hone dijiye." ] },
  "Pigeon Pose": { arms: "forwardReach", legs: "lungeLeftFront", seated: true, cues: [
    "Square your hips toward the front.", "Keep your back leg long and relaxed.", "Fold forward only as far as feels comfortable." ],
    cuesHi: [ "Kulhe seedhe aage ki taraf rakhiye.", "Peechhe wali taang lambi aur relaxed rakhiye.", "Sirf utna hi aage jhukiye jitna comfortable ho." ] },
  "Eagle Pose": { arms: "cactusArms", legs: "treeRightUp", seated: false, cues: [
    "Sit your hips down as if on a chair.", "Wrap your arms and legs gently, don't force it.", "Keep your balance by fixing your gaze forward." ],
    cuesHi: [ "Kulhe kursi par baithne jaisa neeche le jaiye.", "Haath aur pair aaram se lapetiye, zabardasti mat kijiye.", "Aage nazar tika kar balance rakhiye." ] },
  "Crescent Pose": { arms: "overheadV", legs: "lungeLeftFront", seated: false, cues: [
    "Sink your hips low and forward.", "Reach up and slightly back through your fingertips.", "Keep your back leg active and strong." ],
    cuesHi: [ "Kulhe neeche aur aage ki taraf le jaiye.", "Ungliyon se upar aur thoda peeche stretch kijiye.", "Peechhe wali taang active aur mazboot rakhiye." ] },
  "Crow Pose": { arms: "down", legs: "chairBend", seated: false, cues: [
    "Shift your weight forward gradually onto your hands.", "Keep your gaze slightly forward, not down.", "Engage your core to lift your hips." ],
    cuesHi: [ "Dheere dheere apna weight haathon par aage lijiye.", "Nazar thodi aage rakhiye, neeche nahi.", "Kulhe upar uthane ke liye core engage kijiye." ] },
  "Half Moon Pose": { arms: "diagonalVUp", legs: "backLegLiftRight", seated: false, cues: [
    "Keep your standing leg strong and straight.", "Open your hips toward the side of the room.", "Flex the lifted foot to keep the leg active." ],
    cuesHi: [ "Khadi hui taang mazboot aur seedhi rakhiye.", "Kulhe ko room ke side ki taraf kholiye.", "Uthaye hue pair ko flex rakhiye, active taang ke liye." ] },
  "Corpse Pose": { arms: "down", legs: "stacked", seated: false, cues: [
    "Let your whole body relax completely.", "Breathe slowly and naturally.", "Release any tension in your face and jaw." ],
    cuesHi: [ "Poori body ko poori tarah relax hone dijiye.", "Dheere aur natural saans lijiye.", "Chehre aur jabde ka tension chhod dijiye." ] },
  "Extended Side Angle": { arms: "diagonalVUp", legs: "lungeLeftFront", seated: false, cues: [
    "Keep your front knee tracking over your ankle.", "Reach long through your top arm.", "Keep your chest open toward the ceiling." ],
    cuesHi: [ "Aage wala ghutna ankle ke upar hi rakhiye.", "Upar wale haath se lamba stretch kijiye.", "Chest ko ceiling ki taraf khula rakhiye." ] },
  "Revolved Triangle": { arms: "diagonalVUp", legs: "wideStraight", seated: false, cues: [
    "Square your hips before you twist.", "Lengthen your spine, then rotate.", "Keep both legs strong and grounded." ],
    cuesHi: [ "Twist karne se pehle kulhe seedhe kijiye.", "Pehle reedh lambi kijiye, phir ghumaiye.", "Dono taangein mazboot aur zameen se juri rakhiye." ] },
  "Chair Pose": { arms: "overheadV", legs: "chairBend", seated: false, cues: [
    "Sit your hips back like sitting in a chair.", "Keep your weight in your heels.", "Reach your arms up alongside your ears." ],
    cuesHi: [ "Kursi par baithne jaisa kulhe peeche le jaiye.", "Weight eediyon par rakhiye.", "Haath upar kaano ke paas le jaiye." ] },
  "Warrior III": { arms: "forwardReach", legs: "backLegLiftRight", seated: false, cues: [
    "Keep your hips level and square to the floor.", "Reach forward as your back leg lifts.", "Keep your standing leg strong, not locked." ],
    cuesHi: [ "Kulhe level aur zameen ke seedha rakhiye.", "Peechhe wali taang uthate hue aage stretch kijiye.", "Khadi hui taang mazboot rakhiye, lock mat kijiye." ] },
  "Goddess Pose": { arms: "cactusArms", legs: "wideSquat", seated: false, cues: [
    "Turn your toes out and sink your hips.", "Keep your knees tracking over your toes.", "Keep your chest lifted and spine tall." ],
    cuesHi: [ "Paron ki ungliyaan bahar kijiye aur kulhe neeche le jaiye.", "Ghutne paron ki ungliyon ke seedha upar rakhiye.", "Chest upar aur reedh lambi rakhiye." ] },
  "Lotus Pose": { arms: "restOnKnees", legs: "crossedSit", seated: true, cues: [
    "Sit tall with your spine straight and shoulders relaxed.", "Rest the back of each hand gently on your knee.", "Close your eyes and breathe slowly and evenly." ],
    cuesHi: [ "Reedh seedhi rakhiye, kandhe relaxed rakhiye.", "Haathon ko halke se ghutno par rakhiye.", "Aankhein band kijiye aur dheere, barabar saans lijiye." ] }
};

// Poses whose full shape is best learned seated on the floor/mat (used to
// bias the pre-shown guide's vertical placement so it doesn't float too high).
export const SEATED_POSES = new Set(
  Object.entries(POSE_LIBRARY).filter(([, cfg]) => cfg.seated).map(([name]) => name)
);

const FLOOR_POSES = new Set([
  "Downward Dog", "Cobra Pose", "Child's Pose", "Cat-Cow Pose", "Boat Pose",
  "Bridge Pose", "Plank Pose", "Side Plank", "Seated Forward Bend",
  "Pigeon Pose", "Crow Pose", "Corpse Pose", "Lotus Pose"
]);

export function isFloorPose(poseName) {
  return FLOOR_POSES.has(poseName);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Shared low-level builder: given an anchor (shoulder mid-point, hip
 * mid-point and a shoulder-width unit "sw"), lays out every tracked joint
 * for the requested pose using the arm/leg presets above. Both the LIVE
 * (calibrated-to-the-real-body) skeleton and the GENERIC (pre-shown, no
 * person needed) skeleton are built from this one function so the two are
 * always visually identical in shape — only the anchor differs.
 */
function layoutSkeleton(poseName, shoulderMid, hipMid, sw) {
  const config = POSE_LIBRARY[poseName] || POSE_LIBRARY["Mountain Pose"];
  const armOffsets = ARM_PRESETS[config.arms];
  const legOffsets = LEG_PRESETS[config.legs];

  const targets = {};
  ["left_elbow", "right_elbow", "left_wrist", "right_wrist"].forEach((joint) => {
    const [ox, oy] = armOffsets[joint];
    targets[joint] = { x: shoulderMid.x + ox * sw, y: shoulderMid.y + oy * sw };
  });
  ["left_knee", "right_knee", "left_ankle", "right_ankle"].forEach((joint) => {
    const [ox, oy] = legOffsets[joint];
    targets[joint] = { x: hipMid.x + ox * sw, y: hipMid.y + oy * sw };
  });

  return { targets, shoulderMid, hipMid, sw };
}

/**
 * Builds the live "target structure" for a pose, scaled and centered on the
 * person's own detected body.
 * @param {Object} kp - map of landmark name -> {x, y, score}
 * @param {string} poseName
 * @returns {{targets: Object, shoulderMid: Object, hipMid: Object, sw: number} | null}
 */
export function buildTargetSkeleton(kp, poseName) {
  const ls = kp.left_shoulder, rs = kp.right_shoulder;
  if (!ls || !rs || ls.score < 0.4 || rs.score < 0.4) return null;

  const shoulderMid = midpoint(ls, rs);
  let sw = dist(ls, rs);
  if (!sw || sw < 8) sw = 60; // sane fallback in pixels

  let hipMid;
  const lh = kp.left_hip, rh = kp.right_hip;
  if (lh && rh && lh.score > 0.4 && rh.score > 0.4) {
    hipMid = midpoint(lh, rh);
  } else {
    hipMid = { x: shoulderMid.x, y: shoulderMid.y + sw * 1.6 };
  }

  return layoutSkeleton(poseName, shoulderMid, hipMid, sw);
}

/**
 * Adds the head circle + outer bounding box to a raw skeleton layout
 * ({targets, shoulderMid, hipMid, sw}). Shared by the live-calibrated and
 * the generic pre-shown skeleton builders below.
 */
function withHeadAndBox(layout, canvasWidth, canvasHeight) {
  const { targets, shoulderMid, hipMid, sw } = layout;
  const headCenter = { x: shoulderMid.x, y: shoulderMid.y - sw * 1.05 };
  const headRadius = sw * 0.55;

  const allPoints = Object.values(targets).concat([shoulderMid, hipMid]);
  const pad = sw * 0.6;

  let minX = Math.min(headCenter.x - headRadius, ...allPoints.map(p => p.x)) - pad;
  let maxX = Math.max(headCenter.x + headRadius, ...allPoints.map(p => p.x)) + pad;
  let minY = Math.min(headCenter.y - headRadius, ...allPoints.map(p => p.y)) - pad;
  let maxY = Math.max(...allPoints.map(p => p.y)) + pad;

  if (canvasWidth) { minX = Math.max(0, minX); maxX = Math.min(canvasWidth, maxX); }
  if (canvasHeight) { minY = Math.max(0, minY); maxY = Math.min(canvasHeight, maxY); }

  return {
    ...layout, headCenter, headRadius,
    boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  };
}

/**
 * GENERIC PRE-SHOWN GUIDE — no camera, no detected person needed at all.
 * Anchors the same per-pose arm/leg shape to a fixed point on the canvas
 * (centered, sized relative to the frame) so the user sees "what shape to
 * move into" the instant they open a pose — before the camera even starts,
 * and while no person has been detected yet. Every one of the 25 poses gets
 * its own shape here because each maps to its own arm/leg preset above.
 * Seated / floor poses are anchored a little lower and a little smaller so
 * their shape stays inside the frame.
 * @param {string} poseName
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function buildPreviewSkeleton(poseName, canvasWidth, canvasHeight) {
  const w = canvasWidth || 1280;
  const h = canvasHeight || 720;
  const seated = SEATED_POSES.has(poseName);

  // Unit of scale: a fraction of the smaller frame dimension, so the guide
  // looks proportionate whether the video is portrait (phone) or landscape.
  const sw = Math.max(34, Math.min(w, h) * (seated ? 0.10 : 0.115));
  const shoulderMid = { x: w * 0.5, y: h * (seated ? 0.40 : 0.30) };
  const hipMid = { x: shoulderMid.x, y: shoulderMid.y + sw * (seated ? 1.2 : 1.6) };

  const layout = layoutSkeleton(poseName, shoulderMid, hipMid, sw);
  return withHeadAndBox(layout, w, h);
}

/**
 * Builds a ONE-TIME, FROZEN target structure from the first good frame and
 * locks it in canvas-pixel coordinates. Unlike buildTargetSkeleton (which
 * recalculates every frame off the live shoulder midpoint), this is called
 * once per session and the returned object is cached by the caller — so the
 * guide the user sees stays perfectly still, giving a stable visual anchor
 * to move into, rather than a target that chases their own motion.
 *
 * Also computes a head circle and an outer bounding box (with padding)
 * around the whole structure, for the green/red frame the caller draws.
 *
 * @param {Object} kp - map of landmark name -> {x, y, score}, in canvas pixels
 * @param {string} poseName
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {(ReturnType<typeof buildTargetSkeleton> & {
 *   headCenter: Object, headRadius: number,
 *   boundingBox: {x:number, y:number, width:number, height:number}
 * }) | null}
 */
export function buildFixedTargetSkeleton(kp, poseName, canvasWidth, canvasHeight) {
  const base = buildTargetSkeleton(kp, poseName);
  if (!base) return null;
  return withHeadAndBox(base, canvasWidth, canvasHeight);
}

/**
 * Scores how well the live keypoints match the target structure.
 * @returns {{good: boolean, score: number, perJoint: Object}}
 */
export function scorePose(kp, targetSkeleton) {
  const { targets, sw } = targetSkeleton;
  const perJoint = {};
  let matched = 0;
  let visibleCount = 0;

  TRACKED_JOINTS.forEach((joint) => {
    const actual = kp[joint];
    if (!actual || actual.score < 0.4) {
      perJoint[joint] = null;
      return;
    }
    visibleCount++;
    const target = targets[joint];
    const errorUnits = dist(actual, target) / sw;
    const isMatch = errorUnits <= 1.8;
    if (isMatch) matched++;
    perJoint[joint] = { errorUnits, isMatch, dx: target.x - actual.x, dy: target.y - actual.y };
  });

  if (visibleCount < 4) {
    return { good: false, score: 0, perJoint, notEnoughBody: true };
  }

  const score = matched / visibleCount;
  return { good: score >= 0.35, score, perJoint, notEnoughBody: false };
}

const JOINT_LABEL = {
  en: {
    left_elbow: "left arm", right_elbow: "right arm",
    left_wrist: "left arm", right_wrist: "right arm",
    left_knee: "left leg", right_knee: "right leg",
    left_ankle: "left leg", right_ankle: "right leg"
  },
  hi: {
    left_elbow: "baayan haath", right_elbow: "dayan haath",
    left_wrist: "baayan haath", right_wrist: "dayan haath",
    left_knee: "baayi taang", right_knee: "dayi taang",
    left_ankle: "baayi taang", right_ankle: "dayi taang"
  }
};

/**
 * Generates one short, trainer-style correction sentence based on whichever
 * tracked joint is furthest from its target. Pass lang: "hi" for Hinglish.
 */
export function generateCorrection(perJoint, lang = "en") {
  let worstJoint = null;
  let worstError = 0;
  Object.entries(perJoint).forEach(([joint, info]) => {
    if (info && !info.isMatch && info.errorUnits > worstError) {
      worstError = info.errorUnits;
      worstJoint = joint;
    }
  });
  if (!worstJoint) return null;

  const info = perJoint[worstJoint];
  const label = JOINT_LABEL[lang][worstJoint];
  const isLeg = worstJoint.includes("knee") || worstJoint.includes("ankle");
  const vertical = Math.abs(info.dy) >= Math.abs(info.dx);

  if (lang === "hi") {
    if (isLeg) {
      if (vertical) return info.dy > 0 ? `${label} ko thoda aur modiye.` : `${label} ko thoda seedha kijiye.`;
      return info.dx > 0 ? "Pairon ko thoda aur chauda kijiye." : "Pairon ko thoda paas laiye.";
    }
    if (vertical) return info.dy < 0 ? `${label} ko thoda upar uthaiye.` : `${label} ko thoda neeche kijiye.`;
    return info.dx > 0 ? `${label} ko aur bahar stretch kijiye.` : `${label} ko thoda andar laiye.`;
  }

  if (isLeg) {
    if (vertical) {
      return info.dy > 0 ? `Bend your ${label} a little more.` : `Straighten your ${label} a bit.`;
    }
    return info.dx > 0 ? "Step your feet a little wider apart." : "Bring your feet a little closer together.";
  }
  if (vertical) {
    return info.dy < 0 ? `Raise your ${label} a bit higher.` : `Lower your ${label} slightly.`;
  }
  return info.dx > 0 ? `Stretch your ${label} further out.` : `Bring your ${label} in a little.`;
}

export function checkShoulderHipLevel(kp, lang = "en") {
  const ls = kp.left_shoulder, rs = kp.right_shoulder, lh = kp.left_hip, rh = kp.right_hip;
  if (ls && rs && ls.score > 0.4 && rs.score > 0.4) {
    const sw = dist(ls, rs) || 60;
    if (Math.abs(ls.y - rs.y) / sw > 0.28) return lang === "hi" ? "Kandhon ko level rakhiye." : "Keep your shoulders level.";
  }
  if (lh && rh && lh.score > 0.4 && rh.score > 0.4) {
    const sw2 = dist(lh, rh) || 60;
    if (Math.abs(lh.y - rh.y) / sw2 > 0.32) return lang === "hi" ? "Kulhon ko seedha rakhiye." : "Keep your hips square.";
  }
  return null;
}

/* ============================================================================
   DYNAMIC, ANGLE-BASED REAL-TIME COACHING
   ----------------------------------------------------------------------------
   Everything above this line is unchanged. Everything below is ADDITIVE: it
   computes real joint angles (elbow, knee, shoulder, hip) from the live
   camera landmarks every frame, compares them against each pose's own ideal
   angles, and produces a fresh, specific spoken correction — instead of
   picking from a fixed list of pre-written sentences.

   WHERE THE "IDEAL ANGLE" FOR EACH POSE COMES FROM
   ----------------------------------------------------------------------------
   Rather than hand-typing a separate angle table for all 25 poses (which
   would easily drift out of sync with ARM_PRESETS/LEG_PRESETS above), the
   ideal angle for every joint is derived geometrically from the SAME preset
   offset vectors already used to draw the guide skeleton. Angles are
   scale-invariant, so this works without needing any particular body size —
   it only cares about the SHAPE the preset describes, which is exactly what
   "the ideal angle for this pose" means.
============================================================================ */

/**
 * Angle ABC at vertex B, in degrees. Returns null if either arm of the
 * angle has zero length (missing/overlapping points).
 */
function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const mag1 = Math.hypot(v1x, v1y), mag2 = Math.hypot(v2x, v2y);
  if (!mag1 || !mag2) return null;
  let cos = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

// The 8 joint angles we track for every pose. Elbow/knee are the classic
// "limb bend" angles; shoulder/hip describe how far the arm/thigh is lifted
// away from the torso — this is what lets us catch things like "raise your
// arm higher" or "fold deeper at the hips", not just limb bend.
const ANGLE_JOINTS = [
  "left_elbow", "right_elbow", "left_knee", "right_knee",
  "left_shoulder", "right_shoulder", "left_hip", "right_hip"
];

const idealAngleCache = new Map();

/**
 * The ideal angle (degrees) for each of the 8 tracked joints, for a given
 * pose — computed once from that pose's ARM_PRESETS/LEG_PRESETS offsets and
 * cached (these never change at runtime, so there's no need to recompute
 * them every frame).
 */
function idealAnglesForPose(poseName) {
  if (idealAngleCache.has(poseName)) return idealAngleCache.get(poseName);

  const config = POSE_LIBRARY[poseName] || POSE_LIBRARY["Mountain Pose"];
  const armOffsets = ARM_PRESETS[config.arms];
  const legOffsets = LEG_PRESETS[config.legs];

  const shoulderMid = { x: 0, y: 0 };
  const hipMid = { x: 0, y: config.seated ? 1.2 : 1.6 };
  const at = (base, offset) => ({ x: base.x + offset[0], y: base.y + offset[1] });

  const leftElbow = at(shoulderMid, armOffsets.left_elbow);
  const leftWrist = at(shoulderMid, armOffsets.left_wrist);
  const rightElbow = at(shoulderMid, armOffsets.right_elbow);
  const rightWrist = at(shoulderMid, armOffsets.right_wrist);
  const leftKnee = at(hipMid, legOffsets.left_knee);
  const leftAnkle = at(hipMid, legOffsets.left_ankle);
  const rightKnee = at(hipMid, legOffsets.right_knee);
  const rightAnkle = at(hipMid, legOffsets.right_ankle);

  const angles = {
    left_elbow: angleAt(shoulderMid, leftElbow, leftWrist),
    right_elbow: angleAt(shoulderMid, rightElbow, rightWrist),
    left_knee: angleAt(hipMid, leftKnee, leftAnkle),
    right_knee: angleAt(hipMid, rightKnee, rightAnkle),
    left_shoulder: angleAt(leftElbow, shoulderMid, hipMid),
    right_shoulder: angleAt(rightElbow, shoulderMid, hipMid),
    left_hip: angleAt(shoulderMid, hipMid, leftKnee),
    right_hip: angleAt(shoulderMid, hipMid, rightKnee)
  };

  idealAngleCache.set(poseName, angles);
  return angles;
}

/**
 * The SAME 8 joint angles, computed live from the person's actual detected
 * landmarks this frame. Uses the same vertex definitions as
 * idealAnglesForPose() (shoulderMid/hipMid as the shared reference points)
 * so live and ideal angles are directly comparable.
 * @param {Object} kp - map of landmark name -> {x, y, score}
 */
export function computeLiveAngles(kp) {
  const visible = (p) => p && p.score > 0.4;
  const ls = kp.left_shoulder, rs = kp.right_shoulder;
  const lh = kp.left_hip, rh = kp.right_hip;

  const shoulderMid = visible(ls) && visible(rs) ? midpoint(ls, rs) : null;
  const hipMid = visible(lh) && visible(rh) ? midpoint(lh, rh) : null;

  const angles = {};
  if (shoulderMid && visible(kp.left_elbow) && visible(kp.left_wrist)) {
    angles.left_elbow = angleAt(shoulderMid, kp.left_elbow, kp.left_wrist);
  }
  if (shoulderMid && visible(kp.right_elbow) && visible(kp.right_wrist)) {
    angles.right_elbow = angleAt(shoulderMid, kp.right_elbow, kp.right_wrist);
  }
  if (hipMid && visible(kp.left_knee) && visible(kp.left_ankle)) {
    angles.left_knee = angleAt(hipMid, kp.left_knee, kp.left_ankle);
  }
  if (hipMid && visible(kp.right_knee) && visible(kp.right_ankle)) {
    angles.right_knee = angleAt(hipMid, kp.right_knee, kp.right_ankle);
  }
  if (shoulderMid && hipMid && visible(kp.left_elbow)) {
    angles.left_shoulder = angleAt(kp.left_elbow, shoulderMid, hipMid);
  }
  if (shoulderMid && hipMid && visible(kp.right_elbow)) {
    angles.right_shoulder = angleAt(kp.right_elbow, shoulderMid, hipMid);
  }
  if (shoulderMid && hipMid && visible(kp.left_knee)) {
    angles.left_hip = angleAt(shoulderMid, hipMid, kp.left_knee);
  }
  if (shoulderMid && hipMid && visible(kp.right_knee)) {
    angles.right_hip = angleAt(shoulderMid, hipMid, kp.right_knee);
  }
  return angles;
}

// How many degrees of slack we allow before calling a joint "off" — small
// enough to catch real mistakes, large enough not to nag over noise/jitter.
const ANGLE_TOLERANCE_DEGREES = 35;

const ANGLE_JOINT_LABEL = {
  en: {
    left_elbow: "left elbow", right_elbow: "right elbow",
    left_knee: "left knee", right_knee: "right knee",
    left_shoulder: "left arm", right_shoulder: "right arm",
    left_hip: "left hip", right_hip: "right hip"
  },
  hi: {
    left_elbow: "baayi kohni", right_elbow: "dayi kohni",
    left_knee: "baayan ghutna", right_knee: "dayan ghutna",
    left_shoulder: "baayan haath", right_shoulder: "dayan haath",
    left_hip: "baayan kulha", right_hip: "dayan kulha"
  }
};

/**
 * THE MAIN ENTRY POINT for real-time coaching: compares this frame's live
 * joint angles against this pose's ideal joint angles and returns one
 * specific, dynamically-generated spoken correction for whichever tracked
 * angle is furthest off — or null if every trackable angle is already
 * within tolerance (nothing needs correcting right now).
 * @param {Object} kp - live landmark map (name -> {x,y,score})
 * @param {string} poseName
 * @param {"en"|"hi"} lang
 */
export function generateAngleCorrection(kp, poseName, lang = "en") {
  const ideal = idealAnglesForPose(poseName);
  const live = computeLiveAngles(kp);

  let worstJoint = null;
  let worstDiff = 0;
  ANGLE_JOINTS.forEach((joint) => {
    const idealAngle = ideal[joint];
    const liveAngle = live[joint];
    if (idealAngle == null || liveAngle == null) return;
    const diff = liveAngle - idealAngle; // + = live is straighter/more open than ideal
    if (Math.abs(diff) > ANGLE_TOLERANCE_DEGREES && Math.abs(diff) > Math.abs(worstDiff)) {
      worstDiff = diff;
      worstJoint = joint;
    }
  });

  if (!worstJoint) return null;

  const label = ANGLE_JOINT_LABEL[lang][worstJoint];
  const tooStraight = worstDiff > 0; // live angle bigger than the pose calls for
  const isLimb = worstJoint.endsWith("elbow") || worstJoint.endsWith("knee");

  if (lang === "hi") {
    if (isLimb) {
      return tooStraight ? `${label} ko thoda aur modiye.` : `${label} ko thoda seedha kijiye.`;
    }
    return tooStraight
      ? `${label} ko body ke thoda paas laiye.`
      : `${label} ko thoda aur upar/bahar uthaiye.`;
  }

  if (isLimb) {
    return tooStraight ? `Bend your ${label} a little more.` : `Straighten your ${label} a bit.`;
  }
  return tooStraight
    ? `Bring your ${label} a little closer to your body.`
    : `Lift your ${label} a little higher.`;
}
