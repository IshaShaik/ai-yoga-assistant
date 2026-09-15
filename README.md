# AI Yoga Assistant

A responsive AI-style yoga web app using:

- Frontend: HTML5 + modern CSS + Vanilla JavaScript
- AI pose estimation: TensorFlow.js MoveNet in the browser
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Authentication: JWT + bcrypt
- Camera: `navigator.mediaDevices.getUserMedia`
- Voice: HTML5 SpeechSynthesis
- Freemium: Pose #1 free, poses #2–25 premium
- Subscription duration: 30 days

## 1. Requirements

Install Node.js 18+ and create a MongoDB Atlas database (or local MongoDB).

## 2. Install

```bash
npm install
```

## 3. Environment

Copy `.env.example` to `.env` and set:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
DEMO_PAYMENT_VERIFICATION=true
```

`DEMO_PAYMENT_VERIFICATION=true` is only for local UI testing. It is NOT a real payment verification system.

## 4. Seed the 25 poses

```bash
npm run seed
```

## 5. Start

```bash
npm run dev
```

Open:

`http://localhost:5000`

Camera permissions work reliably on `localhost` and HTTPS. Do not open `index.html` with `file://`.

## 6. Add your images later

Replace these files in `public/assets/images/` or change the `image` field in MongoDB:

- `hero-yoga.png` — main hero image
- `pose-placeholder.svg` — temporary pose image

The 25 pose records are seeded with the placeholder. You can later update each record's `image` path to your own image.

## 7. Per-pose music

See `public/assets/audio/README.md` for full instructions. Short version: drop
`pose-1.mp3` ... `pose-25.mp3` into `public/assets/audio/`, matching each
pose's `poseId`. Any pose without a file gets a distinct, calming ambient
tone generated live in the browser instead, so the app never goes silent.

## 8. Bilingual (English / Hinglish) AI voice assistant

Every time someone clicks **Start Pose**, a small chooser pops up asking for
English or Hinglish. That choice controls:

- The spoken coaching cues (`cues` / `cuesHi` in `pose-templates.js`).
- All on-screen/voice status messages (`public/js/i18n.js`).
- Which `speechSynthesis` voice is used — `pickVoice()` in `app.js` prefers
  an Indian voice (`hi-IN` for Hinglish, `en-IN` for English) for a natural
  Indian accent, falling back to whatever voices the browser/OS provides.

The language can also be switched mid-session with the **EN / हिं** toggle
in the camera header. Available voices depend on the user's browser and OS —
Chrome on Windows/Android usually ships several Indian voices out of the box.

## 9. Admin access (free for you, paid for everyone else)

Set `ADMIN_ACCESS_CODE` in your `.env` (already pre-filled in
`.env.example` with a working default — change it before letting anyone
else near this app). Then, on the **Create account** tab, click **"Have an
admin access code?"** and enter that exact code. That account gets every
one of the 25 poses for free, forever, without ever needing to pay —
`isAdmin: true` on the `User` model overrides the subscription check
(`hasActiveSubscription()` in `models/User.js`). Every other account still
follows the normal rule: pose #1 free, poses #2–25 require an active
subscription.

## 10. Real PhonePe payment

Do not unlock production subscriptions simply because a user typed a Transaction ID.

For production:
1. Create a payment order on your backend.
2. Send the user to the official PhonePe checkout/UPI flow.
3. Verify the payment server-side with PhonePe's official APIs/webhooks.
4. Only after a successful server-side verification, set:
   - `subscriptionStatus = true`
   - `subscriptionExpiryDate = now + 30 days`
5. Keep merchant credentials only in `.env`, never in frontend JavaScript.

The included `/api/subscription/verify` endpoint is deliberately a demo/manual placeholder.

## 11. MediaPipe Pose (Tasks Vision)

This version uses **MediaPipe Pose Landmarker** (`@mediapipe/tasks-vision`, loaded from a CDN as an ES module inside `public/js/app.js`). It runs fully in the browser — no video is ever uploaded — and returns 33 body landmarks per frame (vs. MoveNet's 17), which gives noticeably better tracking of elbows, knees and ankles.

Because it's loaded as an ES module, `public/index.html` loads the app with `<script type="module" src="/js/app.js">`. If you ever need to go back to TensorFlow.js MoveNet, swap the `PoseLandmarker` calls in `public/js/app.js` back to `pose-detection`, and keep the same canvas-overlay approach.

## 12. How the pre-shown guide structure, live tracking box, and 25-second hold work

This is the core interaction flow, redesigned so the guide always shows the
shape of the pose immediately — camera or no camera, person detected or not:

1. **The instant "Start Pose" is clicked** (before the camera is even
   requested), `buildPreviewSkeleton()` in `pose-templates.js` draws that
   pose's guide structure on a generic, fixed anchor — not scaled to any
   real person, since none has been detected yet. All 25 poses have their
   own distinct shape here (via the `arms`/`legs` presets in
   `POSE_LIBRARY`), including seated/floor poses, which are anchored a
   little lower in the frame.
2. **Camera turns on**, and this same guide structure keeps showing —
   nothing changes until a person is actually detected.
3. **The moment a person is detected** by MediaPipe, a bounding box appears
   around them for the first time — starting **red** — computed straight
   from their live landmarks (`computeLiveBoundingBox()` in `app.js`).
4. Behind the scenes, the app keeps calibrating: once a handful of stable
   frames pass, it freezes a version of the same guide scaled to that
   person's own shoulder width and torso length (`buildFixedTargetSkeleton()`
   — this part of the logic is unchanged from before).
5. **After that**, the matching logic is exactly as it always was: every
   frame, the person's tracked joints are compared to the frozen target. If
   enough of them are close enough, the box turns **green**; otherwise it
   stays **red** and the app gives one spoken correction for the single
   most-off joint.
6. Seconds only accumulate while the box is green. Break the pose and the
   counter resets. Reach **25 continuous seconds** and the pose is marked
   complete, exactly as before.

**Honest limitation:** the per-pose target offsets in `pose-templates.js`
are reasonable hand-authored approximations, not motion-captured
biomechanical data, and they work best for standing poses viewed from the
front. Floor/seated poses (Cobra, Bridge, Plank, Child's Pose, Cat-Cow,
Boat, Side Plank, Seated Forward Bend, Pigeon, Crow, Corpse) are inherently
harder to verify from a front-facing standing webcam — the app tells the
user this when they open one of those poses and still tracks a best-effort
guide. For production-grade accuracy per pose, replace the offset tables
with real joint-angle rules calibrated from motion-capture or expert-
reviewed reference video.

## 14. Real-time, angle-based dynamic AI coaching (not fixed scripts)

Instead of speaking from a fixed list of sentences, the AI now calculates
real joint angles (elbow, knee, shoulder, hip) from the live camera feed
every frame and compares them to that pose's own ideal angles — derived
geometrically from the same arm/leg presets that draw the guide skeleton,
so there's nothing to hand-author or keep in sync. See
`generateAngleCorrection()` in `public/js/pose-templates.js` and where it's
called in `processFrame()` in `public/js/app.js`.

**Voice behavior**, tuned to feel like a real trainer instead of a nagging
app:
- **Pose correct (green box):** the AI stays completely silent. No repeated
  "good job" lines — the green box/ring is feedback enough.
- **Pose incorrect (red box):** the AI speaks a fresh correction based on
  exactly which joint is off and by how much (e.g. "Bend your right knee a
  little more").
- **Hold complete:** "Completed!" → ~2s later, one line about what that
  pose is good for (from its real `benefits` list) → ~2.5s later, either a
  "Next Pose" prompt (if the user has full access) or a warm, benefit-led
  pitch that opens the Premium modal with a real scan-to-pay QR code (if
  they don't).
- A 🔊/🔇 button in the camera header mutes/unmutes the AI voice entirely,
  independent of a separate 🎵 button that pauses/resumes that pose's
  music — both can be toggled anytime mid-session.

## 15. Real scan-to-pay UPI QR code

Set `UPI_ID`, `UPI_PAYEE_NAME` and `PREMIUM_PRICE` in your `.env`. The
Premium modal then renders an actual QR code (via the `qrcode` library,
loaded from a CDN) encoding a standard `upi://pay` deep link — scanning it
with any UPI app (PhonePe, GPay, Paytm...) opens a pre-filled payment
screen. No payment-gateway account is required just to show the QR; you
still need to connect a real verification flow (see `routes/subscription.js`)
before accepting real money.

## 16. Personal daily feedback ("Your Feedback" panel)

The dashboard now includes a feedback panel (`GET /api/progress/summary`'s
new `feedback` field, built in `routes/progress.js`) showing:
- A friendly message about today's practice (or a nudge to start).
- One improvement tip.
- A day-by-day list for the last 14 days: practiced days show minutes +
  real benefits from the poses done that day; days with no practice are
  shown in **yellow** as "You just miss the today yoga".

## 17. Real progress dashboard

The dashboard (`#dashboard` section and the `My Dashboard` quick-view modal) is backed by real per-user data, not placeholders:

- `models/User.js` stores a `history` array (one entry per completed pose: pose id/name, duration, accuracy, timestamp) and a running `totalPracticeSeconds`.
- `routes/progress.js` exposes `GET /api/progress/summary`, which returns the real completed-pose count, day streak, total practice minutes, a rolling average accuracy (last 20 sessions), and real second-by-second totals for the last 7 calendar days — this is what draws the weekly bar chart.
- The frontend re-fetches this summary right after login and right after every completed pose, so the numbers you see always reflect that logged-in user's own practice.

## Suggested next production upgrades

- Admin dashboard for approving payments
- Real PhonePe payment API/webhook
- Per-pose joint-angle calibration from real motion-capture or expert video, especially for floor poses
- Side-camera mode/prompt for floor poses
- User-facing history/calendar view (the data already exists in `User.history`)
- Secure rate limiting, validation and helmet/cors policy
- HTTPS deployment
# AI Yoga Assistant 🧘‍♀️

> An intelligent, real-time AI-powered yoga posture guidance, voice coaching, and progress tracking web application.

- **Live Application:** [https://ai-yoga-assistant-1.onrender.com/](https://ai-yoga-assistant-1.onrender.com/)
- **Creator & Developer:** **Isha Shaik**
- **Domain:** AI & Computer Vision Healthcare / Fitness

---

## 🌟 About the Project

**AI Yoga Assistant** is designed and developed by **Isha Shaik** to make home yoga practice safe, accurate, and accessible. Using browser-based computer vision and pose classification models, the application analyzes real-time video feed to detect posture alignment, delivers spoken audio coaching cues, and tracks user consistency across sessions.

### Key Features
- **Real-Time Pose Analysis:** Uses computer vision models to evaluate key body joint coordinates and posture angles.
- **Voice Guidance:** Spoken cues to correct alignment during poses.
- **Interactive Dashboard:** Tracks practice consistency, pose mastery, and workout history.
- **Responsive Interface:** Modern, glassmorphism-styled UI optimized across mobile and desktop devices.

---

## 🛠️ Built With

- **Computer Vision & AI:** MediaPipe Pose Detection, TensorFlow.js
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **Frontend:** HTML5, CSS3, Modern JavaScript
- **Hosting & Deployment:** Render

---

## 👩‍💻 Author & Contact

- **Created by:** Isha Shaik
- **Website:** https://ai-yoga-assistant-1.onrender.com/