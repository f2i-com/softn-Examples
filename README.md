# SoftN Examples

The example applications for [SoftN](https://softn.com): every demo the softn.com directory lists, as source, with the scripts that pack, test and release them. Each one is a worked example of some part of the runtime, from a `PixelGrid` snake to a voiced first-person story, a Game Boy, a 386 PC and a language model that never leaves the browser.

The packed `.softn` archives are not committed. The `Release` workflow builds them from a tag and publishes them as a [GitHub Release](../../releases), and softn.com fetches that release rather than keeping copies of its own, so each example exists in exactly one place: its source directory here.

## The examples

### Games

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/PromptlyUnemployed.webp" alt="Promptly Unemployed" width="200"> | **Promptly Unemployed**<br>`bundles/PromptlyUnemployed/` | First-person 3D narrative tragicomedy, part one: laid off by an avatar, home by dinner, a business by midnight. Fully voiced, and one file. |
| <img src="screenshots/Blockscape.webp" alt="Blockscape" width="200"> | **Blockscape**<br>`bundles/Blockscape/` | A first-person voxel sandbox: an island of blocks to mine, build on and save, with gravity, swimming, flight and a day-night cycle |
| <img src="screenshots/DeadHours.webp" alt="Dead Hours" width="200"> | **Dead Hours**<br>`bundles/DeadHours/` | A first-person zombie shooter: hold a fenced yard at night against waves of the dead with a pistol and a shotgun |
| <img src="screenshots/MazeEscape3D.webp" alt="Maze Escape 3D" width="200"> | **Maze Escape 3D**<br>`bundles/MazeEscape3D/` | A first-person maze carved fresh every game: find the golden ring, with a minimap that fills in as you explore and a best time that sticks |
| <img src="screenshots/TexasHoldem.webp" alt="Texas Hold'em" width="200"> | **Texas Hold'em**<br>`bundles/TexasHoldem/` | Texas Hold'em Poker for friends who trust each other: every player's client holds the whole table, hole cards included, over peer-to-peer sync |
| <img src="screenshots/TheOffice.webp" alt="TheOffice" width="200"> | **TheOffice**<br>`bundles/TheOffice/` | Local AI sim game where 6 Office-inspired characters chat autonomously using Qwen3.5-0.8B |
| <img src="screenshots/SimLives.webp" alt="Sim Lives" width="200"> | **Sim Lives**<br>`bundles/SimLives/` | Build a house, design avatars and move a household in: steer them to eat, sleep, wash, play and chat, or switch on free will and watch their day |
| <img src="screenshots/SnakeGame.webp" alt="Snake" width="200"> | **Snake**<br>`bundles/SnakeGame/` | The classic: eat, grow, don't hit the walls — with a shared top ten kept on the site |
| <img src="screenshots/Twenty48.webp" alt="2048" width="200"> | **2048**<br>`bundles/Twenty48/` | The sliding-tile classic: merge equal tiles to reach 2048 and beyond, with undo and a best score |
| <img src="screenshots/Blockfall.webp" alt="Blockfall" width="200"> | **Blockfall**<br>`bundles/Blockfall/` | Falling blocks in a 10×20 well: seven pieces, wall kicks, a ghost piece, hold, a preview, and levels that speed up |
| <img src="screenshots/Pocket.webp" alt="Pocket" width="200"> | **Pocket**<br>`bundles/Pocket/` | An 8-bit handheld emulator — CPU, PPU, APU and mappers all in .logic, drawn by PixelCanvas and heard through AudioStream |
| <img src="screenshots/SoftDOS.webp" alt="SoftDOS" width="200"> | **SoftDOS**<br>`bundles/SoftDOS/` | An x86 PC emulator written in .logic: a 16/32-bit CPU with the full 386 integer instruction set, VGA mode 13h and 80x25 text, a BIOS and DOS kernel, and a command line that runs real 8086 programs. |

### Simulations

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/TrainYard.webp" alt="Model Train Yard" width="200"> | **Model Train Yard**<br>`bundles/TrainYard/` | An animated HO-scale model train yard diorama on a wooden table with running trains, turntable, busy harbor, town, day-night cycle, and tactile physical controls |
| <img src="screenshots/PredatorPrey.webp" alt="Predator-Prey Simulator" width="200"> | **Predator-Prey Simulator**<br>`bundles/PredatorPrey/` | An interactive 3D ecosystem diorama: watch foxes hunt rabbits, rabbits graze on grass, and population dynamics balance in real time |

### Tools, AI and creative

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/WarbleWire.webp" alt="WarbleWire" width="200"> | **WarbleWire**<br>`bundles/WarbleWire/` | Send a message as synthetic birdsong and decode it back — the QXW acoustic transport |
| <img src="screenshots/AIChat.webp" alt="AI Chat" width="200"> | **AI Chat**<br>`bundles/AIChat/` | A chat with a small language model that downloads once and runs entirely in your browser; nothing you type leaves the machine |
| <img src="screenshots/HouseBuilder.webp" alt="House Builder" width="200"> | **House Builder**<br>`bundles/HouseBuilder/` | Draw a house from above and see it in 3D: walls, doors, windows, room floors, a roof, furniture and garden, then walk through it in first person |

### Runtime samples

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/GlamourStudio.webp" alt="Glamour Studio" width="200"> | **Glamour Studio**<br>`bundles/GlamourStudio/` | A salon's front desk: appointments, clients, staff and services in a local-first database that syncs between devices |
| <img src="screenshots/DeviceKit.webp" alt="Device Kit" width="200"> | **Device Kit**<br>`bundles/DeviceKit/` | A tour of what a sandboxed app may ask for: fetch a URL, read and make QR codes, take a photo, open a file — each behind the permission that gates it |
| <img src="screenshots/Showcase.webp" alt="Component Showcase" width="200"> | **Component Showcase**<br>`bundles/Showcase/` | Every chart, animation and interactive component the runtime ships, on three pages, in light and dark |
| <img src="screenshots/Notes.webp" alt="Notes" width="200"> | **Notes**<br>`bundles/Notes/` | A shared notes board kept in the app's own storage on this site: add, search and delete, and everyone who opens it here sees the same notes |
| <img src="screenshots/ThreeDemo.webp" alt="3D Scene" width="200"> | **3D Scene**<br>`bundles/ThreeDemo/` | Seven shapes drifting over a floor: drag to look around, click a shape to select it, add more and recolour them |
| <img src="screenshots/GPUDemo.webp" alt="GPU Compute" width="200"> | **GPU Compute**<br>`bundles/GPUDemo/` | Vector maths on your graphics card: two compute shaders run through the runtime's WebGPU bridge, with the numbers shown as they come back |

Three more bundles are built and released but not listed in the directory: **AIDemo** (an exercise of the `softn.ai.*` inference calls), **FoundationFixture** (a fixture proving bundled `.glb` resolution and `Scene3D` clip animation with `@animation` events) and **PhotoStudio** (a layered image editor with PNG, JPEG, GIF, BMP and PSD import and export; see its README).

## Play them

- On [softn.com](https://softn.com): every listed example is in the directory and opens in the web runtime.
- From a release: download the `.softn` file from the latest [release](../../releases) and open it in the SoftN web runtime with its file picker, or serve the file and open the runtime with `?open=<url of the bundle>`.
- From a softn.com checkout: `npm run fetch:demos` there downloads the pinned release into `apps/softn-web/public/demos/`, and `npm run dev:web` serves them at `http://localhost:1420/?open=/demos/<Name>.softn`.

## Build

```sh
npm ci
npm test                       # logic tests, validator regression tests, Promptly's content checks, then every bundle packed and validated
npm run build                  # dist/<Name>.softn for every bundle, plus SHA256SUMS.txt, catalogue.json and RELEASE_NOTES.md
npm run bundle -- Twenty48     # one bundle, into dist/
node scripts/test-bundle.cjs dist/Twenty48.softn --source bundles/Twenty48   # the check the SoftN loaders apply, against the sources
```

Node 20.19 or newer. A build is byte-for-byte reproducible from the sources: entries are stored, not compressed, in a sorted order, so the same tree always packs to the same archive and the same digest.

## Release

1. Bump `version` in `package.json` and commit.
2. Tag and push: `git tag v1.0.1 && git push origin v1.0.1`.

The `Release` workflow runs the tests, refuses a tag that does not match `package.json`, and publishes every archive with `SHA256SUMS.txt` and `catalogue.json` as a GitHub Release. The `Build` workflow does the same checks on every push and keeps the archives as a workflow artifact.

softn.com then pins the new release from its own checkout:

```sh
node scripts/fetch-demos.mjs --pin v1.0.1   # rewrites the sizes, digests and download URLs in public/demos/index.json, then fetches
```

## Layout

| Path | What it is |
| --- | --- |
| `bundles/<Name>/` | One example per directory: `manifest.json`, `permission.json`, `ui/`, `logic/`, `assets/`, and where the app needs them `server/` (routes the SoftN server runs), `xdb/` (database schemas), `assets-src/` (sound recipes) and a README or contract. |
| `catalogue.json` | The directory's entries: id, file, name, description and colour. A bundle not listed here is still built and released, just not shown on softn.com. |
| `scripts/build-bundle.cjs` | The packer: a stored ZIP of the files the manifest names plus everything under `assets/`. |
| `scripts/build-release.cjs` | Packs every bundle into `dist/` and writes the checksums, the catalogue record and the release notes. |
| `scripts/test-bundle.cjs` | The validator: the same structural checks the browser and desktop loaders apply, plus a comparison with the sources. |
| `scripts/test-all-bundles.cjs` | `npm test`'s last step: build everything, validate everything, check the catalogue. |
| `scripts/bundle-source-composer.cjs` | Composes a bundle's UI and logic the way the runtime does, for the validator. |
| `scripts/sfx-lib.cjs` | Writes 16-bit WAVs from a few tone and noise primitives; each game's `assets-src/make-sfx.cjs` describes its own effects with it. |
| `scripts/test-*.cjs` | The Texas Hold'em rule and authority tests, the WarbleWire protocol test, and the validators' own regression tests. |
| `scripts/*.js`, `build-office-bg.cjs`, `generate-*.cjs` | Authoring helpers for TheOffice's map and sprites and the icons. Some need `sharp` (`npm i --no-save sharp`). |
| `screenshots/` | The directory's thumbnails, one per listed example. |

## Adding an example

1. Create `bundles/<Name>/` with a `manifest.json` (name, version, `main`, `icon`, and the `files` it ships) and a `permission.json`.
2. If it should appear on softn.com, add an entry to `catalogue.json` with a unique `id` and `file` of `<Name>.softn`.
3. `npm test` packs and validates it with the rest.
4. Tag a release, then pin it from softn.com and add the entry to `apps/softn-web/public/demos/index.json` there, with a thumbnail under `thumbs/`.

## Licence

Apache License 2.0; see `LICENSE` and `NOTICE.md`.
