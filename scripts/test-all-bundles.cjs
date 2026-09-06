// Pack every example and put each archive through the bundle validator, with
// its source directory so the archive is checked against what it was packed
// from. Keeping the list discovered rather than hand-maintained means a newly
// added example starts receiving the checks in the same commit that adds it.
// The catalogue is checked on the way: every entry complete, unique and backed
// by a bundles/<Name>/ directory.
const path = require('path');
const { spawnSync } = require('child_process');
const { buildRelease } = require('./build-release.cjs');

const validator = path.join(__dirname, 'test-bundle.cjs');
const bundlesDir = path.join(__dirname, '..', 'bundles');

let built;
let record;
try {
  ({ built, record } = buildRelease({ quiet: true }));
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}

const failed = [];
for (const bundle of built) {
  const result = spawnSync(
    process.execPath,
    [validator, bundle.path, '--source', path.join(bundlesDir, bundle.name)],
    { stdio: 'inherit' }
  );
  if (result.error) {
    console.error(`ERROR: Could not validate ${bundle.file}: ${result.error.message}`);
    failed.push(bundle.file);
  } else if (result.status !== 0) {
    failed.push(bundle.file);
  }
}

if (failed.length > 0) {
  console.error(`Bundle validation failed: ${failed.join(', ')}`);
  process.exit(1);
}

console.log(
  `All ${built.length} example bundles built and validated: ${record.bundles.length} catalogued, ${record.unlisted.length} unlisted.`
);
