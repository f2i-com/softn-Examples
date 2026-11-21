#!/usr/bin/env python3
"""
Deterministic Radiance (.hdr) environment map generator for Voice Simulator:
Warm broadcast vocal studio key softbox from upper-front-left, cool cyan acoustic
rim light from upper-right, and warm walnut booth bounce below.
"""

import importlib.util
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "VoiceSimulator")
HDR_LIB_PATH = os.path.join(REPO_ROOT, "scripts", "assets", "generate-hdr-assets.py")

spec = importlib.util.spec_from_file_location("generate_hdr_assets", HDR_LIB_PATH)
hdr_lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hdr_lib)


def preset_vocal_studio(d):
    dx, dy, dz = d
    ceiling = (0.10, 0.13, 0.19)
    wall = (0.12, 0.14, 0.20)
    floor = (0.06, 0.05, 0.05)
    if dy >= 0.0:
        col = hdr_lib.mix3(wall, ceiling, pow(dy, 0.65))
    else:
        col = hdr_lib.mix3(wall, floor, hdr_lib.smoothstep(0.0, -0.55, dy))

    # 1. Warm portrait key softbox from upper-front-left (+Z is camera side in glTF)
    key_dir = hdr_lib.norm3((-0.42, 0.56, 0.71))
    kd = max(0.0, hdr_lib.dot3(d, key_dir))
    key = hdr_lib.smoothstep(0.88, 0.97, kd) * 11.5 + pow(kd, 6.5) * 1.65

    # 2. Cool cyan studio fill & hair rim from upper-right
    fill_dir = hdr_lib.norm3((0.72, 0.44, 0.53))
    fd = max(0.0, hdr_lib.dot3(d, fill_dir))
    fill = hdr_lib.smoothstep(0.86, 0.96, fd) * 6.2 + pow(fd, 7.5) * 0.95

    # 3. Warm amber On-Air & walnut booth backlight
    rim_dir = hdr_lib.norm3((0.25, 0.34, -0.91))
    rd = max(0.0, hdr_lib.dot3(d, rim_dir))
    rim = hdr_lib.smoothstep(0.90, 0.98, rd) * 5.8 + pow(rd, 9.0) * 0.70

    return (
        col[0] + key * 1.12 + fill * 0.52 + rim * 1.18,
        col[1] + key * 0.98 + fill * 0.86 + rim * 0.68,
        col[2] + key * 0.84 + fill * 1.18 + rim * 0.42,
    )


def main():
    hdr_lib.PRESETS["vocal-studio"] = preset_vocal_studio
    out_path = os.path.join(BUNDLE_DIR, "assets", "env", "vocal-studio.hdr")
    hdr_lib.write_hdr(out_path, "vocal-studio", width=256, height=128)
    hdr_lib.verify_hdr(out_path)
    print(f"OK vocal-studio.hdr ({os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    main()
