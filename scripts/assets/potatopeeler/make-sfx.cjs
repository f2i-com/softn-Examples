/**
 * Deterministic WAV sound synthesizer for Potato Peeler
 * (Ministry of Tubers — Kolkhoz Kitchen Station No. 7).
 */
const path = require('path');
const { blank, tone, noise, writeAll } = require('../sfx-lib.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BUNDLE_DIR = path.join(REPO_ROOT, 'bundles', 'games', 'PotatoPeeler');

function makeScrape(baseFreq, sweepFreq, crispness) {
  const b = blank(0.11);
  noise(b, { at: 0.0, len: 0.10, gain: 0.42, decay: 7.5, cutoff: (p) => crispness + p * 0.35 });
  tone(b, { at: 0.004, len: 0.075, freq: (p) => baseFreq + p * sweepFreq, shape: 'tri', gain: 0.22, decay: 11 });
  return b;
}

function makeLaser() {
  const b = blank(0.14);
  tone(b, { at: 0.0, len: 0.13, freq: (p) => 920 - p * 410, shape: 'sine', gain: 0.30, decay: 7 });
  tone(b, { at: 0.0, len: 0.12, freq: (p) => 1840 - p * 820, shape: 'tri', gain: 0.16, decay: 9 });
  noise(b, { at: 0.01, len: 0.09, gain: 0.16, decay: 10, cutoff: 0.55 });
  return b;
}

function makePlop() {
  const b = blank(0.24);
  tone(b, { at: 0.0, len: 0.09, freq: (p) => 220 + p * 340, shape: 'sine', gain: 0.45, decay: 8 });
  tone(b, { at: 0.055, len: 0.15, freq: (p) => 480 + p * 260, shape: 'sine', gain: 0.28, decay: 9 });
  noise(b, { at: 0.03, len: 0.14, gain: 0.24, decay: 8, cutoff: 0.32 });
  return b;
}

function makeSack() {
  const b = blank(0.18);
  tone(b, { at: 0.0, len: 0.10, freq: (p) => 125 - p * 55, shape: 'sine', gain: 0.38, decay: 9 });
  noise(b, { at: 0.0, len: 0.16, gain: 0.32, decay: 6.5, cutoff: 0.18 });
  return b;
}

function makeUpgrade() {
  const b = blank(0.42);
  // Mechanical clunk + Soviet triumphant fourth/fifth brass chord (A4 -> D5 -> F#5/A5)
  noise(b, { at: 0.0, len: 0.05, gain: 0.28, decay: 14, cutoff: 0.4 });
  tone(b, { at: 0.02, len: 0.14, freq: 440, shape: 'tri', gain: 0.32, decay: 6 });
  tone(b, { at: 0.11, len: 0.15, freq: 587.33, shape: 'tri', gain: 0.34, decay: 5.5 });
  tone(b, { at: 0.21, len: 0.20, freq: 880, shape: 'tri', gain: 0.38, decay: 4.5 });
  tone(b, { at: 0.21, len: 0.20, freq: 659.25, shape: 'sine', gain: 0.24, decay: 4.8 });
  return b;
}

function makeQuota() {
  const b = blank(0.62);
  // 4-note Stakhanovite brass/accordion fanfare (D4 - G4 - B4 - D5)
  const notes = [
    [0.00, 0.13, 293.66],
    [0.11, 0.13, 392.00],
    [0.22, 0.14, 493.88],
    [0.34, 0.27, 587.33],
  ];
  for (const [at, len, f] of notes) {
    tone(b, { at, len, freq: f, shape: 'tri', gain: 0.34, decay: 4.2 });
    tone(b, { at, len, freq: f * 2, shape: 'sine', gain: 0.14, decay: 5.5 });
  }
  tone(b, { at: 0.34, len: 0.27, freq: 392.00, shape: 'sine', gain: 0.20, decay: 4.2 });
  return b;
}

function makeStamp() {
  const b = blank(0.22);
  tone(b, { at: 0.0, len: 0.09, freq: (p) => 150 - p * 85, shape: 'sine', gain: 0.52, decay: 10 });
  noise(b, { at: 0.0, len: 0.08, gain: 0.42, decay: 12, cutoff: 0.28 });
  tone(b, { at: 0.07, len: 0.08, freq: 620, shape: 'tri', gain: 0.16, decay: 12 });
  return b;
}

function makeClick() {
  const b = blank(0.06);
  tone(b, { at: 0.0, len: 0.04, freq: (p) => 980 - p * 320, shape: 'tri', gain: 0.28, decay: 16 });
  noise(b, { at: 0.0, len: 0.025, gain: 0.18, decay: 18, cutoff: 0.5 });
  return b;
}

function makeBuzz() {
  const b = blank(0.20);
  tone(b, { at: 0.0, len: 0.09, freq: 145, shape: 'square', gain: 0.24, decay: 7 });
  tone(b, { at: 0.09, len: 0.10, freq: 118, shape: 'square', gain: 0.24, decay: 7 });
  return b;
}

function makeBell() {
  const b = blank(0.46);
  // Crisp brass commissary desk bell (double ring: D6 + inharmonic overtones)
  for (const offset of [0.0, 0.13]) {
    tone(b, { at: offset, len: 0.30, freq: 1174.66, shape: 'sine', gain: 0.36, decay: 6.5 });
    tone(b, { at: offset, len: 0.24, freq: 2349.32, shape: 'sine', gain: 0.20, decay: 8.5 });
    tone(b, { at: offset, len: 0.16, freq: 3185.0, shape: 'sine', gain: 0.12, decay: 11.0 });
  }
  return b;
}

function makeOverdrive() {
  const b = blank(0.68);
  // Hot Samovar Tea Overdrive rising Soviet brass/accordion chord (A4 -> C#5 -> E5 -> A5)
  const chord = [
    [0.00, 0.14, 440.00],
    [0.09, 0.15, 554.37],
    [0.18, 0.16, 659.25],
    [0.28, 0.38, 880.00],
  ];
  for (const [at, len, f] of chord) {
    tone(b, { at, len, freq: f, shape: 'tri', gain: 0.34, decay: 3.8 });
    tone(b, { at, len, freq: f * 0.5, shape: 'sine', gain: 0.18, decay: 4.0 });
  }
  noise(b, { at: 0.0, len: 0.18, gain: 0.16, decay: 8.0, cutoff: 0.45 });
  return b;
}

function makeSquish() {
  const b = blank(0.18);
  // Snappy counter-sabotage swat + zap pop
  tone(b, { at: 0.0, len: 0.09, freq: (p) => 680 - p * 440, shape: 'tri', gain: 0.38, decay: 9.5 });
  tone(b, { at: 0.05, len: 0.10, freq: (p) => 380 + p * 520, shape: 'sine', gain: 0.26, decay: 10.0 });
  noise(b, { at: 0.0, len: 0.08, gain: 0.25, decay: 12.0, cutoff: 0.42 });
  return b;
}

function makeBossThud() {
  const b = blank(0.52);
  // Heavy Tsar-Kartoshka thud onto butcher block + low brass alert fifth
  tone(b, { at: 0.0, len: 0.24, freq: (p) => 130 - p * 78, shape: 'sine', gain: 0.56, decay: 6.5 });
  noise(b, { at: 0.0, len: 0.16, gain: 0.38, decay: 9.0, cutoff: 0.20 });
  tone(b, { at: 0.14, len: 0.34, freq: 220.0, shape: 'tri', gain: 0.28, decay: 4.5 });
  tone(b, { at: 0.22, len: 0.28, freq: 329.63, shape: 'tri', gain: 0.28, decay: 4.5 });
  return b;
}

function makeOrderDone() {
  const b = blank(0.44);
  const notes = [
    [0.00, 0.11, 523.25], // C5
    [0.09, 0.11, 659.25], // E5
    [0.18, 0.24, 783.99], // G5
  ];
  for (const [at, len, f] of notes) {
    tone(b, { at, len, freq: f, shape: 'tri', gain: 0.32, decay: 5.0 });
    tone(b, { at, len, freq: f * 2, shape: 'sine', gain: 0.10, decay: 7.0 });
  }
  return b;
}

function makeRadioPolka() {
  // Original 16-beat (6.40s @ 150 BPM, beat = 0.40s, eighth = 0.20s) seamless A-minor
  // Kolkhoz accordion oom-pah + plucked balalaika folk work-tune!
  const step = 0.20;
  const totalSteps = 32;
  const b = blank(totalSteps * step);

  // Melody in A harmonic minor (original cheerful folk work-dance phrase)
  const N = {
    A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33,
    E5: 659.25, F5: 698.46, Gs5: 830.61, A5: 880.00, G4: 392.00, Gs4: 415.30,
  };
  const melody = [
    // Bar 1 (Am)
    N.E5, N.C5, N.A4, N.C5,  N.E5, N.A5, N.E5, N.C5,
    // Bar 2 (Dm -> Am)
    N.D5, N.F5, N.E5, N.D5,  N.C5, N.B4, N.A4, N.C5,
    // Bar 3 (E7 -> Am)
    N.B4, N.Gs4, N.B4, N.D5, N.E5, N.F5, N.E5, N.D5,
    // Bar 4 (Am -> E7 -> Am cadence)
    N.C5, N.E5, N.D5, N.B4,  N.A4, N.E5, N.A4, 0,
  ];
  const bassRoots = [
    110.00, 110.00, 110.00, 110.00, // Am
    146.83, 146.83, 110.00, 110.00, // Dm -> Am
    82.41,  123.47, 110.00, 110.00, // E7 -> Am
    110.00, 82.41,  110.00, 110.00, // Am -> E -> Am
  ];

  // Oom-pah bass & off-beat accordion chord stabs
  for (let beat = 0; beat < 16; beat += 1) {
    const t0 = beat * 0.40;
    const root = bassRoots[beat];
    // Downbeat bass ("oom")
    tone(b, { at: t0, len: 0.18, freq: root, shape: 'tri', gain: 0.24, decay: 6.5 });
    tone(b, { at: t0, len: 0.16, freq: root * 2, shape: 'sine', gain: 0.12, decay: 7.5 });
    // Offbeat accordion stab ("pah")
    const tOff = t0 + 0.20;
    const third = Math.abs(root - 82.41) < 1 || Math.abs(root - 123.47) < 1 ? root * 2.52 : root * 2.38;
    tone(b, { at: tOff, len: 0.14, freq: third, shape: 'tri', gain: 0.13, decay: 8.5 });
    tone(b, { at: tOff, len: 0.14, freq: root * 3.0, shape: 'tri', gain: 0.11, decay: 8.5 });
    noise(b, { at: tOff, len: 0.04, gain: 0.05, decay: 16.0, cutoff: 0.55 });
  }

  // Plucked balalaika lead
  for (let s = 0; s < totalSteps; s += 1) {
    const f = melody[s];
    if (f > 0) {
      const at = s * step;
      tone(b, { at, len: 0.185, freq: f, shape: 'tri', gain: 0.26, decay: 6.2, attack: 0.002 });
      tone(b, { at, len: 0.11, freq: f * 2, shape: 'sine', gain: 0.09, decay: 10.5, attack: 0.002 });
    }
  }
  return b;
}

writeAll(BUNDLE_DIR, {
  scrape1: makeScrape(520, 260, 0.34),
  scrape2: makeScrape(610, 310, 0.40),
  scrape3: makeScrape(460, 220, 0.30),
  laser: makeLaser(),
  plop: makePlop(),
  sack: makeSack(),
  upgrade: makeUpgrade(),
  quota: makeQuota(),
  stamp: makeStamp(),
  click: makeClick(),
  buzz: makeBuzz(),
  bell: makeBell(),
  overdrive: makeOverdrive(),
  squish: makeSquish(),
  boss_thud: makeBossThud(),
  order_done: makeOrderDone(),
  radio_polka: makeRadioPolka(),
});
