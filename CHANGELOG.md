# Changelog

## 2026-11-14 — v4: background-audio crackle fix

- Fixed crackling when the PWA is minimised. The old resync snapped `nextBarTime` back to `now` on every late tick; with hidden-tab timer throttling (~1 s) that scheduled 2.4 s bars roughly 1 s apart, overlapping them into a dense burst. The scheduler now **fast-forwards the missed bar grid** (advancing bar index and time by whole bar durations) and never schedules a note in the past.
- Moved the scheduling clock into a **Web Worker** (Blob-based, `setInterval` fallback) so main-thread canvas work can't delay it.
- Adaptive lookahead: 1.5 s while visible (controls stay responsive), 4.0 s while hidden (survives 1 s throttling). `visibilitychange` fills the deeper buffer immediately; `onstatechange` and visibility regain resume a suspended/interrupted AudioContext with a retry guard.
- Reduced mobile CPU load: reverb impulse 2.6 s → 1.8 s, wave-shaper curve 2048 → 1024 with no oversampling.
- Bumped `sw.js` to `synthwave-v4`.

## 2026-11-14 — v3: Downshift + crackle fix

- Added a fourth **Downshift** mode: a 4s-in / 6s-out breathing ring, a slow tempo ramp toward ~60 BPM, and the Vapor preset with bass/drums muted. Session timer, live BPM readout, trend sparkline and delta from the session baseline.
- Heart-rate input has three tiers: live BLE `0x180D` via `hr.js` (Web Bluetooth, parses 8/16-bit HR Measurement + RR intervals), manual BPM entry, and a no-sensor pacer. Fitbit Inspire 3 users use manual entry — that model has no live HR broadcast, and the legacy Fitbit Web API was turned off on 2026-11-02 (Google Health API scopes are restricted and cloud-based).
- Breathing overlay is excluded from PNG wallpaper exports. Leaving Downshift restores the previous mood, tempo and layer settings.
- Fixed intermittent audio crackling: normalised the 2.6 s reverb impulse, added a soft tanh wave-shaper limiter after the compressor, capped delay feedback at 0.42, lowered master/voice peaks, increased the scheduling lookahead to 0.4 s with a resync guard against late notes, capped canvas drawing at ~40 fps, and serialised rapid play/stop toggles.
- Bumped `sw.js` to `synthwave-v3` and added `hr.js` to the precache.

## 2026-11-14 — v2: more moods + modern visualiser

- Expanded moods from 3 to **8**: Dream, Drive, Night, Sunset, Outrun, Vapor, Chrome, Noir. Each is a full arrangement preset (waveforms, filter cutoff, reverb/delay mix and feedback, pad detune/level, arp density/octave/shimmer, bass pattern, swing, kick/snare tuning) plus a colour tint the visualiser picks up. `setSettings` now also updates delay feedback when the mood changes.
- Rewrote the visualiser as a layered modern scene: drifting aurora blooms, parallax stars with flares, haze bands, a bloom-lit scanline sun with rim light, smoothed ridges, a seeded city skyline with flickering windows, a wet-floor sun reflection, a depth-faded perspective grid, audio-reactive spectrum bars, beat rings, drifting embers, a waveform trace, film grain, cinematic bars and a vignette. Added two palettes (Cobalt, Rose) for six total.
- The analyser now feeds frequency + time-domain data (bass/mid/treble, smoothed energy and beat detection) instead of a single bass number, so the scene reacts in several ways and still animates gently when audio is off.
- HUD now shows the current mood and palette; the mood select is populated from the expanded `MOODS` table automatically.
- Bumped `sw.js` to `synthwave-v2`.

## 2026-11-12 — v1

- Built the Synthwave Generator PWA from scratch: generative Web Audio track engine, reactive canvas sunset/grid visualiser, and a mode switch (Both / Audio only / Visuals only) so audio can be generated without the visuals running.
- Audio engine: 12 minor keys, 4 chord progressions, 3 moods, tempo 70–150 BPM, volume, four layer toggles, detuned pad, filtered bass, delayed arp, synthesised kick/snare/hats, convolution reverb and tempo-synced delay. Seeded per-bar PRNG makes tracks reproducible.
- Offline WAV export (8 bars, 16-bit) via `OfflineAudioContext`, sharing the scheduler with live playback; 1920×1080 PNG wallpaper export.
- Seed + all settings round-trip through the URL for shareable exact tracks.
- PWA: manifest, three generated icons (stdlib-only `tools/make-icons.py`), service worker precache (`synthwave-v1`), install prompt, offline badge, keyboard shortcuts (Space / G).
- Published to GitHub (`ptonline33/synthwave`) and deployed to Vercel (team `omarchy1`) with Git-connected auto-deploys on `main`. Live at `synthwave-omarchy1.vercel.app`; deployment SSO protection disabled. `vercel.json` adds security headers and `no-cache` for the service worker.
