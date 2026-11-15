# Synthwave Generator

An offline-first PWA that generates endless synthwave tracks and neon sunset scenes in the browser. No samples, no network calls, no dependencies — every sound is synthesised with the Web Audio API and every pixel is drawn on a canvas.

**Three modes** (switch in the header):

| Mode | Audio | Visuals |
| --- | --- | --- |
| **Both** (default) | yes | yes, reactive to the music |
| **Audio only** | yes | canvas hidden entirely, so the animation costs nothing |
| **Visuals only** | off | ambient animation, play button disabled |

Audio and visuals are otherwise independent: you can leave it running as a quiet generator, or just use it as a wallpaper maker.

## What it generates

- **Music** — a repeating chord progression with a detuned pad, a pulsing bass, a 16th-note arpeggio, and a four-on-the-floor drum kit. Kick, snare and hats are synthesised from oscillators and filtered noise; the pad and arp go through a generated convolution reverb and a tempo-synced feedback delay.
- **8 moods** — Dream, Drive, Night, Sunset, Outrun, Vapor, Chrome, Noir. Each is a full arrangement preset: waveforms, filter cutoff, reverb/delay mix, pad detune, arp density and octave, bass pattern, swing, kick/snare tuning and a colour tint for the visualiser. Switching mood applies on the next bar while playing.
- **Controls** — key (12 minors), 4 progressions, 8 moods, tempo 70–150 BPM, volume, and individual Pad / Bass / Arp / Drums layer switches. Changes apply on the next bar while playing.
- **Seed** — a number that determines the note choices and the visual palette. The same seed always reproduces the same track and scene. **Generate** makes a whole new track (seed, key, progression, mood, tempo); **New seed** changes only the seed.
- **Visualiser** — a layered neon sunset: aurora blooms, parallax stars, a scanline sun with bloom and rim light, distant ridges, a seeded city skyline with flickering windows, a wet-floor sun reflection, a depth-faded perspective grid, plus audio-reactive spectrum bars, beat rings, drifting embers and a waveform trace. Finished with film grain, cinematic bars and a vignette. Six palettes; the current mood tints the grid and glow.
- **Shareable state** — the full configuration lives in the URL (`?s=…&b=…&k=…`), so **Copy link** shares an exact track.
- **Export** — **WAV (8 bars)** renders offline with `OfflineAudioContext` and downloads a 16-bit WAV; **PNG wallpaper** renders the scene at 1920×1080.

## Downshift (calm session)

A fourth mode that uses the generator as a relaxation tool: a **4s-in / 6s-out breathing ring** (~6 breaths/min), a slow tempo ramp toward ~60 BPM, and the Vapor preset with bass and drums muted.

Three heart-rate input tiers, best available wins:

1. **Live BLE HR** — standard Heart Rate Service (`0x180D` / `0x2A37`) via Web Bluetooth. Shows live BPM, a trend sparkline, delta from the session start, and drives the music slower as your HR falls. Needs Chrome/Edge over HTTPS and a sensor that broadcasts standard HR.
2. **Manual BPM** — type the number off your wrist. This is the practical bridge for a **Fitbit Inspire 3**: it has continuous HR tracking but no live HR broadcast (Google's HR Sharing list is Fitbit Air/Edge, Charge 6 and Pixel Watch 2+), and the legacy Fitbit Web API was switched off on 2 Nov 2026.
3. **No sensor** — breathing pacer + tempo ramp alone. Works everywhere, including iOS.

Relaxation support only, not a medical device. No HR data leaves the device; nothing is uploaded.

## Audio quality

The engine uses a soft tanh limiter, a normalised convolution reverb IR, capped delay feedback and lower voice peaks so dense bars never hit 0 dBFS. Every percussive voice has a 3-4 ms attack ramp, so no voice starts on a step discontinuity (an instant jump onto a random noise sample was the source of the remaining clicks).

Scheduling is driven by an **AudioWorkletProcessor** running on the audio rendering thread, not a JS timer. Browsers clamp `setInterval` — even in a Web Worker — to >=1 s (sometimes 1/min) when the tab is hidden, which starves the scheduler. Audio-thread ticks are delivered by the main thread's event loop instead. Worker and interval clocks remain as fallbacks, with a 12 s hidden lookahead so they cannot starve either. Missed bars are **fast-forwarded on the grid** rather than snapped to "now", so throttled tabs never overlap bars.

Playback uses `latencyHint: "playback"` for larger, underrun-resistant buffers on mobile, resumes a suspended or interrupted context even while minimised (mobile audio focus), and does no canvas work at all when `document.hidden`. The reverb impulse is kept short (1.2 s) for mobile CPUs.

## Keyboard

- `Space` — play / stop
- `G` — generate a new track

## Files

```
index.html              app shell + controls
styles.css              neon control-room theme (light on gradients, dark UI)
audio.js                SynthAudio: engine, voices, scheduler, WAV encoder
visuals.js              SynthVisuals: layered reactive canvas visualiser
hr.js                   SynthHR: Web Bluetooth Heart Rate Service reader
app.js                  state, URL sync, Downshift session, render loop
sw.js                   offline precache (synthwave-v1)
manifest.webmanifest    install metadata
icons/                  192, 512 and maskable 512 PNGs
tools/make-icons.py     dependency-free icon generator (stdlib only)
```

## Run it

No build step:

```bash
cd /home/ubuntu/synthwave
python3 -m http.server 8080
# open http://localhost:8080
```

Install it from the browser menu (or the **Install app** button when the browser offers it). Once installed it works with no connection.

## Deployment

**Live:** <https://synthwave-omarchy1.vercel.app>

- Repository: [github.com/ptonline33/synthwave](https://github.com/ptonline33/synthwave) (branch `main`).
- Vercel project `synthwave` in team `omarchy1`, connected to the GitHub repo: every push to `main` deploys production automatically. Deployment SSO protection is disabled so the app is public.
- The short `synthwave.vercel.app` belongs to someone else, so the team-scoped alias is the production URL.
- Static site, no build step. `vercel.json` only adds security headers and `no-cache` for `sw.js`.

## Notes

- Playback needs a user gesture to start audio (browser autoplay policy) — press Play.
- The seed drives musical variation via a small deterministic PRNG seeded per bar, so live playback and offline WAV export produce identical audio.
- Reverb uses a generated noise impulse response and uses `Math.random()`; that affects only the reverb tail, not the seeded notes.
- Regenerate icons with `python3 tools/make-icons.py`.
