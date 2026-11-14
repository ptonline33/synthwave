/* Synthwave Generator - audio engine.
 * Everything is synthesised with the Web Audio API: no samples, no network,
 * no dependencies. A seed reproduces the same track exactly, and the same
 * scheduling code renders both live playback and offline WAV export. */
(function (global) {
  "use strict";

  const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];           // natural minor
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const PROGRESSIONS = [
    { name: "Night Drive",  degrees: [0, 5, 2, 6] },  // i - VI - III - VII
    { name: "Neon Rain",    degrees: [0, 6, 5, 6] },
    { name: "After Hours",  degrees: [0, 3, 5, 4] },
    { name: "Chrome Coast", degrees: [5, 6, 0, 0] },
  ];

  /* Each mood is a full arrangement preset: waveforms, filter, mix, groove,
   * drum tuning and a colour tint that the visualiser picks up. */
  const MOODS = {
    dream: {
      label: "Dream", cutoff: 1050, padWave: "sawtooth", bassWave: "sawtooth", arpWave: "triangle",
      drumGain: 0.50, reverb: 0.48, delay: 0.34, delayFeedback: 0.38, hatDensity: 0.45,
      padDetune: 9, padLevel: 0.16, arpDensity: 0.72, arpOctave: 0, shimmer: 1,
      bassPattern: [0, 0, 0, 0, 0, 0, 12, 0], swing: 0.06,
      kickStart: 145, kickDecay: 0.36, snareFreq: 1300, snareDecay: 0.24, tint: "#ff9ad0",
    },
    drive: {
      label: "Drive", cutoff: 2700, padWave: "sawtooth", bassWave: "sawtooth", arpWave: "square",
      drumGain: 0.95, reverb: 0.22, delay: 0.20, delayFeedback: 0.30, hatDensity: 1.00,
      padDetune: 6, padLevel: 0.15, arpDensity: 0.90, arpOctave: 0, shimmer: 0,
      bassPattern: [0, 0, 0, 0, 0, 0, 12, 0], swing: 0,
      kickStart: 170, kickDecay: 0.30, snareFreq: 1700, snareDecay: 0.18, tint: "#ff5ea8",
    },
    night: {
      label: "Night", cutoff: 780, padWave: "triangle", bassWave: "square", arpWave: "triangle",
      drumGain: 0.65, reverb: 0.55, delay: 0.48, delayFeedback: 0.46, hatDensity: 0.55,
      padDetune: 12, padLevel: 0.14, arpDensity: 0.55, arpOctave: -12, shimmer: 0,
      bassPattern: [0, 0, 0, 0, 12, 0, 0, 0], swing: 0.10,
      kickStart: 130, kickDecay: 0.40, snareFreq: 1000, snareDecay: 0.28, tint: "#a56bff",
    },
    sunset: {
      label: "Sunset", cutoff: 1800, padWave: "sawtooth", bassWave: "triangle", arpWave: "triangle",
      drumGain: 0.72, reverb: 0.34, delay: 0.28, delayFeedback: 0.34, hatDensity: 0.75,
      padDetune: 7, padLevel: 0.15, arpDensity: 0.80, arpOctave: 0, shimmer: 1,
      bassPattern: [0, 0, 0, 0, 0, 0, 7, 0], swing: 0.04,
      kickStart: 150, kickDecay: 0.33, snareFreq: 1500, snareDecay: 0.22, tint: "#ffae6b",
    },
    outrun: {
      label: "Outrun", cutoff: 3400, padWave: "sawtooth", bassWave: "sawtooth", arpWave: "sawtooth",
      drumGain: 1.00, reverb: 0.18, delay: 0.16, delayFeedback: 0.26, hatDensity: 1.00,
      padDetune: 4, padLevel: 0.13, arpDensity: 1.00, arpOctave: 12, shimmer: 1,
      bassPattern: [0, 0, 12, 0, 0, 0, 12, 0], swing: 0,
      kickStart: 190, kickDecay: 0.26, snareFreq: 2000, snareDecay: 0.16, tint: "#35e6ff",
    },
    vapor: {
      label: "Vapor", cutoff: 900, padWave: "triangle", bassWave: "triangle", arpWave: "sine",
      drumGain: 0.30, reverb: 0.62, delay: 0.50, delayFeedback: 0.50, hatDensity: 0.25,
      padDetune: 14, padLevel: 0.17, arpDensity: 0.38, arpOctave: 12, shimmer: 1,
      bassPattern: [0, 0, 0, 0, 0, 0, 0, 0], swing: 0.14,
      kickStart: 120, kickDecay: 0.45, snareFreq: 900, snareDecay: 0.32, tint: "#8af3ff",
    },
    chrome: {
      label: "Chrome", cutoff: 2200, padWave: "sawtooth", bassWave: "square", arpWave: "square",
      drumGain: 0.95, reverb: 0.42, delay: 0.24, delayFeedback: 0.32, hatDensity: 0.85,
      padDetune: 5, padLevel: 0.15, arpDensity: 0.85, arpOctave: 0, shimmer: 0,
      bassPattern: [0, 0, 0, 12, 0, 0, 12, 0], swing: 0.02,
      kickStart: 165, kickDecay: 0.30, snareFreq: 2200, snareDecay: 0.14, tint: "#ffd36e",
    },
    noir: {
      label: "Noir", cutoff: 700, padWave: "triangle", bassWave: "square", arpWave: "sine",
      drumGain: 0.55, reverb: 0.40, delay: 0.40, delayFeedback: 0.42, hatDensity: 0.35,
      padDetune: 10, padLevel: 0.14, arpDensity: 0.45, arpOctave: -12, shimmer: 0,
      bassPattern: [0, 0, 0, 0, 0, 12, 0, 0], swing: 0.18,
      kickStart: 110, kickDecay: 0.42, snareFreq: 800, snareDecay: 0.30, tint: "#b06bff",
    },
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function scaleNote(root, degree) {
    const oct = Math.floor(degree / 7);
    return root + MINOR[((degree % 7) + 7) % 7] + 12 * oct;
  }
  function chordNotes(root, degree) {
    return [0, 2, 4].map((i) => scaleNote(root, degree + i));
  }

  function chordLabel(s, bar) {
    const prog = PROGRESSIONS[s.progression] || PROGRESSIONS[0];
    const degree = prog.degrees[bar % prog.degrees.length];
    const ch = chordNotes(48 + s.key, degree);
    const third = ((ch[1] - ch[0]) % 12 + 12) % 12;
    const quality = third === 3 ? "m" : third === 4 ? "" : "dim";
    return KEYS[((ch[0] % 12) + 12) % 12] + quality;
  }

  /* ------------------------------ graph ------------------------------ */
  function noiseBuffer(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function impulse(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function buildGraph(ctx, s) {
    const mood = MOODS[s.mood] || MOODS.drive;
    const beat = 60 / s.bpm;

    const master = ctx.createGain();
    master.gain.value = s.volume * 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.8;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);

    const reverbSend = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 2.6, 2.4);
    const wet = ctx.createGain(); wet.gain.value = mood.reverb;
    reverbSend.connect(conv); conv.connect(wet); wet.connect(master);

    const delaySend = ctx.createGain();
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = beat * 0.75;
    const fb = ctx.createGain(); fb.gain.value = mood.delayFeedback;
    const delayOut = ctx.createGain(); delayOut.gain.value = mood.delay;
    delaySend.connect(delay);
    delay.connect(fb); fb.connect(delay);
    delay.connect(delayOut); delayOut.connect(master); delayOut.connect(reverbSend);

    return {
      ctx, master, reverbSend, delaySend, analyser, mood,
      wet, delayOut, delay, fb,
      noise: noiseBuffer(ctx, 1),
    };
  }

  /* ------------------------------ voices ------------------------------ */
  function pad(g, t, freqs, dur) {
    const ctx = g.ctx;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.Q.value = 0.8;
    filt.frequency.setValueAtTime(g.mood.cutoff * 0.55, t);
    filt.frequency.linearRampToValueAtTime(g.mood.cutoff, t + dur * 0.6);
    const lvl = g.mood.padLevel;
    const spread = g.mood.padDetune / 6;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(lvl, t + 0.5);
    amp.gain.setValueAtTime(lvl, t + dur * 0.7);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
    filt.connect(amp); amp.connect(g.master); amp.connect(g.reverbSend);
    freqs.forEach((f, i) => {
      [-6, 6].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = g.mood.padWave;
        o.frequency.value = mtof(f);
        o.detune.value = (det + (i % 2 ? 3 : -3)) * spread;
        o.connect(filt);
        o.start(t); o.stop(t + dur + 1.0);
      });
    });
  }

  function bass(g, t, midi, dur) {
    const ctx = g.ctx;
    const o = ctx.createOscillator(); o.type = g.mood.bassWave; o.frequency.value = mtof(midi);
    const sub = ctx.createOscillator(); sub.type = "sine"; sub.frequency.value = mtof(midi - 12);
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.Q.value = 6;
    filt.frequency.setValueAtTime(1400, t);
    filt.frequency.exponentialRampToValueAtTime(240, t + dur * 0.9);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.24, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(filt); sub.connect(filt); filt.connect(amp); amp.connect(g.master);
    o.start(t); sub.start(t); o.stop(t + dur + 0.02); sub.stop(t + dur + 0.02);
  }

  function arp(g, t, midi, dur, vel) {
    const ctx = g.ctx;
    const decay = Math.min(dur, 0.28);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = Math.max(1400, g.mood.cutoff * 1.6);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.10 * vel, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    filt.connect(amp);
    amp.connect(g.master); amp.connect(g.delaySend); amp.connect(g.reverbSend);
    const notes = g.mood.shimmer ? [[midi, 1], [midi + 12, 0.42]] : [[midi, 1]];
    notes.forEach(([n, level]) => {
      const o = ctx.createOscillator();
      o.type = g.mood.arpWave;
      o.frequency.value = mtof(n);
      const trim = ctx.createGain(); trim.gain.value = level;
      o.connect(trim); trim.connect(filt);
      o.start(t); o.stop(t + decay + 0.02);
    });
  }

  function kick(g, t) {
    const ctx = g.ctx;
    const start = g.mood.kickStart;
    const decay = g.mood.kickDecay;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(start, t);
    o.frequency.exponentialRampToValueAtTime(start * 0.28, t + 0.11);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.9 * g.mood.drumGain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(amp); amp.connect(g.master);
    o.start(t); o.stop(t + decay + 0.02);
  }

  function noiseHit(g, t, dur, type, freq, gain, sendReverb) {
    const ctx = g.ctx;
    const src = ctx.createBufferSource(); src.buffer = g.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq;
    if (type === "bandpass") filt.Q.value = 0.8;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(amp); amp.connect(g.master);
    if (sendReverb) amp.connect(g.reverbSend);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function snare(g, t) {
    const decay = g.mood.snareDecay;
    noiseHit(g, t, decay, "highpass", g.mood.snareFreq, 0.35 * g.mood.drumGain, true);
    const ctx = g.ctx;
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.22 * g.mood.drumGain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.7);
    o.connect(amp); amp.connect(g.master);
    o.start(t); o.stop(t + decay * 0.8);
  }

  function hat(g, t, open) {
    noiseHit(g, t, open ? 0.18 : 0.05, "highpass", 8000,
      (open ? 0.14 : 0.10) * g.mood.drumGain, false);
  }

  /* ------------------------------ one bar ------------------------------ */
  function scheduleBar(ctx, g, s, barIndex, when, rng) {
    const beat = 60 / s.bpm;
    const barDur = beat * 4;
    const prog = PROGRESSIONS[s.progression] || PROGRESSIONS[0];
    const degree = prog.degrees[barIndex % prog.degrees.length];
    const root = 48 + s.key;                              // C3 .. B3
    const chord = chordNotes(root, degree).map((n) => n + 12);
    const bassNote = scaleNote(root, degree) - 12;
    const L = s.layers;

    const M = g.mood;
    const swing = M.swing || 0;

    if (L.pad) pad(g, when, [chord[0], chord[1], chord[2], chord[0] + 12], barDur * 0.95);

    if (L.bass) {
      for (let i = 0; i < 8; i++) {
        const n = bassNote + M.bassPattern[i] + (rng() < 0.12 ? 12 : 0);
        const off = i % 2 ? swing * beat / 2 : 0;
        bass(g, when + i * beat / 2 + off, n, beat * 0.44);
      }
    }

    if (L.arp) {
      const shape = [0, 1, 2, 1, 0, 2, 1, 2];
      const oct = [0, 0, 0, 12, 0, 0, 12, 0];
      for (let i = 0; i < 16; i++) {
        if (rng() > M.arpDensity) continue;
        const idx = shape[i % shape.length];
        const n = chord[idx] + oct[i % oct.length] + 12 + M.arpOctave;
        const off = i % 2 ? swing * beat / 4 : 0;
        arp(g, when + i * beat / 4 + off, n, beat / 4, 0.7 + rng() * 0.5);
      }
    }

    if (L.drums) {
      for (let b = 0; b < 4; b++) {
        kick(g, when + b * beat);
        if (b === 1 || b === 3) snare(g, when + b * beat);
      }
      for (let i = 0; i < 8; i++) {
        const off = i % 2 ? swing * beat / 2 : 0;
        if (rng() < M.hatDensity) hat(g, when + i * beat / 2 + off, i === 7 && rng() < 0.4);
      }
    }
  }

  /* ------------------------------ live engine ------------------------------ */
  class SynthEngine {
    constructor(settings) {
      this.settings = settings;
      this.ctx = null; this.g = null; this.timer = null;
      this.bar = 0; this.nextBarTime = 0;
      this.playing = false; this.onBar = null;
    }
    async play() {
      if (this.playing) return;
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) throw new Error("Web Audio is not supported in this browser.");
      this.ctx = new Ctx();
      // resume() is fire-and-forget: browsers differ on when it resolves, and
      // scheduled audio plays as soon as the context actually starts.
      try {
        const resumed = this.ctx.resume();
        if (resumed && typeof resumed.catch === "function") resumed.catch(() => {});
      } catch (_) {}
      this.g = buildGraph(this.ctx, this.settings);
      this.bar = 0;
      this.nextBarTime = this.ctx.currentTime + 0.08;
      this.playing = true;
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
    }
    tick() {
      if (!this.playing || !this.ctx) return;
      const s = this.settings;
      const barDur = (60 / s.bpm) * 4;
      while (this.nextBarTime < this.ctx.currentTime + 0.15) {
        const rng = mulberry32((s.seed + this.bar * 7919) >>> 0);
        scheduleBar(this.ctx, this.g, s, this.bar, this.nextBarTime, rng);
        if (this.onBar) this.onBar(this.bar, this.nextBarTime);
        this.bar++;
        this.nextBarTime += barDur;
      }
    }
    setSettings(next) {
      const prev = this.settings;
      this.settings = next;
      if (!this.g || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (next.volume !== prev.volume) this.g.master.gain.setTargetAtTime(next.volume * 0.85, now, 0.02);
      if (next.bpm !== prev.bpm) this.g.delay.delayTime.setTargetAtTime((60 / next.bpm) * 0.75, now, 0.05);
      if (next.mood !== prev.mood) {
        const mood = MOODS[next.mood] || MOODS.drive;
        this.g.mood = mood;
        this.g.wet.gain.setTargetAtTime(mood.reverb, now, 0.05);
        this.g.delayOut.gain.setTargetAtTime(mood.delay, now, 0.05);
        this.g.fb.gain.setTargetAtTime(mood.delayFeedback, now, 0.05);
      }
    }
    async stop() {
      this.playing = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      const ctx = this.ctx;
      this.ctx = null; this.g = null;
      if (ctx) { try { await ctx.close(); } catch (_) {} }
    }
    get analyser() { return this.g && this.g.analyser; }
    get currentTime() { return this.ctx ? this.ctx.currentTime : 0; }
  }

  /* ------------------------------ offline WAV ------------------------------ */
  function encodeWav(buf) {
    const nch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const bytes = 44 + len * nch * 2;
    const ab = new ArrayBuffer(bytes);
    const dv = new DataView(ab);
    let p = 0;
    const str = (s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i)); };
    const u32 = (v) => { dv.setUint32(p, v, true); p += 4; };
    const u16 = (v) => { dv.setUint16(p, v, true); p += 2; };
    str("RIFF"); u32(bytes - 8); str("WAVE");
    str("fmt "); u32(16); u16(1); u16(nch); u32(sr); u32(sr * nch * 2); u16(nch * 2); u16(16);
    str("data"); u32(len * nch * 2);
    const chans = [];
    for (let c = 0; c < nch; c++) chans.push(buf.getChannelData(c));
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nch; c++) {
        const v = Math.max(-1, Math.min(1, chans[c][i]));
        dv.setInt16(p, v < 0 ? v * 0x8000 : v * 0x7FFF, true); p += 2;
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }

  async function renderWav(settings, bars) {
    const sr = 44100;
    const barDur = (60 / settings.bpm) * 4;
    const total = bars * barDur + 3.0;               // room for reverb tail
    const OCtx = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OCtx) throw new Error("Offline rendering is not supported.");
    const ctx = new OCtx(2, Math.ceil(sr * total), sr);
    const g = buildGraph(ctx, settings);
    for (let b = 0; b < bars; b++) {
      const rng = mulberry32((settings.seed + b * 7919) >>> 0);
      scheduleBar(ctx, g, settings, b, 0.02 + b * barDur, rng);
    }
    return encodeWav(await ctx.startRendering());
  }

  global.SynthAudio = {
    SynthEngine, renderWav, chordLabel,
    KEYS, PROGRESSIONS, MOODS,
  };
})(window);
