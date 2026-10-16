"use strict";
// Copy to Lightning feedback: the page shakes and a soft camera-click sound plays (with a short buzz on devices that vibrate).
// On by default; Customize Site Options turns it off. Reduced-motion systems get the sound without the shake.
window.CopyRumble = (() => {
  const key = "dell-support.copy-rumble", duration = 1000, volume = 0.1;
  let timer = null, audio = null, master = null;
  function enabled() {
    try { return localStorage.getItem(key) !== "false"; } catch { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(key, on ? "true" : "false"); return true; } catch { return false; }
  }
  function shake() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const targets = ["siteTopbar", "main"].map(id => document.getElementById(id)).filter(Boolean);
    clearTimeout(timer);
    // Restart the animation if the button is pressed again mid-shake.
    targets.forEach(node => { node.classList.remove("copy-rumble"); void node.offsetWidth; node.classList.add("copy-rumble"); });
    timer = setTimeout(() => targets.forEach(node => node.classList.remove("copy-rumble")), duration);
  }
  // A camera shutter: two crisp noise snaps (shutter open, then close) with a faint mechanical body. Very quiet on purpose.
  function snap(at, frequency, level, length) {
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * length), audio.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = buffer;
    filter.type = "bandpass"; filter.frequency.value = frequency; filter.Q.value = 1.2;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(at); source.stop(at + length + 0.01);
  }
  function shutter() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      audio ??= new Context();
      audio.resume?.();
      if (!master) { master = audio.createGain(); master.gain.value = volume; master.connect(audio.destination); }
      const now = audio.currentTime;
      snap(now, 3800, 1, 0.03);
      snap(now, 900, 0.5, 0.05);
      snap(now + 0.075, 4200, 0.8, 0.025);
      snap(now + 0.075, 1100, 0.35, 0.04);
    } catch {}
  }
  function play() {
    if (!enabled()) return false;
    shake();
    shutter();
    try { navigator.vibrate?.(30); } catch {}
    return true;
  }
  return { key, enabled, setEnabled, play };
})();
