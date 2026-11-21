#!/usr/bin/env node
'use strict';

/**
 * Headless verification suite for bundles/games/PotatoPeeler (v2.1.0):
 *  1. Static source, manifest, binary GLB (17) / HDR (1) / WAV (17) headers & @softn/core AST + CSS parse
 *  2. 3D potato skin-patch peeling, peel curls, blade trails, clean peels & Radio Mayak polka loop
 *  3. Podstakannik Hot Tea Overdrive (tea-glass.glb -> 2x speed & 2x Rubles)
 *  4. Colorado Saboteur Beetles (beetle-pest.glb) & Pioneer Bug-Zapper Lamp auto-zap beams
 *  5. Brass Service Bell (commissar-bell.glb) & Giant Boss Tsar-Kartoshka + VDNKh Crown (+5 spuds)
 *  6. Progression across all 6 peelers + 5 station upgrades (1 -> 5 board slots, >= 4x faster output),
 *     Live Canteen Dish Orders (dynamic stockpot broth), and 8 State Labour Medals
 *  7. 60-second Stakhanovite Blitz trial, Hall of Labour leaderboard sync, and schema v1/v2 save/backup
 *  8. Mobile & touch ergonomics: touchstart auto-quality, 390x844 portrait camera pull-back & FOV widening,
 *     844x390 short-landscape reframing, collapsible mobile drawer, proximity prop taps & haptic pulses
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const APP_DIR = path.join(ROOT, 'bundles', 'games', 'PotatoPeeler');
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

async function verifyStaticAssetsAndManifest() {
  const allFiles = listFiles(APP_DIR);
  for (const rel of allFiles) {
    assert.ok(
      rel === 'manifest.json' ||
        rel === 'permission.json' ||
        rel.startsWith('ui/') ||
        rel.startsWith('logic/') ||
        rel.startsWith('assets/'),
      `Unexpected file inside bundle directory: ${rel}`
    );
  }

  const allLogic = listFiles(path.join(APP_DIR, 'logic'), 'logic/')
    .filter((f) => f.endsWith('.logic'))
    .sort();
  for (const file of allLogic) {
    new vm.Script(fs.readFileSync(path.join(APP_DIR, file), 'utf8').replace(IMPORT_LINE, ''), {
      filename: file,
    });
  }

  const composed = composeLogic(APP_DIR);
  new vm.Script(composed.code, { filename: 'PotatoPeeler/logic (composed)' });
  const orphans = allLogic.filter((f) => !composed.files.includes(f));
  assert.deepEqual(orphans, [], `Orphan .logic files: ${orphans.join(', ')}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'manifest.json'), 'utf8'));
  const perm = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'permission.json'), 'utf8'));
  assert.equal(manifest.name, 'PotatoPeeler');
  assert.equal(manifest.version, '2.1.0');
  assert.equal(perm.app.name, 'PotatoPeeler');
  assert.equal(perm.app.version, '2.1.0');
  assert.equal(perm.permissions.storage.enabled, true);
  assert.equal(perm.permissions.storage.collections.scores, 'append-only');
  assert.equal(manifest.main, 'ui/main.ui');

  const assetsOnDisk = listFiles(path.join(APP_DIR, 'assets'), 'assets/').sort();
  assert.deepEqual([...manifest.files.assets].sort(), assetsOnDisk, 'manifest.files.assets mismatch');
  assert.deepEqual([...manifest.files.logic].sort(), allLogic, 'manifest.files.logic mismatch');
  assert.deepEqual(manifest.files.ui, ['ui/main.ui']);

  // Verify binary headers of all 17 GLBs, 1 HDR, and 17 WAVs
  const glbs = assetsOnDisk.filter((f) => f.endsWith('.glb'));
  assert.equal(glbs.length, 17, `Expected 17 Blender PBR .glb models, found ${glbs.length}`);
  for (const glb of glbs) {
    const buf = fs.readFileSync(path.join(APP_DIR, glb));
    assert.ok(buf.length > 1000, `${glb} suspiciously small (${buf.length} B)`);
    assert.equal(buf.toString('ascii', 0, 4), 'glTF', `${glb} invalid glTF magic`);
    assert.equal(buf.readUInt32LE(4), 2, `${glb} expected glTF v2`);
  }

  const hdrBuf = fs.readFileSync(path.join(APP_DIR, 'assets/env/commissary-lamp.hdr'));
  assert.ok(hdrBuf.toString('ascii', 0, 10).startsWith('#?RADIANCE'), 'Invalid Radiance HDR header');

  const wavs = assetsOnDisk.filter((f) => f.endsWith('.wav'));
  assert.equal(wavs.length, 17, `Expected 17 synthesized WAV sound effects, found ${wavs.length}`);
  for (const wav of wavs) {
    const buf = fs.readFileSync(path.join(APP_DIR, wav));
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${wav} missing RIFF header`);
    assert.equal(buf.toString('ascii', 8, 12), 'WAVE', `${wav} missing WAVE header`);
  }

  // Verify every asset path referenced in .ui or .logic exists on disk
  const uiText = fs.readFileSync(path.join(APP_DIR, 'ui/main.ui'), 'utf8');
  const refs = new Set(
    [...`${uiText}\n${composed.code}`.matchAll(/assets\/[a-zA-Z0-9_./-]+\.[a-z0-9]+/g)].map((m) => m[0])
  );
  for (const ref of refs) {
    assert.ok(assetsOnDisk.includes(ref), `Referenced asset does not exist: ${ref}`);
  }

  // Verify balanced template directives (#if / #each / #end) in ui/main.ui
  let depth = 0;
  for (const line of uiText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#if ') || trimmed.startsWith('#each ')) depth += 1;
    else if (trimmed === '#end') depth -= 1;
    assert.ok(depth >= 0, 'Unmatched #end in ui/main.ui');
  }
  assert.equal(depth, 0, `Unclosed #if/#each block in ui/main.ui (depth=${depth})`);

  // Verify mobile-critical CSS guards in ui/main.ui
  assert.ok(
    uiText.includes('.pp-scene canvas') && uiText.includes('touch-action: none !important'),
    'ui/main.ui must enforce non-inherited touch-action: none !important on .pp-scene canvas'
  );
  assert.ok(uiText.includes('.pp-mobile-top'), 'ui/main.ui must include dedicated .pp-mobile-top HUD');
  assert.ok(uiText.includes('font-size: 16px !important'), 'ui/main.ui must prevent iOS input focus auto-zoom');

  // If sibling SoftN engine checkout exists, parse the full composed .ui + .logic AST via @softn/core
  const softnCoreDist = 'E:/repos/softn.com/packages/@softn/core/dist/index.js';
  if (fs.existsSync(softnCoreDist)) {
    const core = await import(pathToFileURL(softnCoreDist).href);
    const fullUi = uiText.replace(
      /<logic\s+src=["']\.\.\/logic\/main\.logic["']\s*\/>/,
      `<logic>\n${composed.code}\n</logic>`
    );
    const ast = core.parse(fullUi);
    assert.ok(ast && ast.template, '@softn/core AST parse failed on composed PotatoPeeler UI');
    if (typeof core.scopeCss === 'function') {
      const styleMatch = uiText.match(/<style>([\s\S]*?)<\/style>/);
      assert.ok(styleMatch, 'Expected <style> block in ui/main.ui');
      const scoped = core.scopeCss(styleMatch[1], 'pp-test');
      assert.ok(scoped && scoped.css.includes('touch-action: none !important'), 'Scoped CSS must keep touch-action');
      assert.ok(scoped.css.includes('@media (max-width: 820px)'), 'Scoped CSS must preserve mobile @media rules');
    }
  }

  return composed.code;
}

function createRuntime(composedCode, sharedStorageMap = new Map(), remoteRows = [], browserOpts = null) {
  const localStorageMock = {
    getItem(k) {
      return sharedStorageMap.has(k) ? sharedStorageMap.get(k) : null;
    },
    setItem(k, v) {
      sharedStorageMap.set(k, String(v));
    },
    removeItem(k) {
      sharedStorageMap.delete(k);
    },
  };

  const audioLog = [];
  let nextAudioHandle = 1;
  const activeLoops = new Set();
  const hapticsLog = [];
  const winListeners = new Map();

  const windowMock = browserOpts
    ? {
        innerWidth: browserOpts.innerWidth || 0,
        innerHeight: browserOpts.innerHeight || 0,
        matchMedia(q) {
          return { matches: Boolean(browserOpts.coarsePointer && q.includes('coarse')) };
        },
        addEventListener(type, fn) {
          if (!winListeners.has(type)) winListeners.set(type, new Set());
          winListeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
          if (winListeners.has(type)) winListeners.get(type).delete(fn);
        },
      }
    : undefined;

  const navigatorMock = browserOpts
    ? {
        vibrate(ms) {
          hapticsLog.push(ms);
          return true;
        },
      }
    : undefined;

  function emitWindowEvent(type, payload = {}) {
    const set = winListeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      fn({ type, ...payload });
    }
  }

  const softnMock = {
    storage: {
      query(col, _q, cb) {
        assert.equal(col, 'scores');
        cb(remoteRows.slice());
      },
      insert(col, doc, cb) {
        assert.equal(col, 'scores');
        remoteRows.push({ ...doc });
        if (cb) cb({ id: `row-${remoteRows.length}` });
      },
    },
    audio: {
      play(src, opts, cb) {
        const handle = `aud-${nextAudioHandle++}`;
        audioLog.push({ src, loop: Boolean(opts && opts.loop), handle });
        if (opts && opts.loop) activeLoops.add(handle);
        if (cb) cb({ handle });
      },
      stop(handle) {
        activeLoops.delete(handle);
      },
      stopAll() {
        activeLoops.clear();
      },
    },
  };

  const sandbox = {
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    console,
    localStorage: localStorageMock,
    softn: softnMock,
  };
  if (windowMock) sandbox.window = windowMock;
  if (navigatorMock) sandbox.navigator = navigatorMock;

  const bridge = `
    globalThis.__api = {
      init: _init,
      hide: _onHide,
      tick: gameTick,
      enterStation,
      startBlitzShift,
      closeBlitzSummary,
      returnToTitle,
      toggleShop,
      toggleBoard,
      toggleMobileDrawer,
      toggleHoverPeel,
      toggleCameraOrbit,
      cycleCameraPreset,
      cycleQuality,
      toggleRadioMusic,
      toggleAudioMute,
      onControlPress,
      manualPeelAction,
      onScenePointerDown,
      onScenePointerMove,
      onScenePointerUp,
      onSceneHover,
      onSceneStats,
      selectOrUnlockPeeler,
      sharpenPeeler,
      sharpenEquipped,
      buySpindleUpgrade,
      buyChuteUpgrade,
      buyStampUpgrade,
      buyBoardUpgrade,
      buyZapperUpgrade,
      activateTeaOverdrive,
      ringCommissarBell,
      summonTsarPotato,
      spawnSaboteurBeetle,
      hasActiveBoss,
      getMedalCount,
      setPlayerNameInput,
      submitLeaderboardRecord,
      saveCareer,
      loadCareer,
      getBoardSlotCount,
      getEffectiveAutoRate,
      getEffectivePointMult,
      getEffectiveBladeRadius,
      getSceneMaxPixelRatio,
      state() {
        return {
          started,
          shopOpen,
          boardOpen,
          blitzSummaryOpen,
          mobileDrawerOpen,
          qualityPreset,
          viewportWidth,
          viewportHeight,
          isTouchDevice,
          isMobileLayout,
          isPortrait,
          cameraConfig: JSON.parse(JSON.stringify(cameraConfig)),
          blitzActive,
          blitzTimeLeft,
          blitzPotatoes,
          bestBlitzPotatoes,
          points,
          lifetimePoints,
          potatoesPeeled,
          equippedPeeler,
          unlockedPeelers: unlockedPeelers.slice(),
          toolLevels: toolLevels.slice(),
          upgSpindle,
          upgChute,
          upgStamp,
          upgBoard,
          upgZapper,
          quotaIdx,
          orderIdx,
          orderProgress,
          orderTier,
          ordersCompleted,
          cleanPeelsTotal,
          beetlesSwatted,
          tsarsPeeled,
          teaUsedCount,
          teaCharge,
          teaOverdriveTimer,
          bellCooldown,
          radioOn,
          medalsUnlocked: medalsUnlocked.slice(),
          comboCount,
          comboMult,
          playerName,
          playerRank,
          nextRivalLabel,
          leaderboard: leaderboard.slice(),
          activePotatoes: activePotatoes.slice(),
          beetles: beetles.slice(),
          peelCurlsCount: peelCurls.length,
          bladeTrailCount: bladeTrail.length,
          flyingCount: flyingTubers.length,
          laserBeams: laserBeams.slice(),
          sceneStaticCount: sceneStatic.length,
          sceneLightsCount: sceneLights.length,
          sceneObjects: sceneObjects.slice(),
        };
      },
      grantPoints(n) {
        points = points + n;
        lifetimePoints = lifetimePoints + n;
      },
      setTeaCharge(v) {
        teaCharge = v;
      },
      clearBellCooldown() {
        bellCooldown = 0.0;
      }
    };
  `;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(`${composedCode}\n${bridge}`, ctx, { filename: 'PotatoPeeler-sim.js' });
  return {
    api: ctx.__api,
    storage: sharedStorageMap,
    remoteRows,
    audioLog,
    activeLoops,
    hapticsLog,
    winListeners,
    emitWindowEvent,
  };
}

function sweepPeelStep(api, stepIndex) {
  const st = api.state();
  if (st.activePotatoes.length === 0) {
    api.tick(0.05);
    return;
  }
  const boss = st.activePotatoes.find((p) => p.isBoss);
  const target = boss || st.activePotatoes[stepIndex % st.activePotatoes.length];
  const sweepX = target.x + Math.sin(stepIndex * 1.3) * 0.16;
  const sweepZ = target.z + Math.cos(stepIndex * 1.1) * 0.12;
  api.onScenePointerDown({
    objectId: target.id,
    rootObjectId: target.id,
    point: { x: sweepX - 0.09, y: target.y + 0.12, z: sweepZ - 0.04 },
  });
  api.onScenePointerMove({
    objectId: target.id,
    rootObjectId: target.id,
    point: { x: sweepX + 0.09, y: target.y + 0.12, z: sweepZ + 0.04 },
  });
  api.onScenePointerUp();
  api.tick(0.05);
}

function runSimulationSuite(composedCode) {
  const sharedStorage = new Map();
  const remoteRows = [];
  const { api, audioLog, activeLoops } = createRuntime(composedCode, sharedStorage, remoteRows);

  api.init();
  let st = api.state();
  assert.equal(st.sceneStaticCount, 2, 'Expected kitchen-station + samovar-prop static models');
  assert.equal(st.sceneLightsCount, 5, 'Expected 5 Commissary lights');
  assert.equal(st.leaderboard.length, 7, 'Expected 6 seeded Soviet rivals + player');
  assert.equal(st.started, false);
  assert.ok(st.sceneObjects.some((o) => o.id === 'tea-glass'), 'Podstakannik tea-glass.glb must render');
  assert.ok(st.sceneObjects.some((o) => o.id === 'commissar-bell'), 'Service commissar-bell.glb must render');

  // Enter workstation: verify Radio Mayak loop starts & interactive Samovar toggles it
  api.enterStation();
  st = api.state();
  assert.equal(st.started, true);
  assert.equal(st.activePotatoes.length, 1);
  assert.equal(st.activePotatoes[0].patchesLeft, 16);
  assert.ok(
    audioLog.some((a) => a.src === 'assets/sfx/radio_polka.wav' && a.loop),
    'Entering station should start Radio Mayak accordion/balalaika loop'
  );
  assert.equal(activeLoops.size, 1);
  api.onScenePointerDown({ rootObjectId: 'samovar-prop', objectId: 'samovar-prop' });
  assert.equal(api.state().radioOn, false, 'Clicking Samovar should toggle Radio Mayak off');
  assert.equal(activeLoops.size, 0, 'Toggling Radio Mayak off must stop loop handle');
  api.toggleRadioMusic();
  assert.equal(api.state().radioOn, true);
  assert.equal(activeLoops.size, 1);

  const potNode0 = st.sceneObjects.find((o) => o.id === st.activePotatoes[0].id);
  assert.ok(potNode0, 'Active potato must appear in sceneObjects');
  assert.equal(potNode0.modelUrl, 'assets/models/potato-whole.glb');
  assert.equal(Object.values(potNode0.parts).filter((p) => p.visible).length >= 16, true);

  // 1. Measure 15 seconds (300 frames @ 0.05s) of baseline M-54 Canteen Knife peeling
  let sawHiddenSkinPatch = false;
  let sawPeelCurl = false;
  let sawBladeTrail = false;
  for (let step = 0; step < 300; step += 1) {
    sweepPeelStep(api, step);
    const cur = api.state();
    if (cur.peelCurlsCount > 0) sawPeelCurl = true;
    if (cur.bladeTrailCount > 0 && cur.sceneObjects.some((o) => o.id === 'blade-trail-0')) {
      sawBladeTrail = true;
    }
    if (cur.activePotatoes.length > 0 && cur.activePotatoes[0].patchesLeft < 16) {
      const obj = cur.sceneObjects.find((o) => o.id === cur.activePotatoes[0].id);
      if (obj && Object.keys(obj.parts).some((k) => k.startsWith('Skin_') && !obj.parts[k].visible)) {
        sawHiddenSkinPatch = true;
      }
    }
  }

  st = api.state();
  const baselinePotatoes = st.potatoesPeeled;
  assert.ok(sawHiddenSkinPatch, 'Expected individual 3D Skin_XX parts to hide as potato is shaved');
  assert.ok(sawPeelCurl, 'Expected 3D peel-curl.glb ribbons to launch during peeling');
  assert.ok(sawBladeTrail, 'Expected 3D blade sweep trail ribbons in sceneObjects');
  assert.ok(baselinePotatoes >= 3, `Expected >= 3 potatoes peeled in 15s baseline, got ${baselinePotatoes}`);
  assert.ok(st.cleanPeelsTotal >= 1, 'Expected rapid clean peels to be tracked');
  assert.ok(st.points > 0, 'Expected Rubles/points awarded for peeling potatoes');

  // 2. Test Podstakannik Hot Tea Overdrive (clicking tea-glass.glb at 100% charge)
  api.setTeaCharge(100);
  const multBeforeTea = api.getEffectivePointMult();
  api.onScenePointerDown({ rootObjectId: 'tea-glass', objectId: 'tea-glass' });
  st = api.state();
  assert.equal(st.teaOverdriveTimer, 10, 'Clicking full tea-glass should activate 10s Tea Overdrive');
  assert.equal(st.teaUsedCount, 1);
  assert.ok(
    Math.abs(api.getEffectivePointMult() / multBeforeTea - 2.0) < 0.01,
    'Tea Overdrive must double effective Ruble multiplier'
  );
  // Let overdrive expire so upgraded throughput comparison is fair tool-to-tool
  for (let i = 0; i < 205; i += 1) api.tick(0.05);
  assert.equal(api.state().teaOverdriveTimer, 0);

  // 3. Test Colorado Saboteur Beetle manual swat & Pioneer Bug-Zapper auto-zap!
  const swatBefore = api.state().beetlesSwatted;
  api.spawnSaboteurBeetle();
  api.tick(0.05);
  st = api.state();
  const liveBeetle = st.beetles.find((b) => !b.swatted);
  assert.ok(liveBeetle, 'Expected active Colorado Saboteur Beetle');
  const beetleNode = st.sceneObjects.find((o) => o.id === liveBeetle.id);
  assert.ok(beetleNode && beetleNode.modelUrl === 'assets/models/beetle-pest.glb', 'Beetle GLB must render');
  assert.ok(beetleNode.parts.Legs_Left && beetleNode.parts.Legs_Right, 'Beetle legs must animate');
  api.onScenePointerDown({ rootObjectId: liveBeetle.id, objectId: liveBeetle.id });
  assert.equal(api.state().beetlesSwatted, swatBefore + 1, 'Clicking beetle must swat it & award bounty');

  // Grant Ruble budget to unlock & sharpen all 6 peelers + all 5 station upgrades (including Bug-Zapper Lv 3)
  api.grantPoints(30000);
  for (let toolIdx = 1; toolIdx < 6; toolIdx += 1) {
    api.selectOrUnlockPeeler(toolIdx);
  }
  for (let toolIdx = 0; toolIdx < 6; toolIdx += 1) {
    for (let lv = 1; lv < 5; lv += 1) {
      api.sharpenPeeler(toolIdx);
    }
  }
  for (let i = 0; i < 5; i += 1) api.buySpindleUpgrade();
  for (let i = 0; i < 2; i += 1) api.buyBoardUpgrade();
  for (let i = 0; i < 4; i += 1) api.buyChuteUpgrade();
  for (let i = 0; i < 5; i += 1) api.buyStampUpgrade();
  for (let i = 0; i < 3; i += 1) api.buyZapperUpgrade();
  assert.equal(api.state().upgZapper, 3, 'Expected Pioneer Bug-Zapper upgraded to Lv 3');

  // Clear out any swatted beetle remnants, spawn a fresh beetle, and verify automatic cyan lightning zap!
  for (let i = 0; i < 15; i += 1) api.tick(0.05);
  const swatBeforeAuto = api.state().beetlesSwatted;
  api.spawnSaboteurBeetle();
  let sawCyanZapBeam = false;
  for (let i = 0; i < 10; i += 1) {
    api.tick(0.05);
    if (api.state().laserBeams.some((b) => b.color === '#38bdf8')) {
      sawCyanZapBeam = true;
    }
  }
  assert.ok(sawCyanZapBeam, 'Pioneer Bug-Zapper Lv 3 must fire a #38bdf8 lightning beam');
  assert.ok(api.state().beetlesSwatted > swatBeforeAuto, 'Pioneer Bug-Zapper must auto-swat saboteur beetles');

  // 4. Test Brass Commissary Service Bell & Giant Boss Tsar-Kartoshka (+5 spud credit & VDNKh Crown)
  api.clearBellCooldown();
  if (!api.hasActiveBoss()) {
    api.onScenePointerDown({ rootObjectId: 'commissar-bell', objectId: 'commissar-bell' });
  }
  assert.equal(api.hasActiveBoss(), true, 'Ringing Commissary Service Bell must summon Boss Tsar-Kartoshka');
  api.tick(0.05);
  st = api.state();
  assert.ok(
    st.sceneObjects.some((o) => o.modelUrl === 'assets/models/tsar-crown.glb'),
    'Boss Tsar-Kartoshka must wear spinning VDNKh Gold Crown (tsar-crown.glb)'
  );
  const tsarsBefore = st.tsarsPeeled;
  const spudsBeforeBoss = st.potatoesPeeled;
  for (let step = 0; step < 60 && api.hasActiveBoss(); step += 1) {
    sweepPeelStep(api, step);
  }
  st = api.state();
  assert.equal(api.hasActiveBoss(), false, 'Upgraded Kosmos-9 should conquer Boss Tsar-Kartoshka cleanly');
  assert.ok(st.tsarsPeeled > tsarsBefore, 'Conquering Tsar-Kartoshka must increment tsarsPeeled');
  assert.ok(st.potatoesPeeled >= spudsBeforeBoss + 5, 'Conquering Tsar-Kartoshka must grant +5 spud credit');

  // 5. Verify 5 simultaneous non-overlapping cutting board slots & >= 4x faster output
  assert.equal(api.getBoardSlotCount(), 5, 'Upgraded station + Kosmos-9 must support 5 simultaneous potatoes');
  assert.ok(api.getEffectiveAutoRate() > 25, 'Upgraded Kosmos-9 + Spindle must provide high auto-peel rate');

  for (let k = 0; k < 20; k += 1) api.tick(0.05);
  st = api.state();
  assert.equal(st.activePotatoes.length, 5, 'Expected 5 active 3D potatoes on the cutting board');
  for (let a = 0; a < st.activePotatoes.length; a += 1) {
    for (let b = a + 1; b < st.activePotatoes.length; b += 1) {
      const dx = st.activePotatoes[a].x - st.activePotatoes[b].x;
      const dz = st.activePotatoes[a].z - st.activePotatoes[b].z;
      const dist = Math.hypot(dx, dz);
      assert.ok(dist >= 0.45, `Board slots ${a} and ${b} too close (${dist.toFixed(3)}m)`);
    }
  }

  const beforeUpgraded = api.state().potatoesPeeled;
  let sawLaserBeam = false;
  for (let step = 0; step < 300; step += 1) {
    sweepPeelStep(api, step);
    if (api.state().laserBeams.some((b) => b.color === '#ff2a3c')) sawLaserBeam = true;
  }
  const upgradedPotatoes = api.state().potatoesPeeled - beforeUpgraded;
  assert.ok(sawLaserBeam, 'Expected Kosmos-9 Ruby Laser beams in 3D scene');
  assert.ok(
    upgradedPotatoes >= baselinePotatoes * 4,
    `Expected upgraded tools to peel >= 4x more potatoes (${upgradedPotatoes} vs baseline ${baselinePotatoes})`
  );
  assert.ok(api.state().ordersCompleted >= 2, 'Expected multiple Canteen Dish Orders served');
  assert.ok(api.getMedalCount() >= 6, `Expected >= 6 State Labour Medals unlocked, got ${api.getMedalCount()}`);

  // 6. Test 60-second Stakhanovite Blitz Trial
  api.startBlitzShift();
  assert.equal(api.state().blitzActive, true);
  for (let step = 0; step < 1210; step += 1) {
    if (step % 4 === 0) api.manualPeelAction();
    api.tick(0.05);
    if (!api.state().blitzActive) break;
  }
  st = api.state();
  assert.equal(st.blitzActive, false, 'Blitz shift should conclude after 60s');
  assert.equal(st.blitzSummaryOpen, true, 'Blitz summary modal should open at 0s');
  assert.ok(st.blitzPotatoes > 20, `Expected strong 60s Blitz potato count, got ${st.blitzPotatoes}`);
  assert.equal(st.bestBlitzPotatoes, st.blitzPotatoes);
  api.closeBlitzSummary();

  // 7. Push career total past 505 potatoes & test Hall of Labour Leaderboard submission
  while (api.state().potatoesPeeled <= 505) {
    sweepPeelStep(api, 1);
  }
  api.setPlayerNameInput({ target: { value: 'Comrade Katya' } });
  api.submitLeaderboardRecord();

  st = api.state();
  assert.equal(st.playerName, 'Comrade Katya');
  assert.equal(st.playerRank, 1, 'With >500 potatoes peeled, Comrade Katya should rank #1 above Stakhanovite Olga');
  assert.equal(st.leaderboard[0].name, 'Comrade Katya');
  assert.equal(st.leaderboard[0].tool, 'KOSMOS-9');
  assert.equal(remoteRows.length, 1, 'Expected softn.storage.insert("scores", ...) record');
  assert.equal(remoteRows[0].potatoes, st.potatoesPeeled);

  for (let i = 1; i < st.leaderboard.length; i += 1) {
    assert.ok(
      st.leaderboard[i - 1].potatoes >= st.leaderboard[i].potatoes,
      'Leaderboard must be sorted descending by potatoes peeled'
    );
  }

  // 8. Test schema v2 career save + backup fallback + schema v1 backward compatibility
  api.saveCareer();
  const savedTotal = st.potatoesPeeled;
  const savedMedals = api.getMedalCount();
  api.saveCareer();
  sharedStorage.set('potatopeeler:save:v1', '{corrupted-json');

  const session2 = createRuntime(composedCode, sharedStorage, remoteRows);
  session2.api.init();
  const st2 = session2.api.state();
  assert.equal(st2.potatoesPeeled, savedTotal, 'Backup save slot must restore career potato count');
  assert.equal(st2.equippedPeeler, 5, 'Backup save slot must restore equipped Kosmos-9 peeler');
  assert.equal(st2.upgZapper, 3, 'Backup save slot must restore Pioneer Bug-Zapper level');
  assert.equal(session2.api.getMedalCount(), savedMedals, 'Backup save slot must restore State Labour Medals');
  assert.equal(st2.playerName, 'Comrade Katya');

  // Verify schema v1 legacy save loads cleanly
  const v1Storage = new Map();
  v1Storage.set(
    'potatopeeler:save:v1',
    JSON.stringify({
      schema: 1,
      points: 420,
      lifetimePoints: 900,
      potatoesPeeled: 42,
      bestBlitzPotatoes: 19,
      equippedPeeler: 2,
      unlockedPeelers: [true, true, true, false, false, false],
      toolLevels: [2, 2, 3, 1, 1, 1],
      upgSpindle: 1,
      upgChute: 1,
      upgStamp: 2,
      upgBoard: 1,
      quotaIdx: 2,
      playerName: 'Legacy Boris',
    })
  );
  const sessionV1 = createRuntime(composedCode, v1Storage, []);
  sessionV1.api.init();
  assert.equal(sessionV1.api.state().potatoesPeeled, 42, 'Schema v1 save must remain backward-compatible');
  assert.equal(sessionV1.api.state().playerName, 'Legacy Boris');

  console.log(
    `PASS: PotatoPeeler v2.1.0 gameplay verified — baseline ${baselinePotatoes} spuds/15s -> upgraded ${upgradedPotatoes} spuds/15s (${(
      upgradedPotatoes / baselinePotatoes
    ).toFixed(1)}x faster), Tsars=${st.tsarsPeeled}, Beetles=${st.beetlesSwatted}, Orders=${st.ordersCompleted}, Medals=${savedMedals}/8, Blitz=${st.blitzPotatoes}, Rank #${st.playerRank} (${savedTotal} spuds).`
  );
}

function runMobileViewportSuite(composedCode) {
  // Simulate a Zipp WASM runtime where window.innerWidth is 0 until touchstart / canvas pointer events arrive
  const mobile = createRuntime(composedCode, new Map(), [], {
    innerWidth: 0,
    innerHeight: 0,
    coarsePointer: false,
  });

  mobile.api.init();
  let st = mobile.api.state();
  assert.equal(st.isTouchDevice, false);
  assert.equal(st.qualityPreset, 'high');
  const desktopBladeRad = mobile.api.getEffectiveBladeRadius();

  // 1. User taps "REPORT FOR KITCHEN DUTY" on an iPhone 14 portrait screen (390x844, clientX ~ 195, clientY ~ 510)
  mobile.emitWindowEvent('touchstart', { touches: 1, changedTouches: 1, clientX: 195, clientY: 510 });
  mobile.emitWindowEvent('pointerdown', {
    targetTag: 'button',
    targetWidth: 240,
    targetHeight: 48,
    clientX: 195,
    clientY: 510,
  });
  mobile.api.enterStation();

  st = mobile.api.state();
  assert.equal(st.isTouchDevice, true, 'touchstart must activate touch mode');
  assert.equal(st.isMobileLayout, true, 'touchstart must activate mobile layout');
  assert.equal(st.isPortrait, true, 'Initial portrait button tap must estimate portrait orientation');
  assert.equal(st.qualityPreset, 'balanced', 'Fresh touch session must auto-select balanced quality (no expensive SSAO)');
  assert.equal(mobile.api.getSceneMaxPixelRatio(), 1.25, 'Mobile touch session must cap Scene3D maxPixelRatio at 1.25');
  assert.ok(
    mobile.api.getEffectiveBladeRadius() > desktopBladeRad * 1.14,
    'Touch mode must widen effective blade radius for fat-finger comfort'
  );
  // Button targetWidth (240x48) must NOT clobber viewportWidth when targetTag !== 'canvas'!
  assert.ok(st.viewportWidth >= 360, `Button pointerdown must not shrink viewportWidth (got ${st.viewportWidth})`);

  // 2. First finger touch on <Scene3D> <canvas> locks exact 390x844 portrait dimensions & reframes camera!
  mobile.emitWindowEvent('pointerdown', {
    targetTag: 'canvas',
    targetWidth: 390,
    targetHeight: 844,
    clientX: 195,
    clientY: 420,
  });
  st = mobile.api.state();
  assert.equal(st.viewportWidth, 390);
  assert.equal(st.viewportHeight, 844);
  assert.equal(st.isPortrait, true);
  assert.ok(
    st.cameraConfig.position.z > 4.6 && st.cameraConfig.fov >= 58,
    `Portrait 390x844 camera must pull back & widen FOV so all 5 slots + Bell + Tea fit (got z=${st.cameraConfig.position.z}, fov=${st.cameraConfig.fov})`
  );

  // Verify horizontal half-span at Service Bell plane (z=+0.38) covers [-1.68..+1.68] in 390x844 portrait!
  const aspect = 390 / 844;
  const vFovRad = (st.cameraConfig.fov * Math.PI) / 180;
  const halfWidthAtBoard = Math.tan(vFovRad * 0.5) * aspect * st.cameraConfig.position.z;
  const halfWidthAtBell = Math.tan(vFovRad * 0.5) * aspect * (st.cameraConfig.position.z - 0.38);
  assert.ok(
    halfWidthAtBell >= 1.72,
    `Portrait camera horizontal half-span at z=+0.38 must fit Service Bell (-1.68) + 5 slots + Tea Glass (got ${halfWidthAtBell.toFixed(2)}m)`
  );

  // 3. Test collapsible mobile quick settings drawer & auto-dismiss on 3D board touch
  assert.equal(st.mobileDrawerOpen, false);
  mobile.api.toggleMobileDrawer();
  assert.equal(mobile.api.state().mobileDrawerOpen, true);
  mobile.api.onScenePointerDown({
    objectId: 'kitchen-station',
    rootObjectId: 'kitchen-station',
    point: { x: 0.0, y: 0.18, z: 0.05 },
  });
  mobile.api.onScenePointerUp();
  assert.equal(mobile.api.state().mobileDrawerOpen, false, 'Touching 3D scene must auto-close mobile drawer');

  // 4. Test forgiving counter proximity taps on small mobile screens (Tea Glass & Service Bell) + Haptics
  mobile.api.setTeaCharge(100);
  mobile.api.onScenePointerDown({
    objectId: 'kitchen-station',
    rootObjectId: 'kitchen-station',
    point: { x: 1.08, y: 0.02, z: -0.80 }, // ~0.20m from tea-glass (1.24, -0.92)
  });
  assert.equal(mobile.api.state().teaOverdriveTimer, 10, 'Near-tap by Tea Glass on counter must trigger Tea Overdrive');
  assert.ok(mobile.hapticsLog.length >= 1, 'Activating Tea Overdrive on touch device must trigger navigator.vibrate');

  mobile.api.clearBellCooldown();
  mobile.api.onScenePointerDown({
    objectId: 'kitchen-station',
    rootObjectId: 'kitchen-station',
    point: { x: -1.50, y: 0.02, z: 0.28 }, // ~0.20m from commissar-bell (-1.68, 0.38)
  });
  assert.equal(mobile.api.hasActiveBoss(), true, 'Near-tap by Service Bell on counter must summon Tsar-Kartoshka');

  // 5. Rotate phone to short landscape (844x390) & verify automatic camera reframing
  mobile.emitWindowEvent('pointermove', {
    targetTag: 'canvas',
    targetWidth: 844,
    targetHeight: 390,
    clientX: 420,
    clientY: 200,
  });
  st = mobile.api.state();
  assert.equal(st.viewportWidth, 844);
  assert.equal(st.viewportHeight, 390);
  assert.equal(st.isPortrait, false);
  assert.equal(st.isMobileLayout, true);
  assert.equal(st.cameraConfig.fov, 49, 'Short landscape 844x390 must reframe to short-landscape FOV');
  assert.ok(st.cameraConfig.position.z > 3.0 && st.cameraConfig.position.z < 3.2);

  // 6. Verify clean listener teardown on _onHide()
  mobile.api.hide();
  for (const [evt, set] of mobile.winListeners.entries()) {
    assert.equal(set.size, 0, `Expected window "${evt}" listeners removed on _onHide()`);
  }

  console.log(
    `PASS: Mobile & touch suite verified — 390x844 portrait (halfSpan=${halfWidthAtBoard.toFixed(
      2
    )}m, dpr=${mobile.api.getSceneMaxPixelRatio()}) <-> 844x390 landscape, drawer, proximity taps & haptics.`
  );
}

(async () => {
  const code = await verifyStaticAssetsAndManifest();
  runSimulationSuite(code);
  runMobileViewportSuite(code);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
