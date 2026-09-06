/**
 * Validate a built .softn bundle using the same broad processing steps as the
 * browser and desktop loaders.
 *
 * Usage:
 *   node scripts/test-bundle.cjs dist/Showcase.softn --source bundles/Showcase
 *   node scripts/test-bundle.cjs dist/Showcase.softn --write processed.ui
 */

const fs = require('fs');
const path = require('path');
const fflate = require('fflate');
const { composeBundleSource } = require('./bundle-source-composer.cjs');

const args = process.argv.slice(2);
const writeIndex = args.indexOf('--write');
let outputPath = null;
if (writeIndex >= 0) {
  if (!args[writeIndex + 1]) {
    console.error('ERROR: --write requires an output path');
    process.exit(1);
  }
  outputPath = path.resolve(process.cwd(), args[writeIndex + 1]);
  args.splice(writeIndex, 2);
}

const sourceIndex = args.indexOf('--source');
let sourceOverride = null;
if (sourceIndex >= 0) {
  if (!args[sourceIndex + 1]) {
    console.error('ERROR: --source requires a directory');
    process.exit(1);
  }
  sourceOverride = path.resolve(process.cwd(), args[sourceIndex + 1]);
  if (!fs.existsSync(sourceOverride) || !fs.statSync(sourceOverride).isDirectory()) {
    console.error(`ERROR: --source is not a directory: ${sourceOverride}`);
    process.exit(1);
  }
  args.splice(sourceIndex, 2);
}

if (args.length > 1) {
  console.error('Usage: node scripts/test-bundle.cjs [bundle.softn] [--source bundles/Name] [--write output.ui]');
  process.exit(1);
}

const defaultBundle = path.join(__dirname, '..', 'dist', 'Showcase.softn');
const bundlePath = args[0] ? path.resolve(process.cwd(), args[0]) : defaultBundle;
const decoder = new TextDecoder('utf-8', { fatal: true });
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`ERROR: ${message}`);
}

function normalizeBundlePath(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
    return null;
  }
  const portable = value.replace(/\\/g, '/');
  const normalized = path.posix.normalize(portable);
  if (
    portable.includes('\0') ||
    /^[A-Za-z]:/.test(portable) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    fail(`${label} escapes the bundle: ${value}`);
    return null;
  }
  return normalized;
}

function resolveBundlePath(basePath, relativePath, label) {
  return normalizeBundlePath(
    path.posix.join(path.posix.dirname(basePath), relativePath.replace(/\\/g, '/')),
    label
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (!fs.existsSync(bundlePath)) {
  console.error(`ERROR: Bundle not found: ${bundlePath}`);
  process.exit(1);
}

const bundleData = fs.readFileSync(bundlePath);
let unzipped;
try {
  unzipped = fflate.unzipSync(new Uint8Array(bundleData));
} catch (error) {
  console.error(`ERROR: Invalid ZIP bundle: ${error.message}`);
  process.exit(1);
}

const files = Object.keys(unzipped).sort();
for (const archiveFile of files) {
  const normalized = normalizeBundlePath(archiveFile, 'archive entry');
  if (normalized !== archiveFile.replace(/\\/g, '/')) {
    fail(`Archive entry is not canonical: ${archiveFile}`);
  }
}
console.log(
  `Bundle: ${path.relative(process.cwd(), bundlePath)} (${bundleData.length} bytes, ${files.length} files)`
);

function readText(bundleFile, required = true) {
  const bytes = unzipped[bundleFile];
  if (!bytes) {
    if (required) fail(`Missing bundle file: ${bundleFile}`);
    return null;
  }
  try {
    return decoder.decode(bytes);
  } catch (error) {
    fail(`${bundleFile} is not valid UTF-8: ${error.message}`);
    return null;
  }
}

let manifest;
try {
  const manifestSource = readText('manifest.json');
  manifest = manifestSource ? JSON.parse(manifestSource) : null;
} catch (error) {
  fail(`manifest.json is invalid JSON: ${error.message}`);
}

if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
  fail('manifest.json must contain an object');
  manifest = { files: {} };
}
if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
  fail('manifest.files must contain an object');
  manifest.files = {};
}

const declaredFiles = new Set();
for (const group of ['ui', 'logic', 'server', 'xdb', 'assets']) {
  const entries = manifest.files[group] || [];
  if (!Array.isArray(entries)) {
    fail(`manifest.files.${group} must be an array`);
    continue;
  }
  for (let index = 0; index < entries.length; index += 1) {
    const normalized = normalizeBundlePath(entries[index], `manifest.files.${group}[${index}]`);
    if (!normalized) continue;
    declaredFiles.add(normalized);
    if (!unzipped[normalized]) fail(`Manifest references missing file: ${normalized}`);
  }
}

const mainPath = normalizeBundlePath(manifest.main, 'manifest.main');
if (mainPath) {
  declaredFiles.add(mainPath);
  if (!unzipped[mainPath]) fail(`Main UI is missing: ${mainPath}`);
}
if (manifest.icon) {
  const iconPath = normalizeBundlePath(manifest.icon, 'manifest.icon');
  if (iconPath) {
    declaredFiles.add(iconPath);
    if (!unzipped[iconPath]) fail(`Icon is missing: ${iconPath}`);
  }
}

// The sources: bundles/<Name>/ when passed with --source (how test-all-bundles
// checks the archives build-bundle.cjs writes to dist/), or a directory beside
// the archive when one was packed in place. Comparing them catches an archive
// that no longer matches what it was packed from, and a manifest that names a
// file the sources do not have.
const sourceDir = sourceOverride || bundlePath.replace(/\.softn$/i, '');
if (sourceDir !== bundlePath && fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
  for (const archiveFile of files) {
    const sourceFile = path.join(sourceDir, ...archiveFile.split('/'));
    if (!fs.existsSync(sourceFile)) {
      fail(`Archive contains a file absent from its source directory: ${archiveFile}`);
      continue;
    }
    const sourceBytes = fs.readFileSync(sourceFile);
    if (archiveFile === 'manifest.json') {
      try {
        const sourceManifest = JSON.parse(sourceBytes.toString('utf8'));
        const archiveManifest = JSON.parse(Buffer.from(unzipped[archiveFile]).toString('utf8'));
        if (JSON.stringify(sourceManifest) !== JSON.stringify(archiveManifest)) {
          fail('The archive manifest does not match the source manifest');
        }
      } catch (error) {
        fail(`Could not compare source manifest: ${error.message}`);
      }
    } else if (!sourceBytes.equals(Buffer.from(unzipped[archiveFile]))) {
      fail(`Archive file is stale: ${archiveFile}`);
    }
  }

  for (const declaredFile of declaredFiles) {
    if (!fs.existsSync(path.join(sourceDir, ...declaredFile.split('/')))) {
      fail(`Source file declared by the manifest is missing: ${declaredFile}`);
    }
  }

  const sourceAssets = path.join(sourceDir, 'assets');
  if (fs.existsSync(sourceAssets)) {
    const pending = [sourceAssets];
    while (pending.length > 0) {
      const directory = pending.pop();
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          pending.push(absolutePath);
          continue;
        }
        const bundleFile = path.relative(sourceDir, absolutePath).replace(/\\/g, '/');
        if (!unzipped[bundleFile]) fail(`Source asset is missing from the archive: ${bundleFile}`);
      }
    }
  }
}

let fullSource = mainPath ? readText(mainPath) : null;
if (fullSource && mainPath) {
  const sourceFiles = new Map();
  for (const bundleFile of files) {
    if (bundleFile === mainPath || /\.(?:ui|logic)$/i.test(bundleFile)) {
      const content = readText(bundleFile);
      if (content !== null) sourceFiles.set(bundleFile, content);
    }
  }

  try {
    fullSource = composeBundleSource(
      sourceFiles,
      mainPath,
      Array.isArray(manifest.files.logic) ? manifest.files.logic : []
    );
  } catch (error) {
    fail(error.message);
    fullSource = null;
  }

  if (fullSource !== null) {
    if (/<logic\s+src=/.test(fullSource))
      fail('Processed UI still contains an unresolved <logic src> tag');
    if (/<import\s+\w+/.test(fullSource))
      fail('Processed UI still contains an unresolved <import> tag');

    const logicBlocks = [...fullSource.matchAll(/<logic>([\s\S]*?)<\/logic>/g)];
    if (logicBlocks.length !== 1) {
      fail(`Processed UI contains ${logicBlocks.length} logic blocks; expected exactly one`);
    } else {
      try {
        new Function(logicBlocks[0][1]);
      } catch (error) {
        fail(`Combined logic has invalid JavaScript: ${error.message}`);
      }
    }

    if (outputPath) {
      fs.writeFileSync(outputPath, fullSource);
      console.log(`Processed source: ${outputPath}`);
    }
  }
}

if (failures > 0) {
  console.error(`Bundle validation failed with ${failures} issue${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}

console.log(
  `PASS: ${manifest.name || path.basename(bundlePath)} bundle is complete, current, and parseable.`
);
