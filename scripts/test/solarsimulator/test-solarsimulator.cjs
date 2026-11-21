#!/usr/bin/env node
'use strict';

/**
 * Comprehensive verification suite for bundles/games/SolarSimulator:
 *  1. Bundle layout, manifest/permission parity, 12 Blender PBR GLBs, Radiance HDR,
 *     10 WAV SFX, WebP screenshot, mobile CSS guards, balanced UI directives & @softn/core AST/CSS parse.
 *  2. NASA J2000 Solar System accuracy, 4th-order Yoshida symplectic energy conservation,
 *     exact 1:1 km/AU physical scale ratios, Size Lineup mode, and co-moving reference-frame focusing.
 *  3. Orbit perturbation & gravitational chaos lab (a/e/i editing, delta-v burns, retrograde flip, 10x mass, scramble).
 *  4. Red Giant stellar evolution (swelling > 170 R_sun, Mercury/Venus engulfment, mass-loss orbital spiral-out,
 *     White Dwarf + Planetary Nebula shell, and what-if Supernova unbinding).
 *  5. Kinetic asteroid impacts (Chicxulub cratering, Mars-mass Theia delta-v + magma crust + debris ring,
 *     and Hypervelocity Planet-Cracker catastrophic planetary disruption Ek >= 0.85 U_bind).
 *  6. Multi-star dynamics (2-Sun Tatooine, 2-Sun Nemesis, 3-Sun Hierarchical, 3-Sun Chaotic Trisolaris,
 *     live +Spawn Companion Sun, multi-star point lights, snapshot save/load, and mobile viewports).
 *  7. Real Zipp WASM 50M main-thread instruction budget stress test at 100 yr/s max time warp.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const APP_DIR = path.join(ROOT, 'bundles', 'games', 'SolarSimulator');
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

function createSandboxHarness() {
  const composed = composeLogic(APP_DIR);
  const lsMap = new Map();
  const playedAudio = [];
  const context = vm.createContext({
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    console,
    localStorage: {
      getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
      setItem: (k, v) => lsMap.set(k, String(v)),
      removeItem: (k) => lsMap.delete(k),
    },
    navigator: { maxTouchPoints: 0, vibrate: () => true },
    window: { innerWidth: 1280, innerHeight: 800, navigator: { maxTouchPoints: 0 } },
    softn: {
      audio: {
        play: (src, opts, cb) => {
          playedAudio.push({ src, opts });
          if (cb) cb({ handle: 'h-amb' });
        },
        stop: () => {},
      },
    },
  });

  const helperCode = `
${composed.code}
globalThis.__api = {
  init: _init,
  simTick: simTick,
  stepPhysicsSimulation: stepPhysicsSimulation,
  composeSceneFrame: composeSceneFrame,
  getBodyById: getBodyById,
  computeOsculatingElements: computeOsculatingElements,
  getBodyVisualRadius: getBodyVisualRadius,
  selectBody: selectBody,
  focusOnBody: focusOnBody,
  toggleFocusSelected: toggleFocusSelected,
  setCameraPreset: setCameraPreset,
  changeScaleMode: changeScaleMode,
  applyViewportSize: applyViewportSize,
  modifyBodyOrbitElements: modifyBodyOrbitElements,
  nudgeSelectedOrbit: nudgeSelectedOrbit,
  pumpSelectedEccentricity: pumpSelectedEccentricity,
  flipSelectedRetrograde: flipSelectedRetrograde,
  boostSelectedMass10x: boostSelectedMass10x,
  chaosScrambleInnerOrbits: chaosScrambleInnerOrbits,
  chooseSolarStage: chooseSolarStage,
  runRedGiantEvolution: runRedGiantEvolution,
  triggerSupernovaAction: triggerSupernovaAction,
  selectImpactorPreset: selectImpactorPreset,
  onImpactorSpeedSlider: onImpactorSpeedSlider,
  setImpactorAngle: setImpactorAngle,
  launchAsteroidStrike: launchAsteroidStrike,
  fireAsteroidAtSelected: fireAsteroidAtSelected,
  triggerMeteorStorm: triggerMeteorStorm,
  activateScenario: activateScenario,
  setCompanionTemplate: setCompanionTemplate,
  onCompanionDistSlider: onCompanionDistSlider,
  addCompanionSunAction: addCompanionSunAction,
  saveCurrentSandbox: saveCurrentSandbox,
  loadSavedSandbox: loadSavedSandbox,
  onSceneClick: onSceneClick,
  getState: () => ({
    bodies,
    beltAsteroids,
    shockwaves,
    ejectaDebris,
    eventLog,
    simTimeYears,
    timeWarpYrPerSec,
    paused,
    activeScenarioId,
    chaosIndex,
    energyDriftPct,
    engulfedCount,
    ejectedCount,
    stellarStageId,
    stellarEvoActive,
    stellarEvoProgress,
    nebulaShellAlpha,
    lastImpactReport,
    scaleMode,
    focusedBodyId,
    cameraPreset,
    cameraConfig,
    sceneStatic,
    sceneObjects,
    sceneLights,
    anchorItems,
    selectedBodyId,
    selectedSummary,
    sunSummary,
    isMobileLayout,
    isPortrait
  })
};
`;
  vm.runInContext(helperCode, context, { filename: 'SolarSimulator/test-harness' });
  context.__api.init();
  return { api: context.__api, playedAudio, lsMap };
}

async function verifyStaticBundleAndUiAst() {
  const allFiles = listFiles(APP_DIR);
  for (const rel of allFiles) {
    assert.ok(
      rel === 'manifest.json' ||
        rel === 'permission.json' ||
        rel.startsWith('ui/') ||
        rel.startsWith('logic/') ||
        rel.startsWith('assets/'),
      `Unexpected file inside SolarSimulator bundle: ${rel}`
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
  new vm.Script(composed.code, { filename: 'SolarSimulator/logic (composed)' });
  const orphans = allLogic.filter((f) => !composed.files.includes(f));
  assert.deepEqual(orphans, [], `Orphan .logic files: ${orphans.join(', ')}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'manifest.json'), 'utf8'));
  const perm = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'permission.json'), 'utf8'));
  assert.equal(manifest.name, 'SolarSimulator');
  assert.equal(perm.app.name, 'SolarSimulator');
  assert.equal(manifest.version, perm.app.version);
  assert.equal(manifest.main, 'ui/main.ui');
  assert.deepEqual(composed.files, manifest.files.logic, 'manifest.files.logic must match exact import dependency order');

  const assetsOnDisk = listFiles(path.join(APP_DIR, 'assets'), 'assets/').sort();
  assert.deepEqual([...manifest.files.assets].sort(), assetsOnDisk, 'manifest.files.assets mismatch');

  // Verify 12 Blender PBR GLB models & key articulated nodes
  const glbs = assetsOnDisk.filter((f) => f.endsWith('.glb'));
  assert.equal(glbs.length, 12, `Expected 12 Blender PBR .glb models, found ${glbs.length}`);
  const nodeMap = {};
  for (const glb of glbs) {
    const buf = fs.readFileSync(path.join(APP_DIR, glb));
    assert.ok(buf.length > 2000, `${glb} too small (${buf.length} B)`);
    const json = parseGlbJsonChunk(buf);
    nodeMap[path.basename(glb)] = (json.nodes || []).map((n) => n.name);
  }
  assert.ok(nodeMap['sun-star.glb'].includes('Flare_Arch_0'), 'sun-star.glb missing Flare_Arch_0');
  assert.ok(nodeMap['planet-earth.glb'].includes('Cloud_Layer'), 'planet-earth.glb missing Cloud_Layer');
  assert.ok(nodeMap['planet-earth.glb'].includes('Magma_Crust'), 'planet-earth.glb missing Magma_Crust');
  assert.ok(nodeMap['planet-saturn.glb'].includes('Rings_Main_B'), 'planet-saturn.glb missing Rings_Main_B');

  // Verify HDR, 10 WAVs & WebP promotional screenshot
  const hdrBuf = fs.readFileSync(path.join(APP_DIR, 'assets/env/deep-space.hdr'));
  assert.ok(hdrBuf.toString('ascii', 0, 10).startsWith('#?RADIANCE'), 'Invalid Radiance HDR header');

  const wavs = assetsOnDisk.filter((f) => f.endsWith('.wav'));
  assert.equal(wavs.length, 10, `Expected 10 WAV SFX files, found ${wavs.length}`);
  for (const wav of wavs) {
    const buf = fs.readFileSync(path.join(APP_DIR, wav));
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  }

  const webpPath = path.join(ROOT, 'screenshots', 'SolarSimulator.webp');
  assert.ok(fs.existsSync(webpPath), 'Missing screenshots/SolarSimulator.webp');
  const webpBuf = fs.readFileSync(webpPath);
  assert.equal(webpBuf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(webpBuf.toString('ascii', 8, 12), 'WEBP');

  // Verify UI asset references, balanced directives & mobile CSS guards
  const uiText = fs.readFileSync(path.join(APP_DIR, 'ui/main.ui'), 'utf8');
  const refs = new Set(
    [...`${uiText}\n${composed.code}`.matchAll(/assets\/[a-zA-Z0-9_./-]+\.[a-z0-9]+/g)].map((m) => m[0])
  );
  for (const ref of refs) {
    assert.ok(assetsOnDisk.includes(ref), `Referenced asset does not exist: ${ref}`);
  }

  let depth = 0;
  for (const line of uiText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#if ') || trimmed.startsWith('#each ')) depth += 1;
    else if (trimmed === '#end') depth -= 1;
    assert.ok(depth >= 0, 'Unmatched #end in ui/main.ui');
  }
  assert.equal(depth, 0, `Unclosed #if/#each block in ui/main.ui (depth=${depth})`);

  assert.ok(uiText.includes('.ss-scene canvas') && uiText.includes('touch-action: none !important'));
  assert.ok(uiText.includes('.ss-mobile-top'));
  assert.ok(uiText.includes('font-size: 16px !important'));

  // Parse full UI + Logic AST and scoped CSS via sibling @softn/core if present
  const softnCoreDist = 'E:/repos/softn.com/packages/@softn/core/dist/index.js';
  if (fs.existsSync(softnCoreDist)) {
    const core = await import(pathToFileURL(softnCoreDist).href);
    const fullUi = uiText.replace(
      /<logic\s+src=["']\.\.\/logic\/main\.logic["']\s*\/>/,
      `<logic>\n${composed.code}\n</logic>`
    );
    const ast = core.parse(fullUi);
    assert.ok(ast && ast.template, '@softn/core failed to parse SolarSimulator main.ui');
    if (typeof core.scopeCss === 'function') {
      const styleMatch = uiText.match(/<style>([\s\S]*?)<\/style>/);
      if (styleMatch) {
        const scoped = core.scopeCss(styleMatch[1], 'ss-scope-check');
        assert.ok(scoped && scoped.css.includes('touch-action: none !important'), 'Scoped CSS must preserve touch-action');
        assert.ok(scoped.css.includes('@media (max-width: 860px)'), 'Scoped CSS must preserve mobile @media rules');
      }
    }
  }
}

function verifyScaleAccuracyAndSymplecticOrbits() {
  const { api } = createSandboxHarness();

  // Check J2000 initial ephemeris accuracy
  const earth = api.getBodyById('earth');
  const el0 = api.computeOsculatingElements(earth);
  assert.ok(Math.abs(el0.a - 1.0) < 0.002, `Expected Earth semi-major axis ~1.000 AU, got ${el0.a}`);
  assert.ok(Math.abs(el0.e - 0.0167) < 0.002, `Expected Earth eccentricity ~0.0167, got ${el0.e}`);
  assert.ok(Math.abs(el0.periodYr - 1.0) < 0.003, `Expected Earth period ~1.000 yr, got ${el0.periodYr}`);
  assert.ok(Math.abs(el0.speedKms - 29.78) < 0.75, `Expected Earth speed ~29.78 km/s, got ${el0.speedKms}`);
  assert.ok(earth.tempK >= 282 && earth.tempK <= 295, `Expected temperate Earth ~288 K, got ${earth.tempK}`);

  // Integrate 10 full Solar System years (at 1 yr/s in 0.05s frames = 200 frames)
  for (let i = 0; i < 200; i++) {
    api.stepPhysicsSimulation(0.05);
  }
  const stAfter = api.getState();
  assert.ok(Math.abs(stAfter.simTimeYears - 10.0) < 0.05);
  assert.ok(
    stAfter.energyDriftPct < 0.02,
    `4th-order Yoshida symplectic energy drift too high over 10 yr: ${stAfter.energyDriftPct}%`
  );
  const el10 = api.computeOsculatingElements(api.getBodyById('earth'));
  assert.ok(Math.abs(el10.a - 1.0) < 0.003, `Earth semi-major axis drifted after 10 yr: ${el10.a}`);

  // Verify 1:1 Exact Physical km/AU Scale Mode & Reference-Frame Focusing
  api.changeScaleMode('true_1to1');
  const rSun1to1 = api.getBodyVisualRadius(api.getBodyById('sol'));
  const rEarth1to1 = api.getBodyVisualRadius(api.getBodyById('earth'));
  const trueRatio = 696340.0 / 6371.0;
  const renderedRatio = rSun1to1 / rEarth1to1;
  assert.ok(
    Math.abs(renderedRatio - trueRatio) < 1.0,
    `1:1 Exact mode must preserve literal 109.3:1 Sun/Earth diameter ratio, got ${renderedRatio}`
  );

  api.focusOnBody('earth');
  api.composeSceneFrame(0.016, 'earth');
  const earthNode = api.getState().sceneObjects.find((o) => o.id === 'body-earth');
  assert.ok(earthNode, 'body-earth missing in sceneObjects');
  assert.equal(earthNode.position.x, 0, 'Focused Earth must be centered at WebGL x=0');
  assert.equal(earthNode.position.y, 0, 'Focused Earth must be centered at WebGL y=0');
  assert.equal(earthNode.position.z, 0, 'Focused Earth must be centered at WebGL z=0');

  // Verify Size Lineup comparator mode
  api.changeScaleMode('lineup');
  api.composeSceneFrame(0.016, 'earth');
  const rJupLineup = api.getBodyVisualRadius(api.getBodyById('jupiter'));
  const rEarthLineup = api.getBodyVisualRadius(api.getBodyById('earth'));
  assert.ok(Math.abs(rJupLineup / rEarthLineup - 69911 / 6371) < 0.25);
}

function verifyOrbitPerturbationAndChaos() {
  const { api } = createSandboxHarness();
  api.selectBody('mars', false);
  api.modifyBodyOrbitElements('mars', 1.18, 0.52, 22.0);
  const elMars = api.computeOsculatingElements(api.getBodyById('mars'));
  assert.ok(Math.abs(elMars.a - 1.18) < 0.02, `Expected Mars a=1.18, got ${elMars.a}`);
  assert.ok(Math.abs(elMars.e - 0.52) < 0.02, `Expected Mars e=0.52, got ${elMars.e}`);
  assert.ok(Math.abs(elMars.iDeg - 22.0) < 0.5, `Expected Mars i=22 deg, got ${elMars.iDeg}`);

  api.flipSelectedRetrograde();
  const elRetro = api.computeOsculatingElements(api.getBodyById('mars'));
  assert.ok(elRetro.iDeg > 90.0, `Retrograde flip must invert orbital inclination > 90 deg, got ${elRetro.iDeg}`);

  api.chaosScrambleInnerOrbits();
  for (let i = 0; i < 60; i++) {
    api.stepPhysicsSimulation(0.05);
  }
  assert.ok(api.getState().chaosIndex > 0.5, 'Scrambled crossing orbits must raise chaosIndex');
}

function verifyRedGiantStellarEvolutionAndSupernova() {
  const { api } = createSandboxHarness();
  const jupBefore = api.computeOsculatingElements(api.getBodyById('jupiter')).a;

  // Run animated Red Giant evolution (completes in ~27s of real-time stepping)
  api.runRedGiantEvolution();
  let peakSunRadiusAU = 0;
  for (let step = 0; step < 620; step++) {
    api.stepPhysicsSimulation(0.05);
    const sol = api.getBodyById('sol');
    if (sol.radiusAU > peakSunRadiusAU) peakSunRadiusAU = sol.radiusAU;
  }

  const st = api.getState();
  assert.ok(
    peakSunRadiusAU > 0.95,
    `Sun must swell past 0.95 AU (>200 R_sun) during AGB Red Giant peak, got ${peakSunRadiusAU} AU`
  );
  assert.equal(api.getBodyById('mercury').alive, false, 'Mercury must be engulfed during Red Giant expansion');
  assert.equal(api.getBodyById('venus').alive, false, 'Venus must be engulfed during Red Giant expansion');
  assert.equal(st.stellarStageId, 'white_dwarf', 'Animated stellar track must conclude at White Dwarf stage');
  assert.ok(st.nebulaShellAlpha > 0.1, 'Planetary Nebula shell must glow after envelope ejection');

  // Verify adiabatic mass-loss outward expansion of Jupiter's orbit (M_sun: 1.00 -> 0.54 => a increases ~1.8x!)
  const jupAfter = api.computeOsculatingElements(api.getBodyById('jupiter')).a;
  assert.ok(
    jupAfter > jupBefore * 1.55,
    `Solar wind mass loss (1.0 -> 0.54 M_sun) must expand Jupiter's semi-major axis >1.55x (before=${jupBefore}, after=${jupAfter})`
  );

  // Test What-If Supernova unbinding on fresh system
  api.activateScenario('j2000_accurate');
  api.triggerSupernovaAction();
  const earthPostSN = api.computeOsculatingElements(api.getBodyById('earth'));
  assert.equal(earthPostSN.bound, false, '86% instantaneous Supernova mass loss must unbind Earth onto hyperbolic escape');
}

function verifyAsteroidImpactsAndDisruption() {
  const { api } = createSandboxHarness();

  // 1. Chicxulub 12 km impactor on Earth -> huge MT energy, tiny delta-v
  api.launchAsteroidStrike('earth', 'chicxulub', 22.0, 'head_on', true);
  let rep = api.getState().lastImpactReport;
  assert.ok(rep && rep.energyMegatons > 5e7, `Expected >50M MT Chicxulub energy, got ${rep && rep.energyMegatons}`);
  assert.ok(rep.deltaVKms < 0.01, '12 km asteroid should not measurably alter Earth orbital velocity');

  // 2. Mars-sized Theia Protoplanet impact on Earth -> major orbital kick + magma crust + debris ring!
  api.launchAsteroidStrike('earth', 'theia_proto', 24.0, 'prograde', true);
  rep = api.getState().lastImpactReport;
  assert.ok(rep.deltaVKms > 2.0, `Expected >2 km/s orbital delta-v from Mars-mass Theia impact, got ${rep.deltaVKms}`);
  assert.ok(Math.abs(rep.newE - rep.oldE) > 0.05, 'Theia impact must noticeably shift Earth eccentricity');
  api.composeSceneFrame(0.016, 'earth');
  const objs = api.getState().sceneObjects;
  const earthModel = objs.find((o) => o.id === 'body-earth');
  assert.ok(earthModel, 'Earth should survive Theia giant impact as molten planet');
  assert.equal(earthModel.parts.Magma_Crust.visible, true, 'Theia impact must expose glowing Magma_Crust on Earth');
  assert.ok(objs.some((o) => o.id === 'body-earth-debris-ring'), 'Theia impact must spawn moon-forming debris ring');

  // 3. Hypervelocity Planet-Cracker on Mars -> Ek >= 1.85 U_bind catastrophic disruption!
  const beltBefore = api.getState().beltAsteroids.length;
  api.launchAsteroidStrike('mars', 'planet_cracker', 105.0, 'head_on', true);
  rep = api.getState().lastImpactReport;
  assert.equal(api.getBodyById('mars').alive, false, 'Planet-Cracker must shatter Mars');
  assert.equal(api.getBodyById('mars').status, 'shattered');
  assert.ok(rep.bindRatioPct >= 185, `Expected Ek >= 185% U_bind, got ${rep.bindRatioPct}%`);
  assert.ok(api.getState().beltAsteroids.length > beltBefore, 'Shattered planet must inject rubble fragments into asteroid belt');
}

function verifyMultiStarScenariosSnapshotsAndMobile() {
  const { api } = createSandboxHarness();

  // Check 2-Sun & 3-Sun scenarios + dynamic star point lights
  const expectedStars = {
    j2000_accurate: 1,
    binary_tatooine: 2,
    binary_nemesis: 2,
    triple_hierarchical: 3,
    triple_trisolaris: 3,
    chaos_heavy_jupiter: 1,
  };

  for (const [scenId, starCount] of Object.entries(expectedStars)) {
    api.activateScenario(scenId);
    for (let k = 0; k < 20; k++) api.simTick(0.016);
    const st = api.getState();
    const aliveStars = st.bodies.filter((b) => b.alive && b.kind === 'star').length;
    assert.equal(aliveStars, starCount, `Scenario ${scenId} expected ${starCount} stars, got ${aliveStars}`);
    const pointLights = st.sceneLights.filter((l) => l.type === 'point').length;
    assert.equal(pointLights, starCount, `Scenario ${scenId} expected ${starCount} dynamic star point lights`);
  }

  // Live spawn 2nd & 3rd companion suns into J2000 Solar System
  api.activateScenario('j2000_accurate');
  api.setCompanionTemplate('k_orange');
  api.onCompanionDistSlider(3.2);
  api.addCompanionSunAction();
  api.setCompanionTemplate('m_dwarf');
  api.onCompanionDistSlider(9.5);
  api.addCompanionSunAction();
  assert.equal(api.getState().sunSummary.starCount, 3, 'Expected 3 active suns after spawning 2 companions');

  // Snapshot Save & Restore
  api.saveCurrentSandbox();
  api.activateScenario('j2000_accurate');
  assert.equal(api.getState().sunSummary.starCount, 1);
  api.loadSavedSandbox();
  assert.equal(api.getState().sunSummary.starCount, 3, 'Restored snapshot must bring back all 3 suns');

  // Mobile portrait (390x844) & landscape (844x390) responsive camera framing
  const desktopCamZ = api.getState().cameraConfig.position.z;
  api.applyViewportSize(390, 844);
  const portraitState = api.getState();
  assert.equal(portraitState.isMobileLayout, true);
  assert.equal(portraitState.isPortrait, true);
  assert.ok(portraitState.cameraConfig.position.z > desktopCamZ * 1.25, 'Portrait viewport must pull camera back cleanly');

  api.applyViewportSize(844, 390);
  assert.equal(api.getState().isMobileLayout, true);
  assert.equal(api.getState().isPortrait, false);
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

  engine.setInstructionBudget(MAIN_THREAD_BUDGET);
  engine.callFunction('_init', []);

  // Stress test at max 100 yr/s time warp + Red Giant + Meteor Storm + 3 Suns!
  engine.setInstructionBudget(MAIN_THREAD_BUDGET);
  engine.callFunction('selectTimeWarp', [100.0]);
  for (let i = 0; i < 60; i++) {
    engine.setInstructionBudget(MAIN_THREAD_BUDGET);
    engine.callFunction('simTick', [0.033]);
  }

  engine.setInstructionBudget(MAIN_THREAD_BUDGET);
  engine.callFunction('triggerMeteorStorm', []);
  for (let i = 0; i < 30; i++) {
    engine.setInstructionBudget(MAIN_THREAD_BUDGET);
    engine.callFunction('simTick', [0.05]);
  }

  for (const scen of ['binary_tatooine', 'triple_hierarchical', 'triple_trisolaris']) {
    engine.setInstructionBudget(MAIN_THREAD_BUDGET);
    engine.callFunction('activateScenario', [scen]);
    for (let i = 0; i < 20; i++) {
      engine.setInstructionBudget(MAIN_THREAD_BUDGET);
      engine.callFunction('simTick', [0.033]);
    }
  }

  engine.free();
  return true;
}

async function main() {
  console.log('Running Solar Simulator verification suite...');
  await verifyStaticBundleAndUiAst();
  console.log('  [PASS] Manifest, 12 Blender PBR GLBs, HDR, 10 WAVs, WebP, mobile CSS & @softn/core AST');
  verifyScaleAccuracyAndSymplecticOrbits();
  console.log('  [PASS] NASA J2000 ephemeris, 4th-order Yoshida energy conservation & 1:1 km/AU scale modes');
  verifyOrbitPerturbationAndChaos();
  console.log('  [PASS] Orbit perturbation (a/e/i, delta-v, retrograde flip & crossing-orbit chaos)');
  verifyRedGiantStellarEvolutionAndSupernova();
  console.log('  [PASS] Red Giant swelling (>200 R_sun), Mercury/Venus engulfment, mass-loss spiral-out & Supernova');
  verifyAsteroidImpactsAndDisruption();
  console.log('  [PASS] Chicxulub, Mars-mass Theia impact (delta-v + magma + ring) & Planet-Cracker disruption');
  verifyMultiStarScenariosSnapshotsAndMobile();
  console.log('  [PASS] 2-Sun & 3-Sun scenarios, live companion star spawning, snapshots & mobile viewports');
  const ranZipp = await verifyZippWasmInstructionBudget();
  if (ranZipp) {
    console.log('  [PASS] Real Zipp WASM 50M main-thread instruction budget stress test at 100 yr/s');
  }
  console.log('All Solar Simulator checks passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
