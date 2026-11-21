#!/usr/bin/env python3
"""
Deterministic Radiance (.hdr) environment map generator for Potato Peeler:
Warm Soviet commissary tungsten pendant lamp overhead, snowy Moscow window
daylight from upper-left, and warm brass samovar glow from back-right.
"""

import importlib.util
import math
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "PotatoPeeler")
HDR_LIB_PATH = os.path.join(REPO_ROOT, "scripts", "assets", "generate-hdr-assets.py")

spec = importlib.util.spec_from_file_location("generate_hdr_assets", HDR_LIB_PATH)
hdr_lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hdr_lib)


def preset_commissary_lamp(d):
    dx, dy, dz = d
    ceiling = (0.14, 0.13, 0.10)
    wall = (0.16, 0.21, 0.18)
    floor = (0.06, 0.05, 0.04)
    if dy >= 0.0:
        col = hdr_lib.mix3(wall, ceiling, pow(dy, 0.65))
    else:
        col = hdr_lib.mix3(wall, floor, hdr_lib.smoothstep(0.0, -0.55, dy))

    # 1. Warm Soviet enamel pendant tungsten lamp slightly forward-overhead
    lamp_dir = hdr_lib.norm3((0.12, 0.88, 0.46))
    ld = max(0.0, hdr_lib.dot3(d, lamp_dir))
    bulb = hdr_lib.smoothstep(0.955, 0.992, ld) * 16.0 + pow(ld, 9.0) * 1.65

    # 2. Frosted snowy Moscow window light from upper-left
    win_dir = hdr_lib.norm3((-0.82, 0.36, 0.44))
    wd = max(0.0, hdr_lib.dot3(d, win_dir))
    win = hdr_lib.smoothstep(0.86, 0.95, wd) * 4.8 + pow(wd, 7.0) * 0.85

    # 3. Warm crimson/brass stove & samovar rim bounce from back-right
    sam_dir = hdr_lib.norm3((0.68, 0.22, -0.70))
    sd = max(0.0, hdr_lib.dot3(d, sam_dir))
    sam = hdr_lib.smoothstep(0.91, 0.97, sd) * 5.2 + pow(sd, 10.0) * 0.65

    return (
        col[0] + bulb * 1.15 + win * 0.72 + sam * 1.25,
        col[1] + bulb * 0.92 + win * 0.88 + sam * 0.68,
        col[2] + bulb * 0.62 + win * 1.12 + sam * 0.28,
    )


def main():
    hdr_lib.PRESETS["commissary-lamp"] = preset_commissary_lamp
    out_path = os.path.join(BUNDLE_DIR, "assets", "env", "commissary-lamp.hdr")
    hdr_lib.write_hdr(out_path, "commissary-lamp", width=256, height=128)
    hdr_lib.verify_hdr(out_path)
    print(f"OK commissary-lamp.hdr ({os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    main()
