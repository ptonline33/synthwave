/* Synthwave Generator - canvas visualiser.
 * A layered neon sunset: atmospheric sky, bloom, scanline sun, skyline,
 * wet-floor reflection, perspective grid, spectrum bars, beat rings, drifting
 * embers, a waveform trace and film grain. The same draw() is used for live
 * (analyser-driven) animation and for high-resolution PNG export. */
(function (global) {
  "use strict";

  const PALETTES = [
    { name: "Magenta", skyTop: "#0b0626", skyMid: "#3d1059", skyLow: "#d12a72", sunTop: "#ffe19a", sunBot: "#ff2d78", grid: "#ff3fa4", glow: "#ff5ea8", mountain: "#1c0b38", ground: "#0b051c", city: "#160a30", haze: "#ff69b4" },
    { name: "Sunset",  skyTop: "#08132e", skyMid: "#164a72", skyLow: "#ef5f35", sunTop: "#fff0b4", sunBot: "#ff6a2b", grid: "#27d7ff", glow: "#ff9a55", mountain: "#0a1a36", ground: "#06111f", city: "#08162c", haze: "#ffb066" },
    { name: "Violet",  skyTop: "#0d0626", skyMid: "#301a75", skyLow: "#7a35df", sunTop: "#a6f4ff", sunBot: "#b14bff", grid: "#57e6ff", glow: "#a56bff", mountain: "#160a38", ground: "#0a0520", city: "#130732", haze: "#b980ff" },
    { name: "Mint",    skyTop: "#04121a", skyMid: "#0b4148", skyLow: "#209a80", sunTop: "#dcffe4", sunBot: "#31d6a8", grid: "#57ffd1", glow: "#5ce0b0", mountain: "#062028", ground: "#03131a", city: "#051c24", haze: "#6fffd0" },
    { name: "Cobalt",  skyTop: "#050b2c", skyMid: "#123a86", skyLow: "#3f7fe8", sunTop: "#d8ecff", sunBot: "#4a8dff", grid: "#6ad6ff", glow: "#7fa8ff", mountain: "#0a1338", ground: "#040a20", city: "#0a1230", haze: "#82b6ff" },
    { name: "Rose",    skyTop: "#170620", skyMid: "#5b123f", skyLow: "#f0477f", sunTop: "#ffe0c2", sunBot: "#ff4f8b", grid: "#ff9ec4", glow: "#ff77ad", mountain: "#210a2c", ground: "#120618", city: "#1b0826", haze: "#ff8fbb" },
  ];

  function hex(c) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class VisualRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.t = 0; this.w = 0; this.h = 0; this.dpr = 1; this.bpm = 104;
      this.tint = hex("#ff5ea8");
      this.freq = null; this.wave = null;
      this.sm = { bass: 0, mid: 0, treble: 0, energy: 0 };
      this.pulse = 0; this.lastBass = 0; this.lastBeat = 0;
      this.a = { energy: 0, bass: 0, mid: 0, treble: 0, pulse: 0, freq: null, wave: null };
      this.makeGrain();
      this.setSeed(1);
    }

    makeGrain() {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const cx = c.getContext("2d");
      const img = cx.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 90 + Math.random() * 165;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 16;
      }
      cx.putImageData(img, 0, 0);
      this.grain = c;
    }

    setMood(mood) {
      if (mood && mood.tint) this.tint = hex(mood.tint);
    }

    setSeed(seed) {
      this.seed = seed;
      this.palette = PALETTES[Math.abs(seed) % PALETTES.length];
      const r = rng(seed >>> 0);

      this.stars = [];
      for (let i = 0; i < 150; i++) {
        this.stars.push({
          x: r(), y: r() * 0.56, s: 0.5 + r() * 1.5,
          p: r() * Math.PI * 2, b: 0.2 + r() * 0.7, depth: 0.3 + r() * 0.7,
          flare: r() < 0.06,
        });
      }

      this.ridges = [];
      for (let layer = 0; layer < 2; layer++) {
        const pts = [];
        const n = 34;
        let v = 0.35 + r() * 0.25;
        for (let i = 0; i <= n; i++) {
          v += (r() - 0.5) * 0.14;
          v = Math.max(0.12, Math.min(0.85, v));
          pts.push(v);
        }
        this.ridges.push({ pts, height: layer === 0 ? 0.20 : 0.11, shade: layer });
      }

      this.buildings = [];
      let bx = -0.02;
      while (bx < 1.02) {
        const bw = 0.018 + r() * 0.035;
        const bh = 0.035 + r() * 0.11;
        const wins = [];
        const cols = Math.max(1, Math.floor(bw * 60));
        const rows = Math.max(1, Math.floor(bh * 90));
        for (let c = 0; c < cols; c++) {
          for (let rr = 0; rr < rows; rr++) {
            if (r() < 0.34) wins.push([(c + 0.5) / cols, (rr + 0.5) / rows]);
          }
        }
        this.buildings.push({ x: bx, w: bw, h: bh, wins, spire: r() < 0.16 });
        bx += bw + 0.004 + r() * 0.012;
      }

      this.embers = [];
      for (let i = 0; i < 38; i++) {
        this.embers.push({ x: r(), y: r(), s: 0.6 + r() * 1.8, sp: 0.02 + r() * 0.06, ph: r() * 6.28 });
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ------------------------------ audio analysis ------------------------------ */
    analyse(analyser, t) {
      const a = this.a;
      let raw;
      if (analyser) {
        if (!this.freq || this.freq.length !== analyser.frequencyBinCount) {
          this.freq = new Uint8Array(analyser.frequencyBinCount);
          this.wave = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteFrequencyData(this.freq);
        analyser.getByteTimeDomainData(this.wave);
        const band = (lo, hi) => {
          let s = 0;
          const n = Math.max(1, Math.min(this.freq.length, hi) - lo);
          for (let i = lo; i < Math.min(this.freq.length, hi); i++) s += this.freq[i];
          return s / (n * 255);
        };
        raw = { bass: band(0, 8), mid: band(8, 48), treble: band(48, 120),
                energy: band(0, 8) * 0.55 + band(8, 48) * 0.35 + band(48, 120) * 0.2,
                freq: this.freq, wave: this.wave };
      } else {
        const f = new Uint8Array(64), wv = new Uint8Array(256);
        for (let i = 0; i < f.length; i++) {
          f[i] = Math.max(0, 48 + 34 * Math.sin(t * 1.6 + i * 0.34) + 22 * Math.sin(t * 0.7 + i * 0.12));
        }
        for (let i = 0; i < wv.length; i++) {
          wv[i] = 128 + 20 * Math.sin(i * 0.075 + t * 2.1) * Math.sin(i * 0.018 + t * 0.5);
        }
        raw = { bass: 0.12 + 0.05 * Math.sin(t * 1.1), mid: 0.10 + 0.04 * Math.sin(t * 0.7 + 1.2),
                treble: 0.07 + 0.03 * Math.sin(t * 1.9 + 2.1), energy: 0.12, freq: f, wave: wv };
      }
      for (const k of ["bass", "mid", "treble", "energy"]) {
        this.sm[k] += (raw[k] - this.sm[k]) * 0.18;
        a[k] = Math.max(0, Math.min(1, this.sm[k]));
      }
      if (a.bass > 0.27 && a.bass > this.lastBass + 0.05 && t - this.lastBeat > 0.22) {
        this.pulse = 1; this.lastBeat = t;
      }
      this.lastBass = a.bass;
      this.pulse *= 0.90;
      a.pulse = this.pulse;
      a.freq = raw.freq; a.wave = raw.wave;
      return a;
    }

    synthetic(t) {
      const f = new Uint8Array(64), wv = new Uint8Array(256);
      for (let i = 0; i < f.length; i++) {
        f[i] = Math.max(0, 58 + 38 * Math.sin(t + i * 0.34) + 22 * Math.sin(t * 0.6 + i * 0.12));
      }
      for (let i = 0; i < wv.length; i++) wv[i] = 128 + 24 * Math.sin(i * 0.075 + t * 2.1);
      return { energy: 0.22, bass: 0.26, mid: 0.16, treble: 0.11, pulse: 0.3, freq: f, wave: wv };
    }

    frame(dt, analyser, bpm) {
      this.t += Math.min(0.06, Math.max(0, dt));
      if (bpm) this.bpm = bpm;
      this.resize();
      const a = this.analyse(analyser, this.t);
      this.draw(this.ctx, this.w, this.h, this.t, a);
    }

    /* All coordinates are relative to w/h so a 1920x1080 export matches. */
    draw(ctx, w, h, time, a) {
      const p = this.palette;
      const hy = h * 0.60;
      const skyTop = hex(p.skyTop), skyMid = hex(p.skyMid), skyLow = hex(p.skyLow);
      const sunTop = hex(p.sunTop), sunBot = hex(p.sunBot);
      const gridC = mix(hex(p.grid), this.tint, 0.26);
      const glowC = mix(hex(p.glow), this.tint, 0.20);
      const hazeC = hex(p.haze);
      const e = a.energy || 0;

      ctx.clearRect(0, 0, w, h);

      /* --- 1. sky --- */
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(0.42, p.skyMid);
      sky.addColorStop(0.80, p.skyLow);
      sky.addColorStop(1, rgba(mix(skyLow, glowC, 0.35), 1));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hy + 2);

      /* --- 2. drifting aurora blooms --- */
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const ax = (0.22 + i * 0.29 + Math.sin(time * 0.12 + i) * 0.07) * w;
        const ay = (0.18 + i * 0.10 + Math.cos(time * 0.09 + i) * 0.05) * h;
        const ar = (0.28 + 0.08 * Math.sin(time * 0.2 + i)) * w;
        const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
        g.addColorStop(0, rgba(hazeC, 0.075 + e * 0.04));
        g.addColorStop(1, rgba(hazeC, 0));
        ctx.fillStyle = g;
        ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
      }
      ctx.globalCompositeOperation = "source-over";

      /* --- 3. stars (parallax + twinkle + flares) --- */
      for (const s of this.stars) {
        const drift = Math.sin(time * 0.05 + s.depth * 3) * 0.008 * s.depth;
        const x = (s.x + drift + 1) % 1 * w;
        const y = s.y * h;
        const tw = 0.5 + 0.5 * Math.sin(time * (1.2 + s.depth) + s.p);
        const alpha = s.b * (0.35 + 0.65 * tw);
        const size = Math.max(0.8, s.s * (w / 1100));
        ctx.fillStyle = rgba([255, 246, 255], alpha);
        ctx.fillRect(x, y, size, size);
        if (s.flare && tw > 0.75) {
          ctx.fillStyle = rgba(glowC, alpha * 0.5);
          ctx.fillRect(x - size * 3, y, size * 7, Math.max(0.6, size * 0.4));
          ctx.fillRect(x, y - size * 3, Math.max(0.6, size * 0.4), size * 7);
        }
      }

      /* --- 4. atmospheric haze bands near the horizon --- */
      for (let i = 0; i < 4; i++) {
        const yy = hy - h * (0.03 + i * 0.035) + Math.sin(time * 0.25 + i) * h * 0.004;
        const g = ctx.createLinearGradient(0, yy - h * 0.02, 0, yy + h * 0.02);
        g.addColorStop(0, rgba(hazeC, 0));
        g.addColorStop(0.5, rgba(hazeC, 0.05 + i * 0.012));
        g.addColorStop(1, rgba(hazeC, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, yy - h * 0.02, w, h * 0.04);
      }

      /* --- 5. sun bloom + disc --- */
      const r = Math.min(w, h) * 0.185 * (1 + e * 0.09 + a.pulse * 0.03);
      const cx = w * 0.5, cy = hy - r * 0.38;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 3; i >= 1; i--) {
        const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * (1.2 + i * 0.65));
        g.addColorStop(0, rgba(glowC, (0.20 + e * 0.12) / i));
        g.addColorStop(1, rgba(glowC, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
      }
      ctx.globalCompositeOperation = "source-over";

      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, p.sunTop);
      sun.addColorStop(0.55, rgba(mix(sunTop, sunBot, 0.45), 1));
      sun.addColorStop(1, p.sunBot);
      ctx.fillStyle = sun;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      for (let i = 0; i < 10; i++) {
        const by = cy + r * (0.06 + i * 0.098);
        const th = r * (0.014 + i * 0.0095);
        const t = Math.max(0, Math.min(1, (by - (cy - r)) / (2 * r)));
        const shade = mix(skyTop, skyMid, 0.45 + 0.35 * t);
        ctx.fillStyle = rgba(shade, 0.93);
        ctx.fillRect(cx - r, by, r * 2, th);
      }
      const core = ctx.createRadialGradient(cx, cy - r * 0.35, 0, cx, cy - r * 0.35, r * 1.1);
      core.addColorStop(0, rgba([255, 255, 255], 0.22));
      core.addColorStop(1, rgba([255, 255, 255], 0));
      ctx.fillStyle = core;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = rgba(mix(sunTop, [255, 255, 255], 0.4), 0.35);
      ctx.lineWidth = Math.max(1, w / 1400);
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();

      /* --- 6. distant ridges --- */
      for (const ridge of this.ridges) {
        const base = hex(p.mountain);
        ctx.fillStyle = rgba(mix(base, [0, 0, 0], ridge.shade ? 0.38 : 0), 0.94);
        ctx.beginPath();
        ctx.moveTo(0, hy);
        const n = ridge.pts.length - 1;
        for (let i = 0; i <= n; i++) {
          const x = (i / n) * w;
          const v = (ridge.pts[Math.max(0, i - 1)] + ridge.pts[i] + ridge.pts[Math.min(n, i + 1)]) / 3;
          ctx.lineTo(x, hy - v * h * ridge.height);
        }
        ctx.lineTo(w, hy);
        ctx.closePath(); ctx.fill();
      }

      /* --- 7. city skyline with lit windows --- */
      const cityC = hex(p.city);
      for (const b of this.buildings) {
        const bx = b.x * w, bw = b.w * w, bh = b.h * h;
        ctx.fillStyle = rgba(cityC, 0.96);
        ctx.fillRect(bx, hy - bh, bw, bh);
        if (b.spire) ctx.fillRect(bx + bw * 0.48, hy - bh - h * 0.018, Math.max(1, bw * 0.06), h * 0.018);
        const wsize = Math.max(0.8, w * 0.0018);
        for (const [wx, wy] of b.wins) {
          const flick = 0.55 + 0.45 * Math.sin(time * 0.8 + b.x * 40 + wx * 12 + wy * 7);
          ctx.fillStyle = rgba(mix(glowC, sunTop, 0.4), 0.32 + flick * 0.4);
          ctx.fillRect(bx + wx * bw, hy - bh + wy * bh, wsize, wsize * 1.4);
        }
      }

      /* --- 8. ground --- */
      const ground = ctx.createLinearGradient(0, hy, 0, h);
      ground.addColorStop(0, rgba(glowC, 0.20));
      ground.addColorStop(0.28, p.ground);
      ground.addColorStop(1, "#03020a");
      ctx.fillStyle = ground;
      ctx.fillRect(0, hy, w, h - hy);

      /* --- 9. sun reflection on the wet floor --- */
      ctx.save();
      ctx.beginPath(); ctx.rect(0, hy, w, h - hy); ctx.clip();
      const refl = ctx.createLinearGradient(0, hy, 0, h);
      refl.addColorStop(0, rgba(sunBot, 0.30));
      refl.addColorStop(0.45, rgba(glowC, 0.10));
      refl.addColorStop(1, rgba(glowC, 0));
      ctx.fillStyle = refl;
      ctx.fillRect(cx - r * 0.95, hy, r * 1.9, h - hy);
      for (let i = 0; i < 22; i++) {
        const f = i / 22;
        const yy = hy + (h - hy) * Math.pow(f, 1.7);
        const wob = Math.sin(time * 1.5 + i * 0.85) * r * 0.07;
        const halfW = r * (0.95 + f * 0.35);
        ctx.fillStyle = rgba(mix(sunBot, glowC, f), (0.13 - f * 0.09) * (0.6 + 0.4 * Math.sin(i * 1.7)));
        ctx.fillRect(cx - halfW + wob, yy, halfW * 2, Math.max(1, h * 0.005));
      }
      ctx.restore();

      /* --- 10. horizon glow --- */
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createLinearGradient(0, hy - h * 0.025, 0, hy + h * 0.055);
      hg.addColorStop(0, rgba(glowC, 0));
      hg.addColorStop(0.45, rgba(glowC, 0.55 + e * 0.35));
      hg.addColorStop(1, rgba(glowC, 0));
      ctx.fillStyle = hg;
      ctx.fillRect(0, hy - h * 0.025, w, h * 0.08);

      /* --- 11. spectrum bars rising from the horizon --- */
      if (a.freq && a.freq.length) {
        const bars = 64;
        const bw = w / bars;
        for (let i = 0; i < bars; i++) {
          const v = a.freq[Math.floor(i / bars * a.freq.length)] / 255;
          const bh = (0.025 + v * 0.19) * h;
          const g = ctx.createLinearGradient(0, hy - bh, 0, hy);
          g.addColorStop(0, rgba(gridC, 0.03));
          g.addColorStop(1, rgba(glowC, 0.42 + v * 0.45));
          ctx.fillStyle = g;
          ctx.fillRect(i * bw + bw * 0.18, hy - bh, bw * 0.64, bh);
        }
      }
      ctx.globalCompositeOperation = "source-over";

      /* --- 12. perspective grid --- */
      ctx.save();
      ctx.beginPath(); ctx.rect(0, hy, w, h - hy); ctx.clip();
      ctx.lineWidth = Math.max(1, w / 1200);
      ctx.shadowColor = rgba(gridC, 0.9);
      ctx.shadowBlur = (8 + e * 16) * (w / 900);
      const scroll = (time * (this.bpm / 120) * 0.4) % 1;
      const lines = 22;
      for (let i = 0; i <= lines; i++) {
        const f = (i + scroll) / lines;
        const y = hy + (h - hy) * f * f;
        ctx.strokeStyle = rgba(gridC, (0.18 + f * 0.72) * (0.85 + e * 0.25));
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let k = -20; k <= 20; k++) {
        const alpha = 0.48 + Math.abs(k) / 20 * 0.18;
        ctx.strokeStyle = rgba(gridC, alpha);
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + k * w * 0.0035, hy);
        ctx.lineTo(w * 0.5 + k * w * 0.078, h);
        ctx.stroke();
      }
      ctx.restore();

      /* --- 13. beat rings --- */
      if (a.pulse > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const rad = r * (1.1 + (1 - a.pulse) * (0.7 + i * 0.35));
          ctx.strokeStyle = rgba(glowC, a.pulse * (0.30 - i * 0.08));
          ctx.lineWidth = Math.max(1, w / 900);
          ctx.beginPath(); ctx.ellipse(cx, hy, rad * 1.7, rad * 0.30, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }

      /* --- 14. drifting embers --- */
      ctx.globalCompositeOperation = "lighter";
      for (const em of this.embers) {
        const y = ((em.y - time * em.sp) % 1 + 1) % 1;
        const x = (em.x + Math.sin(time * 0.5 + em.ph) * 0.02) * w;
        const yy = hy + (h - hy) * y * 0.9;
        const s = em.s * (w / 1200);
        ctx.fillStyle = rgba(glowC, 0.20 + 0.25 * (1 - y));
        ctx.beginPath(); ctx.arc(x, yy, Math.max(0.6, s), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      /* --- 15. waveform trace --- */
      if (a.wave && a.wave.length) {
        const baseY = h * 0.945;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rgba(mix(gridC, [255, 255, 255], 0.25), 0.55);
        ctx.lineWidth = Math.max(1, w / 1200);
        ctx.shadowColor = rgba(gridC, 0.8);
        ctx.shadowBlur = 8 * (w / 900);
        ctx.beginPath();
        const n = Math.min(220, a.wave.length);
        for (let i = 0; i < n; i++) {
          const v = (a.wave[Math.floor(i / n * a.wave.length)] - 128) / 128;
          const x = (i / (n - 1)) * w;
          const y = baseY + v * h * 0.035;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      /* --- 16. grain, cinematic bars, vignette --- */
      const pattern = ctx.createPattern(this.grain, "repeat");
      if (pattern) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      const top = ctx.createLinearGradient(0, 0, 0, h * 0.10);
      top.addColorStop(0, "rgba(0,0,0,0.45)"); top.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = top; ctx.fillRect(0, 0, w, h * 0.10);
      const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.78);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    }

    exportPng() {
      const w = 1920, h = 1080;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const cx = c.getContext("2d");
      this.draw(cx, w, h, this.t, this.synthetic(this.t));
      return new Promise((resolve) => c.toBlob(resolve, "image/png"));
    }
  }

  global.SynthVisuals = { VisualRenderer, PALETTES };
})(window);
