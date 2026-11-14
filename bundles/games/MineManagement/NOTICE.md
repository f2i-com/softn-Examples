# Mine Management: notices

Mine Management is a game by Lance, built with SoftN. Copyright © 2026 Lance. All rights reserved.

## Licence

The manifest says `UNLICENSED`: no public open-source licence has been chosen for this game. You may
play it, inspect it and change it for your own use. Before a public release the owner should pick a
licence and keep the upstream notices below.

## Where the parts come from

- **The PIT tablet.** The fleet tablet's queue model is adapted from the owner's PIT Software
  (v0.11.1): first-in-first-out loading and tipping bays, tonnes counted when they are dumped, and
  route geometry kept separate from the trucks. The `distance3` and `simQueueOrder` helpers are
  retained from its `simulation.logic`. Everything else was written for this game. The tablet makes
  no network requests, and its JSON export is labelled as simulated game data.
- **3D models, signs and the icon.** The low-poly GLB models, the four sign textures and the icon
  were generated procedurally for this game. They are not downloaded or commercial assets. Gary,
  Mel, Oscar, Dot, Bazza, June, Kevin the emu, KILN Industrial Robotics and the Ironback 80 are
  made up, and any resemblance to a real robot is a coincidence the robot would deny.
- **Sound.** The effects and the score were synthesised for this game. The four radio voice cues
  and the site ambience were generated with the owner's ElevenLabs account and remain subject to
  ElevenLabs' terms. The bundle contains no credentials and makes no requests to that service.
- **Inspiration.** The tone, physical comedy and "hold it together with tape" spirit owe a debt to
  co-op road-trip games such as *RV There Yet?*. No code, art, audio or branding from any other
  game is used.

## The runtime

SoftN, its ZIPP engine and Three.js are provided by the host that runs the game (the SoftN runtime
or FormLogic). They are not part of this bundle; their licences ship with the host.
