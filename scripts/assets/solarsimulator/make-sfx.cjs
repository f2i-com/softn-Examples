/**
 * Deterministic 16-bit WAV sound synthesizer for Solar Simulator.
 * Generates 10 crisp cosmic & physical sandbox sound effects into
 * `bundles/games/SolarSimulator/assets/sfx/`.
 */
const path = require('path');
const { RATE, blank, tone, noise, writeAll } = require('../sfx-lib.cjs');

const BUNDLE_DIR = path.resolve(__dirname, '..', '..', '..', 'bundles', 'games', 'SolarSimulator');

function normalizeSoft(buf, peakTarget = 0.86) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  if (peak > peakTarget) {
    const k = peakTarget / peak;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
  }
  return buf;
}

// 1. UI tactile observatory click
function makeClick() {
  const b = blank(0.08);
  tone(b, { at: 0, len: 0.045, freq: (p) => 880 - p * 340, gain: 0.35, decay: 14 });
  tone(b, { at: 0.01, len: 0.05, freq: 1320, gain: 0.16, decay: 18 });
  return normalizeSoft(b, 0.55);
}

// 2. Asteroid kinetic launch whoosh / rail thrust
function makeLaunch() {
  const b = blank(0.42);
  noise(b, { at: 0, len: 0.38, cutoff: (p) => 0.08 + p * 0.36, gain: 0.42, decay: 4.5 });
  tone(b, { at: 0, len: 0.36, freq: (p) => 150 + p * 420, shape: 'tri', gain: 0.34, decay: 4.0 });
  tone(b, { at: 0.04, len: 0.28, freq: (p) => 300 + p * 540, gain: 0.18, decay: 5.5 });
  return normalizeSoft(b, 0.78);
}

// 3. Minor / Chicxulub impact strike
function makeImpactMinor() {
  const b = blank(0.55);
  tone(b, { at: 0, len: 0.45, freq: (p) => 165 * Math.exp(-p * 2.2) + 38, gain: 0.62, decay: 5.2 });
  noise(b, { at: 0, len: 0.48, cutoff: (p) => 0.42 * (1 - p * 0.75) + 0.04, gain: 0.52, decay: 5.0 });
  tone(b, { at: 0.02, len: 0.18, freq: (p) => 520 - p * 340, shape: 'tri', gain: 0.22, decay: 8.0 });
  return normalizeSoft(b, 0.85);
}

// 4. Giant / Theia / Planet-shattering seismic impact boom
function makeImpactGiant() {
  const b = blank(1.15);
  tone(b, { at: 0, len: 1.05, freq: (p) => 118 * Math.exp(-p * 2.4) + 28, gain: 0.78, decay: 2.8 });
  tone(b, { at: 0.03, len: 0.92, freq: (p) => 76 * Math.exp(-p * 1.6) + 24, shape: 'tri', gain: 0.52, decay: 2.5 });
  noise(b, { at: 0, len: 1.08, cutoff: (p) => 0.48 * Math.exp(-p * 2.2) + 0.035, gain: 0.68, decay: 2.9 });
  tone(b, { at: 0.08, len: 0.55, freq: (p) => 340 * Math.exp(-p * 2.8), gain: 0.25, decay: 4.5 });
  return normalizeSoft(b, 0.90);
}

// 5. Sun swelling into Red Giant (deep solar convection swell)
function makeRedGiant() {
  const b = blank(1.10);
  tone(b, { at: 0, len: 1.05, freq: (p) => 65 + Math.sin(p * Math.PI) * 42, gain: 0.48, decay: 1.8, attack: 0.12 });
  tone(b, { at: 0.05, len: 0.98, freq: (p) => 98 + Math.sin(p * Math.PI) * 58, shape: 'tri', gain: 0.30, decay: 2.0, attack: 0.14 });
  noise(b, { at: 0, len: 1.05, cutoff: (p) => 0.04 + 0.10 * Math.sin(p * Math.PI), gain: 0.38, decay: 2.1 });
  return normalizeSoft(b, 0.80);
}

// 6. Planet engulfed by Red Giant photosphere
function makeEngulf() {
  const b = blank(0.75);
  noise(b, { at: 0, len: 0.70, cutoff: (p) => 0.32 * (1 - p * 0.6) + 0.05, gain: 0.58, decay: 3.4 });
  tone(b, { at: 0, len: 0.68, freq: (p) => 220 * Math.exp(-p * 1.9) + 42, gain: 0.46, decay: 3.2 });
  return normalizeSoft(b, 0.82);
}

// 7. Supernova / Planetary Nebula shell ejection
function makeSupernova() {
  const b = blank(1.45);
  tone(b, { at: 0, len: 0.22, freq: (p) => 620 - p * 480, gain: 0.42, decay: 6.0 });
  tone(b, { at: 0.04, len: 1.35, freq: (p) => 132 * Math.exp(-p * 2.1) + 26, gain: 0.80, decay: 2.1 });
  noise(b, { at: 0.02, len: 1.38, cutoff: (p) => 0.55 * Math.exp(-p * 1.9) + 0.04, gain: 0.72, decay: 2.2 });
  tone(b, { at: 0.18, len: 1.15, freq: 440, gain: 0.16, decay: 2.6, attack: 0.08 });
  tone(b, { at: 0.22, len: 1.10, freq: 659.25, gain: 0.12, decay: 2.8, attack: 0.10 });
  return normalizeSoft(b, 0.90);
}

// 8. Close gravitational flyby / chaos alert ping
function makeFlybyAlert() {
  const b = blank(0.34);
  tone(b, { at: 0.00, len: 0.14, freq: 784, gain: 0.28, decay: 9.0 });
  tone(b, { at: 0.11, len: 0.20, freq: 1046.5, gain: 0.30, decay: 7.5 });
  return normalizeSoft(b, 0.60);
}

// 9. Spawn 2nd or 3rd Sun harmonic chord
function makeSpawnStar() {
  const b = blank(0.85);
  const freqs = [220, 329.63, 440, 659.25];
  freqs.forEach((f, idx) => {
    tone(b, { at: idx * 0.04, len: 0.75 - idx * 0.04, freq: f, gain: 0.26, decay: 2.8, attack: 0.04 });
  });
  return normalizeSoft(b, 0.76);
}

// 10. Seamless 6-second warm cosmic observatory ambient loop (A2 + E3 + B3 + C#4 pad)
function makeAmbientCosmos() {
  const dur = 6.0;
  const n = Math.floor(RATE * dur);
  const b = new Float64Array(n);
  // Exact integer cycles over 6.0s for zero-click loop seam!
  const partials = [
    { f: 110.0, amp: 0.16 },
    { f: 165.0, amp: 0.13 },
    { f: 220.0, amp: 0.10 },
    { f: 277.0, amp: 0.065 },
    { f: 330.0, amp: 0.055 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const swell = 0.78 + 0.22 * Math.sin((2 * Math.PI * t) / dur);
    let s = 0;
    for (let k = 0; k < partials.length; k++) {
      const p = partials[k];
      s += Math.sin(2 * Math.PI * p.f * t + k * 0.7) * p.amp;
    }
    b[i] = s * swell;
  }
  return normalizeSoft(b, 0.42);
}

writeAll(BUNDLE_DIR, {
  click: makeClick(),
  launch: makeLaunch(),
  impact_minor: makeImpactMinor(),
  impact_giant: makeImpactGiant(),
  red_giant: makeRedGiant(),
  engulf: makeEngulf(),
  supernova: makeSupernova(),
  flyby_alert: makeFlybyAlert(),
  spawn_star: makeSpawnStar(),
  ambient_cosmos: makeAmbientCosmos(),
});
