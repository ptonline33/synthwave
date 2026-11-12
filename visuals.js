/* Synthwave Generator - canvas scene.
 * A sunset, scanline sun, mountains and a moving perspective grid. The same
 * draw() is used for the live (reactive) animation and for PNG export. */
(function (global) {
  "use strict";

  const PALETTES = [
    { name: "Magenta", skyTop: "#120a2e", skyMid: "#4a1259", skyLow: "#d12a72", sunTop: "#ffd874", sunBot: "#ff2d78", grid: "#ff3fa4", glow: "#ff5ea8", mountain: "#1c0b38", ground: "#0b051c" },
    { name: "Sunset",  skyTop: "#08132e", skyMid: "#164a72", skyLow: "#ef5f35", sunTop: "#ffe79b", sunBot: "#ff6a2b", grid: "#27d7ff", glow: "#ff9a55", mountain: "#0a1a36", ground: "#06111f" },
    { name: "Violet",  skyTop: "#0d0626", skyMid: "#301a75", skyLow: "#7a35df", sunTop: "#9ef4ff", sunBot: "#b14bff", grid: "#57e6ff", glow: "#a56bff", mountain: "#160a38", ground: "#0a0520" },
    { name: "Mint",    skyTop: "#04121a", skyMid: "#0b4148", skyLow: "#209a80", sunTop: "#d2ffdc", sunBot: "#31d6a8", grid: "#57ffd1", glow: "#5ce0b0", mountain: "#062028", ground: "#03131a" },
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
      this.t = 0; this.w = 0; this.h = 0; this.dpr = 1;
      this.bpm = 104;
      this.freq = null;
      this.setSeed(1);
    }

    setSeed(seed) {
      this.seed = seed;
      this.palette = PALETTES[Math.abs(seed) % PALETTES.length];
      const r = rng(seed >>> 0);
      this.stars = [];
      for (let i = 0; i < 110; i++) {
        this.stars.push({ x: r(), y: r() * 0.58, s: 0.4 + r() * 1.3, p: r() * Math.PI * 2, b: 0.25 + r() * 0.6 });
      }
      this.ridges = [];
      for (let layer = 0; layer < 2; layer++) {
        const pts = [];
        const n = 26;
        let v = 0.35 + r() * 0.25;
        for (let i = 0; i <= n; i++) {
          v += (r() - 0.5) * 0.18;
          v = Math.max(0.12, Math.min(0.85, v));
          pts.push(v);
        }
        this.ridges.push({ pts, height: layer === 0 ? 0.20 : 0.12, shade: layer === 0 ? 0 : 1 });
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

    readEnergy(analyser) {
      if (!analyser) return 0;
      if (!this.freq || this.freq.length !== analyser.frequencyBinCount) {
        this.freq = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(this.freq);
      const n = Math.min(28, this.freq.length);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += this.freq[i];
      return Math.max(0, Math.min(1, sum / (n * 170)));
    }

    frame(dt, energy, bpm) {
      this.t += Math.min(0.06, Math.max(0, dt));
      if (bpm) this.bpm = bpm;
      this.resize();
      this.draw(this.ctx, this.w, this.h, this.t, energy);
    }

    /* All coordinates are relative to w/h so a 1920x1080 export matches. */
    draw(ctx, w, h, time, energy) {
      const p = this.palette;
      const hy = h * 0.60;
      const skyTop = hex(p.skyTop), skyMid = hex(p.skyMid), skyLow = hex(p.skyLow);
      const sunTop = hex(p.sunTop), sunBot = hex(p.sunBot);
      const gridC = hex(p.grid), glowC = hex(p.glow);
      const e = energy || 0;

      ctx.clearRect(0, 0, w, h);

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(0.55, p.skyMid);
      sky.addColorStop(1, p.skyLow);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hy + 2);

      // stars
      for (const s of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(time * 1.7 + s.p);
        ctx.fillStyle = rgba([255, 245, 255], s.b * (0.35 + 0.65 * tw));
        const size = Math.max(0.8, s.s * (w / 900));
        ctx.fillRect(s.x * w, s.y * h, size, size);
      }

      // sun glow
      const r = Math.min(w, h) * 0.19 * (1 + e * 0.10);
      const cx = w * 0.5, cy = hy - r * 0.30;
      const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.3);
      glow.addColorStop(0, rgba(glowC, 0.38 + e * 0.22));
      glow.addColorStop(1, rgba(glowC, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);

      // sun disc + scanline gaps
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, p.sunTop);
      sun.addColorStop(1, p.sunBot);
      ctx.fillStyle = sun;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      for (let i = 0; i < 9; i++) {
        const by = cy + r * (0.10 + i * 0.105);
        const th = r * (0.016 + i * 0.009);
        const shade = mix(skyMid, skyLow, Math.max(0, Math.min(1, (by - hy * 0.30) / (hy * 0.70))));
        ctx.fillStyle = rgba(shade, 0.96);
        ctx.fillRect(cx - r, by, r * 2, th);
      }
      ctx.restore();

      // mountains on the horizon
      for (const ridge of this.ridges) {
        const base = hex(p.mountain);
        ctx.fillStyle = rgba(mix(base, [0, 0, 0], ridge.shade ? 0.35 : 0), 0.95);
        ctx.beginPath();
        ctx.moveTo(0, hy);
        const n = ridge.pts.length - 1;
        for (let i = 0; i <= n; i++) {
          const x = (i / n) * w;
          const y = hy - ridge.pts[i] * h * ridge.height;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, hy);
        ctx.closePath();
        ctx.fill();
      }

      // ground
      const ground = ctx.createLinearGradient(0, hy, 0, h);
      ground.addColorStop(0, rgba(glowC, 0.22));
      ground.addColorStop(0.35, p.ground);
      ground.addColorStop(1, "#04030c");
      ctx.fillStyle = ground;
      ctx.fillRect(0, hy, w, h - hy);

      // horizon glow line
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createLinearGradient(0, hy - h * 0.02, 0, hy + h * 0.05);
      hg.addColorStop(0, rgba(glowC, 0));
      hg.addColorStop(0.45, rgba(glowC, 0.65 + e * 0.3));
      hg.addColorStop(1, rgba(glowC, 0));
      ctx.fillStyle = hg;
      ctx.fillRect(0, hy - h * 0.02, w, h * 0.07);
      ctx.globalCompositeOperation = "source-over";

      // perspective grid
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, hy, w, h - hy);
      ctx.clip();
      ctx.lineWidth = Math.max(1, w / 1100);
      ctx.strokeStyle = rgba(gridC, 0.55 + e * 0.35);
      ctx.shadowColor = p.grid;
      ctx.shadowBlur = (10 + e * 14) * (w / 900);
      const scroll = (time * (this.bpm / 120) * 0.42) % 1;
      const lines = 20;
      for (let i = 0; i <= lines; i++) {
        const f = (i + scroll) / lines;
        const y = hy + (h - hy) * f * f;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let k = -18; k <= 18; k++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + k * w * 0.004, hy);
        ctx.lineTo(w * 0.5 + k * w * 0.075, h);
        ctx.stroke();
      }
      ctx.restore();

      // beat flash + vignette
      if (e > 0.01) {
        ctx.fillStyle = rgba(glowC, e * 0.045);
        ctx.fillRect(0, 0, w, h);
      }
      const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.78);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }

    exportPng() {
      const w = 1920, h = 1080;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const cx = c.getContext("2d");
      this.draw(cx, w, h, this.t, 0.3);
      return new Promise((resolve) => c.toBlob(resolve, "image/png"));
    }
  }

  global.SynthVisuals = { VisualRenderer, PALETTES };
})(window);
