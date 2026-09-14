# Per-pose music

The app plays a different background track for every pose during a camera
session. To add your own music:

1. Get an MP3 (or MP4 audio) file for each pose you want music for. Use
   music you own the rights to, or a royalty-free / licensed-for-use track
   (e.g. from a royalty-free music library) — do not use copyrighted songs
   you don't have a license for.
2. Name each file **exactly** `pose-<poseId>.mp3`, matching the pose's
   `poseId` from `seed.js` (1 = Mountain Pose, 2 = Tree Pose, ... 25 =
   Goddess Pose).
3. Drop the files straight into this folder:
   `public/assets/audio/pose-1.mp3`
   `public/assets/audio/pose-2.mp3`
   ...
   `public/assets/audio/pose-25.mp3`

That's it — no code changes needed. `app.js` automatically looks for
`/assets/audio/pose-<id>.mp3` when a session starts.

## What happens if a file is missing?

No file for a pose yet? The app doesn't go silent — it generates a soft,
calming ambient pad live in the browser for that pose instead (a different,
gentle tone for each of the 25 poses), so every pose still has its own
music from day one. Once you add the real file with the matching name, the
app switches to that file automatically and stops using the generated tone.

## Video (mp4) instead of audio?

If you'd rather use `.mp4` files (audio-only or with a black video track),
rename this pattern in `startMusic()` in `public/js/app.js`:
```js
const audio = new Audio(`/assets/audio/pose-${poseId}.mp3`);
```
to:
```js
const audio = new Audio(`/assets/audio/pose-${poseId}.mp4`);
```
Browsers play the audio track of an `.mp4` fine through the `<audio>`
element as long as it has an audio stream.
