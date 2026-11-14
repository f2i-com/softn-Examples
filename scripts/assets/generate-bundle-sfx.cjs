/**
 * Adds extra procedural WAV SFX for 3D & 2D bundles that don't yet have them.
 */
const fs = require('fs');
const path = require('path');
const { blank, tone, noise, writeAll } = require('./sfx-lib.cjs');
const { resolveBundleDir } = require('../build/build-bundle.cjs');

function clip(buf, limit = 0.92) {
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.max(-limit, Math.min(limit, buf[i]));
  }
  return buf;
}

function addMissing(bundleName, soundsMap) {
  const dir = resolveBundleDir(bundleName);
  if (!dir) throw new Error(`Unknown bundle: ${bundleName}`);
  const toWrite = {};
  for (const [k, buf] of Object.entries(soundsMap)) {
    const out = path.join(dir, 'assets', 'sfx', `${k}.wav`);
    if (!fs.existsSync(out)) {
      toWrite[k] = clip(buf);
    }
  }
  if (Object.keys(toWrite).length > 0) {
    writeAll(dir, toWrite);
    console.log(`Added SFX for ${bundleName}: ${Object.keys(toWrite).join(', ')}`);
  }
}

addMissing('Blockscape', {
  step: (() => {
    const b = blank(0.08);
    noise(b, { len: 0.05, gain: 0.35, decay: 20, cutoff: 0.35 });
    tone(b, { len: 0.05, freq: (p) => 135 - p * 40, shape: 'tri', gain: 0.25, decay: 18 });
    return b;
  })(),
  splash: (() => {
    const b = blank(0.28);
    noise(b, { len: 0.25, gain: 0.52, decay: 7, cutoff: (p) => 0.7 - p * 0.45 });
    return b;
  })(),
  chest: (() => {
    const b = blank(0.32);
    tone(b, { at: 0, len: 0.12, freq: 523.25, shape: 'sine', gain: 0.4, decay: 10 });
    tone(b, { at: 0.08, len: 0.12, freq: 659.25, shape: 'sine', gain: 0.42, decay: 10 });
    tone(b, { at: 0.16, len: 0.15, freq: 783.99, shape: 'sine', gain: 0.45, decay: 8 });
    return b;
  })(),
});

addMissing('MazeEscape3D', {
  rune: (() => {
    const b = blank(0.35);
    tone(b, { at: 0, len: 0.16, freq: 587.3, shape: 'sine', gain: 0.45, decay: 10 });
    tone(b, { at: 0.09, len: 0.24, freq: 880.0, shape: 'sine', gain: 0.48, decay: 8 });
    return b;
  })(),
  portal: (() => {
    const b = blank(0.45);
    tone(b, { len: 0.42, freq: (p) => 240 + p * 420, shape: 'sine', gain: 0.45, decay: 4 });
    tone(b, { at: 0.08, len: 0.35, freq: (p) => 360 + p * 540, shape: 'tri', gain: 0.28, decay: 5 });
    return b;
  })(),
  step: (() => {
    const b = blank(0.07);
    noise(b, { len: 0.045, gain: 0.28, decay: 22, cutoff: 0.28 });
    tone(b, { len: 0.04, freq: 110, shape: 'tri', gain: 0.22, decay: 20 });
    return b;
  })(),
});

addMissing('TrainYard', {
  chuff: (() => {
    const b = blank(0.18);
    noise(b, { len: 0.15, gain: 0.48, decay: 12, cutoff: (p) => 0.45 - p * 0.3 });
    return b;
  })(),
  bell: (() => {
    const b = blank(0.38);
    tone(b, { len: 0.36, freq: 1320, shape: 'sine', gain: 0.36, decay: 7 });
    tone(b, { len: 0.28, freq: 1980, shape: 'sine', gain: 0.18, decay: 10 });
    return b;
  })(),
  switch: (() => {
    const b = blank(0.12);
    noise(b, { len: 0.07, gain: 0.55, decay: 18, cutoff: 0.6 });
    tone(b, { len: 0.06, freq: 290, shape: 'square', gain: 0.26, decay: 18 });
    return b;
  })(),
});

addMissing('PredatorPrey', {
  chirp: (() => {
    const b = blank(0.16);
    tone(b, { len: 0.06, freq: (p) => 1650 + p * 480, shape: 'sine', gain: 0.28, decay: 16 });
    tone(b, { at: 0.07, len: 0.07, freq: (p) => 1920 + p * 380, shape: 'sine', gain: 0.24, decay: 16 });
    return b;
  })(),
  hop: (() => {
    const b = blank(0.10);
    tone(b, { len: 0.08, freq: (p) => 220 + p * 260, shape: 'sine', gain: 0.26, decay: 16 });
    return b;
  })(),
  alert: (() => {
    const b = blank(0.22);
    tone(b, { len: 0.18, freq: (p) => 620 - p * 240, shape: 'saw', gain: 0.28, decay: 10 });
    return b;
  })(),
});

addMissing('SimLives', {
  chime: (() => {
    const b = blank(0.30);
    tone(b, { at: 0, len: 0.14, freq: 587.3, shape: 'sine', gain: 0.36, decay: 10 });
    tone(b, { at: 0.08, len: 0.20, freq: 880.0, shape: 'sine', gain: 0.38, decay: 8 });
    return b;
  })(),
  cook: (() => {
    const b = blank(0.22);
    noise(b, { len: 0.18, gain: 0.25, decay: 9, cutoff: 0.72 });
    return b;
  })(),
  sleep: (() => {
    const b = blank(0.32);
    tone(b, { len: 0.28, freq: (p) => 420 - p * 140, shape: 'sine', gain: 0.3, decay: 6 });
    return b;
  })(),
  click: (() => {
    const b = blank(0.06);
    tone(b, { len: 0.04, freq: 760, shape: 'sine', gain: 0.28, decay: 22 });
    return b;
  })(),
});

addMissing('TheOffice', {
  cash: (() => {
    const b = blank(0.22);
    tone(b, { at: 0, len: 0.08, freq: 1046.5, shape: 'sine', gain: 0.32, decay: 14 });
    tone(b, { at: 0.06, len: 0.14, freq: 1318.5, shape: 'sine', gain: 0.34, decay: 10 });
    return b;
  })(),
  click: (() => {
    const b = blank(0.05);
    tone(b, { len: 0.035, freq: 880, shape: 'sine', gain: 0.24, decay: 24 });
    return b;
  })(),
  alert: (() => {
    const b = blank(0.24);
    tone(b, { at: 0, len: 0.10, freq: 440, shape: 'tri', gain: 0.35, decay: 12 });
    tone(b, { at: 0.11, len: 0.12, freq: 349.2, shape: 'tri', gain: 0.35, decay: 10 });
    return b;
  })(),
});

addMissing('SoftDOS', {
  beep: (() => {
    const b = blank(0.14);
    tone(b, { len: 0.12, freq: 800, shape: 'square', gain: 0.28, decay: 4 });
    return b;
  })(),
  click: (() => {
    const b = blank(0.04);
    tone(b, { len: 0.02, freq: 1200, shape: 'square', gain: 0.18, decay: 25 });
    return b;
  })(),
});
