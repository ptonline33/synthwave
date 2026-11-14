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
    if (["both", "audio", "visual"].indexOf(mode) !== -1) state.mode = mode;
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
    $("badgeMode").textContent = { both: "Audio + visuals", audio: "Audio only", visual: "Visuals only" }[state.mode];
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

  function applySettings() {
    if (engine) engine.setSettings(snapshot());
    updateBadges();
    updateURL();
  }

  async function generate(full) {
    state.seed = randSeed();
    if (full) {
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
    state.mode = mode;
    if (mode === "visual" && state.playing) await stop();
    syncUI();
    updateURL();
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
  function loop(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (state.mode !== "audio" && renderer) {
      const analyser = state.playing && engine ? engine.analyser : null;
      renderer.frame(dt, analyser, state.bpm);
    }
    requestAnimationFrame(loop);
  }

  /* ------------------------------ boot ------------------------------ */
  function bind() {
    document.querySelectorAll(".seg").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode)));

    $("playBtn").addEventListener("click", () => state.playing ? stop() : play());
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
      if (e.code === "Space") { e.preventDefault(); state.playing ? stop() : play(); }
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

  function boot() {
    readURL();
    populateSelects();
    renderer = new V.VisualRenderer($("canvas"));
    renderer.setSeed(state.seed);
    syncUI();
    updateURL();
    bind();
    requestAnimationFrame(loop);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  boot();
})();
