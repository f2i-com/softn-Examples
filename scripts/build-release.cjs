#!/usr/bin/env node
/**
 * Pack every example into dist/ and write the release record beside them:
 *
 *   dist/<Name>.softn       one archive per bundles/<Name>/
 *   dist/SHA256SUMS.txt     every archive's digest, in `sha256sum -c` form
 *   dist/catalogue.json     catalogue.json plus each bundle's version, size,
 *                           digest and (for a tagged build) download URL
 *   dist/RELEASE_NOTES.md   the table the GitHub Release shows
 *
 * Usage:
 *   node scripts/build-release.cjs
 *   node scripts/build-release.cjs --expect-tag v1.0.0
 *
 * With --expect-tag the tag has to be "v" + package.json's version, so a
 * release can never carry a number the repository does not report, and each
 * catalogue entry gains the URL its archive is published at. softn.com pins a
 * release by reading that catalogue: `node scripts/fetch-demos.mjs --pin v1.0.0`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { buildBundle, discoverBundles } = require('./build-bundle.cjs');

const root = path.resolve(__dirname, '..');
const REPO = 'f2i-com/softn-Examples';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function tryGit(command) {
  try {
    return execSync(`git ${command}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** catalogue.json, checked: every entry complete, unique, and backed by a source directory. */
function readCatalogue() {
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'catalogue.json'), 'utf8'));
  if (!Array.isArray(catalogue) || catalogue.length === 0) {
    throw new Error('catalogue.json must be a non-empty array');
  }
  const files = new Set();
  const ids = new Set();
  for (const entry of catalogue) {
    for (const key of ['id', 'file', 'name', 'description', 'primary']) {
      if (!entry || typeof entry[key] !== 'string' || entry[key].length === 0) {
        throw new Error(`catalogue entry ${JSON.stringify(entry)} lacks a string ${key}`);
      }
    }
    if (path.basename(entry.file) !== entry.file || !entry.file.endsWith('.softn')) {
      throw new Error(`${entry.file} is not a safe .softn filename`);
    }
    if (files.has(entry.file)) throw new Error(`${entry.file} is catalogued twice`);
    if (ids.has(entry.id)) throw new Error(`id ${entry.id} is catalogued twice`);
    files.add(entry.file);
    ids.add(entry.id);
    const name = entry.file.slice(0, -'.softn'.length);
    if (!fs.existsSync(path.join(root, 'bundles', name, 'manifest.json'))) {
      throw new Error(`${entry.file} is catalogued but bundles/${name}/ has no manifest.json`);
    }
  }
  return catalogue;
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

function releaseNotes(record) {
  const tag = record.tag || `v${record.version}`;
  const header = '| Example | File | Version | Size | SHA-256 |\n|---|---|---|---|---|';
  const rows = (list) =>
    list
      .map(
        (b) =>
          `| ${b.name} | \`${b.file}\` | ${b.version || '-'} | ${formatSize(b.size)} | \`${b.sha256.slice(0, 12)}\` |`
      )
      .join('\n');
  const lines = [
    `# SoftN Examples ${tag}`,
    '',
    `${record.bundles.length + record.unlisted.length} example applications for [SoftN](https://softn.com), packed from this tag's sources` +
      (record.commit ? ` (commit \`${record.commit.slice(0, 7)}\`)` : '') +
      '. Download a `.softn` file and open it in the SoftN web runtime with its file picker, or serve it and open the runtime with `?open=<url>`.',
    '',
    `## In the softn.com directory (${record.bundles.length})`,
    '',
    header,
    rows(record.bundles),
  ];
  if (record.unlisted.length) {
    lines.push('', `## Built but not listed (${record.unlisted.length})`, '', header, rows(record.unlisted));
  }
  lines.push(
    '',
    '`SHA256SUMS.txt` verifies every archive (`sha256sum -c SHA256SUMS.txt`). `catalogue.json` is the machine-readable record: softn.com pins this release with `node scripts/fetch-demos.mjs --pin ' +
      tag +
      '`.',
    ''
  );
  return lines.join('\n');
}

/**
 * Build everything. Returns { built, record }: `built` has one entry per
 * bundle directory with its path, bytes, size and digest; `record` is what
 * dist/catalogue.json holds.
 */
function buildRelease({ expectTag = null, quiet = true } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (expectTag && expectTag !== `v${pkg.version}`) {
    throw new Error(`tag ${expectTag} does not match package.json version ${pkg.version}`);
  }
  const catalogue = readCatalogue();

  // Start from an empty dist/ so an example that was removed cannot linger.
  const outDir = path.join(root, 'dist');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const built = [];
  for (const name of discoverBundles()) {
    const result = buildBundle(name, { outDir, quiet });
    if (!result) throw new Error(`could not build ${name}`);
    built.push({
      name,
      file: result.file,
      path: result.path,
      size: result.bytes.length,
      sha256: sha256(result.bytes),
      version: typeof result.manifest.version === 'string' ? result.manifest.version : null,
    });
  }

  const byFile = new Map(built.map((b) => [b.file, b]));
  const sourceOf = (file) =>
    expectTag ? { source: `https://github.com/${REPO}/releases/download/${expectTag}/${file}` } : {};
  const listedFiles = new Set(catalogue.map((entry) => entry.file));
  const record = {
    repository: REPO,
    version: pkg.version,
    tag: expectTag,
    commit: process.env.GITHUB_SHA || tryGit('rev-parse HEAD'),
    bundles: catalogue.map((entry) => {
      const b = byFile.get(entry.file);
      return { ...entry, version: b.version, size: b.size, sha256: b.sha256, ...sourceOf(entry.file) };
    }),
    unlisted: built
      .filter((b) => !listedFiles.has(b.file))
      .map((b) => ({
        file: b.file,
        name: b.name,
        version: b.version,
        size: b.size,
        sha256: b.sha256,
        ...sourceOf(b.file),
      })),
  };

  fs.writeFileSync(path.join(outDir, 'catalogue.json'), `${JSON.stringify(record, null, 2)}\n`);
  fs.writeFileSync(
    path.join(outDir, 'SHA256SUMS.txt'),
    built
      .slice()
      .sort((a, b) => a.file.localeCompare(b.file))
      .map((b) => `${b.sha256}  ${b.file}\n`)
      .join('')
  );
  fs.writeFileSync(path.join(outDir, 'RELEASE_NOTES.md'), releaseNotes(record));
  return { built, record };
}

module.exports = { buildRelease, readCatalogue };

if (require.main === module) {
  const args = process.argv.slice(2);
  let expectTag = null;
  const tagIndex = args.indexOf('--expect-tag');
  if (tagIndex >= 0) {
    expectTag = args[tagIndex + 1];
    if (!expectTag) {
      console.error('ERROR: --expect-tag requires a tag such as v1.0.0');
      process.exit(1);
    }
  }
  try {
    const { built, record } = buildRelease({ expectTag, quiet: false });
    const total = built.reduce((sum, b) => sum + b.size, 0);
    console.log(
      `Built ${built.length} bundles (${formatSize(total)}) into dist/: ${record.bundles.length} catalogued, ${record.unlisted.length} unlisted` +
        (expectTag ? `, tagged ${expectTag}` : '')
    );
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
