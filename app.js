/* Synthwave Generator - UI wiring.
 * Mode: "both" (default), "audio" (no canvas) or "visual" (no sound).
 * A seed + settings reproduce a track; the URL carries the whole state. */
(function () {
  "use strict";

  const A = window.SynthAudio;
  const V = window.SynthVisuals;
  const $ = (id) => document.getElementById(id);

  const defaults = () => ({
    seed: 482910, bpm: 104, key: 0, progression: 0, mood: "drive", volume: 0.8,
    layers: { pad: true, bass: true, arp: true, drums: true },
    mode: "both", playing: false,
  });
  let state = defaults();
  let engine = null;
  let renderer = null;
  let rendering = false;
  let deferredPrompt = null;
  let toastTimer = null;
  let transportBusy = false;

  /* Downshift guided session (not part of the shareable track state). */
  const ds = {
    active: false, source: "none", bpm: null, baseline: null,
    samples: [], startedAt: 0, lastTempoStep: 0, saved: null, handle: null,
  };

  const randSeed = () => 100000 + Math.floor(Math.random() * 900000);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function snapshot() {
    return {
      seed: state.seed, bpm: state.bpm, key: state.key,
      progression: state.progression, mood: state.mood, volume: state.volume,
      layers: {
        pad: state.layers.pad, bass: state.layers.bass,
        arp: state.layers.arp, drums: state.layers.drums,
      },
    };
  }

  /* ------------------------------ URL state ------------------------------ */
  function readURL() {
    const q = new URLSearchParams(location.search);
    const num = (k, fallback) => {
      const v = parseInt(q.get(k), 10);
      return Number.isFinite(v) ? v : fallback;
    };
    state.seed = clamp(num("s", state.seed), 0, 999999999);
    state.bpm = clamp(num("b", state.bpm), 70, 150);
    state.key = clamp(num("k", state.key), 0, 11);
    state.progression = clamp(num("p", state.progression), 0, A.PROGRESSIONS.length - 1);
    const m = q.get("m");
    if (m && A.MOODS[m]) state.mood = m;
    state.volume = clamp(num("v", 80), 0, 100) / 100;
    const mode = q.get("mode");
    if (["both", "audio", "visual", "downshift"].indexOf(mode) !== -1) state.mode = mode;
    const l = q.get("l");
    if (l && /^[01]{4}$/.test(l)) {
      state.layers = { pad: l[0] === "1", bass: l[1] === "1", arp: l[2] === "1", drums: l[3] === "1" };
    }
  }
  function updateURL() {
    const q = new URLSearchParams();
    q.set("s", state.seed); q.set("b", state.bpm); q.set("k", state.key);
    q.set("p", state.progression); q.set("m", state.mood);
    q.set("v", Math.round(state.volume * 100)); q.set("mode", state.mode);
    q.set("l", ["pad", "bass", "arp", "drums"].map((k) => state.layers[k] ? "1" : "0").join(""));
    history.replaceState(null, "", location.pathname + "?" + q.toString());
  }

  /* ------------------------------ UI ------------------------------ */
  function populateSelects() {
    A.KEYS.forEach((k, i) => $("keySel").add(new Option(k + " minor", String(i))));
    A.PROGRESSIONS.forEach((p, i) => $("progSel").add(new Option(p.name, String(i))));
    Object.keys(A.MOODS).forEach((k) => $("moodSel").add(new Option(A.MOODS[k].label, k)));
  }

  function updateBadges() {
    const mood = A.MOODS[state.mood] || A.MOODS.drive;
    $("badgeSeed").textContent = "SEED " + String(state.seed).padStart(6, "0");
    $("badgeKey").textContent = A.KEYS[state.key] + " MINOR · " + state.bpm + " BPM";
    $("badgeScene").textContent = mood.label.toUpperCase() + " · " + (renderer ? renderer.palette.name : "").toUpperCase();
    $("nowProg").textContent = A.PROGRESSIONS[state.progression].name;
    $("nowMood").textContent = mood.label;
  }

  function syncTransport() {
    const b = $("playBtn");
    b.textContent = state.playing ? "STOP" : "PLAY";
    b.classList.toggle("playing", state.playing);
  }

  function syncUI() {
    if (renderer) renderer.setMood(A.MOODS[state.mood]);
    $("seedInput").value = String(state.seed);
    $("keySel").value = String(state.key);
    $("progSel").value = String(state.progression);
    $("moodSel").value = state.mood;
    $("bpmRange").value = state.bpm;
    $("bpmVal").textContent = state.bpm + " BPM";
    $("volRange").value = Math.round(state.volume * 100);
    $("volVal").textContent = Math.round(state.volume * 100) + "%";
    ["pad", "bass", "arp", "drums"].forEach((k) => {
      $("layer" + k[0].toUpperCase() + k.slice(1)).checked = state.layers[k];
    });
    document.body.dataset.mode = state.mode;
    document.querySelectorAll(".seg").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));

    const visualOnly = state.mode === "visual";
    $("playBtn").disabled = visualOnly;
    $("hint").hidden = !visualOnly;
    if (visualOnly) $("hint").textContent = "Visuals-only mode. Switch to Both or Audio only to hear the track.";
    $("downshiftPanel").hidden = state.mode !== "downshift";
    $("badgeMode").textContent = {
      both: "Audio + visuals", audio: "Audio only", visual: "Visuals only", downshift: "Downshift session",
    }[state.mode];
    syncTransport();
    updateBadges();
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /* ------------------------------ playback ------------------------------ */
  function setNow(bar) {
    $("nowBar").textContent = "Bar " + (bar + 1);
    $("nowChord").textContent = A.chordLabel(snapshot(), bar);
  }

  async function play() {
    if (state.mode === "visual") { toast("Switch to Both or Audio only to play"); return; }
    if (state.playing) return;
    try {
      if (!engine) {
        engine = new A.SynthEngine(snapshot());
        engine.onBar = (bar, when) => {
          const delay = Math.max(0, (when - engine.currentTime) * 1000);
          setTimeout(() => { if (state.playing) setNow(bar); }, delay);
        };
      } else {
        engine.setSettings(snapshot());
      }
      await engine.play();
      state.playing = true;
      syncTransport();
      setNow(0);
    } catch (e) {
      toast("Audio error: " + e.message);
    }
  }

  async function stop() {
    state.playing = false;
    syncTransport();
    if (engine) await engine.stop();
  }

  async function toggleTransport() {
    if (transportBusy) return;   // rapid play/stop used to overlap AudioContexts
    transportBusy = true;
    try { state.playing ? await stop() : await play(); }
    finally { transportBusy = false; }
  }

  function applySettings() {
    if (engine) engine.setSettings(snapshot());
    updateBadges();
    updateURL();
  }

  async function generate(full) {
    state.seed = randSeed();
    if (full && !ds.active) {
      state.key = Math.floor(Math.random() * 12);
      state.progression = Math.floor(Math.random() * A.PROGRESSIONS.length);
      const moods = Object.keys(A.MOODS);
      state.mood = moods[Math.floor(Math.random() * moods.length)];
      state.bpm = 88 + Math.floor(Math.random() * 36);
    }
    renderer.setSeed(state.seed);
    syncUI();
    updateURL();
    if (state.playing) { await stop(); await play(); }
    toast(full ? "New track generated" : "New seed");
  }

  async function setMode(mode) {
    const prev = state.mode;
    if (prev === "downshift" && mode !== "downshift") await endDownshift();
    state.mode = mode;
    if (mode === "visual" && state.playing) await stop();
    if (mode === "downshift" && prev !== "downshift") await startDownshift(true);
    syncUI();
    updateURL();
  }

  /* ------------------------------ downshift ------------------------------ */
  const tempoFor = (bpm) => clamp(Math.round(bpm * 0.82), 60, 92);

  async function startDownshift(autoPlay) {
    ds.saved = { mood: state.mood, bpm: state.bpm, layers: { ...state.layers } };
    ds.active = true; ds.startedAt = performance.now(); ds.lastTempoStep = 0;
    ds.samples = []; ds.baseline = null; ds.bpm = null; ds.source = "none";
    state.mood = "vapor";
    state.layers = { pad: true, bass: false, arp: true, drums: false };
    state.bpm = 78;
    renderer.downshift.active = true;
    $("hrStatus").textContent = "No sensor. Glance at your Fitbit and type your BPM, or use the breathing pacer alone.";
    updateHRUI(); drawChart(); syncUI(); updateURL();
    if (autoPlay && !state.playing) await play();
    toast("Downshift started · follow the breathing ring");
  }

  async function endDownshift() {
    if (ds.handle) { try { ds.handle.disconnect(); } catch (_) {} ds.handle = null; }
    ds.active = false; ds.source = "none"; ds.bpm = null; ds.baseline = null; ds.samples = [];
    renderer.downshift.active = false;
    if (ds.saved) {
      state.mood = ds.saved.mood; state.bpm = ds.saved.bpm; state.layers = ds.saved.layers;
      ds.saved = null;
      applySettings();
    }
    updateHRUI(); drawChart();
  }

  function pushSample(bpm) {
    ds.bpm = bpm;
    if (ds.baseline === null) ds.baseline = bpm;
    ds.samples.push({ t: performance.now(), bpm });
    if (ds.samples.length > 120) ds.samples.shift();
    updateHRUI(); drawChart();
  }

  function updateHRUI() {
    $("hrValue").textContent = ds.bpm == null ? "--" : String(ds.bpm);
    if (ds.baseline != null && ds.bpm != null) {
      const d = ds.bpm - ds.baseline;
      $("hrDelta").textContent = (d > 0 ? "+" : "") + d + " from start";
      $("hrDelta").style.color = d <= 0 ? "var(--cyan)" : "var(--muted)";
    } else {
      $("hrDelta").textContent = "";
    }
    $("sessionTarget").textContent = ds.bpm != null
      ? "Target tempo " + tempoFor(ds.bpm) + " BPM"
      : "Target ~60 BPM";
  }

  function drawChart() {
    const c = $("hrChart");
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    if (ds.samples.length === 0) return;
    if (ds.samples.length === 1) {
      ctx.fillStyle = "#35e6ff";
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const vals = ds.samples.map((s) => s.bpm);
    const min = Math.min(...vals) - 4, max = Math.max(...vals) + 4;
    const span = Math.max(8, max - min);
    ctx.strokeStyle = "rgba(53,230,255,0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    const lx = w, ly = h - ((vals[vals.length - 1] - min) / span) * h;
    ctx.fillStyle = "#35e6ff";
    ctx.beginPath(); ctx.arc(lx - 3, ly, 3, 0, Math.PI * 2); ctx.fill();
  }

  async function connectHR() {
    try {
      $("hrStatus").textContent = "Choose your sensor in the browser picker…";
      ds.handle = await window.SynthHR.connect(
        (sample) => { ds.source = "ble"; pushSample(Math.round(sample.bpm)); },
        (msg) => { $("hrStatus").textContent = msg; }
      );
    } catch (e) {
      const reason = /cancel|no device|not found/i.test(e.message || "")
        ? "No sensor picked."
        : "Couldn't connect: " + e.message;
      $("hrStatus").textContent = reason + " Fitbit Inspire 3 can't broadcast live HR — type your BPM above, or pair a BLE chest strap (Polar/Wahoo).";
      toast("Sensor not connected");
    }
  }

  function setManualBpm() {
    const v = parseInt($("manualBpm").value, 10);
    if (!Number.isFinite(v) || v < 25 || v > 240) { toast("Enter a BPM between 25 and 240"); return; }
    ds.source = "manual";
    pushSample(v);
    $("manualBpm").value = "";
    $("hrStatus").textContent = "Manual BPM from your Fitbit. Update it every minute or so.";
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function tickDownshift(now) {
    const elapsed = (now - ds.startedAt) / 1000;
    $("sessionTimer").textContent = fmtTime(elapsed);
    const phase = (elapsed % 10) / 10;                 // 4s in / 6s out = 6 breaths/min
    renderer.downshift.phase = phase;
    renderer.downshift.label = phase < 0.4 ? "BREATHE IN" : "BREATHE OUT";
    if (now - ds.lastTempoStep > 2500) {
      ds.lastTempoStep = now;
      const target = ds.bpm != null ? tempoFor(ds.bpm) : Math.max(60, 78 - Math.floor(elapsed / 12));
      if (state.bpm !== target) {
        state.bpm = clamp(state.bpm + Math.sign(target - state.bpm), 60, 150);
        $("bpmRange").value = state.bpm;
        $("bpmVal").textContent = state.bpm + " BPM";
        applySettings();
      }
    }
  }

  /* ------------------------------ exports ------------------------------ */
  async function exportWav() {
    if (rendering) { toast("Already rendering…"); return; }
    rendering = true;
    $("wavBtn").disabled = true;
    toast("Rendering 8 bars…");
    try {
      const blob = await A.renderWav(snapshot(), 8);
      download(blob, `synthwave-${state.seed}-${state.bpm}bpm.wav`);
      toast("WAV ready");
    } catch (e) {
      toast("Export failed: " + e.message);
    } finally {
      rendering = false;
      $("wavBtn").disabled = false;
    }
  }

  async function exportPng() {
    try {
      const blob = await renderer.exportPng();
      if (!blob) throw new Error("canvas export unavailable");
      download(blob, `synthwave-${state.seed}.png`);
      toast("Wallpaper saved");
    } catch (e) {
      toast("PNG failed: " + e.message);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied");
    } catch (_) {
      toast("Copy this URL from the address bar");
    }
  }

  /* ------------------------------ render loop ------------------------------ */
  let last = performance.now();
  let lastDraw = 0;
  let drawAccum = 0;
  function loop(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (ds.active) tickDownshift(now);
    /* Cap canvas work at ~40 fps. The visualiser is gradient-heavy; leaving it
     * uncapped can starve the audio scheduler on slower machines. */
    drawAccum += dt;
    if (state.mode !== "audio" && renderer && now - lastDraw >= 25) {
      const analyser = state.playing && engine ? engine.analyser : null;
      renderer.frame(Math.min(0.06, drawAccum), analyser, state.bpm);
      drawAccum = 0;
      lastDraw = now;
    }
    requestAnimationFrame(loop);
  }

  /* ------------------------------ boot ------------------------------ */
  function bind() {
    document.querySelectorAll(".seg").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode)));

    $("playBtn").addEventListener("click", toggleTransport);
    $("hrConnectBtn").addEventListener("click", connectHR);
    $("manualSetBtn").addEventListener("click", setManualBpm);
    $("manualBpm").addEventListener("keydown", (e) => { if (e.key === "Enter") setManualBpm(); });
    $("genBtn").addEventListener("click", () => generate(true));
    $("diceBtn").addEventListener("click", () => generate(false));
    $("copyBtn").addEventListener("click", copyLink);
    $("wavBtn").addEventListener("click", exportWav);
    $("pngBtn").addEventListener("click", exportPng);

    $("seedInput").addEventListener("change", async (e) => {
      const v = parseInt(e.target.value, 10);
      state.seed = Number.isFinite(v) ? clamp(v, 0, 999999999) : randSeed();
      renderer.setSeed(state.seed);
      syncUI(); updateURL();
      if (state.playing) { await stop(); await play(); }
    });

    $("keySel").addEventListener("change", (e) => { state.key = +e.target.value; applySettings(); });
    $("progSel").addEventListener("change", (e) => { state.progression = +e.target.value; applySettings(); });
    $("moodSel").addEventListener("change", (e) => { state.mood = e.target.value; applySettings(); });
    $("bpmRange").addEventListener("input", (e) => {
      state.bpm = +e.target.value;
      $("bpmVal").textContent = state.bpm + " BPM";
      applySettings();
    });
    $("volRange").addEventListener("input", (e) => {
      state.volume = +e.target.value / 100;
      $("volVal").textContent = e.target.value + "%";
      applySettings();
    });
    ["pad", "bass", "arp", "drums"].forEach((k) => {
      const id = "layer" + k[0].toUpperCase() + k.slice(1);
      $(id).addEventListener("change", (e) => { state.layers[k] = e.target.checked; applySettings(); });
    });

    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (e.code === "Space") { e.preventDefault(); toggleTransport(); }
      else if (e.key === "g" || e.key === "G") generate(true);
    });

    $("installBtn").addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $("installBtn").hidden = true;
    });
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); deferredPrompt = e; $("installBtn").hidden = false;
    });
    window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; });

    const offline = () => { $("offlineBadge").hidden = navigator.onLine; };
    window.addEventListener("online", offline);
    window.addEventListener("offline", offline);
    offline();

    window.addEventListener("resize", () => { if (renderer) renderer.resize(); });
  }

  async function boot() {
    readURL();
    populateSelects();
    renderer = new V.VisualRenderer($("canvas"));
    renderer.setSeed(state.seed);
    syncUI();
    updateURL();
    updateHRUI();
    bind();
    if (state.mode === "downshift") await startDownshift(false);
    requestAnimationFrame(loop);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  boot();
})();
