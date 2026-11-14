/**
 * Procedural WAV sound synthesizer for DeadHours v2.0.
 * Run: node bundles/games/DeadHours/assets-src/make-sfx.cjs
 */
const path = require('path');
const { blank, tone, noise, writeAll } = require('../../../../scripts/assets/sfx-lib.cjs');

const bundleDir = path.resolve(__dirname, '..');

function clip(buf, limit = 0.94) {
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.max(-limit, Math.min(limit, buf[i]));
  }
  return buf;
}

const sounds = {
  // Weapons
  pistol: clip((() => {
    const b = blank(0.24);
    noise(b, { len: 0.16, gain: 0.72, decay: 15, cutoff: (p) => 0.85 - p * 0.65 });
    tone(b, { len: 0.10, freq: (p) => 240 - p * 180, shape: 'tri', gain: 0.75, decay: 14 });
    tone(b, { at: 0.015, len: 0.09, freq: (p) => 920 - p * 600, shape: 'sine', gain: 0.28, decay: 18 });
    return b;
  })()),

  shotgun: clip((() => {
    const b = blank(0.42);
    noise(b, { len: 0.34, gain: 0.95, decay: 9, cutoff: (p) => 0.92 - p * 0.72 });
    tone(b, { len: 0.19, freq: (p) => 165 - p * 125, shape: 'tri', gain: 0.9, decay: 9 });
    tone(b, { at: 0.01, len: 0.12, freq: (p) => 420 - p * 260, shape: 'square', gain: 0.32, decay: 14 });
    // Subtle pump clack tail
    tone(b, { at: 0.24, len: 0.045, freq: 520, shape: 'square', gain: 0.18, decay: 16 });
    return b;
  })()),

  smg: clip((() => {
    const b = blank(0.14);
    noise(b, { len: 0.10, gain: 0.64, decay: 18, cutoff: (p) => 0.88 - p * 0.60 });
    tone(b, { len: 0.075, freq: (p) => 310 - p * 210, shape: 'tri', gain: 0.62, decay: 18 });
    return b;
  })()),

  dryfire: clip((() => {
    const b = blank(0.08);
    tone(b, { len: 0.025, freq: 1180, shape: 'square', gain: 0.35, decay: 22 });
    noise(b, { len: 0.025, gain: 0.25, decay: 24, cutoff: 0.8 });
    return b;
  })()),

  reload: clip((() => {
    const b = blank(0.42);
    tone(b, { at: 0.02, len: 0.055, freq: (p) => 480 + p * 160, shape: 'square', gain: 0.30, decay: 18 });
    noise(b, { at: 0.14, len: 0.08, gain: 0.28, decay: 14, cutoff: 0.55 });
    tone(b, { at: 0.25, len: 0.06, freq: (p) => 780 - p * 260, shape: 'square', gain: 0.34, decay: 15 });
    tone(b, { at: 0.31, len: 0.05, freq: 1120, shape: 'tri', gain: 0.26, decay: 16 });
    return b;
  })()),

  melee: clip((() => {
    const b = blank(0.22);
    noise(b, { len: 0.18, gain: 0.52, decay: 10, cutoff: (p) => 0.2 + p * 0.5 });
    tone(b, { len: 0.12, freq: (p) => 240 - p * 160, shape: 'tri', gain: 0.50, decay: 11 });
    return b;
  })()),

  explosion: clip((() => {
    const b = blank(0.75);
    noise(b, { len: 0.72, gain: 0.98, decay: 4.5, cutoff: (p) => 0.65 * (1 - p * 0.75) });
    tone(b, { len: 0.55, freq: (p) => 110 * (1 - p * 0.72) + 28, shape: 'tri', gain: 0.95, decay: 5.2 });
    tone(b, { len: 0.22, freq: (p) => 220 - p * 150, shape: 'square', gain: 0.38, decay: 9 });
    return b;
  })()),

  // Hits & Player Feedback
  hit: clip((() => {
    const b = blank(0.11);
    tone(b, { len: 0.07, freq: (p) => 360 - p * 220, shape: 'tri', gain: 0.55, decay: 18 });
    noise(b, { len: 0.06, gain: 0.35, decay: 16, cutoff: 0.5 });
    return b;
  })()),

  headshot: clip((() => {
    const b = blank(0.18);
    tone(b, { len: 0.12, freq: (p) => 1320 - p * 340, shape: 'sine', gain: 0.58, decay: 11 });
    noise(b, { len: 0.07, gain: 0.48, decay: 16, cutoff: 0.78 });
    tone(b, { at: 0.03, len: 0.09, freq: 1760, shape: 'tri', gain: 0.32, decay: 14 });
    return b;
  })()),

  hurt: clip((() => {
    const b = blank(0.28);
    tone(b, { len: 0.22, freq: (p) => 145 - p * 75, shape: 'square', gain: 0.58, decay: 9 });
    noise(b, { len: 0.16, gain: 0.45, decay: 11, cutoff: 0.42 });
    return b;
  })()),

  heartbeat: clip((() => {
    const b = blank(0.32);
    tone(b, { at: 0.0, len: 0.10, freq: (p) => 78 - p * 28, shape: 'sine', gain: 0.65, decay: 13 });
    tone(b, { at: 0.14, len: 0.12, freq: (p) => 66 - p * 22, shape: 'sine', gain: 0.48, decay: 13 });
    return b;
  })()),

  // Zombies
  groan: clip((() => {
    const b = blank(0.55);
    tone(b, { len: 0.50, freq: (p) => 118 - Math.sin(p * 7) * 18 - p * 32, shape: 'tri', gain: 0.48, decay: 3.8 });
    tone(b, { len: 0.45, freq: (p) => 82 - p * 18, shape: 'square', gain: 0.18, decay: 4.5 });
    noise(b, { len: 0.45, gain: 0.22, decay: 5.0, cutoff: 0.28 });
    return b;
  })()),

  spit: clip((() => {
    const b = blank(0.22);
    noise(b, { len: 0.18, gain: 0.55, decay: 11, cutoff: (p) => 0.35 + p * 0.45 });
    tone(b, { len: 0.16, freq: (p) => 340 + p * 420, shape: 'sine', gain: 0.36, decay: 10 });
    return b;
  })()),

  brute_roar: clip((() => {
    const b = blank(0.65);
    tone(b, { len: 0.60, freq: (p) => 76 - p * 28 + Math.sin(p * 11) * 10, shape: 'square', gain: 0.55, decay: 3.4 });
    tone(b, { len: 0.55, freq: (p) => 114 - p * 34, shape: 'tri', gain: 0.52, decay: 3.8 });
    noise(b, { len: 0.52, gain: 0.40, decay: 4.2, cutoff: 0.32 });
    return b;
  })()),

  // Progression & UI
  wave: clip((() => {
    const b = blank(0.95);
    tone(b, { at: 0.0, len: 0.55, freq: (p) => 146.8 - p * 12, shape: 'tri', gain: 0.52, decay: 3.4 });
    tone(b, { at: 0.16, len: 0.65, freq: (p) => 220.0 + p * 18, shape: 'sine', gain: 0.48, decay: 3.0 });
    tone(b, { at: 0.34, len: 0.55, freq: 293.7, shape: 'sine', gain: 0.38, decay: 3.8 });
    return b;
  })()),

  wave_clear: clip((() => {
    const b = blank(0.62);
    tone(b, { at: 0.0, len: 0.22, freq: 440, shape: 'tri', gain: 0.42, decay: 8 });
    tone(b, { at: 0.14, len: 0.22, freq: 554.4, shape: 'tri', gain: 0.42, decay: 8 });
    tone(b, { at: 0.28, len: 0.32, freq: 659.3, shape: 'sine', gain: 0.48, decay: 6 });
    return b;
  })()),

  pickup: clip((() => {
    const b = blank(0.24);
    tone(b, { at: 0.0, len: 0.11, freq: 660, shape: 'sine', gain: 0.44, decay: 12 });
    tone(b, { at: 0.08, len: 0.14, freq: 990, shape: 'sine', gain: 0.46, decay: 10 });
    return b;
  })()),

  buy: clip((() => {
    const b = blank(0.28);
    tone(b, { at: 0.0, len: 0.09, freq: 523.3, shape: 'tri', gain: 0.45, decay: 12 });
    tone(b, { at: 0.07, len: 0.18, freq: 784.0, shape: 'sine', gain: 0.48, decay: 9 });
    return b;
  })()),

  click: clip((() => {
    const b = blank(0.06);
    tone(b, { len: 0.04, freq: 920, shape: 'sine', gain: 0.30, decay: 22 });
    return b;
  })()),

  impact_metal: clip((() => {
    const b = blank(0.24);
    noise(b, { at: 0.0, len: 0.035, gain: 0.48, decay: 18, cutoff: 0.72 });
    tone(b, { at: 0.0, len: 0.14, freq: p => 1950 - p * 1180, shape: 'tri', gain: 0.38, decay: 11, attack: 0.001 });
    tone(b, { at: 0.004, len: 0.21, freq: 2860, shape: 'sine', gain: 0.22, decay: 14, attack: 0.002 });
    tone(b, { at: 0.0, len: 0.08, freq: p => 520 - p * 260, shape: 'sine', gain: 0.34, decay: 14, attack: 0.001 });
    return b;
  })()),

  impact_stone: clip((() => {
    const b = blank(0.16);
    noise(b, { at: 0.0, len: 0.08, gain: 0.56, decay: 14, cutoff: p => 0.68 - p * 0.42 });
    tone(b, { at: 0.0, len: 0.06, freq: p => 340 - p * 220, shape: 'sine', gain: 0.42, decay: 16, attack: 0.001 });
    tone(b, { at: 0.018, len: 0.09, freq: p => 1420 + p * 380, shape: 'sine', gain: 0.14, decay: 18, attack: 0.002 });
    return b;
  })()),

  impact_wood: clip((() => {
    const b = blank(0.18);
    noise(b, { at: 0.0, len: 0.09, gain: 0.50, decay: 13, cutoff: 0.44 });
    tone(b, { at: 0.0, len: 0.075, freq: p => 440 - p * 240, shape: 'tri', gain: 0.46, decay: 13, attack: 0.001 });
    tone(b, { at: 0.015, len: 0.10, freq: 215, shape: 'sine', gain: 0.32, decay: 11, attack: 0.002 });
    return b;
  })()),

  impact_glass: clip((() => {
    const b = blank(0.30);
    noise(b, { at: 0.0, len: 0.14, gain: 0.42, decay: 12, cutoff: 0.88 });
    tone(b, { at: 0.0, len: 0.11, freq: 3420, shape: 'sine', gain: 0.28, decay: 16, attack: 0.001 });
    tone(b, { at: 0.02, len: 0.14, freq: 4180, shape: 'sine', gain: 0.24, decay: 14, attack: 0.001 });
    tone(b, { at: 0.045, len: 0.16, freq: 2740, shape: 'tri', gain: 0.22, decay: 12, attack: 0.002 });
    tone(b, { at: 0.075, len: 0.15, freq: 2180, shape: 'sine', gain: 0.18, decay: 12, attack: 0.002 });
    return b;
  })()),

  barrel_hiss: clip((() => {
    const b = blank(0.46);
    tone(b, { at: 0.0, len: 0.07, freq: p => 1520 - p * 860, shape: 'tri', gain: 0.34, decay: 16, attack: 0.001 });
    noise(b, { at: 0.01, len: 0.44, gain: 0.46, decay: 2.6, cutoff: p => 0.84 - p * 0.25 });
    return b;
  })()),

  car_alarm: clip((() => {
    const b = blank(0.28);
    noise(b, { at: 0.0, len: 0.06, gain: 0.36, decay: 16, cutoff: 0.82 });
    tone(b, { at: 0.0, len: 0.10, freq: 680, shape: 'square', gain: 0.22, decay: 6, attack: 0.004 });
    tone(b, { at: 0.0, len: 0.10, freq: 910, shape: 'tri', gain: 0.24, decay: 6, attack: 0.004 });
    tone(b, { at: 0.12, len: 0.13, freq: p => 640 - p * 140, shape: 'square', gain: 0.18, decay: 7, attack: 0.004 });
    return b;
  })()),
};

writeAll(bundleDir, sounds);
