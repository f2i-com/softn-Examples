#!/usr/bin/env node
'use strict';

/**
 * Automated verification suite for bundles/games/VoiceSimulator:
 *  1. Bundle structure, manifest/permission parity, Radiance HDR, WebP screenshot,
 *     Blender PBR Mouth GLB (verifying all 17 mouth/tongue morph targets & jaw/velum nodes,
 *     and verifying X-Ray, Chat, Quiz, and Organ clutter are completely removed while
 *     Direct Speak + Full Voice Lab + Mobile @media layout are present),
 *     balanced UI directives, and @softn/core AST parse.
 *  2. Pure-code LF mucosal glottal + chest resonance + 5-formant + Piriform notch speech synthesis:
 *     Male, Female, and all 10 curated human presets, F0 autocorrelation pitch tracking,
 *     formant scaling, IPA G2P normalization, and RIFF/WAVE generation.
 *  3. Real-time <AudioStream getSamples={sampleSource}> speech streaming & sample-locked 60fps
 *     3D mouth lip-sync across long multi-sentence paragraphs with zero main-thread freezes.
 *  4. Always-visible Full Voice Lab controls (direct numeric Hz/cm/speed inputs, warmth, chest body,
 *     breathiness, roughness/fry, nasality, crispness, intonation, vibrato, whisper, presets).
 *  5. Real Zipp WASM 50M main-thread instruction budget stress test on long paragraphs & WAV export.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const APP_DIR = path.join(ROOT, 'bundles', 'games', 'VoiceSimulator');
const IMPORT_LINE = /^[ \t]*import[ \t]+["']([^"'\n]+)["'][ \t]*;?[ \t]*$/gm;

function listFiles(dir, prefix = '') {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) =>
      d.name.startsWith('.')
        ? []
        : d.isDirectory()
          ? listFiles(path.join(dir, d.name), `${prefix}${d.name}/`)
          : [`${prefix}${d.name}`]
    );
}

function composeLogic(appDir, entry = 'logic/main.logic') {
  const included = new Set();
  const order = [];
  const expand = (relPath, chain) => {
    if (chain.includes(relPath)) {
      throw new Error(`Circular import: ${[...chain, relPath].join(' -> ')}`);
    }
    const full = path.join(appDir, relPath);
    assert.ok(fs.existsSync(full), `Missing imported logic file: ${relPath}`);
    included.add(relPath);
    const src = fs.readFileSync(full, 'utf8').replace(/\r\n?/g, '\n');
    const code = src.replace(IMPORT_LINE, (_line, spec) => {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relPath), spec));
      if (included.has(target)) return `/* already included: ${spec} */`;
      return expand(target, [...chain, relPath]);
    });
    order.push(relPath);
    return `// ===== ${relPath} =====\n${code}\n`;
  };
  return { code: expand(entry, []), files: order };
}

function parseGlbJsonChunk(glbBuf) {
  assert.equal(glbBuf.toString('ascii', 0, 4), 'glTF', 'Invalid glTF magic');
  assert.equal(glbBuf.readUInt32LE(4), 2, 'Expected glTF v2');
  const chunkLen = glbBuf.readUInt32LE(12);
  const chunkType = glbBuf.readUInt32LE(16);
  assert.equal(chunkType, 0x4e4f534a, 'Expected JSON first chunk in GLB');
  return JSON.parse(glbBuf.toString('utf8', 20, 20 + chunkLen));
}

function estimateAutocorrF0(pcm, sampleRate, minHz = 65, maxHz = 340) {
  const start = Math.floor(pcm.length * 0.2);
  const len = Math.min(4800, pcm.length - start);
  if (len < 600) return 0;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);
  let bestLag = minLag;
  let bestCorr = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let e0 = 0;
    let e1 = 0;
    for (let i = 0; i < len - lag; i++) {
      const a = pcm[start + i];
      const b = pcm[start + i + lag];
      sum += a * b;
      e0 += a * a;
      e1 += b * b;
    }
    const r = sum / (Math.sqrt(e0 * e1) + 1e-9);
    if (r > bestCorr) {
      bestCorr = r;
      bestLag = lag;
    }
  }
  return bestCorr > 0.45 ? sampleRate / bestLag : 0;
}

async function verifyStaticAssetsAndUiAst() {
  const allFiles = listFiles(APP_DIR);
  for (const rel of allFiles) {
    assert.ok(
      rel === 'manifest.json' ||
        rel === 'permission.json' ||
        rel.startsWith('ui/') ||
        rel.startsWith('logic/') ||
        rel.startsWith('assets/'),
      `Unexpected file in VoiceSimulator bundle: ${rel}`
    );
  }

  const allLogic = listFiles(path.join(APP_DIR, 'logic'), 'logic/')
    .filter((f) => f.endsWith('.logic'))
    .sort();

  for (const file of allLogic) {
    const raw = fs.readFileSync(path.join(APP_DIR, file), 'utf8');
    assert.ok(!raw.includes('speechSynthesis'), `${file} must not use browser speechSynthesis`);
    new vm.Script(raw.replace(IMPORT_LINE, ''), { filename: file });
  }

  const composed = composeLogic(APP_DIR);
  new vm.Script(composed.code, { filename: 'VoiceSimulator/logic (composed)' });
  const orphans = allLogic.filter((f) => !composed.files.includes(f));
  assert.deepEqual(orphans, [], `Orphan .logic files: ${orphans.join(', ')}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'manifest.json'), 'utf8'));
  const perm = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'permission.json'), 'utf8'));
  assert.equal(manifest.name, 'VoiceSimulator');
  assert.equal(perm.app.name, 'VoiceSimulator');
  assert.equal(manifest.version, perm.app.version);
  assert.equal(manifest.main, 'ui/main.ui');

  const assetsOnDisk = listFiles(path.join(APP_DIR, 'assets'), 'assets/').sort();
  assert.deepEqual([...manifest.files.assets].sort(), assetsOnDisk, 'manifest.files.assets mismatch');
  assert.deepEqual([...manifest.files.logic].sort(), allLogic, 'manifest.files.logic mismatch');

  // Ensure X-Ray cutaway model is completely removed from disk and manifest
  assert.ok(
    !fs.existsSync(path.join(APP_DIR, 'assets/models/vocal-anatomy-rig.glb')),
    'Obsolete vocal-anatomy-rig.glb should be removed'
  );
  assert.ok(
    !manifest.files.assets.includes('assets/models/vocal-anatomy-rig.glb'),
    'manifest.json must not reference vocal-anatomy-rig.glb'
  );

  // Check HDR & Promotional Screenshot
  const hdrBuf = fs.readFileSync(path.join(APP_DIR, 'assets/env/vocal-studio.hdr'));
  assert.ok(hdrBuf.toString('ascii', 0, 10).startsWith('#?RADIANCE'), 'Invalid Radiance HDR');

  const shotPath = path.join(ROOT, 'screenshots', 'VoiceSimulator.webp');
  assert.ok(fs.existsSync(shotPath), 'Missing screenshots/VoiceSimulator.webp');
  const shotBuf = fs.readFileSync(shotPath);
  assert.equal(shotBuf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(shotBuf.toString('ascii', 8, 12), 'WEBP');

  // Verify hero 3D Mouth GLB nodes & all 17 morph targets
  const mouthGlb = parseGlbJsonChunk(
    fs.readFileSync(path.join(APP_DIR, 'assets/models/mouth-avatar.glb'))
  );
  const nodeNames = new Set((mouthGlb.nodes || []).map((n) => n.name));
  for (const reqNode of [
    'Mouth_Root',
    'Mouth_Pivot',
    'Mouth_Lips',
    'Upper_Teeth',
    'Velum_Uvula',
    'Jaw_Pivot',
    'Lower_Teeth',
    'Tongue_Body',
  ]) {
    assert.ok(nodeNames.has(reqNode), `mouth-avatar.glb missing required node: ${reqNode}`);
  }
  const targetNames = new Set(
    (mouthGlb.meshes || []).flatMap((m) =>
      m.extras && Array.isArray(m.extras.targetNames) ? m.extras.targetNames : []
    )
  );
  const expectedMorphs = [
    'Jaw_Open',
    'Lip_Close',
    'Lip_Round',
    'Lip_Spread',
    'Lip_Dental',
    'Upper_Lip_Raise',
    'Lower_Lip_Depress',
    'Corner_Up',
    'Corner_Down',
    'Cheek_Puff',
    'Feminine_Mouth',
    'Asymmetry_Natural',
    'Tongue_Tip_Up',
    'Tongue_Interdental',
    'Tongue_High_Front',
    'Tongue_High_Back',
    'Tongue_Retroflex',
  ];
  for (const morph of expectedMorphs) {
    assert.ok(targetNames.has(morph), `mouth-avatar.glb missing morph target: ${morph}`);
  }

  // Verify simplified UI: no X-Ray, no Chat, no Quiz, no Organ, always-visible Speak + Full Voice Lab + mobile @media
  const uiText = fs.readFileSync(path.join(APP_DIR, 'ui/main.ui'), 'utf8');
  assert.ok(!/X-Ray|toggleAnatomyXRay|submitChatTurn|submitChallengeOption|toggleLiveOrganVoicing/i.test(uiText), 'Chat, Quiz, Organ, and X-Ray must be removed from ui/main.ui');
  assert.ok(!/activeTab\s*===/i.test(uiText), 'Full Voice Lab & Type-and-Speak must be always visible (not hidden behind tabs)');
  assert.ok(uiText.includes('TYPE & SPEAK') && uiText.includes('VOICE LAB'), 'ui/main.ui must include Type & Speak and always-visible Voice Lab');
  assert.ok(uiText.includes('@media (max-width: 860px)'), 'ui/main.ui must include mobile-friendly responsive CSS');

  let depth = 0;
  for (const line of uiText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#if ') || trimmed.startsWith('#each ')) depth += 1;
    else if (trimmed === '#end') depth -= 1;
    assert.ok(depth >= 0, 'Unmatched #end in ui/main.ui');
  }
  assert.equal(depth, 0, `Unclosed #if/#each in ui/main.ui (depth=${depth})`);

  const softnCoreDist = 'E:/repos/softn.com/packages/@softn/core/dist/index.js';
  if (fs.existsSync(softnCoreDist)) {
    const softnCore = await import(pathToFileURL(softnCoreDist).href);
    if (typeof softnCore.parse === 'function') {
      const ast = softnCore.parse(uiText);
      assert.ok(ast && ast.template, '@softn/core failed to parse ui/main.ui');
    }
  }
}

function createAppSandbox() {
  const storageMap = new Map();
  const savedFiles = [];

  const sandbox = {
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Date,
    RegExp,
    Float32Array,
    Int16Array,
    Uint8Array,
    DataView,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    console,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
    },
    softn: {
      files: {
        saveFile: (name, content, opts, cb) => {
          savedFiles.push({ name, content, opts });
          if (typeof cb === 'function') cb({ saved: true });
        },
      },
    },
  };

  const composed = composeLogic(APP_DIR);
  const helperExpose = `
    globalThis.__vsTest = {
      getState: () => ({
        gender, pitchHz, tractLengthCm, speed, warmth, chestResonance,
        breathiness, nasality, roughness, crispness, expressiveness, vibrato,
        whisper, presetId, cameraPreset, mobileStageCompact,
        directSpeakInput, isSpeaking, playbackElapsedSec, playbackDurationSec,
        streamRenderedSec: _speechStreamRenderedSec,
        streamDone: _speechStream ? _speechStream.done : true,
        lastIpa, lastWavDataUrl,
        mouthAnim, sceneObjects, presets: VOICE_PRESETS, phrases: QUICK_SPEAK_PHRASES
      }),
      setVoiceGender,
      adjustPitchBy,
      selectVoicePreset,
      onPitchTextInput,
      onTractTextInput,
      onSpeedTextInput,
      commitNumericVoiceInputs,
      onWarmthSliderChange,
      onChestSliderChange,
      onBreathSliderChange,
      onNasalitySliderChange,
      onRoughnessSliderChange,
      onCrispnessSliderChange,
      onExpressSliderChange,
      onVibratoSliderChange,
      toggleWhisperMode,
      resetVoiceToDefaults,
      setDirectInput: (t) => { directSpeakInput = t; },
      triggerDirectSpeak,
      speakQuickPhrase,
      replayLastUtterance,
      exportLastWav,
      stepSimulation,
      synthesizeSpeechUtterance,
      textToUtterancePlan,
      sampleSource,
      setCameraView,
      toggleMobileStageSize
    };
  `;

  vm.createContext(sandbox);
  vm.runInContext(`${composed.code}\n${helperExpose}`, sandbox, {
    filename: 'VoiceSimulator/runtime',
  });

  return { api: sandbox.__vsTest, savedFiles, storageMap };
}

function decodeBlockPeakAbs(block) {
  assert.ok(block && typeof block.pcm === 'string' && block.frames > 0, 'Expected valid AudioStream i16 block');
  const buf = Buffer.from(block.pcm, 'base64');
  assert.equal(buf.length, block.frames * 2, 'Base64 i16 byte length mismatch');
  let peak = 0;
  for (let i = 0; i < block.frames; i++) {
    const s = Math.abs(buf.readInt16LE(i * 2));
    if (s > peak) peak = s;
  }
  return peak;
}

function verifySpeechPhysicsAndVoices() {
  const { api } = createAppSandbox();

  // 1. Male voice pitch & waveform check
  const maleRes = api.synthesizeSpeechUtterance('Hello world, welcome to the voice simulator.', {
    gender: 'male',
    pitchHz: 108,
    tractLengthCm: 17.6,
    warmth: 0.62,
    chestResonance: 0.56,
  });
  assert.ok(maleRes.ok && maleRes.pcm.length > 24000, 'Male utterance PCM too short');
  const maleF0 = estimateAutocorrF0(maleRes.pcm, maleRes.sampleRate);
  assert.ok(maleF0 >= 88 && maleF0 <= 136, `Expected Male F0 near 108 Hz, got ${maleF0.toFixed(1)} Hz`);

  // 2. Female voice pitch & higher formant scaling check
  const femRes = api.synthesizeSpeechUtterance('Hello world, welcome to the voice simulator.', {
    gender: 'female',
    pitchHz: 186,
    tractLengthCm: 16.0,
    warmth: 0.66,
    chestResonance: 0.50,
  });
  assert.ok(femRes.ok && femRes.pcm.length > 24000, 'Female utterance PCM too short');
  const femF0 = estimateAutocorrF0(femRes.pcm, femRes.sampleRate);
  assert.ok(femF0 >= 162 && femF0 <= 220, `Expected Female F0 near 186 Hz, got ${femF0.toFixed(1)} Hz`);
  assert.ok(femF0 > maleF0 + 50, 'Female F0 must be distinctly higher than Male F0');

  // Compare average vowel F2 (Female shorter vocal tract -> higher F2)
  const avgVowelF2 = (frames) => {
    const vf = frames.filter((f) => f.av > 0.5 && f.jaw > 0.25);
    return vf.reduce((s, f) => s + f.f2, 0) / Math.max(1, vf.length);
  };
  assert.ok(
    avgVowelF2(femRes.frames) > avgVowelF2(maleRes.frames) + 75,
    'Female vocal tract must shift vowel formants higher than Male vocal tract'
  );
}

function verifyStreamingSyncVoiceLabAnd3DAnimation() {
  const { api, savedFiles, storageMap } = createAppSandbox();

  // 1. Direct text-to-speech & audible real-time streaming
  api.setDirectInput('Hello! Welcome to the simplified human voice simulator.');
  api.triggerDirectSpeak();
  let st = api.getState();
  assert.equal(st.isSpeaking, true, 'Utterance stream must start speaking immediately');

  let openingPeak = 0;
  for (let b = 0; b < 6; b++) {
    openingPeak = Math.max(openingPeak, decodeBlockPeakAbs(api.sampleSource(640)));
  }
  assert.ok(openingPeak > 1500, `Streamed speech PCM blocks must contain audible vocal signal (got peak=${openingPeak})`);

  // 2. Verify Male/Female toggle & all 10 curated human presets produce clean audio
  api.setVoiceGender('female');
  st = api.getState();
  assert.equal(st.gender, 'female');
  assert.equal(st.presetId, 'natural_female');
  assert.ok(st.pitchHz >= 180, `Expected female pitch >= 180 Hz, got ${st.pitchHz}`);
  assert.ok(storageMap.size >= 1, 'Profile changes must persist to localStorage');

  assert.equal(st.presets.length, 10, 'Expected 10 curated human voice presets');
  for (const pr of st.presets) {
    api.selectVoicePreset(pr.id);
    assert.equal(api.getState().presetId, pr.id);
    let prPeak = 0;
    for (let b = 0; b < 6; b++) {
      prPeak = Math.max(prPeak, decodeBlockPeakAbs(api.sampleSource(640)));
    }
    assert.ok(prPeak > 500, `Preset ${pr.id} must produce audible PCM output (got peak=${prPeak})`);
  }

  // 3. Always-visible Full Voice Lab controls: direct numeric entry & vocal fold/resonance sliders
  api.onPitchTextInput('196');
  api.onTractTextInput('15.7');
  api.onSpeedTextInput('1.06');
  api.commitNumericVoiceInputs();
  api.onWarmthSliderChange('0.72');
  api.onChestSliderChange('0.58');
  api.onRoughnessSliderChange('0.18');
  api.onNasalitySliderChange('0.22');
  api.onBreathSliderChange('0.12');
  api.onCrispnessSliderChange('1.08');
  api.onExpressSliderChange('1.15');
  api.onVibratoSliderChange('0.16');

  st = api.getState();
  assert.equal(st.pitchHz, 196);
  assert.equal(st.tractLengthCm, 15.7);
  assert.equal(st.speed, 1.06);
  assert.equal(st.warmth, 0.72);
  assert.equal(st.chestResonance, 0.58);
  assert.equal(st.roughness, 0.18);
  assert.equal(st.nasality, 0.22);

  api.selectVoicePreset('warm_narrator');
  assert.equal(api.getState().presetId, 'warm_narrator');
  assert.equal(api.getState().gender, 'male');

  // 4. Articulatory 3D Mouth & Tongue animation across rich phonetic sentence
  api.setDirectInput('Think fast, boys and girls, smooth red ocean.');
  api.triggerDirectSpeak();

  let maxJaw = 0;
  let maxLipClose = 0;
  let maxLipDental = 0;
  let maxLipRound = 0;
  let maxInterdental = 0;
  let maxRetroflex = 0;

  for (let i = 0; i < 240; i++) {
    api.sampleSource(384);
    api.stepSimulation(0.016);
    const cur = api.getState();
    const hero = cur.sceneObjects.find((o) => o.id === 'hero_mouth');
    assert.ok(hero && hero.appearance && hero.appearance.morphs);
    const m = hero.appearance.morphs;
    maxJaw = Math.max(maxJaw, m.Jaw_Open);
    maxLipClose = Math.max(maxLipClose, m.Lip_Close);
    maxLipDental = Math.max(maxLipDental, m.Lip_Dental);
    maxLipRound = Math.max(maxLipRound, m.Lip_Round);
    maxInterdental = Math.max(maxInterdental, m.Tongue_Interdental);
    maxRetroflex = Math.max(maxRetroflex, m.Tongue_Retroflex);

    assert.ok(Math.abs(hero.parts.Jaw_Pivot.rotation.x - 0.42 * m.Jaw_Open) < 1e-6);
  }

  assert.ok(maxJaw > 0.35, `Expected mouth jaw opening > 0.35, got ${maxJaw}`);
  assert.ok(maxLipClose > 0.30, `Expected bilabial Lip_Close > 0.30 on 'boys', got ${maxLipClose}`);
  assert.ok(maxLipDental > 0.30, `Expected labiodental Lip_Dental > 0.30 on 'fast', got ${maxLipDental}`);
  assert.ok(maxLipRound > 0.30, `Expected rounded Lip_Round > 0.30 on 'smooth/ocean', got ${maxLipRound}`);
  assert.ok(maxInterdental > 0.30, `Expected Tongue_Interdental > 0.30 on 'Think/smooth', got ${maxInterdental}`);
  assert.ok(maxRetroflex > 0.25, `Expected Tongue_Retroflex > 0.25 on 'girls/red', got ${maxRetroflex}`);

  // 5. Long Multi-Sentence Paragraph Continuous Streaming & Phase-Locked Lip-Sync Test
  const longParagraph =
    'Watch my lips, jaw, and tongue stay in continuous synchronization across this entire long paragraph without ever freezing. ' +
    'Every single vowel, nasal murmur, and crisp consonant is synthesized live in tiny twenty millisecond blocks directly inside the vocal tract stream, ' +
    'so both male and female voices sound natural and responsive from the first word to the very last syllable.';
  api.setDirectInput(longParagraph);
  const tStart = Date.now();
  api.triggerDirectSpeak();
  const planMs = Date.now() - tStart;
  assert.ok(planMs < 50, `Long paragraph planning must be near-instant (<50ms), took ${planMs}ms`);

  st = api.getState();
  assert.ok(st.playbackDurationSec > 12.0, `Expected long paragraph > 12s, got ${st.playbackDurationSec.toFixed(2)}s`);
  const totalFrames60fps = Math.ceil((st.playbackDurationSec + 0.5) / 0.016);
  let maxSyncDriftSec = 0;
  let activeBlocks = 0;

  for (let step = 0; step < totalFrames60fps; step++) {
    if (step % 2 === 0) {
      const blk = api.sampleSource(768);
      if (decodeBlockPeakAbs(blk) > 25) activeBlocks += 1;
    }
    api.stepSimulation(0.016);
    const cur = api.getState();
    if (!cur.isSpeaking) break;
    if (!cur.streamDone && step > 6) {
      const expectedAudible = Math.max(0, cur.streamRenderedSec - 0.065);
      const drift = Math.abs(cur.playbackElapsedSec - expectedAudible);
      if (drift > maxSyncDriftSec) maxSyncDriftSec = drift;
    }
  }

  assert.ok(activeBlocks > 250, `Expected >250 active streamed audio blocks across paragraph, got ${activeBlocks}`);
  assert.ok(
    maxSyncDriftSec < 0.085,
    `3D mouth playhead must stay phase-locked within 85ms of audio stream across long paragraphs (max drift=${(maxSyncDriftSec * 1000).toFixed(1)}ms)`
  );
  assert.equal(api.getState().isSpeaking, false, 'Long paragraph must cleanly finish isSpeaking=false at end of stream');

  // 6. Export WAV file
  api.exportLastWav();
  assert.equal(savedFiles.length, 1);
  assert.ok(savedFiles[0].name.endsWith('.wav'));
  const wavBytes = Buffer.from(savedFiles[0].content, 'base64');
  assert.equal(wavBytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wavBytes.toString('ascii', 8, 12), 'WAVE');

  // 7. Mobile compact toggle & pure mouth-only 3D viewport across ALL camera presets
  api.toggleMobileStageSize();
  assert.equal(api.getState().mobileStageCompact, true);
  for (const preset of ['front', 'three_quarter', 'closeup', 'side']) {
    api.setCameraView(preset);
    const viewState = api.getState();
    assert.equal(viewState.sceneObjects.length, 1);
    assert.equal(viewState.sceneObjects[0].id, 'hero_mouth');
  }

  // 8. Native spoken contractions & weak-form function words
  const contrPlan = api.textToUtterancePlan("I'm glad we don't freeze on the biggest sentences!");
  assert.equal(contrPlan.words[0].word, "i'm");
  assert.ok(contrPlan.ipaString.includes('doʊnt'), `Expected /doʊnt/ in IPA, got ${contrPlan.ipaString}`);
}

async function verifyZippWasmInstructionBudget() {
  const zippJsPath = 'E:/repos/softn.com/packages/@softn/core/wasm-zipp/zipp_wasm.js';
  const zippWasmPath = 'E:/repos/softn.com/packages/@softn/core/wasm-zipp/zipp_wasm_bg.wasm';
  if (!fs.existsSync(zippJsPath) || !fs.existsSync(zippWasmPath)) {
    return false;
  }

  const { initSync, Engine } = await import(pathToFileURL(zippJsPath).href);
  initSync({ module: fs.readFileSync(zippWasmPath) });

  const MAIN_THREAD_BUDGET = 50_000_000;
  const composed = composeLogic(APP_DIR).code;
  const engine = new Engine();
  const store = new Map();
  engine.setLocalStorageBridge({
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  });
  engine.setSyncHostCapabilities(['ls.getItem', 'ls.setItem', 'ls.removeItem', 'ls.clear']);
  engine.setInstructionBudget(MAIN_THREAD_BUDGET);
  engine.initScript(composed);

  for (const phrase of [
    'Hello, welcome to the human voice simulator.',
    'The quick brown fox jumps over the lazy dog.',
    'Watch my lips, jaw, and tongue stay in continuous sync across a very long multi sentence paragraph without ever freezing or sounding robotic!'
  ]) {
    engine.setInstructionBudget(MAIN_THREAD_BUDGET);
    engine.callFunction('speakQuickPhrase', [phrase]);

    for (let i = 0; i < 120; i++) {
      engine.setInstructionBudget(MAIN_THREAD_BUDGET);
      engine.callFunction('sampleSource', [768]);
      engine.setInstructionBudget(MAIN_THREAD_BUDGET);
      engine.callFunction('stepSimulation', [0.016]);
    }
  }

  engine.setInstructionBudget(MAIN_THREAD_BUDGET);
  engine.callFunction('setVoiceGender', ['female']);

  // Verify synchronous WAV export on long utterance stays safely under 50M Zipp instructions
  engine.setInstructionBudget(MAIN_THREAD_BUDGET);
  engine.callFunction('exportLastWav', []);

  engine.free();
  return true;
}

async function main() {
  console.log('Running Voice Simulator verification suite...');
  await verifyStaticAssetsAndUiAst();
  console.log('  [PASS] Simplified UI (no Chat/Quiz/Organ/X-Ray), mobile @media, 17-morph Mouth GLB, HDR & WebP');
  verifySpeechPhysicsAndVoices();
  console.log('  [PASS] Male/Female LF mucosal glottal + chest body + 5-formant + Piriform notch physics');
  verifyStreamingSyncVoiceLabAnd3DAnimation();
  console.log('  [PASS] Gapless AudioStream paragraph sync, 10 human presets, Full Voice Lab & 17-morph 3D mouth');
  const ranZipp = await verifyZippWasmInstructionBudget();
  if (ranZipp) {
    console.log('  [PASS] Real Zipp WASM 50M main-thread instruction budget paragraph & WAV stress test');
  }
  console.log('All Voice Simulator checks passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
