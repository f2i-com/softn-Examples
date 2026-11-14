#!/usr/bin/env node
'use strict';

// Headless verification suite for bundles/games/MineManagement:
// 1. Static source, asset, manifest, and FormLogic hosting rule checks
// 2. Unit checks for portable career save backup/restore, _onHide lifecycle,
//    keyboard PIT workspace shortcuts, log filtering, tow alert sync, and UI formatting
// 3. Deterministic replay check across separated wall-clock sessions
// 4. Random monkey soak + competent player soak (verifying winnability, zero watchdog jams,
//    strict validState() round-trips, and <= 30,000-char FormLogic storage bounds)

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const APP_DIR = path.join(ROOT, 'bundles', 'games', 'MineManagement');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const MONKEY_SHIFTS = Number(arg('monkey-shifts', 2));
const PLAY_SHIFTS = Number(arg('play-shifts', 2));
const VERBOSE = process.argv.includes('--verbose');

const IMPORT_LINE = /^[ \t]*import[ \t]+["']([^"'\n]+)["'][ \t]*;?[ \t]*$/gm;
const SOURCE_PATH = /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:ui|logic|py|json|sql|xdb)$/;
const HOSTED_MEDIA =
  /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|gif|webp|avif|ico|bmp|svg|hdr|exr|mp3|wav|ogg|opus|aac|flac|m4a|mp4|webm|woff2?|ttf|otf|glb|gltf|obj|stl|fbx|bin|wgsl|txt|md)$/i;
const METADATA = /^(README|LICENSE|NOTICE)(\.|$)/;
const PRIVATE_TREE = /^(server|backend|private)\//i;

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
    if (!fs.existsSync(full)) {
      throw new Error(`${chain.at(-1) ?? 'entry'} imports ${relPath}, which does not exist`);
    }
    included.add(relPath);
    const source = fs.readFileSync(full, 'utf8').replace(/\r\n?/g, '\n');
    const code = source.replace(IMPORT_LINE, (_line, spec) => {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relPath), spec));
      if (included.has(target)) return `/* already included: ${spec} */`;
      return expand(target, [...chain, relPath]);
    });
    order.push(relPath);
    return `// ===== ${relPath} =====\n${code}\n`;
  };
  const code = expand(entry, []);
  return { code, files: order };
}

function formlogicProblems(files) {
  const problems = [];
  let total = 0;
  let sources = 0;
  let media = 0;
  for (const [relPath, bytes] of Object.entries(files)) {
    if (
      relPath.startsWith('/') ||
      relPath.includes('\\') ||
      relPath.includes(':') ||
      relPath.split('/').some((p) => p === '..' || p === '.')
    ) {
      problems.push(`${relPath}: invalid path`);
    }
    if (/\.(ui|logic|py|json|sql|xdb)$/.test(relPath)) {
      if (!SOURCE_PATH.test(relPath) || relPath.includes('..')) {
        problems.push(`${relPath}: source names may use letters, digits, '-', '_' and '.' only`);
      }
      if (bytes.length > 1_000_000) {
        problems.push(`${relPath}: ${bytes.length} bytes is over the 1 MB source-file limit`);
      }
      if (relPath.endsWith('.py') && PRIVATE_TREE.test(relPath)) {
        problems.push(`${relPath}: Python cannot be backend code`);
      }
      sources++;
    } else if (relPath.startsWith('assets/')) {
      if (!HOSTED_MEDIA.test(relPath)) problems.push(`${relPath}: not a media type FormLogic serves`);
      if (bytes.length > 8 * 1024 * 1024) problems.push(`${relPath}: over the 8 MB media-file limit`);
      media++;
    } else if (!METADATA.test(relPath)) {
      problems.push(`${relPath}: unexpected file outside source, assets/, or README/LICENSE/NOTICE`);
      continue;
    } else {
      continue;
    }
    total += bytes.length;
  }
  if (sources > 200) problems.push(`${sources} source files (limit 200)`);
  if (media > 1000) problems.push(`${media} media files (limit 1000)`);
  if (total > 64 * 1024 * 1024) problems.push(`${(total / 1048576).toFixed(1)} MB project (limit 64 MB)`);
  return problems;
}

function soundNamesFor(code, fn) {
  const names = new Set();
  for (const call of code.matchAll(new RegExp(String.raw`\b${fn}\(([^()]*)\)`, 'g'))) {
    for (const m of call[1].matchAll(/(?:^|[?:])\s*'([a-z0-9-]+)'/g)) names.add(m[1]);
  }
  return names;
}

function verifyStaticBundle() {
  const allLogicFiles = listFiles(path.join(APP_DIR, 'logic'), 'logic/')
    .filter((f) => f.endsWith('.logic'))
    .sort();
  for (const file of allLogicFiles) {
    new vm.Script(
      fs.readFileSync(path.join(APP_DIR, file), 'utf8').replace(IMPORT_LINE, ''),
      { filename: file }
    );
  }
  const logic = composeLogic(APP_DIR);
  new vm.Script(logic.code, { filename: 'MineManagement/logic (joined)' });

  const orphans = allLogicFiles.filter((f) => !logic.files.includes(f));
  assert.deepEqual(orphans, [], `Orphan .logic files not imported by main.logic: ${orphans.join(', ')}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'manifest.json'), 'utf8'));
  const versionInCode = /var VERSION\s*=\s*'([^']+)'/.exec(logic.code)?.[1];
  assert.equal(versionInCode, manifest.version, 'VERSION in state.logic must match manifest.json version');
  assert.equal('server' in manifest, false, 'MineManagement must remain client-only');

  const uiFiles = listFiles(path.join(APP_DIR, 'ui'), 'ui/').filter((f) => f.endsWith('.ui'));
  const expectedUi = ['ui/main.ui', ...uiFiles.filter((f) => f !== 'ui/main.ui').sort()];
  const assets = listFiles(path.join(APP_DIR, 'assets'), 'assets/').sort();
  assert.deepEqual(manifest.files.ui, expectedUi, 'manifest.files.ui must match ui/ files on disk');
  assert.deepEqual(
    [...manifest.files.logic].sort(),
    allLogicFiles,
    'manifest.files.logic must list every .logic file on disk'
  );
  assert.deepEqual(manifest.files.assets, assets, 'manifest.files.assets must match assets/ files on disk');

  const uiText = uiFiles.map((f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8')).join('\n');
  const namedAssets = new Set(
    [...`${uiText}\n${logic.code}`.matchAll(/assets\/[a-zA-Z0-9_./-]+\.[a-z0-9]+/g)].map((m) => m[0])
  );
  for (const ref of namedAssets) {
    assert.ok(assets.includes(ref), `${ref} is referenced in source but missing from assets/`);
  }
  for (const name of soundNamesFor(logic.code, 'sfx')) {
    assert.ok(assets.includes(`assets/audio/${name}.wav`), `Missing sfx audio assets/audio/${name}.wav`);
  }
  for (const name of soundNamesFor(logic.code, 'radioCue')) {
    assert.ok(
      assets.includes(`assets/audio/radio-${name}.mp3`),
      `Missing radioCue audio assets/audio/radio-${name}.mp3`
    );
  }

  const bundleFiles = {};
  for (const rel of listFiles(APP_DIR)) {
    bundleFiles[rel] = fs.readFileSync(path.join(APP_DIR, rel));
  }
  const problems = formlogicProblems(bundleFiles);
  assert.deepEqual(problems, [], `FormLogic hosting violations: ${problems.join('; ')}`);

  return logic.code;
}

function makeHost(startTime = 1_700_000_000_000) {
  let now = startTime;
  const listeners = {};
  const store = new Map();
  let clipboardText = '';
  const audio = {
    played: [],
    stopped: [],
    stopAllCalls: 0,
    play(p, _opts, cb) {
      this.played.push(p);
      if (cb) cb({ handle: `h${this.played.length}`, played: true });
      return true;
    },
    stop(h) {
      this.stopped.push(h);
    },
    setVolume() {},
    stopAll() {
      this.stopAllCalls++;
    }
  };
  class FakeDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [now]));
    }
    static now() {
      return now;
    }
  }
  const win = {
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((f) => f !== fn);
    },
    navigator: {
      clipboard: {
        writeText(t) {
          clipboardText = String(t);
          return { catch() {} };
        }
      }
    }
  };
  const context = {
    window: win,
    navigator: win.navigator,
    Date: FakeDate,
    Math,
    JSON,
    console,
    softn: { audio, input: { captureKeys() {} } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  };
  const g = vm.createContext(context);
  return {
    g,
    listeners,
    store,
    audio,
    getClipboard: () => clipboardText,
    advance(ms) {
      now += ms;
    },
    key(k, down = true) {
      for (const fn of listeners[down ? 'keydown' : 'keyup'] || []) {
        fn({ key: k, repeat: false, preventDefault() {} });
      }
    }
  };
}

function testFeaturesAndLifecycle(logicCode) {
  const host = makeHost();
  vm.runInContext(logicCode, host.g, { filename: 'main.logic' });
  const { g } = host;

  // Boot listener deduplication on reload
  const initialKeydowns = (host.listeners.keydown || []).length;
  assert.equal(initialKeydowns, 1, 'boot() should attach exactly one keydown listener');
  g.boot();
  assert.equal(
    (host.listeners.keydown || []).length,
    1,
    're-running boot() should clean up prior window listeners'
  );

  // Start shift & test PIT tablet keyboard shortcuts (1..9, 0)
  g.newGame();
  assert.equal(g.screen, 'play');
  g.toggleTablet();
  assert.equal(g.tablet, true);
  host.key('5');
  assert.equal(g.tab, 'ledger', 'Key 5 should open Production & ledger workspace');
  host.key('0');
  assert.equal(g.tab, 'site', 'Key 0 should open Site journal workspace');
  host.key('6');
  assert.equal(g.tab, 'log', 'Key 6 should open Shift log workspace');

  // Log filtering & counts
  g.setLogFilter('alerts');
  assert.equal(g.logFilter, 'alerts');
  g.setLogFilter('ops');
  assert.equal(g.logFilter, 'ops');
  g.setLogFilter('all');
  assert.equal(g.logFilter, 'all');
  assert.ok(typeof g.logCounts.all === 'number');

  // Economics, service status, and tab badges
  assert.equal(g.economicsRows.length, 4, 'economicsRows should expose 4 unit economics cards');
  assert.equal(g.serviceStatusRows.length, 4, 'serviceStatusRows should expose 4 readiness cards');
  assert.ok(typeof g.tabBadges.fleet === 'string' && g.tabBadges.fleet.length > 0);
  assert.ok(Array.isArray(g.controlHints) && g.controlHints.length >= 4);

  // Locate & head outside helper
  g.locateAndGoTruck(1);
  assert.equal(g.tablet, false, 'locateAndGoTruck should close tablet');
  assert.equal(g.selectedTruck, 1);

  // Tow recovery clears plain fuel alert & syncs incident holds
  const t1 = g.S.trucks[0];
  g.S.player.mode = 'truck';
  g.S.player.vehicle = t1.id;
  t1.phase = 'manual';
  t1.fuel = 0;
  t1.fault = 'out_of_fuel';
  g.S.alerts.push({
    key: 'fuel-' + t1.id,
    kind: 'fuel',
    severity: 'warning',
    title: t1.external_id + ' out of diesel',
    detail: 'Refuel needed.',
    x: t1.x,
    z: t1.z
  });
  g.recoverVehicle(); // first call arms confirmation
  assert.equal(g.resetConfirm, true);
  g.cancelResetConfirm();
  assert.equal(g.resetConfirm, false);
  g.recoverVehicle();
  g.recoverVehicle(); // second call executes tow
  assert.ok(t1.fuel >= 20, 'Recovered truck should have >= 20% diesel');
  assert.equal(
    g.S.alerts.some((a) => a.key === 'fuel-' + t1.id),
    false,
    'Plain fuel alert should clear once tow tops diesel to 20%'
  );

  // Finish shift to populate historyRows and test profitText formatting
  g.S.time = 120;
  g.S.tonnes = g.S.target + 40;
  g.S.lifetimeTonnes += g.S.tonnes;
  g.finishShift();
  assert.equal(g.screen, 'report');
  assert.ok(g.historyRows.length >= 1);
  assert.match(
    g.historyRows[0].profitText,
    /^-?\$[\d,]+$/,
    `historyRows[0].profitText should be formatted currency, got ${g.historyRows[0].profitText}`
  );

  // Portable save backup & restore validation
  g.showSaveBackup();
  assert.equal(g.exportOpen, true);
  assert.equal(g.exportMode, 'save');
  const validBackupJson = g.exportText;
  assert.ok(validBackupJson.length > 100 && validBackupJson.length <= 30000);
  g.copyExportText();
  assert.equal(host.getClipboard(), validBackupJson);

  // Reject PIT snapshot when pasted into career save import
  g.switchExportMode('snapshot');
  const snapshotJson = g.exportText;
  g.switchExportMode('save');
  g.importText = snapshotJson;
  assert.equal(g.importSaveData(), false, 'PIT telemetry snapshot must not be accepted as a career save');
  assert.equal(g.exportFeedbackKind, 'warning');

  // Reject malformed JSON cleanly
  g.importText = '{not valid json';
  assert.equal(g.importSaveData(), false);
  assert.equal(g.exportFeedbackKind, 'warning');

  // Restore valid career backup into a wiped session
  g.ready = true;
  g.hideExport();
  g.returnTitle();
  host.store.clear();
  g.checkSave();
  assert.equal(g.canContinue, false);
  g.showSaveBackup();
  g.importText = validBackupJson;
  assert.equal(g.importSaveData(), true, 'Valid career save JSON should restore cleanly');
  assert.equal(g.exportOpen, false);
  assert.equal(g.screen, 'report');
  assert.equal(g.S.tonnes, g.S.target + 40);

  // _onHide lifecycle pauses active play and stops all audio
  g.nextShift();
  assert.equal(g.screen, 'play');
  const stopsBefore = host.audio.stopAllCalls;
  g._onHide();
  assert.equal(g.screen, 'pause', '_onHide() should pause an active shift');
  assert.ok(host.audio.stopAllCalls > stopsBefore, '_onHide() should stop active audio');
}

function runReplaySession(logicCode, startClock) {
  const host = makeHost(startClock);
  vm.runInContext(logicCode, host.g, { filename: 'main.logic' });
  const { g } = host;
  g.seedText = 'RED-DUST-4817';
  g.newGame();
  g.S.cash += 9000;
  g.buyRobot();
  g.dispatchAll();

  const snapshots = [];
  let shifts = 0;
  let step = 0;
  while (shifts < 2 && step < 40000) {
    host.advance(200);
    g.tick();
    step++;
    if (step % 400 === 0) g.honk();
    if (step % 450 === 225) {
      g.toggleTablet();
      if (g.tablet) g.openTab(step % 900 === 225 ? 'ledger' : 'operations');
    }
    if (g.memoView && g.memoView.visible && step % 50 === 0) {
      g.answerMemo(step % 100 === 0 ? 'a' : 'b');
    }
    if (step % 300 === 0 && g.screen === 'play') {
      snapshots.push(
        JSON.stringify({
          shift: g.S.shift,
          time: Math.round(g.S.time * 10) / 10,
          rng: g.S.rng,
          tonnes: Math.round(g.S.tonnes * 10) / 10,
          cash: Math.round(g.S.cash),
          weather: g.S.weather,
          trucks: g.S.trucks.map((t) => `${t.phase}@${Math.round(t.progress * 1000)}:${Math.round(t.payload)}`),
          faults: g.S.alerts.map((a) => a.eventId || a.kind)
        })
      );
    }
    if (g.screen === 'report') {
      snapshots.push(
        JSON.stringify({
          shift: g.S.shift,
          tonnes: Math.round(g.S.tonnes * 10) / 10,
          cash: Math.round(g.S.cash),
          rng: g.S.rng
        })
      );
      shifts++;
      if (shifts < 2) {
        g.nextShift();
        g.dispatchAll();
      }
    }
  }
  return snapshots;
}

function runSoak(logicCode, mode, targetShifts) {
  let rng = 1;
  const random = () => (rng = (rng * 48271) % 2147483647) / 2147483647;
  const host = makeHost();
  const { g } = host;
  vm.runInContext(logicCode, g, { filename: 'main.logic' });

  const failures = [];
  const fail = (where, err) => {
    failures.push(`${where}: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`);
  };
  const call = (name, ...args) => {
    try {
      return g[name](...args);
    } catch (e) {
      fail(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`, e);
      return undefined;
    }
  };
  const key = (k, down = true) => {
    try {
      host.key(k, down);
    } catch (e) {
      fail(`key ${k}`, e);
    }
  };
  const tick = (ms = 200) => {
    host.advance(ms);
    call('tick');
  };

  function check(where) {
    const S = g.S;
    if (!S) return fail(where, 'no state');
    for (const k of ['time', 'cash', 'tonnes', 'extraction', 'lifetimeTonnes']) {
      if (!Number.isFinite(S[k])) fail(where, `S.${k} is ${S[k]}`);
    }
    for (const t of S.trucks) {
      for (const k of ['x', 'y', 'z', 'heading', 'payload', 'progress', 'fuel', 'health']) {
        if (!Number.isFinite(t[k])) fail(where, `truck ${t.id}.${k} is ${t[k]}`);
      }
    }
    for (const k of ['x', 'y', 'z']) {
      if (!Number.isFinite(S.player[k])) fail(where, `player.${k} is ${S.player[k]}`);
    }
    if (S.tonnes < 0 || S.extraction < -0.001) {
      fail(where, `negative tonnes ${S.tonnes} / ore ${S.extraction}`);
    }
    if (!Array.isArray(g.sceneObjects) || g.sceneObjects.some((o) => !o || typeof o.id !== 'string')) {
      fail(where, 'bad sceneObjects');
    }
    const ids = new Set();
    for (const o of g.sceneObjects) {
      if (ids.has(o.id)) {
        fail(where, `duplicate scene id ${o.id}`);
        break;
      }
      ids.add(o.id);
    }
    for (const o of g.sceneObjects) {
      if (o.type === 'model' && !o.modelKey) {
        fail(where, `model ${o.id} has no modelKey`);
        break;
      }
    }
    for (const [k, v] of Object.entries(g.hud)) {
      if (typeof v === 'number' && !Number.isFinite(v)) fail(where, `hud.${k} is ${v}`);
    }
    for (const row of g.historyRows || []) {
      if (typeof row.profitText !== 'string' || !/^-?\$[\d,]+$/.test(row.profitText)) {
        fail(where, `bad historyRows profitText: ${row.profitText}`);
        break;
      }
    }
    try {
      const text = g.saveText();
      const data = JSON.parse(text);
      if (!g.validState(data)) fail(where, 'saveText() does not pass validState()');
      if (text.length > 30000) fail(where, `save is ${text.length} characters (limit 30000)`);
    } catch (e) {
      fail(`${where} save`, e);
    }
  }

  const tabs = [
    'operations',
    'fleet',
    'workforce',
    'workshop',
    'ledger',
    'log',
    'guide',
    'contracts',
    'excavators',
    'site'
  ];
  const actions = [
    () => call('toggleTablet'),
    () => call('openTab', tabs[Math.floor(random() * tabs.length)]),
    () => call('setLogFilter', ['all', 'alerts', 'ops', 'crew'][Math.floor(random() * 4)]),
    () => call('locateAndGoTruck', 1 + Math.floor(random() * 4)),
    () => call('dispatchAll'),
    () => call('pitDispatch', 1 + Math.floor(random() * 5)),
    () => call('recallTruck', 1 + Math.floor(random() * 4)),
    () => call('setPolicy', 1 + Math.floor(random() * 4)),
    () => call('buyRobot'),
    () => call('buyTruck'),
    () => call('buyExcavator'),
    () => call('deployExcavator', 2),
    () => call('holdExcavator', 1),
    () => call('buyUpgrade', ['loader', 'crusher', 'roads', 'battery', 'relay', 'nope'][Math.floor(random() * 6)]),
    () => call('acceptContract', ['production', 'manual', 'service'][Math.floor(random() * 3)]),
    () => call('acceptCommission'),
    () => call('chooseChapter', random() < 0.5 ? 'a' : 'b'),
    () =>
      call(
        'markPlace',
        ['pit', 'crusher', 'office', 'fuel', 'workshop', 'charger', 'relay'][Math.floor(random() * 7)]
      ),
    () => call('focusObjective'),
    () => call('nextInspection'),
    () => call('clearWaypoint'),
    () => call('guideService'),
    () => {
      if (g.S.alerts.length) call('goAlert', g.S.alerts[0].key);
    },
    () => key(['w', 'a', 's', 'd', ' ', 'shift'][Math.floor(random() * 6)], random() < 0.6),
    () => {
      const s = g.S.player;
      for (const k of ['w', 'a', 's', 'd']) key(k, false);
      s.x = -60 + random() * 200;
      s.z = -20 + random() * 200;
      s.y = g.heightAt(s.x, s.z);
    },
    () => key('e'),
    () => key('l'),
    () => key('r'),
    () => key('g'),
    () => key('p'),
    () => key('c'),
    () => key('f'),
    () => key('h'),
    () => key(String(Math.floor(random() * 10))),
    () => call('interact', true),
    () => call('controlInteract'),
    () => call('manualLoad'),
    () => call('scoopBucket'),
    () => call('haulAction'),
    () => {
      const a = g.S.alerts[0];
      if (a && g.S.player.mode === 'foot') {
        g.S.player.x = a.x + 1.5;
        g.S.player.z = a.z + 1.5;
        call('interact', true);
      }
    },
    () => {
      if (g.repairJob) {
        const step = g.fieldStep();
        if (step) {
          if (step.action === 'hold') g.fieldHeld = true;
          else if (step.action === 'drag') call('fieldAttach');
          else call('fieldAction', step.action);
        }
      }
    },
    () => {
      if (g.repairJob && g.carryingCone()) {
        const w = g.repairJob.alert.work;
        g.S.player.x = w.dropX;
        g.S.player.z = w.dropZ;
        call('fieldAction', 'place');
      }
    },
    () => call('cancelField'),
    () => call('pauseGame'),
    () => call('resumeGame'),
    () => call('saveGame', true),
    () => call('toggleScreenControls'),
    () => call('cycleSensitivity'),
    () => call('toggleMusic'),
    () => call('toggleRadio'),
    () => call('toggleMute'),
    () => call('checkInCrew', 1 + Math.floor(random() * 6)),
    () => call('locateRobot', 1 + Math.floor(random() * 6)),
    () => call('recallOperator', 1 + Math.floor(random() * 6)),
    () => call('selectTruck', 1 + Math.floor(random() * 4)),
    () => call('showExport'),
    () => call('showSaveBackup'),
    () => call('switchExportMode', random() < 0.5 ? 'save' : 'snapshot'),
    () => call('copyExportText'),
    () => call('hideExport'),
    () => call('cancelResetConfirm'),
    () => call('toggleCamera'),
    () => call('toggleParkBrake'),
    () => call('centerView'),
    () => call('toggleRun'),
    () => call('touchJump'),
    () => call('toggleLamp')
  ];

  function competentPlayer() {
    const S = g.S;
    if (g.tablet) call('toggleTablet');
    if (S.player.mode !== 'foot') key('e');
    if (S.robots.length < 3 && S.cash > 3000) call('buyRobot');
    if (S.trucks.length < 4 && S.cash > 22000) call('buyTruck');
    if (S.robots.length < Math.min(6, S.trucks.length + 1) && S.cash > g.recruitmentPrice() + 1500) {
      call('buyRobot');
    }
    for (const u of ['loader', 'crusher', 'roads', 'battery']) {
      const level = S.upgrade[u];
      const item = g.upgradeCatalog.find((c) => c.id === u);
      if (level < 3 && S.cash > Math.round(item.cost * (1 + level * 0.7)) + 6000) call('buyUpgrade', u);
    }
    if (S.excavators.length < 2 && S.cash > 30000) call('buyExcavator');
    if (S.excavators.length === 2 && S.activeExcavator === 1 && !S.deployment.remaining) {
      call('deployExcavator', 2);
    }
    if (S.trucks.some((t) => !t.active && t.operator_id !== 0)) call('dispatchAll');
    if (g.repairJob) {
      const step = g.fieldStep();
      if (!step) return;
      if (step.action === 'hold') g.fieldHeld = true;
      else if (step.action === 'drag') call('fieldAttach');
      else if (step.action === 'place') {
        const w = g.repairJob.alert.work;
        S.player.x = w.dropX;
        S.player.z = w.dropZ;
        S.player.y = g.heightAt(w.dropX, w.dropZ);
        call('fieldAction', 'place');
      } else {
        call('fieldAction', step.action);
      }
      return;
    }
    g.fieldHeld = false;
    const a = S.alerts[0];
    if (a && a.kind === 'kevin' && S.kevin) {
      S.player.x = S.kevin.x + 3;
      S.player.z = S.kevin.z + 3;
      S.player.y = g.heightAt(S.player.x, S.player.z);
      return;
    }
    if (a) {
      S.player.x = a.x + 2;
      S.player.z = a.z + 2;
      S.player.y = g.heightAt(S.player.x, S.player.z);
      call('interact', true);
      return;
    }
    if (Math.hypot(S.player.x + 34, S.player.z - 141) > 3) {
      S.player.x = -34;
      S.player.z = 141;
      S.player.y = g.heightAt(-34, 141);
    }
    if (S.tonnes >= S.target && S.time > 60 && random() < 0.002) call('finishShift');
  }

  let lastEventId = 0;
  let watchdogFired = 0;
  function countWatchdog() {
    for (const e of g.S ? g.S.events : []) {
      if (e.id <= lastEventId) break;
      if (e.speaker === 'DISPATCH' && /^Traffic jam/.test(e.message)) watchdogFired++;
    }
    if (g.S && g.S.events.length) lastEventId = Math.max(lastEventId, g.S.events[0].id);
  }

  call('newGame');
  if (g.screen !== 'play') fail('newGame', `screen is ${g.screen}`);
  check('start');

  let shiftsDone = 0;
  let shiftsMet = 0;
  let ticks = 0;
  while (shiftsDone < targetShifts && ticks < 250000) {
    tick(200);
    ticks++;
    countWatchdog();
    if (mode === 'play' && g.screen === 'play') competentPlayer();
    else if (g.screen === 'play' && random() < 0.25) {
      actions[Math.floor(random() * actions.length)]();
    }
    if (g.screen === 'pause' && random() < 0.3) call('resumeGame');
    if (ticks % 25 === 0 && g.screen === 'play') check(`shift ${g.S.shift} t=${g.S.time.toFixed(0)}`);
    if (g.screen === 'report') {
      check(`report ${g.S.shift}`);
      if (g.S.tonnes >= g.S.target) shiftsMet++;
      shiftsDone++;
      if (VERBOSE) {
        console.log(
          `  [${mode}] shift ${g.S.shift}: ${Math.round(g.S.tonnes)}/${g.S.target} t, cash $${Math.round(g.S.cash)}, rank ${g.hud.rank}`
        );
      }
      call('returnTitle');
      call('checkSave');
      if (!g.canContinue) fail('continue', 'no save to continue after shift');
      call('continueGame');
      if (g.screen !== 'report') fail('continue', `screen is ${g.screen} after continuing finished shift`);
      call('nextShift');
      if (g.screen !== 'play') fail('nextShift', `screen is ${g.screen}`);
    }
    if (failures.length > 20) break;
  }

  assert.equal(shiftsDone, targetShifts, `[${mode}] expected ${targetShifts} shifts, completed ${shiftsDone}`);
  assert.deepEqual(failures, [], `[${mode}] soak failures:\n  ${[...new Set(failures)].join('\n  ')}`);
  if (mode === 'play') {
    assert.equal(watchdogFired, 0, `[play] fleet watchdog fired ${watchdogFired} times (expected 0)`);
    const minMet = Math.ceil(targetShifts * 0.7);
    assert.ok(
      shiftsMet >= minMet,
      `[play] competent bot should meet target on at least ${minMet}/${targetShifts} shifts (met ${shiftsMet})`
    );
  }
  return { shiftsDone, shiftsMet, ticks, watchdogFired };
}

const t0 = Date.now();
const logicCode = verifyStaticBundle();
testFeaturesAndLifecycle(logicCode);

const replayA = runReplaySession(logicCode, 1_700_000_000_000);
const replayB = runReplaySession(logicCode, 1_700_086_400_000);
assert.ok(replayA.length >= 10, 'Replay should capture minute snapshots across 2 shifts');
assert.deepEqual(replayA, replayB, 'Simulation diverged between runs with separated wall clocks');

const monkeyRes = runSoak(logicCode, 'monkey', MONKEY_SHIFTS);
const playRes = runSoak(logicCode, 'play', PLAY_SHIFTS);

console.log(
  `✓ MineManagement verified in ${((Date.now() - t0) / 1000).toFixed(2)}s ` +
    `(replay: ${replayA.length} snapshots; monkey: ${monkeyRes.shiftsDone} shifts; ` +
    `play: ${playRes.shiftsMet}/${playRes.shiftsDone} targets met, ${playRes.watchdogFired} jams)`
);
