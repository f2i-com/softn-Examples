# Mine Management

> One human. One mine. Questionable automation.

A comedic 3D mine-site game built with [SoftN](https://www.softn.com/) and hosted on FormLogic. Head
Office has given you one shift to prove the Red Dust mine can reopen. You have a tablet, a ute, two
robot haul trucks, a robot crew with opinions, and an emu called Kevin who has never read a sign.

You run dispatch from the PIT tablet, then do everything the automation can't: drive the trucks and
the excavator, fix faults in person with the field kit, answer Clive's memos from Head Office, and
keep the ore moving until 18:00. Every shift is a chapter; the trucks, crew, upgrades and career
records carry from one to the next.

## Playing

| Key | On foot | In a vehicle |
| --- | --- | --- |
| W A S D | walk | drive and steer (in the excavator: boom and swing) |
| Mouse | look (or drag to look where the host blocks pointer lock, such as FormLogic) | look |
| E | interact, get in, open the field kit | get out |
| Space | jump | brake (in the excavator: dig) |
| L | | load at Bench 1, tip at the crusher, empty the excavator's bucket |
| R | | ask the excavator for a full tray |
| G | | mark the next stop on the haul |
| C | | cab or chase camera |
| P | | park brake |
| H | horn | horn (it moves emus) |
| F | headlamp | headlamp |
| T | open or close the PIT tablet | |
| 1 – 9, 0 | switch PIT tablet workspaces (`01` – `10`) while the tablet is open | |
| 1, 2 | answer a memo from Head Office | |
| Esc | pause and settings | |

On a touch screen, on-screen pads appear at the first touch. The tablet's Field guide workspace is the
in-game induction.

## Bundle layout

```
bundles/games/MineManagement/   the bundle root: everything in here ships in dist/MineManagement.softn
  manifest.json                 name, version, entry page and file lists
  NOTICE.md                     licence and where the parts come from
  logic/                        the game's code, plain JavaScript, joined into one script by SoftN
    main.logic                  the entry point: imports every other file, then boot()
    core/                       state, saving, settings, sound, the frame loop, the screens' view of the game
    world/                      terrain, collisions and everything the 3D scene draws
    mine/                       haul trucks, bays, the crusher, faults, crew, contracts, chapters, telemetry & save export
    player/                     input, walking and driving, the camera, the field kit, navigation, stunts
    fun/                        radio banter, toasts, memos, career records and the end-of-shift awards
  ui/                           the interface, one page per screen
    main.ui                     the root: the game loop, the 3D world and every screen stacked on top
    theme.ui                    colours, type and shared building blocks (styles only)
    screens/                    title, HUD, touch pads, field kit, toasts and memos, pause, report, export & save backup
    tablet/                     the PIT tablet's frame, live telemetry strip and its ten workspaces
  assets/                       models (GLB), sign textures, sounds and the icon
```

## Building & testing

From the `softn-Examples` repository root (Node 20.19+ or 22.12+):

```
npm run build                                                       # pack dist/*.softn including dist/MineManagement.softn
npm run test:minemanagement                                         # static checks, replay determinism, save round-trip & soak tests
node scripts/test/minemanagement/test-minemanagement.cjs --verbose  # verbose shift-by-shift soak output
npm test                                                            # run the full softn-Examples validation suite
```

The test suite verifies that every logic file parses and is imported, every referenced asset (including
sounds played by `sfx()` and `radioCue()`) exists, `VERSION` in `logic/core/state.logic` matches
`manifest.json`, FormLogic's upload limits hold, two separated-clock runs replay identically, and
both random-action monkey shifts and an 8-shift competent playthrough pass every invariant with valid
saves under 30,000 characters.

## Hosting on FormLogic & portable saves

Upload `dist/MineManagement.softn` with **Create app → SoftN app** (or **Apps → Import**). FormLogic
v0.1.15 is the first version that accepts the 3D models; the game is tested on v0.1.30.

Inside FormLogic the app runs in a sandboxed frame that refuses pointer lock, so the game switches to
drag-to-look by itself. The game saves with `localStorage`, which FormLogic keeps in its own app
storage; a save is trimmed to stay under that store's limit of 30,000 characters per value. Players
can also export and restore validated schema-v1 career save JSON across browsers or devices from the
**Save backup / restore** dialog on the title screen, pause menu, shift report or PIT tablet.

## Working on the code

- **The logic is one script.** SoftN inlines the files imported by `logic/main.logic` into a
  single classic script, so every top-level name is a global shared by all files and by the interface.
  Keep names unique, and put start-up work in `boot()` rather than at a file's top level. The header of
  `main.logic` explains the rules.
- **The saved game is `S`.** On load, `validState` in `logic/core/persistence.logic` checks the
  values the game relies on: truck phases, weathers, player modes, the ids of badges, contracts and
  memos, and a few pinned constants. Add a new value or change a constant without updating its check
  and every save that holds it is rejected; a new field loads unchecked until you give it a check.
  Run `npm run test:minemanagement` after changing `S`: it fails any save that wouldn't load again.
- **The screens read prepared values.** `refreshUI()` in `logic/core/ui-state.logic` fills `hud`
  and the row arrays four times a second; the pages show them and call logic functions from their
  buttons. To add a tablet workspace, write `ui/tablet/<name>.ui`, import it in `tablet.ui` and add
  a nav button that calls `openTab('<name>')`.
- **Sounds are played by name.** `sfx('horn')` plays `assets/audio/horn.wav` and
  `radioCue('target')` plays `assets/audio/radio-target.mp3`.
- **Prove a refactor.** Changes should keep `npm run test:minemanagement` (including replay determinism
  and the 8-shift playthrough) green.

## Credits

Made by Lance with SoftN. See `NOTICE.md` for the licence and where the models, sounds and ideas
come from.
