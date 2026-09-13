import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import {
  LANDMARK_INDEX,
  POSE_LIBRARY,
  isFloorPose,
  buildFixedTargetSkeleton,
  buildPreviewSkeleton,
  scorePose,
  generateCorrection,
  checkShoulderHipLevel,
  generateAngleCorrection
} from "./pose-templates.js";
import { T } from "./i18n.js";

const HOLD_TARGET_SECONDS = 25;
// How many consecutive good frames we wait for before freezing the target,
// so we don't lock onto a half-in-frame or transient first detection.
const CALIBRATION_FRAMES_NEEDED = 6;

const state = {
  token: localStorage.getItem("yoga_token"),
  user: JSON.parse(localStorage.getItem("yoga_user") || "null"),
  poses: [],
  authMode: "login",
  currentPose: null,
  stream: null,
  landmarker: null,
  rafId: null,
  idleRafId: null,
  timerInterval: null,
  elapsed: 0,
  holdSeconds: 0,
  holdComplete: false,
  scoreSamples: [],
  fixedTarget: null,
  previewTarget: null,
  personDetected: false,
  calibrationStreak: 0,
  lastSpokenAt: 0,
  lastSpokenText: "",
  cueRotationIndex: 0,
  completedToday: new Set(),
  // "en" = English, "hi" = Hinglish (Hindi meaning, Roman letters)
  language: localStorage.getItem("yoga_lang") || "en",
  voicesCache: [],
  music: null,
  ambient: null,
  pendingPose: null,
  // AI coaching voice can be muted independently of the per-pose music.
  voiceEnabled: localStorage.getItem("yoga_voice_enabled") !== "false",
  // Explicit state names used by the hands-free command layer.
  aiGuidanceEnabled: localStorage.getItem("yoga_voice_enabled") !== "false",
  musicPaused: false,
  musicEnabled: true,
  isYogaRunning: false,
  currentPoseIndex: 0,
  awaitingNextStep: false, // true right after a pose is completed, while we speak "completed" -> benefit -> next-step, so tracking/corrections pause
  countdownTimeout: null, // "get into position" 3-2-1 countdown timer, right after the camera opens
  voiceCmdEnabled: false // hands-free voice command listening (mic), independent of the spoken AI coach
};

const $ = (id) => document.getElementById(id);
const poseGrid = $("poseGrid");

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

// ---- Local "completed today" tracking (per user, resets daily) ---------
function todayKey() {
  const d = new Date();
  const userPart = state.user ? state.user.id : "guest";
  return `yoga_completed_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}_${userPart}`;
}
function loadCompletedToday() {
  try {
    const raw = localStorage.getItem(todayKey());
    state.completedToday = new Set(raw ? JSON.parse(raw) : []);
  } catch { state.completedToday = new Set(); }
}
function markCompletedToday(poseId) {
  state.completedToday.add(poseId);
  localStorage.setItem(todayKey(), JSON.stringify([...state.completedToday]));
}

function showModal(id) {
  const el = $(id);
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}
function closeModal(id) {
  const el = $(id);
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal.open")) document.body.classList.remove("modal-open");
}
function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function renderAuthButton() {
  if (!state.user) { $("authBtn").textContent = "Login / Sign up"; return; }
  const first = state.user.name.split(" ")[0];
  $("authBtn").textContent = state.user.isAdmin ? `Hi, ${first} ✦ Admin` : `Hi, ${first}`;
}
// ---- Dashboard ----------------------------------------------------------
async function refreshDashboard() {
  if (!$("dashCompleted")) return;
  renderAuthButton();
  if (!state.token) {
    $("dashSubline").textContent = "Login to save your streak and see real practice history.";
    $("dashCompleted").textContent = "0";
    $("dashAccuracy").textContent = "—";
    $("dashTime").textContent = "0m";
    $("dashStreak").textContent = "0";
    $("miniStreak").textContent = "0";
    $("miniProgressBar").style.width = "0%";
    $("dashGreeting").textContent = "Login to save your streak and practice history.";
    renderBars([]);
    renderAchievements(0);
    renderFeedback(null);
    return;
  }
  try {
    const data = await api("/api/progress/summary");
    $("dashCompleted").textContent = data.completedPoses;
    $("dashAccuracy").textContent = data.averageAccuracy != null ? `${data.averageAccuracy}%` : "—";
    $("dashTime").textContent = `${data.totalPracticeMinutes}m`;
    $("dashStreak").textContent = data.dailyStreak;
    $("miniStreak").textContent = data.dailyStreak;
    $("miniProgressBar").style.width = `${Math.min(100, data.dailyStreak * 14)}%`;
    $("dashSubline").textContent = `${state.user.name.split(" ")[0]}, here is your real practice history.`;
    $("dashGreeting").textContent = `${state.user.name.split(" ")[0]}, keep your practice consistent and build your daily streak.`;
    renderBars(data.weekly || []);
    renderAchievements(data.completedPoses);
    renderFeedback(data.feedback || null);
  } catch (error) {
    console.warn("Dashboard load failed:", error.message);
  }
}

// ---- "Your Feedback" panel: today's summary + a day-by-day list where
// days with no practice are called out in yellow as a gentle nudge.
function renderFeedback(feedback) {
  const todayEl = $("feedbackToday");
  const tipEl = $("feedbackTip");
  const daysEl = $("feedbackDays");

  if (!feedback) {
    todayEl.textContent = "Login and complete a pose to see your personal feedback here.";
    tipEl.textContent = "";
    daysEl.innerHTML = "";
    return;
  }

  todayEl.textContent = feedback.todayMessage
    || "You haven't practiced yet today — even one pose counts. Let's get started!";
  todayEl.classList.toggle("is-missed", !feedback.todayMessage);
  tipEl.textContent = feedback.tip
    || `Aim for at least ${feedback.recommendedDaysPerWeek} days a week for the best results — you've practiced ${feedback.practicedDaysInWindow} of the last ${feedback.windowDays} days.`;

  daysEl.innerHTML = feedback.days.map((day) => {
    if (day.missed) {
      return `
        <div class="feedback-day missed">
          <span class="fd-date">${escapeHTML(day.label)}</span>
          <span class="fd-status">You just miss the today yoga</span>
        </div>`;
    }
    const benefitText = day.benefits.length ? ` — helps with ${escapeHTML(day.benefits.join(", "))}` : "";
    return `
      <div class="feedback-day done">
        <span class="fd-date">${escapeHTML(day.label)}</span>
        <span class="fd-status">✓ ${day.minutes} min · ${day.sessions} pose${day.sessions === 1 ? "" : "s"}${benefitText}</span>
      </div>`;
  }).join("");
}

function renderBars(weekly) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(1, ...weekly.map(d => d.seconds || 0));
  $("bars").innerHTML = days.map((day, i) => {
    const val = weekly[i]?.seconds || 0;
    const h = Math.max(6, Math.round((val / max) * 100));
    return `<i style="--h:${h}%" data-day="${day}" title="${Math.round(val / 60)} min"></i>`;
  }).join("");
}

function renderAchievements(completedPoses) {
  const list = $("achievementsList");
  const items = [
    { done: completedPoses >= 1, text: "🌱 First Step — Complete your first pose" },
    { done: completedPoses >= 5, text: "✦ Yoga Beginner — Complete 5 poses" },
    { done: completedPoses >= 15, text: "🏅 Dedicated Practitioner — Complete 15 poses" },
    { done: completedPoses >= 26, text: "🌿 Full Circle — Complete all 26 poses" }
  ];
  list.innerHTML = items.map(i => `<p class="${i.done ? "unlocked" : "locked"}">${i.done ? "✓" : "🔒"} ${i.text.replace(/^\S+\s/, "")}</p>`).join("");
}

// ---- Poses ---------------------------------------------------------------
async function loadPoses(search = "") {
  try {
    const data = await api(`/api/poses${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    state.poses = data.poses;
    renderPoses();
  } catch (error) {
    poseGrid.innerHTML = `<div class="glass" style="padding:20px;border-radius:16px">${escapeHTML(error.message)}</div>`;
  }
}

function renderPoses() {
  if (!poseGrid) return;
  // Admins (state.user.isAdmin) get every pose unlocked for free, without
  // ever needing an active paid subscription. Everyone else follows the
  // normal free-pose-1 / premium-poses-2-25 rule, unchanged.
  const active = state.user?.subscriptionStatus || state.user?.isAdmin;
  poseGrid.innerHTML = state.poses.map((pose) => {
    const locked = pose.premium && !active;
    const image = pose.image || "/assets/images/pose-placeholder.svg";
    const completed = state.completedToday.has(pose.poseId);
    return `
      <article class="pose-card">
        <div class="pose-img">
          <img src="${escapeHTML(image)}" alt="${escapeHTML(pose.name)}" loading="lazy">
          <span class="pose-tag ${pose.premium ? "tag-premium" : "tag-free"}">${pose.premium ? "PREMIUM" : "FREE"}</span>
          ${locked ? '<span class="lock">🔒</span>' : ""}
        </div>
        <div class="pose-body">
          <span class="pose-number">POSE ${String(pose.poseId).padStart(2, "0")}</span>
          <h3>${escapeHTML(pose.name)}</h3>
          <div class="pose-benefits">${pose.benefits.map(b => `<span>${escapeHTML(b)}</span>`).join("")}</div>
          ${completed ? `<div class="completed-tag">✓ Completed today</div>` : ""}
          <button class="btn ${locked ? "btn-soft" : "btn-primary"}" data-pose="${pose.poseId}">
            ${locked ? "Unlock Pose" : completed ? "Practice Again" : "Start Pose"} →
          </button>
        </div>
      </article>`;
  }).join("");

  poseGrid.querySelectorAll("[data-pose]").forEach((btn) => {
    btn.addEventListener("click", () => handlePoseClick(Number(btn.dataset.pose)));
  });
}

async function handlePoseClick(poseId) {
  const pose = state.poses.find(p => p.poseId === poseId);
  if (!pose) return;

  const active = state.user?.subscriptionStatus || state.user?.isAdmin;
  if (!pose.premium || active) return openLanguageChooser(pose);

  if (!state.token) {
    showAuth("login");
    $("authMessage").textContent = "Create a free account to unlock premium access.";
    return;
  }

  try {
    const access = await api(`/api/poses/${poseId}/access`);
    if (access.allowed) openLanguageChooser(pose);
    else openPremium();
  } catch (error) {
    showAuth("login");
    $("authMessage").textContent = error.message;
  }
}

// ---- Premium modal + real Razorpay (UPI / Google Pay) payment flow --------
// The subscription belongs to the logged-in account (checked server-side via
// GET /api/subscription/status), not to this device/browser — so Premium
// shows up the same way on any device once the user logs in with the same
// account, and localStorage is never the source of truth for it.
//
// Razorpay Checkout's own popup shows the UPI/Google Pay screen (intent on
// mobile, QR on desktop) — we never render our own QR here. Whatever the
// popup reports is only ever used to trigger a SERVER-SIDE verification
// call; the subscription is unlocked only from that server's response (or
// from the poll below, which itself re-checks with Razorpay's API). The
// webhook in routes/payment.js is the durable backstop if both miss.
let paymentPollTimer = null;

function stopPaymentPolling() {
  if (paymentPollTimer) clearInterval(paymentPollTimer);
  paymentPollTimer = null;
}

function applyConfirmedSubscription(result) {
  state.user.subscriptionStatus = true;
  state.user.subscriptionExpiryDate = result.subscriptionExpiryDate;
  localStorage.setItem("yoga_user", JSON.stringify(state.user));
  $("paymentMessage").style.color = "#159765";
  $("paymentMessage").textContent = "Payment Successful — Premium Active for 30 Days";
  renderPoses();
  setTimeout(() => closeModal("premiumModal"), 1600);
}

function openPremium(motivationText) {
  $("premiumMotivation").textContent = motivationText || "Unlock the remaining 24 poses for 30 days.";
  $("startPayment").style.display = "";
  $("startPayment").disabled = false;
  $("paymentMessage").style.color = "";
  $("paymentMessage").textContent = "";
  showModal("premiumModal");
}

async function startPremiumPayment() {
  if (!state.token) return showAuth("login");
  stopPaymentPolling();
  $("startPayment").disabled = true;
  $("paymentMessage").style.color = "";
  $("paymentMessage").textContent = "Creating your payment request...";

  try {
    const order = await api("/api/payment/create-order", { method: "POST", body: JSON.stringify({}) });

    const checkout = new window.Razorpay({
      key: order.razorpayKeyId,
      order_id: order.razorpayOrderId,
      amount: order.amount,
      currency: order.currency,
      name: "AI Yoga Assistant",
      description: "Premium — 30 days",
      // Only UPI is offered, so "Pay" always means Google Pay/PhonePe/any
      // other UPI app — no cards, netbanking or wallets.
      method: { upi: true, card: false, netbanking: false, wallet: false, paylater: false, emi: false },
      prefill: { email: state.user?.email || "" },
      theme: { color: "#159765" },
      handler: async function (response) {
        // The popup reporting success is NOT trusted by itself — it is only
        // used to ask the backend to verify (which re-checks the
        // cryptographic signature AND asks Razorpay's API directly).
        $("paymentMessage").textContent = "Confirming your payment...";
        try {
          const result = await api("/api/payment/verify", {
            method: "POST",
            body: JSON.stringify({
              orderId: order.orderId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            })
          });
          if (result.status === "SUCCESS") {
            stopPaymentPolling();
            applyConfirmedSubscription(result);
          } else {
            // Signature was fine but Razorpay hadn't marked it captured yet
            // — keep polling, which re-checks with Razorpay directly.
            pollPaymentStatus(order.orderId);
          }
        } catch (error) {
          // Verification call failed (network etc). Don't unlock anything —
          // fall back to polling, which independently re-checks with
          // Razorpay's API, and to the webhook.
          pollPaymentStatus(order.orderId);
        }
      },
      modal: {
        ondismiss: function () {
          // User closed the popup without a success callback. We do NOT
          // mark this as failed — they may have completed the UPI payment
          // on their phone and just closed the window. Poll to find out.
          $("startPayment").disabled = false;
          $("paymentMessage").textContent = "Checking payment status...";
          pollPaymentStatus(order.orderId);
        }
      }
    });

    checkout.on("payment.failed", function () {
      $("paymentMessage").style.color = "#e05252";
      $("paymentMessage").textContent = "Payment failed. Please try again.";
      $("startPayment").disabled = false;
    });

    $("paymentMessage").textContent = "Opening secure payment...";
    checkout.open();
  } catch (error) {
    $("startPayment").disabled = false;
    $("paymentMessage").style.color = "#e05252";
    $("paymentMessage").textContent = error.message;
  }
}

function pollPaymentStatus(orderId) {
  stopPaymentPolling();
  paymentPollTimer = setInterval(async () => {
    try {
      const result = await api(`/api/payment/status/${encodeURIComponent(orderId)}`);
      if (result.status === "SUCCESS") {
        stopPaymentPolling();
        applyConfirmedSubscription(result);
      } else if (result.status === "FAILED") {
        stopPaymentPolling();
        $("paymentMessage").style.color = "#e05252";
        $("paymentMessage").textContent = "Payment failed. Please try again.";
        $("startPayment").style.display = "";
        $("startPayment").disabled = false;
      }
      // PENDING: keep waiting, message already shown.
    } catch {
      // transient network hiccup — keep polling, don't alarm the user
    }
  }, 3000);
}

// ---- Language chooser (shown every time "Start Pose" is clicked) ----------
// The user picks English or Hinglish for the AI voice assistant before the
// camera opens. Their choice is remembered for next time but can always be
// changed again here, or mid-session with the toggle inside the camera view.
function openLanguageChooser(pose) {
  state.pendingPose = pose;
  $("langModalTitle").textContent = T("chooseLanguageTitle", state.language);
  $("langModalSubtitle").textContent = T("chooseLanguageSubtitle", state.language);
  document.querySelectorAll("[data-lang-choice]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langChoice === state.language);
  });
  showModal("langModal");
}

function chooseLanguage(lang) {
  setLanguage(lang);
  closeModal("langModal");
  if (state.pendingPose) {
    const pose = state.pendingPose;
    state.pendingPose = null;
    startPose(pose);
  }
}

function setLanguage(lang) {
  state.language = lang;
  localStorage.setItem("yoga_lang", lang);
  document.querySelectorAll("[data-lang-toggle]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langToggle === lang);
  });
  // Keep the voice-command mic listening in the matching language.
  if (state.voiceCmdEnabled) setVoiceCommandEnabled(true);
}

function showAuth(mode = "login") {
  state.authMode = mode;
  $("nameLabel").classList.toggle("hidden", mode !== "signup");
  $("adminCodeToggle").classList.toggle("hidden", mode !== "signup");
  $("adminCodeRow").classList.add("hidden");
  if ($("authAdminCode")) $("authAdminCode").value = "";
  $("authTitle").textContent = mode === "login" ? "Welcome back" : "Create your account";
  $("authSubmit").textContent = mode === "login" ? "Login" : "Create account";
  document.querySelectorAll("[data-auth-tab]").forEach(b => b.classList.toggle("active", b.dataset.authTab === mode));
  $("authMessage").textContent = "";
  showModal("authModal");
}

async function submitAuth(event) {
  event.preventDefault();
  const mode = state.authMode;
  const body = {
    name: $("authName").value.trim(),
    email: $("authEmail").value.trim(),
    password: $("authPassword").value
  };
  if (mode === "signup") {
    const code = $("authAdminCode")?.value.trim();
    if (code) body.adminCode = code;
  }
  try {
    const data = await api(`/api/auth/${mode === "login" ? "login" : "signup"}`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("yoga_token", state.token);
    localStorage.setItem("yoga_user", JSON.stringify(state.user));
    closeModal("authModal");
    loadCompletedToday();
    await refreshDashboard();
    renderPoses();
  } catch (error) {
    $("authMessage").textContent = error.message;
  }
}

// ---- Voice coaching (bilingual, natural Indian voice) ----------------------
// speechSynthesis.getVoices() loads asynchronously in most browsers, so we
// cache the list once it's ready and re-pick whenever it changes.
if ("speechSynthesis" in window) {
  const refreshVoices = () => { state.voicesCache = window.speechSynthesis.getVoices(); };
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

/**
 * Picks the most natural-sounding available voice for the chosen language.
 * Hinglish text reads best on an Indian voice (native Hindi voice if it can
 * handle Roman script, otherwise an Indian-English voice — both give a
 * natural Indian accent instead of a flat/robotic default voice).
 */
function pickVoice(lang) {
  const voices = state.voicesCache.length ? state.voicesCache : window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const find = (test) => voices.find(test);
  if (lang === "hi") {
    return find(v => v.lang === "hi-IN") ||
           find(v => v.lang?.startsWith("hi")) ||
           find(v => v.lang === "en-IN") ||
           find(v => v.lang?.startsWith("en-IN")) ||
           voices[0];
  }
  return find(v => v.lang === "en-IN") ||
         find(v => v.lang?.startsWith("en-IN")) ||
         find(v => v.lang?.startsWith("en")) ||
         voices[0];
}

function speak(text, { force = false } = {}) {
  $("voiceText").textContent = text || "";
  if (!state.voiceEnabled) return; // AI voice muted — captions still update above, no audio
  if (!("speechSynthesis" in window) || !text) return;
  if (!force && text === state.lastSpokenText) return;
  if (window.speechSynthesis.speaking && !force) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(state.language);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || (state.language === "hi" ? "hi-IN" : "en-IN");
  utterance.rate = 0.96;
  utterance.pitch = 1.03;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  state.lastSpokenText = text;
  state.lastSpokenAt = Date.now();
}

// AI voice on/off toggle — lets the user mute spoken coaching mid-session
// while everything else (tracking, box colors, music) keeps working.
function setVoiceEnabled(enabled) {
  state.voiceEnabled = enabled;
  state.aiGuidanceEnabled = enabled;
  localStorage.setItem("yoga_voice_enabled", String(enabled));
  if (!enabled) window.speechSynthesis?.cancel();
  const btn = $("voiceToggleBtn");
  if (btn) {
    btn.textContent = enabled ? "🔊" : "🔇";
    btn.title = enabled ? "Turn off AI voice" : "Turn on AI voice";
    btn.classList.toggle("muted", !enabled);
  }
}

// ---- Per-pose background music ---------------------------------------------
// Looks for a real audio file first (drop your own mp3/mp4 files into
// /public/assets/audio/ named "pose-<id>.mp3" — see that folder's README).
// If no file is found, a distinct calming ambient pad is generated live in
// the browser for that pose instead, so every pose still gets its own music
// even before real tracks are added.
function startMusic(poseId) {
  const audio = new Audio(`/assets/audio/pose-${poseId}.mp3`);
  audio.loop = true;
  audio.volume = 0.22;
  let usedFallback = false;
  const fallback = () => {
    if (usedFallback) return;
    usedFallback = true;
    startAmbient(poseId);
  };
  audio.addEventListener("error", fallback, { once: true });
  state.music = audio;
  audio.play().catch(fallback);
}

function stopMusic() {
  if (state.music) { state.music.pause(); state.music = null; }
  stopAmbient();
}

// Music pause/resume toggle — independent of the AI voice toggle. Pauses
// whichever is currently playing (real file or generated ambient pad)
// without touching AI speech.
function toggleMusicPause() {
  state.musicPaused = !state.musicPaused;
  state.musicEnabled = !state.musicPaused;
  if (state.musicPaused) {
    state.music?.pause();
    state.ambient?.ctx.suspend().catch(() => {});
  } else {
    state.music?.play().catch(() => {});
    state.ambient?.ctx.resume().catch(() => {});
  }
  const btn = $("musicToggleBtn");
  if (btn) {
    btn.textContent = state.musicPaused ? "▶" : "🎵";
    btn.title = state.musicPaused ? "Resume music" : "Pause music";
    btn.classList.toggle("muted", state.musicPaused);
  }
}

// A pool of pleasant root notes (Hz) spread across poses so each of the 25
// poses gets an audibly different, still-calming ambient tone.
const AMBIENT_ROOTS = [174.61, 196, 220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440, 493.88];

function startAmbient(poseId) {
  try {
    stopAmbient();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const root = AMBIENT_ROOTS[poseId % AMBIENT_ROOTS.length];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.5);
    masterGain.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(masterGain);

    const oscillators = [1, 1.5, 2.01].map((mult, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = root * mult;
      osc.detune.value = (i - 1) * 5;
      osc.connect(filter);
      osc.start();
      return osc;
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    state.ambient = { ctx, oscillators, lfo, masterGain };
  } catch (error) {
    console.warn("Ambient audio unavailable:", error);
  }
}

function stopAmbient() {
  if (!state.ambient) return;
  const { ctx, oscillators, lfo, masterGain } = state.ambient;
  try {
    masterGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    setTimeout(() => {
      oscillators.forEach((o) => { try { o.stop(); } catch {} });
      try { lfo.stop(); } catch {}
      ctx.close();
    }, 600);
  } catch {}
  state.ambient = null;
}

// ---- Camera / session lifecycle -------------------------------------------
async function startPose(pose) {
  state.currentPose = pose;
  state.currentPoseIndex = Math.max(0, state.poses.findIndex(p => p.poseId === pose.poseId));
  state.isYogaRunning = true;
  state.holdSeconds = 0;
  state.holdComplete = false;
  state.scoreSamples = [];
  state.cueRotationIndex = 0;
  state.lastSpokenText = "";
  state.fixedTarget = null;
  state.previewTarget = null;
  state.personDetected = false;
  state.calibrationStreak = 0;
  state.musicPaused = false;
  state.awaitingNextStep = false;

  $("cameraPoseName").textContent = pose.name;
  $("refPoseName").textContent = pose.name;
  $("refCategory").textContent = pose.premium ? "PREMIUM" : "FREE DEMO";
  $("referenceImg").src = pose.image || "/assets/images/pose-placeholder.svg";
  $("refBenefits").innerHTML = pose.benefits.map(b => `<span>${escapeHTML(b)}</span>`).join("");
  const startLine = T("cameraStarting", state.language, pose.name);
  $("voiceText").textContent = startLine;
  $("feedbackBadge").className = "feedback good";
  $("feedbackBadge").textContent = "● Get Ready";
  $("completedBadge").classList.remove("show");
  $("practiceAgainBtn").style.display = "none";
  $("nextPoseBtn").style.display = "none";
  $("finishPose").style.display = "";
  setVoiceEnabled(state.voiceEnabled);
  state.musicPaused = false;
  const musicBtn = $("musicToggleBtn");
  if (musicBtn) { musicBtn.textContent = "🎵"; musicBtn.title = "Pause music"; musicBtn.classList.remove("muted"); }
  updateHoldRing(0);

  showModal("cameraModal");

  // ---- Show the pose's guide structure IMMEDIATELY, before the camera has
  // even been requested and before any person is on screen. This is drawn
  // on a generic anchor (see buildPreviewSkeleton) so it doesn't depend on
  // anyone's live body being visible yet.
  const canvas = $("poseCanvas");
  canvas.width = canvas.clientWidth || 1280;
  canvas.height = canvas.clientHeight || 720;
  state.previewTarget = buildPreviewSkeleton(pose.name, canvas.width, canvas.height);
  startIdlePreviewLoop();

  speak(startLine, { force: true });
  startMusic(pose.poseId);
  await openCamera();
  // Give the person a moment to actually get into the frame/position before
  // real tracking (the red/green box + calibration) kicks in. The guide
  // structure is already visible on the canvas the whole time via the idle
  // preview loop started above — this just delays the live tracking start.
  await runGetReadyCountdown();
  startTimer();
  await initPoseDetection();

  if (isFloorPose(pose.name)) {
    setTimeout(() => speak(T("floorPoseNote", state.language), { force: true }), 4500);
  }
}

// Keeps redrawing the generic guide structure on the canvas while we wait
// for the camera/model to be ready and for a person to actually appear.
// Cancelled the moment trackPose() starts producing real frames.
function startIdlePreviewLoop() {
  cancelAnimationFrame(state.idleRafId);
  const step = () => {
    if (state.personDetected || !$("cameraModal").classList.contains("open")) return;
    const canvas = $("poseCanvas");
    const video = $("cameraVideo");
    if (video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.previewTarget = buildPreviewSkeleton(state.currentPose?.name || "Mountain Pose", canvas.width, canvas.height);
    drawGhostSkeleton(ctx, state.previewTarget);
    state.idleRafId = requestAnimationFrame(step);
  };
  state.idleRafId = requestAnimationFrame(step);
}

async function openCamera() {
  $("cameraStatus").innerHTML = "<i></i> Starting camera...";
  if (!navigator.mediaDevices?.getUserMedia) {
    $("voiceText").textContent = T("cameraNotAvailable", state.language);
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    $("cameraVideo").srcObject = state.stream;
    $("cameraStatus").innerHTML = "<i></i> AI Ready";
  } catch (error) {
    $("voiceText").textContent = T("cameraDenied", state.language);
    $("cameraStatus").innerHTML = "<i></i> Camera blocked";
    speak(T("cameraRequired", state.language), { force: true });
  }
}

// ---- "Get ready" countdown ------------------------------------------------
// Runs once, right after the camera stream is live, before real pose
// tracking starts. Purely visual + spoken; the guide structure underneath
// (idle preview loop) keeps drawing exactly as before throughout.
function runGetReadyCountdown(seconds = 3) {
  return new Promise((resolve) => {
    const overlay = $("countdownOverlay");
    const numberEl = $("countdownNumber");
    const labelEl = $("countdownLabel");
    if (!overlay || !numberEl) { resolve(); return; }

    const stillOpen = () => $("cameraModal").classList.contains("open");
    if (!stillOpen()) { resolve(); return; }

    if (labelEl) labelEl.textContent = T("getIntoPosition", state.language);
    overlay.classList.add("show");
    speak(T("getIntoPosition", state.language), { force: true });

    let n = seconds;
    const showNumber = (value) => {
      numberEl.textContent = value;
      numberEl.classList.remove("pop");
      void numberEl.offsetWidth; // restart the pop animation each tick
      numberEl.classList.add("pop");
    };
    showNumber(n);

    const tick = () => {
      if (!stillOpen()) { overlay.classList.remove("show"); resolve(); return; }
      n--;
      if (n > 0) {
        showNumber(n);
        speak(String(n), { force: true });
        state.countdownTimeout = setTimeout(tick, 1000);
      } else {
        overlay.classList.remove("show");
        resolve();
      }
    };
    state.countdownTimeout = setTimeout(tick, 1000);
  });
}

async function initPoseDetection() {
  /*
    MediaPipe Pose (Tasks Vision) runs fully client-side in the browser.
    It returns 33 body landmarks per frame. Those are compared against this
    pose's guide structure: first the generic pre-shown guide, then (once a
    person is detected and calibration locks) a version scaled to that
    person's own body proportions (see pose-templates.js).
  */
  if (!state.stream) return;
  try {
    if (!state.landmarker) {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      state.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });
    }
    trackPose();
  } catch (error) {
    console.warn("Pose detector setup failed:", error);
    $("voiceText").textContent = T("modelLoadFailed", state.language);
  }
}

function trackPose() {
  const video = $("cameraVideo");
  if (!state.landmarker || !video.videoWidth) {
    state.rafId = requestAnimationFrame(trackPose);
    return;
  }
  try {
    const result = state.landmarker.detectForVideo(video, performance.now());
    processFrame(result?.landmarks?.[0]);
  } catch (error) {
    console.warn(error);
  }
  state.rafId = requestAnimationFrame(trackPose);
}

function landmarksToKeypoints(landmarks, width, height) {
  const kp = {};
  Object.entries(LANDMARK_INDEX).forEach(([name, idx]) => {
    const lm = landmarks[idx];
    if (!lm) return;
    kp[name] = { x: lm.x * width, y: lm.y * height, score: lm.visibility ?? 0.9 };
  });
  return kp;
}

// Builds a red/green box straight from whatever the camera can currently
// see — independent of calibration — so the box appears the instant a
// person is detected, not only once the target has locked.
function computeLiveBoundingBox(kp) {
  const pts = Object.values(kp).filter((p) => p && p.score > 0.35);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY || 1;
  const padX = w * 0.28, padY = h * 0.22;
  return { x: minX - padX, y: minY - padY - h * 0.28, width: w + padX * 2, height: h + padY * 2 + h * 0.28 };
}

function processFrame(landmarks) {
  const canvas = $("poseCanvas");
  const video = $("cameraVideo");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const poseName = state.currentPose?.name || "Mountain Pose";

  // Right after a pose is completed we run a short spoken sequence
  // (Completed! -> benefit -> next step). Tracking/corrections pause during
  // this so the AI isn't talking over itself or restarting the hold timer.
  if (state.awaitingNextStep) {
    if (state.fixedTarget && landmarks) {
      const kp = landmarksToKeypoints(landmarks, canvas.width, canvas.height);
      drawTargetSkeleton(ctx, state.fixedTarget, { good: true, perJoint: {} }, kp);
    } else if (state.fixedTarget) {
      drawGhostSkeleton(ctx, state.fixedTarget);
    }
    return;
  }

  if (!landmarks) {
    // No person yet: keep the guide structure visible (this is the same
    // structure the idle loop was drawing), just with no box on top of it.
    state.personDetected = false;
    state.previewTarget = buildPreviewSkeleton(poseName, canvas.width, canvas.height);
    drawGhostSkeleton(ctx, state.previewTarget);
    setFeedback(false, T("noPersonDetected", state.language));
    tickHold(false);
    return;
  }

  // Person is now visible on camera — this is exactly when the red box
  // should first appear (calibration/matching logic below is unchanged).
  state.personDetected = true;
  cancelAnimationFrame(state.idleRafId);

  const kp = landmarksToKeypoints(landmarks, canvas.width, canvas.height);

  // ---- Calibration: freeze the target skeleton on the first few stable
  // frames, then never move it again for the rest of the session. This
  // gives the user a fixed on-screen anchor to move into, instead of a
  // guide that re-centers itself on their own live position every frame.
  if (!state.fixedTarget) {
    const candidate = buildFixedTargetSkeleton(kp, poseName, canvas.width, canvas.height);
    const liveBox = computeLiveBoundingBox(kp);
    const guide = candidate || buildPreviewSkeleton(poseName, canvas.width, canvas.height);
    drawGhostSkeleton(ctx, guide);
    if (liveBox) drawStatusBox(ctx, liveBox, false); // red — not matched/calibrated yet

    if (candidate) {
      state.calibrationStreak++;
      if (state.calibrationStreak >= CALIBRATION_FRAMES_NEEDED) {
        state.fixedTarget = candidate;
        setFeedback(false, null);
        speak(T("targetLocked", state.language, poseName), { force: true });
      } else {
        setFeedback(false, T("holdStillCalibrating", state.language));
      }
    } else {
      state.calibrationStreak = 0;
      setFeedback(false, T("stepBackShoulders", state.language));
    }
    tickHold(false);
    return;
  }

  const target = state.fixedTarget;
  const result = scorePose(kp, target);
  drawTargetSkeleton(ctx, target, result, kp);

  if (result.notEnoughBody) {
    setFeedback(false, T("stepBackFullBody", state.language));
    tickHold(false);
    return;
  }

  state.scoreSamples.push(result.score);
  if (state.scoreSamples.length > 300) state.scoreSamples.shift();

  if (result.good) {
    // Doing it right: stay completely silent (no AI voice) so we don't
    // disturb/distract the user — the box/skeleton turning green is enough
    // feedback. Music (if any) keeps playing.
    setFeedback(true, null);
  } else {
    // Doing it wrong: look at the ACTUAL live joint angles (elbows, knees,
    // shoulders, hips) this frame and speak a fresh, specific correction —
    // not a line picked from a fixed pre-written list.
    const angleCue = generateAngleCorrection(kp, poseName, state.language);
    const correction = angleCue
      || checkShoulderHipLevel(kp, state.language)
      || generateCorrection(result.perJoint, state.language)
      || T("generalCorrection", state.language);
    setFeedback(false, correction);
  }

  tickHold(result.good);
}

const TARGET_BLUE = "#2f6bff";

// The pre-shown / not-yet-calibrated guide: same shape as the locked target,
// drawn a little softer (dashed, lower opacity) so it visually reads as "a
// guide to move into" rather than "your locked-in live result".
function drawGhostSkeleton(ctx, target) {
  if (!target) return;
  const { targets, shoulderMid, hipMid, headCenter, headRadius } = target;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = TARGET_BLUE;
  const lines = [
    [shoulderMid, targets.left_elbow], [targets.left_elbow, targets.left_wrist],
    [shoulderMid, targets.right_elbow], [targets.right_elbow, targets.right_wrist],
    [shoulderMid, hipMid],
    [hipMid, targets.left_knee], [targets.left_knee, targets.left_ankle],
    [hipMid, targets.right_knee], [targets.right_knee, targets.right_ankle]
  ];
  lines.forEach(([a, b]) => {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.fillStyle = TARGET_BLUE;
  [shoulderMid, hipMid, ...Object.values(targets)].forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  if (headCenter && headRadius) {
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y, headRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// The red/green tracking box drawn around the actually-detected person.
function drawStatusBox(ctx, box, good) {
  const color = good ? "#1fe37a" : "#ff3f52";
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawTargetSkeleton(ctx, target, result, kp) {
  const statusColor = result.good ? "#1fe37a" : "#ff3f52";
  const { targets, shoulderMid, hipMid, headCenter, headRadius, boundingBox } = target;

  // ---- Solid blue target structure: the frozen reference the user moves into.
  ctx.setLineDash([]);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = TARGET_BLUE;
  const lines = [
    [shoulderMid, targets.left_elbow], [targets.left_elbow, targets.left_wrist],
    [shoulderMid, targets.right_elbow], [targets.right_elbow, targets.right_wrist],
    [shoulderMid, hipMid],
    [hipMid, targets.left_knee], [targets.left_knee, targets.left_ankle],
    [hipMid, targets.right_knee], [targets.right_knee, targets.right_ankle]
  ];
  lines.forEach(([a, b]) => {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  });

  // Solid joints (shoulders, hips, elbows, wrists, knees, ankles)
  ctx.fillStyle = TARGET_BLUE;
  const joints = [shoulderMid, hipMid, ...Object.values(targets)];
  joints.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = TARGET_BLUE;
    ctx.lineWidth = 5;
  });

  // Head circle
  if (headCenter && headRadius) {
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y, headRadius, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = TARGET_BLUE;
    ctx.stroke();
  }

  // ---- Outer bounding box: green when aligned, red when adjustment is needed.
  if (boundingBox) {
    ctx.setLineDash([]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = statusColor;
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 14;
    ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height);
    ctx.shadowBlur = 0;
  }

  // Faint live markers so the user can see their actual tracked joints
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  Object.entries(kp).forEach(([name, pt]) => {
    if (pt.score > 0.4) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function setFeedback(good, message) {
  $("feedbackBadge").className = `feedback ${good ? "good" : "bad"}`;
  $("feedbackBadge").textContent = good ? T("greatAlignment", state.language) : T("adjustPosture", state.language);

  // While the pose is being held correctly (green), stay silent — no AI
  // voice at all. Talking during a correct hold is what was disturbing/
  // distracting the user before; the green box + ring is feedback enough.
  // The moment it's wrong (red), speak up with a specific correction.
  if (good) {
    $("voiceText").textContent = T("greatAlignment", state.language);
    return;
  }
  const now = Date.now();
  if (message && now - state.lastSpokenAt > 3500) {
    speak(message, { force: true });
  }
}

function tickHold(isGood) {
  // handled once per second from the timer interval, not per frame
  state._latestGood = isGood;
}

function updateHoldRing(seconds) {
  const ring = $("ringFg");
  const circumference = 2 * Math.PI * 34;
  const pct = Math.min(1, seconds / HOLD_TARGET_SECONDS);
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference * (1 - pct)}`;
  $("holdSeconds").textContent = seconds;
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.elapsed = 0;
  $("timer").textContent = "00:00";
  state.timerInterval = setInterval(() => {
    state.elapsed++;
    const m = String(Math.floor(state.elapsed / 60)).padStart(2, "0");
    const s = String(state.elapsed % 60).padStart(2, "0");
    $("timer").textContent = `${m}:${s}`;

    if (!state.holdComplete) {
      if (state._latestGood) {
        state.holdSeconds = Math.min(HOLD_TARGET_SECONDS, state.holdSeconds + 1);
      } else {
        state.holdSeconds = 0;
      }
      updateHoldRing(state.holdSeconds);
      if (state.holdSeconds >= HOLD_TARGET_SECONDS) {
        onHoldComplete();
      }
    }
  }, 1000);
}

// One or two of the pose's real benefits, phrased as a short spoken line —
// generated from that pose's own data, not a fixed pre-written script.
function buildBenefitLine(pose, lang) {
  const list = (pose?.benefits || []).slice(0, 2);
  if (!list.length) return null;
  const joined = lang === "hi" ? list.join(" aur ") : list.join(" and ");
  return lang === "hi"
    ? `Yeh pose ${joined} jaisi cheezon mein madad karta hai.`
    : `This pose helps with ${joined}.`;
}

function buildEnticementLine(lang) {
  return lang === "hi"
    ? "Agar aap roz yoga karenge, to flexibility, stress relief aur better posture jaisa fayda milega. Baaki 24 poses unlock karne ke liye neeche scan kijiye aur abhi shuru kijiye!"
    : "Practicing daily can improve your flexibility, reduce stress and build better posture. Scan below to unlock all 24 remaining poses and keep going!";
}

function findNextPose() {
  if (!state.currentPose) return null;
  const idx = state.poses.findIndex((p) => p.poseId === state.currentPose.poseId);
  return idx >= 0 ? state.poses[idx + 1] || null : null;
}

// Skips the language chooser (already picked for this session) and goes
// straight into the next pose.
function goToNextPose() {
  const next = findNextPose();
  if (!next) { finishPose(); return; }
  stopCameraSession();
  startPose(next);
}

async function onHoldComplete() {
  state.holdComplete = true;
  state.awaitingNextStep = true; // pause corrections while we speak the completion sequence
  $("completedBadge").classList.add("show");
  $("practiceAgainBtn").style.display = "";
  speak(T("poseCompleted", state.language), { force: true });

  if (state.currentPose) markCompletedToday(state.currentPose.poseId);
  renderPoses();

  let avgScore = 80;
  if (state.token) {
    avgScore = state.scoreSamples.length
      ? Math.round((state.scoreSamples.reduce((a, b) => a + b, 0) / state.scoreSamples.length) * 100)
      : 80;
    try {
      const data = await api("/api/progress/complete", {
        method: "POST",
        body: JSON.stringify({
          poseId: state.currentPose?.poseId,
          poseName: state.currentPose?.name,
          durationSeconds: state.elapsed,
          accuracy: avgScore
        })
      });
      state.user.dailyStreak = data.dailyStreak;
      state.user.completedPoses = data.completedPoses;
      localStorage.setItem("yoga_user", JSON.stringify(state.user));
      refreshDashboard();
    } catch (e) { console.warn(e); }
  }

  const pose = state.currentPose;
  const lang = state.language;
  const active = state.user?.subscriptionStatus || state.user?.isAdmin;

  // ---- Step 2 (~2.2s later): say what this pose is good for -------------
  setTimeout(() => {
    const benefitLine = buildBenefitLine(pose, lang);
    if (benefitLine) speak(benefitLine, { force: true });
  }, 2200);

  // ---- Step 3 (~4.8s later): approach the next step ----------------------
  setTimeout(() => {
    state.awaitingNextStep = false;
    if (active) {
      const next = findNextPose();
      if (next) {
        $("nextPoseBtn").style.display = "";
        speak(
          lang === "hi"
            ? `Bahut badhiya! Chaliye ab ${next.name} try karte hain.`
            : `Great work! Ready to try ${next.name} next?`,
          { force: true }
        );
      }
    } else {
      speak(buildEnticementLine(lang), { force: true });
      openPremium(
        lang === "hi"
          ? "Roz practice se flexibility, stress relief aur better posture milta hai — abhi scan karke baaki 24 poses unlock kijiye."
          : "Daily practice builds flexibility, reduces stress and improves posture — scan now to unlock all 24 remaining poses."
      );
    }
  }, 4800);

  // Ask for a rating after the completion guidance has finished. It is optional,
  // but every submitted rating is stored for the user and visible to admins.
  setTimeout(() => openFeedbackModal(), 5600);
}

function practiceAgain() {
  state.holdSeconds = 0;
  state.holdComplete = false;
  state.awaitingNextStep = false;
  state.scoreSamples = [];
  state.fixedTarget = null;
  state.calibrationStreak = 0;
  state.personDetected = false;
  $("completedBadge").classList.remove("show");
  $("practiceAgainBtn").style.display = "none";
  $("nextPoseBtn").style.display = "none";
  updateHoldRing(0);
  startIdlePreviewLoop();
  speak(T("practiceAgain", state.language), { force: true });
}

function recalibrateTarget() {
  state.fixedTarget = null;
  state.calibrationStreak = 0;
  state.holdSeconds = 0;
  updateHoldRing(0);
  speak(T("recalibrating", state.language), { force: true });
}

function stopCameraSession() {
  state.isYogaRunning = false;
  clearInterval(state.timerInterval);
  cancelAnimationFrame(state.rafId);
  cancelAnimationFrame(state.idleRafId);
  clearTimeout(state.countdownTimeout);
  $("countdownOverlay")?.classList.remove("show");
  if (state.stream) state.stream.getTracks().forEach(track => track.stop());
  stopMusic();
  window.speechSynthesis?.cancel();
}

function finishPose() {
  stopCameraSession();
  closeModal("cameraModal");
}

// ---- Hands-free voice commands ---------------------------------------------
// Independent of the AI's own spoken coaching (that's speak()/voiceEnabled
// above). This is a mic that LISTENS for a few simple commands, so someone
// mid-pose (phone/laptop out of reach) can still control things:
//   "next"                      -> next pose if free, else shows the pay option
//   "mute" / "please mute ..."  -> mutes the AI coaching voice
//   "guide" / "AI on" / "on AI" -> turns the AI coaching voice back on
//   "progress page"             -> jumps to the Progress Dashboard section
//   "home page"                 -> jumps to the Home section
// Toggled on/off with a single floating mic button (#voiceCmdBtn).
let voiceRecognition = null;

function getVoiceRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  if (voiceRecognition) return voiceRecognition;
  voiceRecognition = new SR();
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = false;
  voiceRecognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    const transcript = last?.[0]?.transcript || "";
    handleVoiceCommand(transcript);
  };
  voiceRecognition.onerror = (event) => {
    console.warn("Voice command recognition error:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setVoiceCommandEnabled(false);
    }
  };
  // Browsers auto-stop recognition after a period of silence — restart it
  // automatically as long as the person hasn't turned it off themselves.
  voiceRecognition.onend = () => {
    if (state.voiceCmdEnabled) {
      try { voiceRecognition.start(); } catch { /* already starting */ }
    }
  };
  return voiceRecognition;
}

function handleVoiceNext() {
  // Only meaningful while an actual pose session is open.
  if (!state.currentPose || !$("cameraModal").classList.contains("open")) return;
  const next = findNextPose();
  if (!next) { finishPose(); return; }
  const active = state.user?.subscriptionStatus || state.user?.isAdmin;
  if (next.premium && !active) {
    speak(
      state.language === "hi"
        ? "Agla pose premium hai. Unlock karne ke liye payment kijiye."
        : "The next pose is premium. Please complete payment to unlock it.",
      { force: true }
    );
    openPremium();
  } else {
    goToNextPose();
  }
}

function goToSection(sectionId) {
  document.querySelectorAll(".modal.open").forEach((modal) => {
    if (modal.id === "cameraModal") stopCameraSession();
    closeModal(modal.id);
  });
  const target = $(sectionId); if (target) target.scrollIntoView({ behavior: "smooth" }); else if (sectionId === "dashboard") window.location.href = "/pages/dashboard.html";
}

function normalizeVoiceCommand(rawText) {
  return String(rawText || "")
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function handleVoiceCommand(rawText) {
  const text = normalizeVoiceCommand(rawText);
  if (!text) return;
  console.log("Voice command heard:", text);

  // Check explicit ON/UNMUTE commands BEFORE MUTE, because "unmute" contains "mute".
  if (/\b(unmute|turn on|enable)\b.*\b(ai|assistant|guidance)\b|\b(ai|assistant|guidance)\b.*\b(on|enabled|unmute)\b/.test(text)) {
    setVoiceEnabled(true);
    return;
  }
  if (/\b(mute|turn off|disable)\b.*\b(ai|assistant|guidance)\b|\b(ai|assistant|guidance)\b.*\b(off|muted|mute)\b/.test(text)) {
    setVoiceEnabled(false);
    return;
  }
  if (/\b(unmute|turn on|enable|play)\b.*\bmusic\b|\bmusic\b.*\b(on|enabled|play|unmute)\b/.test(text)) {
    state.musicEnabled = true;
    if (state.musicPaused) toggleMusicPause();
    else { state.music?.play().catch(()=>{}); state.ambient?.ctx.resume().catch(()=>{}); }
    return;
  }
  if (/\b(mute|turn off|stop|pause)\b.*\bmusic\b|\bmusic\b.*\b(off|muted|stop|pause)\b/.test(text)) {
    if (!state.musicPaused) toggleMusicPause();
    else state.musicEnabled = false;
    return;
  }
  if (/^(next|next pose|go next|next post|next yoga pose|move to next)$/.test(text) || text.includes("next pose")) {
    handleVoiceNext();
    return;
  }
  if (/^(previous|previous pose|go back|previous yoga pose)$/.test(text)) {
    const idx = state.currentPoseIndex > 0 ? state.currentPoseIndex - 1 : 0;
    const prev = state.poses[idx];
    if (prev && state.isYogaRunning) { stopCameraSession(); startPose(prev); }
    return;
  }
  if (text.includes("open progress") || text.includes("show progress") || text === "progress") {
    window.location.href = "/pages/progress.html";
    return;
  }
  if (text.includes("open dashboard") || text.includes("show dashboard") || text === "dashboard") {
    window.location.href = "/pages/dashboard.html";
    return;
  }
  if (text.includes("open benefits") || text.includes("show benefits") || text === "benefits") {
    window.location.href = "/pages/benefits.html";
    return;
  }
  if (text === "home" || text.includes("go home") || text.includes("open home") || text.includes("show home")) {
    window.location.href = "/index.html";
    return;
  }
  if (text.includes("start yoga")) {
    if (!state.currentPose && state.poses[0]) openLanguageChooser(state.poses[0]);
    return;
  }
  if (text === "stop yoga" || text === "pause") {
    if (state.isYogaRunning) stopCameraSession();
    return;
  }
  if (text === "resume") {
    if (state.currentPose && !state.isYogaRunning) startPose(state.currentPose);
  }
}

window.handleVoiceCommand = handleVoiceCommand;

function setVoiceCommandEnabled(enabled) {
  const btn = $("voiceCmdBtn");
  const recognition = getVoiceRecognition();
  if (!recognition) {
    state.voiceCmdEnabled = false;
    if (btn) btn.title = "Voice commands are not supported in this browser";
    return;
  }
  state.voiceCmdEnabled = enabled;
  recognition.lang = state.language === "hi" ? "hi-IN" : "en-IN";
  localStorage.setItem("yoga_mic_on", enabled ? "1" : "0");
  if (enabled) {
    try { recognition.start(); } catch { /* already listening */ }
    btn?.classList.add("listening");
    if (btn) btn.title = "Voice commands: ON — say 'next', 'mute AI', 'mute music', 'progress page' or 'home page' (tap to turn off)";
  } else {
    try { recognition.stop(); } catch { /* not listening */ }
    btn?.classList.remove("listening");
    if (btn) btn.title = "Voice commands: OFF (tap to turn on)";
  }
}

// ---- Wiring ---------------------------------------------------------------
// This file is page-scoped: it is loaded only by pages/poses.html.
// Every listener is still guarded so optional controls can be omitted safely.
$("authBtn")?.addEventListener("click", () => state.user ? showModal("dashModal") : showAuth("login"));
$("dashboardBtn")?.addEventListener("click", () => window.location.href = "/pages/dashboard.html");
$("pricingBtn")?.addEventListener("click", () => state.user ? openPremium() : showAuth("signup"));
$("freePlanBtn")?.addEventListener("click", () => $("poseGrid")?.scrollIntoView({ behavior: "smooth" }));
$("demoBtn")?.addEventListener("click", () => state.poses[0] && openLanguageChooser(state.poses[0]));
$("authForm")?.addEventListener("submit", submitAuth);
$("finishPose")?.addEventListener("click", finishPose);
$("practiceAgainBtn")?.addEventListener("click", practiceAgain);
$("recalibrateBtn")?.addEventListener("click", recalibrateTarget);
$("nextPoseBtn")?.addEventListener("click", goToNextPose);
$("voiceToggleBtn")?.addEventListener("click", () => setVoiceEnabled(!state.voiceEnabled));
$("musicToggleBtn")?.addEventListener("click", toggleMusicPause);
$("voiceCmdBtn")?.addEventListener("click", () => setVoiceCommandEnabled(!state.voiceCmdEnabled));
if (localStorage.getItem("yoga_mic_on") === "1") setTimeout(() => setVoiceCommandEnabled(true), 300);

document.querySelectorAll("[data-lang-choice]").forEach((btn) => {
  btn.addEventListener("click", () => chooseLanguage(btn.dataset.langChoice));
});
document.querySelectorAll("[data-lang-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => setLanguage(btn.dataset.langToggle));
});
document.querySelectorAll("[data-admin-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => $("adminCodeRow")?.classList.toggle("hidden"));
});
setLanguage(state.language);

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.close === "cameraModal") stopCameraSession();
    if (btn.dataset.close === "premiumModal") stopPaymentPolling();
    closeModal(btn.dataset.close);
  });
});
document.querySelectorAll("[data-auth-tab]").forEach(btn => btn.addEventListener("click", () => showAuth(btn.dataset.authTab)));
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      if (modal.id === "cameraModal") stopCameraSession();
      if (modal.id === "premiumModal") stopPaymentPolling();
      closeModal(modal.id);
    }
  });
});

let searchTimer;
$("searchInput")?.addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if ($("poseSearch")) $("poseSearch").value = e.target.value;
    loadPoses(e.target.value);
  }, 250);
});
$("poseSearch")?.addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPoses(e.target.value), 250);
});

$("startPayment")?.addEventListener("click", startPremiumPayment);

(async function boot() {
  if (!poseGrid) return;
  loadCompletedToday();
  await refreshDashboard();
  await loadPoses();
  // Home hero "Try Free Pose" opens the existing first/free pose flow.
  if (new URLSearchParams(window.location.search).get("pricing") === "1") {
    setTimeout(() => openPremium(), 200);
  }
  // ---- Home hero pose config -----------------------------------------
  // The hero image on the home page shows a specific pose. If you ever
  // change that photo, just change this ONE name to match the new pose
  // (must exactly match a pose name from seed.js / the pose library).
  const HERO_POSE_NAME = "Lotus Pose";
  if (new URLSearchParams(window.location.search).get("free") === "1") {
    const heroPose = state.poses.find(p => p.name === HERO_POSE_NAME)
      || state.poses.find(p => !p.premium)
      || state.poses[0];
    if (heroPose) setTimeout(() => openLanguageChooser(heroPose), 200);
  }
  if (state.token) {
    try {
      const data = await api("/api/auth/me");
      state.user = data.user;
      localStorage.setItem("yoga_user", JSON.stringify(state.user));
      loadCompletedToday();
      await refreshDashboard();
      renderPoses();
    } catch {
      localStorage.removeItem("yoga_token");
      localStorage.removeItem("yoga_user");
      state.token = null; state.user = null;
    }
  }
})();

// ---- Post-practice rating & feedback --------------------------------------
let selectedRating = 0;
function setRating(value) {
  selectedRating = Number(value) || 0;
  document.querySelectorAll("#ratingStars button").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.rating) <= selectedRating);
  });
  const labels = ["", "We can do better", "Thanks for trying", "Good session", "Great session", "Amazing! ⭐"];
  const label = $("ratingLabel");
  if (label) label.textContent = labels[selectedRating] || "Tap a star to rate";
}
function openFeedbackModal() {
  if (!state.token || !state.currentPose) return;
  selectedRating = 0;
  setRating(0);
  $("feedbackComment") && ($("feedbackComment").value = "");
  $("feedbackMessage") && ($("feedbackMessage").textContent = "");
  showModal("feedbackModal");
}
async function submitSessionFeedback() {
  const message = $("feedbackMessage");
  if (!selectedRating) { if (message) message.textContent = "Please select a star rating."; return; }
  const btn = $("submitFeedbackBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    await api("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        rating: selectedRating,
        comment: $("feedbackComment")?.value || "",
        poseId: state.currentPose?.poseId,
        poseName: state.currentPose?.name || "Yoga Session"
      })
    });
    if (message) { message.style.color = "#159765"; message.textContent = "Thank you! Your feedback was saved."; }
    setTimeout(() => closeModal("feedbackModal"), 700);
  } catch (error) {
    if (message) { message.style.color = "#e05252"; message.textContent = error.message; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Submit Feedback"; }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#ratingStars button").forEach(btn => btn.addEventListener("click", () => setRating(btn.dataset.rating)));
  $("submitFeedbackBtn")?.addEventListener("click", submitSessionFeedback);
  $("skipFeedbackBtn")?.addEventListener("click", () => closeModal("feedbackModal"));
});
