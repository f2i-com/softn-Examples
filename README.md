# SoftN Examples

The example applications for [SoftN](https://softn.com): every demo the softn.com directory lists, as source, with the scripts that pack, test and release them. Each one is a worked example of some part of the runtime, from WebGPU compute shaders to a voiced first-person story, survival and strategy games, a Game Boy, a 386 PC and a language model that never leaves the browser.

The packed `.softn` archives are not committed. The `Release` workflow compiles and validates them, attaches them to a [GitHub Release](../../releases), and outputs `dist/` as a workflow artifact, and softn.com fetches that release rather than keeping copies of its own, so each example exists in exactly one place: its source directory here.

## The examples

### Games

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/PromptlyUnemployed.webp" alt="Promptly Unemployed" width="200"> | **Promptly Unemployed**<br>`bundles/games/PromptlyUnemployed/` | First-person 3D narrative tragicomedy, part one: laid off by an avatar, home by dinner, a business by midnight. Fully voiced, and one file. |
| <img src="screenshots/Blockscape.webp" alt="Blockscape" width="200"> | **Blockscape**<br>`bundles/games/Blockscape/` | A first-person voxel sandbox: an island of blocks to mine, build on and save, with gravity, swimming, flight and a day-night cycle |
| <img src="screenshots/DeadHours.webp" alt="Dead Hours" width="200"> | **Dead Hours**<br>`bundles/games/DeadHours/` | A first-person zombie shooter: hold a fenced yard at night against waves of the dead, destructible props and explosive barrels with a pistol, shotgun and SMG |
| <img src="screenshots/MazeEscape3D.webp" alt="Maze Escape 3D" width="200"> | **Maze Escape 3D**<br>`bundles/games/MazeEscape3D/` | A first-person maze carved fresh every game: find the golden ring, with a minimap that fills in as you explore and a best time that sticks |
| <img src="screenshots/TexasHoldem.webp" alt="Texas Hold'em" width="200"> | **Texas Hold'em**<br>`bundles/games/TexasHoldem/` | Texas Hold'em Poker for friends who trust each other: every player's client holds the whole table, hole cards included, over peer-to-peer sync |
| <img src="screenshots/TheOffice.webp" alt="TheOffice" width="200"> | **TheOffice**<br>`bundles/games/TheOffice/` | Local AI sim game where 6 Office-inspired characters chat autonomously using Qwen3-0.6B, run in the browser by SoftN |
| <img src="screenshots/SimLives.webp" alt="Sim Lives" width="200"> | **Sim Lives**<br>`bundles/games/SimLives/` | Build a house, design avatars and move a household in: steer them to eat, sleep, wash, play and chat, or switch on free will and watch their day |
| <img src="screenshots/Outermate.webp" alt="Outermate" width="200"> | **Outermate**<br>`bundles/games/Outermate/` | First Count: a living prison-escape strategy game on Hollow-7. Learn routines, trade favours, prepare a route and get beyond Greywall. |
| <img src="screenshots/Outerstead.webp" alt="Outerstead" width="200"> | **Outerstead**<br>`bundles/games/Outerstead/` | First Light: a people-first frontier colony survival game on Hollow-7. Four survivors, a growing settlement, and an older world that still listens. |
| <img src="screenshots/MineManagement.webp" alt="Mine Management" width="200"> | **Mine Management**<br>`bundles/games/MineManagement/` | One human, one mine, questionable automation: run the robot haul fleet from your PIT tablet, drive trucks and the excavator, fix faults in person, and keep Kevin the emu off the haul road |
| <img src="screenshots/Pocket.webp" alt="Pocket" width="200"> | **Pocket**<br>`bundles/games/Pocket/` | An 8-bit handheld emulator — CPU, PPU, APU and mappers in `.logic`, with a built-in Brick-Breaker cartridge, DMG palettes, PixelCanvas and AudioStream |
| <img src="screenshots/SoftDOS.webp" alt="SoftDOS" width="200"> | **SoftDOS**<br>`bundles/games/SoftDOS/` | An x86 PC emulator written in .logic with bundled one-click FastDOOM + Freedoom Phase 1, accelerated host bridge, VGA mode 13h and 80x25 text, Sound Blaster + AdLib, mouse, and mobile touch controls. |
| <img src="screenshots/LastSound3D.webp" alt="LastSound3D" width="200"> | **LastSound3D**<br>`bundles/games/LastSound3D/` | LAST SOUND: Below the Call — a fully voiced first-person survey of a blood ocean from inside a sealed pressure hull across three compartments and six photographs |
| <img src="screenshots/TheNightWindow.webp" alt="The Night Window" width="200"> | **The Night Window**<br>`bundles/games/TheNightWindow/` | Seven graveyard shifts at Meridian-17: inspect documents, question returning residents, and preserve a truth the terminal can rewrite across six endings |
| <img src="screenshots/Scorchline.webp" alt="Scorchline" width="200"> | **Scorchline**<br>`bundles/games/Scorchline/` | An original top-down resource-warfare RTS with two factions, three maps and offline AI skirmishes |
| <img src="screenshots/Urbanward.webp" alt="Urbanward" width="200"> | **Urbanward**<br>`bundles/games/Urbanward/` | A modular city-building game: build connected neighbourhoods, balance the books and watch a city find its identity |
| <img src="screenshots/ConvenienceStoreAtTheEndOfTheUniverse.webp" alt="Convenience Store at the End of the Universe" width="200"> | **Convenience Store at the End of the Universe**<br>`bundles/games/ConvenienceStoreAtTheEndOfTheUniverse/` | Last Light: seven nights, six usuals, one little shop at the end of everything |
| <img src="screenshots/PleaseDoNotFeedTheMoon.webp" alt="Please Do Not Feed the Moon" width="200"> | **Please Do Not Feed the Moon**<br>`bundles/games/PleaseDoNotFeedTheMoon/` | A dreamy late-night convenience store: twenty-four bad ideas, nine hidden combinations and seven endings |
| <img src="screenshots/DoNotPressTheDuck.webp" alt="Do Not Press the Duck" width="200"> | **Do Not Press the Duck**<br>`bundles/games/DoNotPressTheDuck/` | One button, a roomful of consequences, and a completely unreasonable amount of duck |
| <img src="screenshots/VeryNormalPostOffice.webp" alt="Very Normal Post Office" width="200"> | **Very Normal Post Office**<br>`bundles/games/VeryNormalPostOffice/` | Work Window 04: eight shifts of tactile postal inspection, questionable regulations and very hungry mail |
| <img src="screenshots/PigeonMunicipalEmployee.webp" alt="Pigeon: Municipal Employee" width="200"> | **Pigeon: Municipal Employee**<br>`bundles/games/PigeonMunicipalEmployee/` | Explore Littleborough, fly, perch, collect evidence and physically process excessively official paperwork |
| <img src="screenshots/FrogEmployeeOfTheMonth.webp" alt="Frog Employee of the Month" width="200"> | **Frog Employee of the Month**<br>`bundles/games/FrogEmployeeOfTheMonth/` | Corporate Ascent: eight frog-scale office assignments, physical tongue traversal and a very unreasonable printer |
| <img src="screenshots/ExpressDeliverySnail.webp" alt="Express Delivery Snail" width="200"> | **Express Delivery Snail**<br>`bundles/games/ExpressDeliverySnail/` | Special Delivery — seven tiny routes, seven very particular parcels and one impossibly determined snail |

### Simulations

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/TrainYard.webp" alt="Model Train Yard" width="200"> | **Model Train Yard**<br>`bundles/simulations/TrainYard/` | An animated HO-scale model train yard diorama on a wooden table with running trains, turntable, busy harbor, town, day-night cycle, and tactile physical controls |
| <img src="screenshots/PredatorPrey.webp" alt="Predator-Prey Simulator" width="200"> | **Predator-Prey Simulator**<br>`bundles/simulations/PredatorPrey/` | An interactive 3D ecosystem diorama: watch foxes hunt rabbits, rabbits graze on grass, and population dynamics balance in real time |
| <img src="screenshots/FirstDrive.webp" alt="First drive" width="200"> | **First drive**<br>`bundles/simulations/FirstDrive/` | A one-minute real-time 3D film of a lunar rover leaving its lander on the Moon in eight Blender-animated shots with sunlight, bounce light, shadows and depth of field |
| <img src="screenshots/RaceLab.webp" alt="RaceLab" width="200"> | **RaceLab**<br>`bundles/simulations/RaceLab/` | Experimental Melbourne Cup simulator with multi-trial Monte Carlo probability analysis, interactive 3D replay and reproducible results |

### Tools, AI and creative

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/WarbleWire.webp" alt="WarbleWire" width="200"> | **WarbleWire**<br>`bundles/tools/WarbleWire/` | Send a message as synthetic birdsong and decode it back — the QXW acoustic transport |
| <img src="screenshots/AIChat.webp" alt="AI Chat" width="200"> | **AI Chat**<br>`bundles/tools/AIChat/` | A chat with a small language model that downloads once and runs entirely in your browser; nothing you type leaves the machine |
| <img src="screenshots/HouseBuilder.webp" alt="House Builder" width="200"> | **House Builder**<br>`bundles/tools/HouseBuilder/` | Draw a house from above and see it in 3D: walls, doors, windows, room floors, a roof, furniture and garden, then walk through it in first person |
| <img src="screenshots/PhotoStudio.webp" alt="Photo Studio" width="200"> | **Photo Studio**<br>`bundles/tools/PhotoStudio/` | A layered image editor written in `.logic` with PNG, JPEG, GIF, BMP and PSD import/export, 16 blend modes, brushes, selections, masks, adjustments, bitmap type and undo history |

### Runtime samples

| | Example | What it shows |
|---|---|---|
| <img src="screenshots/GlamourStudio.webp" alt="Glamour Studio" width="200"> | **Glamour Studio**<br>`bundles/samples/GlamourStudio/` | A salon's front desk and interactive Beauty & Lighting studio: appointments, clients, staff, services and lookbook snapshots in a local-first database that syncs between devices |
| <img src="screenshots/DeviceKit.webp" alt="Device Kit" width="200"> | **Device Kit**<br>`bundles/samples/DeviceKit/` | A tour of what a sandboxed app may ask for: fetch a URL, inspect live system capabilities, read and make QR codes, capture or calibrate camera frames, and inspect files |
| <img src="screenshots/Showcase.webp" alt="Component Showcase" width="200"> | **Component Showcase**<br>`bundles/samples/Showcase/` | UI controls, charts, spring animations, interactive widgets and an articulated PBR 3D studio scene across five pages, in light and dark |
| <img src="screenshots/Notes.webp" alt="Notes" width="200"> | **Notes**<br>`bundles/samples/Notes/` | A persistent Markdown notes board across site XDB storage, a local server backend, or browser storage with live preview, tags, pinning and undo delete |
| <img src="screenshots/ThreeDemo.webp" alt="3D Scene" width="200"> | **3D Scene**<br>`bundles/samples/ThreeDemo/` | Articulated Chrono-Orrery and Crystal Relic GLBs plus sculpted PBR shapes over a grid stage: orbit, camera presets, click-to-inspect, spawn and recolour |
| <img src="screenshots/GPUDemo.webp" alt="GPU Compute" width="200"> | **GPU Compute**<br>`bundles/samples/GPUDemo/` | Six WGSL/CPU vector compute kernels across 8..4096 floats with spectrum analytics, live WGSL preview, dispatch timing and an interactive Compute Field simulation |

## Play them

- On [softn.com](https://softn.com): every listed example is in the directory and opens in the web runtime.
- From a release: download the `.softn` file from the latest [release](../../releases) and open it in the SoftN web runtime with its file picker, or serve the file and open the runtime with `?open=<url of the bundle>`.
- From a softn.com checkout: `npm run fetch:demos` there downloads the pinned release into `apps/softn-web/public/demos/`, and `npm run dev:web` serves them at `http://localhost:1420/?open=/demos/<Name>.softn`.

## Build

```sh
npm ci
npm test                                                                                    # logic tests, validator tests, Promptly checks, then every bundle packed and validated
npm run build                                                                               # dist/<Name>.softn for every bundle, plus SHA256SUMS.txt, catalogue.json and RELEASE_NOTES.md
npm run bundle -- Outermate                                                                  # one bundle by name, into dist/
node scripts/test/test-bundle.cjs dist/Outermate.softn --source bundles/games/Outermate        # the check the SoftN loaders apply, against the sources
```

Node 20.19 or newer. A build is deterministic from the sources: files are enumerated in sorted order and compressed deterministically, so the same source tree always packs to the same archive and digest.

## Release

1. Bump `version` in `package.json` and commit.
2. Either tag and push (`git tag v1.0.4 && git push origin v1.0.4`), publish a GitHub Release for that tag in the GitHub UI, or run the `Release` workflow manually (`workflow_dispatch`).

The `Release` workflow runs `npm test`, runs `node scripts/build/build-release.cjs --expect-tag vX.Y.Z` to compile all `.softn` archives into `dist/`, uploads `dist/` as a workflow run artifact, and attaches every compiled `dist/*.softn` file along with `dist/SHA256SUMS.txt` and `dist/catalogue.json` directly to the GitHub Release.

A published release is immutable: softn.com pins one by URL and digest, and a platform build from any later date has to be able to fetch exactly the bytes it verified. A re-run of the workflow on an existing tag confirms the digests it already carries, fills any missing release assets, and refuses to replace different bytes. New bytes are a new version.

softn.com then pins the new release from its own checkout:

```sh
node scripts/fetch-demos.mjs --pin v1.0.4   # rewrites the sizes, digests and download URLs in public/demos/index.json, then fetches
```

## Layout

| Path | What it is |
| --- | --- |
| `bundles/games/<Name>/` | Game bundles: `manifest.json`, `permission.json`, `ui/`, `logic/`, `assets/`, plus optional `server/`, `xdb/`, `assets-src/` and docs. |
| `bundles/simulations/<Name>/` | Interactive ecosystem and diorama simulations. |
| `bundles/tools/<Name>/` | Creative, acoustic transport and local-AI tools. |
| `bundles/samples/<Name>/` | Focused runtime capability samples. |
| `catalogue.json` | The directory's entries: id, file, name, description and primary colour. A bundle not listed here is still built and released, just not shown on softn.com. |
| `scripts/build/build-bundle.cjs` | Packs one or all discovered bundles into `dist/<Name>.softn`. |
| `scripts/build/build-release.cjs` | Packs every bundle into `dist/` and writes `SHA256SUMS.txt`, `catalogue.json` and `RELEASE_NOTES.md`. |
| `scripts/build/bundle-source-composer.cjs` | Composes a bundle's UI and `.logic` imports the way the runtime does, for validation. |
| `scripts/test/test-bundle.cjs` | Structural, composition and source-parity validator for built `.softn` bundles. |
| `scripts/test/test-all-bundles.cjs` | `npm test`'s final gate: builds and validates every bundle against its source directory and `catalogue.json`. |
| `scripts/test/texasholdem/` | Texas Hold'em gameplay, server authority, client sync and HTTP authority tests. |
| `scripts/test/promptly/` | Promptly Unemployed geometry, spawn clearance and voiced-audio completeness checks. |
| `scripts/test/test-*.cjs` | WarbleWire protocol tests and validator regression tests. |
| `scripts/assets/` | Shared Blender 3D PBR library, HDR environment generator and WAV SFX synthesizer. |
| `screenshots/` | Thumbnails (`<Name>.webp`), one per catalogued example. |

## Adding an example

1. Create `bundles/<category>/<Name>/` (under `games`, `simulations`, `tools` or `samples`) with `manifest.json`, `permission.json`, `ui/`, `logic/`, and `assets/`.
2. If it should appear on softn.com, add an entry to `catalogue.json` with a unique `id` and `file` of `<Name>.softn`, plus a screenshot at `screenshots/<Name>.webp`.
3. `npm test` packs and validates it with the rest.
4. Bump `package.json`, push, and create/tag the release — the `Release` workflow compiles and attaches every `.softn` bundle automatically.

## Licence

Apache License 2.0; see `LICENSE` and `NOTICE.md`.
