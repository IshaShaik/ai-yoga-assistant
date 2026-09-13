/*
  i18n.js
  --------------------------------------------------------------------------
  Small bilingual text dictionary for the AI voice assistant + on-screen
  captions. Two languages are supported:
    - "en"  → plain English
    - "hi"  → natural Hinglish (Hindi meaning, written in Roman/English
              letters) — this is what most Indian users actually speak day
              to day, and it reads naturally out loud on Indian text-to-speech
              voices without needing a Devanagari font or keyboard.

  Pass the current language code into T(key, ...args) to get the right
  string. Fall back to English if a key or language is missing.
*/

const STRINGS = {
  cameraStarting: {
    en: (pose) => `Camera starting, please align your body for ${pose}.`,
    hi: (pose) => `Camera start ho raha hai, please apni body ko ${pose} ke liye align kijiye.`
  },
  showStructureFirst: {
    en: (pose) => `Here is the guide structure for ${pose}. Move into this shape.`,
    hi: (pose) => `Yeh raha ${pose} ka guide structure. Isi shape mein aa jaiye.`
  },
  noPersonDetected: {
    en: () => "No person detected — step into the frame.",
    hi: () => "Koi person detect nahi hua — frame ke andar aa jaiye."
  },
  holdStillCalibrating: {
    en: () => "Hold still while we lock your target position...",
    hi: () => "Thoda ruk jaiye, hum aapki position lock kar rahe hain..."
  },
  stepBackShoulders: {
    en: () => "Step back so your shoulders are fully visible.",
    hi: () => "Thoda peeche jaiye taaki kandhe poori tarah dikhein."
  },
  stepBackFullBody: {
    en: () => "Step back so your whole body is visible.",
    hi: () => "Thoda peeche jaiye taaki poori body camera mein aaye."
  },
  targetLocked: {
    en: (pose) => `Target locked. Move into ${pose}.`,
    hi: (pose) => `Target lock ho gaya. Ab ${pose} mein aa jaiye.`
  },
  floorPoseNote: {
    en: () => "This is a floor pose. For best tracking, stand where your full body is visible, or use this as a general guide.",
    hi: () => "Yeh ek floor pose hai. Behtar tracking ke liye wahan khadi rahiye jahan poori body dikhe, ya isse ek general guide ki tarah use kijiye."
  },
  cameraNotAvailable: {
    en: () => "Camera API is not available. Use HTTPS or localhost.",
    hi: () => "Camera API available nahi hai. HTTPS ya localhost use kijiye."
  },
  cameraDenied: {
    en: () => "Camera permission was denied or unavailable. Please allow camera access and try again.",
    hi: () => "Camera permission nahi mili. Please camera access allow kijiye aur dubara try kijiye."
  },
  cameraRequired: {
    en: () => "Camera permission is required for AI pose tracking.",
    hi: () => "AI pose tracking ke liye camera permission zaroori hai."
  },
  modelLoadFailed: {
    en: () => "AI model could not load. Camera is still active.",
    hi: () => "AI model load nahi ho paaya. Camera abhi bhi chalu hai."
  },
  poseCompleted: {
    en: () => "Excellent! Pose completed. Great job holding steady.",
    hi: () => "Bahut badhiya! Pose complete ho gaya. Steady hold karne ke liye shabaash."
  },
  practiceAgain: {
    en: () => "Let's do it again. Reset and find your alignment.",
    hi: () => "Chaliye dubara karte hain. Reset kijiye aur apna alignment dhundiye."
  },
  recalibrating: {
    en: () => "Recalibrating. Hold still.",
    hi: () => "Recalibrate ho raha hai. Thoda ruk jaiye."
  },
  greatAlignment: {
    en: () => "● Great Alignment!",
    hi: () => "● Alignment Bahut Achha Hai!"
  },
  adjustPosture: {
    en: () => "● Adjust Your Posture",
    hi: () => "● Apni Posture Theek Kijiye"
  },
  generalCorrection: {
    en: () => "Move into the pose shown on the left.",
    hi: () => "Left mein dikh rahe pose ki tarah aa jaiye."
  },
  chooseLanguageTitle: {
    en: () => "Choose your AI voice language",
    hi: () => "Apni AI voice ki language chuniye"
  },
  chooseLanguageSubtitle: {
    en: () => "You can switch anytime during the session.",
    hi: () => "Session ke dauraan kabhi bhi switch kar sakti hain."
  },
  englishOption: { en: () => "English", hi: () => "English" },
  hinglishOption: { en: () => "Hinglish (हिंग्लिश)", hi: () => "Hinglish (हिंग्लिश)" },
  getIntoPosition: {
    en: () => "Get into this position",
    hi: () => "Is position mein aa jaiye"
  },
  namaste: {
    en: () => "Namaste! Welcome to your practice.",
    hi: () => "Namaste! Aapke practice mein swagat hai."
  }
};

/**
 * T(key, lang, ...args) — resolves a bilingual string.
 * Example: T("cameraStarting", "hi", "Tree Pose")
 */
export function T(key, lang, ...args) {
  const entry = STRINGS[key];
  if (!entry) return "";
  const fn = entry[lang] || entry.en;
  return fn(...args);
}

export const SUPPORTED_LANGS = ["en", "hi"];
