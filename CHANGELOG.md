# Changelog

## 2026-11-12 — v1

- Built the Synthwave Generator PWA from scratch: generative Web Audio track engine, reactive canvas sunset/grid visualiser, and a mode switch (Both / Audio only / Visuals only) so audio can be generated without the visuals running.
- Audio engine: 12 minor keys, 4 chord progressions, 3 moods, tempo 70–150 BPM, volume, four layer toggles, detuned pad, filtered bass, delayed arp, synthesised kick/snare/hats, convolution reverb and tempo-synced delay. Seeded per-bar PRNG makes tracks reproducible.
- Offline WAV export (8 bars, 16-bit) via `OfflineAudioContext`, sharing the scheduler with live playback; 1920×1080 PNG wallpaper export.
- Seed + all settings round-trip through the URL for shareable exact tracks.
- PWA: manifest, three generated icons (stdlib-only `tools/make-icons.py`), service worker precache (`synthwave-v1`), install prompt, offline badge, keyboard shortcuts (Space / G).
- Published to GitHub (`ptonline33/synthwave`) and deployed to Vercel (team `omarchy1`) with Git-connected auto-deploys on `main`. `vercel.json` adds security headers and `no-cache` for the service worker.
