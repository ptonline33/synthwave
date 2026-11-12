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
- **Controls** — key (12 minors), 4 progressions, 3 moods (Dream / Drive / Night), tempo 70–150 BPM, volume, and individual Pad / Bass / Arp / Drums layer switches. Changes apply on the next bar while playing.
- **Seed** — a number that determines the note choices and the visual palette. The same seed always reproduces the same track and scene. **Generate** makes a whole new track (seed, key, progression, mood, tempo); **New seed** changes only the seed.
- **Shareable state** — the full configuration lives in the URL (`?s=…&b=…&k=…`), so **Copy link** shares an exact track.
- **Export** — **WAV (8 bars)** renders offline with `OfflineAudioContext` and downloads a 16-bit WAV; **PNG wallpaper** renders the scene at 1920×1080.

## Keyboard

- `Space` — play / stop
- `G` — generate a new track

## Files

```
index.html              app shell + controls
styles.css              neon control-room theme (light on gradients, dark UI)
audio.js                SynthAudio: engine, voices, scheduler, WAV encoder
visuals.js              SynthVisuals: sunset / grid canvas renderer
app.js                  state, URL sync, UI wiring, render loop
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

- Repository: [github.com/ptonline33/synthwave](https://github.com/ptonline33/synthwave) (branch `main`).
- Vercel project `synthwave` in team `omarchy1`, connected to the GitHub repo: every push to `main` deploys production automatically.
- Static site, no build step. `vercel.json` only adds security headers and `no-cache` for `sw.js`.

## Notes

- Playback needs a user gesture to start audio (browser autoplay policy) — press Play.
- The seed drives musical variation via a small deterministic PRNG seeded per bar, so live playback and offline WAV export produce identical audio.
- Reverb uses a generated noise impulse response and uses `Math.random()`; that affects only the reverb tail, not the seeded notes.
- Regenerate icons with `python3 tools/make-icons.py`.
