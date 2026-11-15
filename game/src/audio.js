// DUSKLINE — procedural sound: every effect is synthesised with WebAudio.
// No audio files, no network. One shared noise buffer, short-lived nodes
// created only on events (never in the per-frame loop).
let ctx = null;
let noiseBuf = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch (e) {
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noise(dur, filterFreq, gain, type = 'lowpass') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playShot(weapon, distant = false) {
  if (!ctx) return;
  if (distant) { noise(0.12, 900, 0.10); return; }
  if (weapon === 'shotgun') { noise(0.22, 1400, 0.5); tone(120, 0.12, 0.25, 'square', 50); }
  else if (weapon === 'sniper') { noise(0.3, 2200, 0.55); tone(90, 0.25, 0.3, 'sawtooth', 40); }
  else if (weapon === 'smg') { noise(0.08, 2600, 0.32); tone(220, 0.05, 0.12, 'square', 110); }
  else { noise(0.11, 2000, 0.4); tone(160, 0.08, 0.18, 'square', 70); }
}

export function playDryFire() { tone(1200, 0.04, 0.12, 'square'); }
export function playReload() { tone(900, 0.05, 0.12, 'square'); setTimeout(() => tone(650, 0.05, 0.12, 'square'), 180); }
export function playHit() { tone(1800, 0.05, 0.16, 'sine'); }
export function playKill() { tone(880, 0.07, 0.2, 'sine'); setTimeout(() => tone(1320, 0.1, 0.2, 'sine'), 70); }
export function playStep() { noise(0.05, 500, 0.05); }
export function playPlant() { tone(1000, 0.12, 0.2, 'sine'); setTimeout(() => tone(1000, 0.12, 0.2, 'sine'), 200); }
export function playBeep() { tone(1400, 0.09, 0.18, 'square'); }
export function playExplode() {
  noise(0.9, 300, 0.8);
  tone(60, 0.8, 0.5, 'sine', 28);
}
export function playBuy() { tone(660, 0.06, 0.15, 'sine'); setTimeout(() => tone(990, 0.08, 0.15, 'sine'), 60); }
export function playRoundWin() {
  [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.2, 'triangle'), i * 110));
}
export function playRoundLose() {
  [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.2, 'triangle'), i * 120));
}
export function playHurt() { tone(140, 0.12, 0.25, 'sawtooth', 70); }
