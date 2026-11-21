/**
 * Pack .softn bundle(s) from bundles/<category>/<Name>/ (or bundles/<Name>/) into dist/.
 *
 * Usage:
 *   node scripts/build/build-bundle.cjs              — build every bundle (auto-discovered)
 *   node scripts/build/build-bundle.cjs Showcase     — build only dist/Showcase.softn
 *
 * scripts/build/build-release.cjs builds them all and writes the checksums and the
 * catalogue record beside them; `npm test` packs and validates every one. The
 * archives are build products and are never committed: a tag publishes them.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const repoRoot = path.resolve(__dirname, '../..');
const bundlesRoot = path.join(repoRoot, 'bundles');

// Binary file extensions.
//
// Kept by hand in step with the registry in
// packages/@softn/core/src/bundle/asset-classification.ts in f2i-com/softn.com (the source of
// truth): this script is CommonJS and cannot import the TS module. Note
// .gltf is deliberately absent — it is JSON text, unlike its sibling .glb.
// .obj is text in the registry but stays here: a writer must never transcode
// bytes it had no need to read, and the readers classify on read regardless.
const binaryExtensions = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg', '.bmp', '.avif', '.tiff', '.tif',
  '.glb', '.obj', '.fbx', '.stl', '.3ds', '.dae', '.bin',
  '.mp3', '.wav', '.ogg', '.opus', '.aac', '.flac', '.m4a',
  '.mp4', '.webm',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.hdr', '.exr', '.pdf',
  '.onnx',
];

function isBinary(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}

const CONTAINER_EXCLUDED_DIRS = new Set(['assets-src', '.git', 'node_modules']);
const CONTAINER_EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function isWebContainerManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return false;
  if (manifest.engine === 2 || manifest.container === true) return true;
  if (manifest.backend && typeof manifest.backend === 'object') return true;
  if (!manifest.files && typeof manifest.main === 'string' && /\.html?$/i.test(manifest.main)) return true;
  return false;
}

function collectContainerFiles(sourceDir) {
  const out = [];
  const stack = [sourceDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (CONTAINER_EXCLUDED_DIRS.has(entry.name)) continue;
        stack.push(abs);
      } else {
        if (CONTAINER_EXCLUDED_FILES.has(entry.name)) continue;
        const rel = path.relative(sourceDir, abs).replace(/\\/g, '/');
        if (rel === 'manifest.json' || rel === 'permission.json') continue;
        out.push(rel);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function collectFilesRecursive(rootDir, baseDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const dirEntries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of dirEntries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else {
        out.push(path.relative(baseDir, abs).replace(/\\/g, '/'));
      }
    }
  }
  // Bundle bytes are also the application identity, so filesystem enumeration
  // order must not make identical source trees produce different identities.
  return out.sort((a, b) => a.localeCompare(b));
}

// CRC-32 calculation
const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[i] = value;
}

function crc32(data) {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// Create ZIP file
function createZip(entries) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf-8');
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const checksum = crc32(dataBuffer);
    let method = 0;
    let storedBuffer = dataBuffer;
    if (dataBuffer.length > 0) {
      const deflated = zlib.deflateRawSync(dataBuffer, { level: 9 });
      if (deflated.length < dataBuffer.length) {
        method = 8;
        storedBuffer = deflated;
      }
    }

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(storedBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBytes.copy(localHeader, 30);

    chunks.push(localHeader);
    chunks.push(storedBuffer);

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + nameBytes.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);
    cdEntry.writeUInt16LE(20, 4);
    cdEntry.writeUInt16LE(20, 6);
    cdEntry.writeUInt16LE(0, 8);
    cdEntry.writeUInt16LE(method, 10);
    cdEntry.writeUInt16LE(0, 12);
    cdEntry.writeUInt16LE(0, 14);
    cdEntry.writeUInt32LE(checksum, 16);
    cdEntry.writeUInt32LE(storedBuffer.length, 20);
    cdEntry.writeUInt32LE(dataBuffer.length, 24);
    cdEntry.writeUInt16LE(nameBytes.length, 28);
    cdEntry.writeUInt16LE(0, 30);
    cdEntry.writeUInt16LE(0, 32);
    cdEntry.writeUInt16LE(0, 34);
    cdEntry.writeUInt16LE(0, 36);
    cdEntry.writeUInt32LE(0, 38);
    cdEntry.writeUInt32LE(offset, 42);
    nameBytes.copy(cdEntry, 46);

    centralDirectory.push(cdEntry);
    offset += localHeader.length + storedBuffer.length;
  }

  const cdStart = offset;
  for (const entry of centralDirectory) {
    chunks.push(entry);
    offset += entry.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.size, 8);
  eocd.writeUInt16LE(entries.size, 10);
  eocd.writeUInt32LE(offset - cdStart, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);

  chunks.push(eocd);

  return Buffer.concat(chunks);
}

/**
 * Discover every bundle directory under bundles/ containing a manifest.json,
 * whether directly inside bundles/<Name>/ or grouped under bundles/<category>/<Name>/.
 */
function discoverBundleEntries() {
  const found = [];
  const seen = new Map();

  function scan(dir, category) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const abs = path.join(dir, entry.name);
      const manifestPath = path.join(abs, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const rel = path.relative(bundlesRoot, abs).replace(/\\/g, '/');
        if (seen.has(entry.name)) {
          throw new Error(`Duplicate bundle name "${entry.name}" in ${seen.get(entry.name)} and ${rel}`);
        }
        seen.set(entry.name, rel);
        found.push({
          name: entry.name,
          category,
          relPath: rel,
          dir: abs,
        });
      } else if (!category) {
        scan(abs, entry.name);
      }
    }
  }

  scan(bundlesRoot, null);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve a bundle name ("Showcase") or relative path ("samples/Showcase") to its directory. */
function resolveBundleDir(bundleRef) {
  if (!bundleRef) return null;
  const normalized = bundleRef.replace(/\\/g, '/').replace(/^bundles\//, '').replace(/\/+$/, '');
  const direct = path.join(bundlesRoot, ...normalized.split('/'));
  if (fs.existsSync(path.join(direct, 'manifest.json'))) {
    return direct;
  }
  const entries = discoverBundleEntries();
  const match = entries.find((e) => e.name === normalized || e.relPath === normalized);
  return match ? match.dir : null;
}

/**
 * Build a single bundle by name (or category/name).
 */
function buildBundle(bundleName, options = {}) {
  const resolvedName = path.basename(bundleName.replace(/\\/g, '/').replace(/\/+$/, ''));
  const sourceDir = resolveBundleDir(bundleName);
  const manifestPath = sourceDir ? path.join(sourceDir, 'manifest.json') : null;
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    console.error(`ERROR: manifest.json not found for bundle "${bundleName}" under bundles/`);
    return null;
  }

  if (!options.quiet) console.log(`Building ${resolvedName}.softn bundle...`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const entries = new Map();

  // Add manifest
  entries.set('manifest.json', JSON.stringify(manifest, null, 2));

  // Add permission.json if present
  const permPath = path.join(sourceDir, 'permission.json');
  if (fs.existsSync(permPath)) {
    entries.set('permission.json', fs.readFileSync(permPath, 'utf-8'));
  }

  let allFiles;
  if (isWebContainerManifest(manifest)) {
    // Engine 2 Web Container bundles pack their entire source tree (HTML/CSS/JS,
    // assets, .htaccess, PHP/JS/TS/Rust/Python backend, SQL migrations, vendor).
    allFiles = collectContainerFiles(sourceDir);
  } else {
    // Classic Engine 1 bundles declare their files in manifest.files.
    const mf = manifest.files || {};
    const fileSet = new Set([
      ...(mf.ui || []),
      ...(mf.logic || []),
      ...(mf.server || []),
      ...(mf.xdb || []),
      ...(mf.assets || []),
    ]);
    // Always include files physically under assets/ so new media files are picked up
    // even if manifest.files.assets is stale.
    const discoveredAssets = collectFilesRecursive(path.join(sourceDir, 'assets'), sourceDir);
    for (const a of discoveredAssets) {
      fileSet.add(a);
    }
    if (manifest.main) fileSet.add(manifest.main);
    if (manifest.icon) fileSet.add(manifest.icon);
    allFiles = [...fileSet];
  }

  // Add each file
  for (const filePath of allFiles) {
    const fullPath = path.join(sourceDir, filePath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`  WARNING: File not found: ${filePath}`);
      continue;
    }

    if (isBinary(filePath)) {
      entries.set(filePath, fs.readFileSync(fullPath));
    } else {
      entries.set(filePath, fs.readFileSync(fullPath, 'utf-8'));
    }
  }

  // Create the ZIP bundle
  const bundleData = createZip(entries);

  // Write the archive. Archives are build products, not sources: they go to
  // dist/ (or wherever the caller asks), never beside the files they were
  // packed from, so nothing packed is ever committed.
  const outDir = options.outDir || path.join(repoRoot, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${resolvedName}.softn`);
  fs.writeFileSync(outputPath, bundleData);

  if (!options.quiet) {
    console.log(`Bundle created: ${path.relative(process.cwd(), outputPath) || outputPath}`);
    console.log(`Size: ${(bundleData.length / 1024).toFixed(2)} KB`);
    console.log('Contents:');
    for (const [name] of entries) {
      console.log(`  - ${name}`);
    }
    console.log('');
  }

  return { name: resolvedName, file: `${resolvedName}.softn`, path: outputPath, bytes: bundleData, manifest };
}

/** Every bundle name under bundles/ with a manifest.json, in a stable order. */
function discoverBundles() {
  return discoverBundleEntries().map((entry) => entry.name);
}

module.exports = { buildBundle, discoverBundles, discoverBundleEntries, resolveBundleDir, createZip, binaryExtensions };

// --- Main ---

if (require.main === module) {
  const bundleName = process.argv[2];

  if (bundleName) {
    if (!buildBundle(bundleName)) process.exit(1);
  } else {
    const bundleNames = discoverBundles();
    if (bundleNames.length === 0) {
      console.log('No bundles found with manifest.json');
      process.exit(0);
    }
    console.log(`Found ${bundleNames.length} bundle(s): ${bundleNames.join(', ')}\n`);

    let allSuccess = true;
    for (const name of bundleNames) {
      if (!buildBundle(name)) allSuccess = false;
    }
    if (!allSuccess) process.exit(1);
  }
}
