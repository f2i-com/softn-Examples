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
| 1, 2 | answer a memo from Head Office | |
| Esc | pause and settings | |

On a touch screen, on-screen pads appear at the first touch. The tablet's Field guide workspace is the
in-game induction.

## The repository

```
app/                 the bundle root: everything in here ships in app.softn
  manifest.json      name, version, entry page and file lists (the build keeps the lists current)
  NOTICE.md          licence and where the parts come from
  logic/             the game's code, plain JavaScript, joined into one script by SoftN
    main.logic       the entry point: imports every other file, then boot()
    core/            state, saving, settings, sound, the frame loop, the screens' view of the game
    world/           terrain, collisions and everything the 3D scene draws
    mine/            haul trucks, bays, the crusher, faults, crew, contracts, chapters
    player/          input, walking and driving, the camera, the field kit, navigation, stunts
    fun/             radio banter, toasts, memos, career records and the end-of-shift awards
  ui/                the interface, one page per screen
    main.ui          the root: the game loop, the 3D world and every screen stacked on top
    theme.ui         colours, type and shared building blocks (styles only)
    screens/         title, HUD, touch pads, field kit, toasts and memos, pause, report, export
    tablet/          the PIT tablet's frame and its ten workspaces
  assets/            models (GLB), sign textures, sounds and the icon
dev/debug.logic      test hooks for development builds only
scripts/             build, checks and the headless soak test
app.softn            the built bundle, ready to upload
```

## Building

Needs Node 22 or later.

```
npm install          # prettier, for formatting
npm run build        # check everything and write app.softn
npm run check        # fail if app.softn or the manifest is out of date (writes nothing)
npm run build:dev    # add dev/debug.logic and write dist/mine-management-dev.softn
npm run format       # format the logic and scripts with prettier
```

The build fails if any logic file doesn't parse or isn't imported, if an asset the code names is
missing (including every sound `sfx()` or `radioCue()` can play), if `VERSION` in
`app/logic/core/state.logic` doesn't match the manifest, or if FormLogic would refuse the bundle. The
bundle is a deterministic zip: the same files always give the same bytes.

## Testing

```
npm run soak         # three shifts of random actions, headless; fails on any error or broken rule
npm run soak:play    # eight shifts played by a competent bot; checks the shifts are winnable
npm run replay       # the same site plays the same way whatever the clock says
```

The soak test runs the logic exactly as SoftN joins it, with the host's APIs stubbed, and checks the
game's invariants and that every save passes validation and fits FormLogic's storage limit. It also
reports how often the fleet watchdog had to untangle a jam, which should be never. The replay check
keeps the simulation reproducible: jokes and cosmetics use their own random numbers (`flavour()`),
and anything that changes what happens uses `rand()`, which is seeded from the site and saved.

For the real thing, open `dist/mine-management-dev.softn` in the SoftN runtime. A development build
reads one command at a time from `window.__mmCmd` (for example `tab:fleet`, `incident:hydraulic_leak`,
`ute`, `report` or `eval:<expression>`) and writes the result to `window.__mmOut`; the full list is at
the top of `dev/debug.logic`.

## Hosting on FormLogic

Upload `app.softn` with **Create app → SoftN app** (or **Apps → Import**). FormLogic v0.1.15 is the
first version that accepts the 3D models; the game is tested on v0.1.30.

Inside FormLogic the app runs in a sandboxed frame that refuses pointer lock, so the game switches to
drag-to-look by itself. The game saves with `localStorage`, which FormLogic keeps in its own app
storage; a save is trimmed to stay under that store's limit of 30,000 characters per value.

## Working on the code

- **The logic is one script.** SoftN inlines the files imported by `app/logic/main.logic` into a
  single classic script, so every top-level name is a global shared by all files and by the interface.
  Keep names unique, and put start-up work in `boot()` rather than at a file's top level. The header of
  `main.logic` explains the rules.
- **The saved game is `S`.** On load, `validState` in `app/logic/core/persistence.logic` checks the
  values the game relies on: truck phases, weathers, player modes, the ids of badges, contracts and
  memos, and a few pinned constants. Add a new value or change a constant without updating its check
  and every save that holds it is rejected; a new field loads unchecked until you give it a check.
  Run `npm run soak` after changing `S`: it fails any save that wouldn't load again.
- **The screens read prepared values.** `refreshUI()` in `app/logic/core/ui-state.logic` fills `hud`
  and the row arrays four times a second; the pages show them and call logic functions from their
  buttons. To add a tablet workspace, write `app/ui/tablet/<name>.ui`, import it in `tablet.ui` and add
  a nav button that calls `openTab('<name>')`.
- **Sounds are played by name.** `sfx('horn')` plays `app/assets/audio/horn.wav` and
  `radioCue('target')` plays `radio-target.mp3`. The comedy effects come from
  `scripts/make-sounds.py`, which reproduces them byte for byte.
- **Prove a refactor.** A pure formatting or commenting change should leave every file's syntax tree
  as it was; anything else should leave the soak tests and two shifts of play unchanged.

## Credits

Made by Lance with SoftN. See `app/NOTICE.md` for the licence and where the models, sounds and ideas
come from.
