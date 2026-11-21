#!/usr/bin/env python3
"""
Deterministic Radiance (.hdr) environment map generator for Solar Simulator:
Deep interstellar space with an inclined Milky Way galactic dust & starlight band,
subtle Carina/Orion nebula accents, and gentle starlight IBL fill so night hemispheres,
ocean specular highlights, and planetary ring ice crystals read cleanly in 3D.
"""

import importlib.util
import math
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "SolarSimulator")
HDR_LIB_PATH = os.path.join(REPO_ROOT, "scripts", "assets", "generate-hdr-assets.py")

spec = importlib.util.spec_from_file_location("generate_hdr_assets", HDR_LIB_PATH)
hdr_lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hdr_lib)


def preset_deep_space(d):
    dx, dy, dz = d
    # Base cosmic background: subtle cool deep-indigo starlight fill for night-side readability
    base = (0.045, 0.058, 0.095)

    # Milky Way plane inclined ~60.2 deg to the ecliptic!
    gal_norm = hdr_lib.norm3((0.46, 0.50, -0.73))
    gal_lat = abs(hdr_lib.dot3(d, gal_norm))
    band = math.exp(-((gal_lat / 0.22) ** 2))
    core_dir = hdr_lib.norm3((-0.68, 0.24, -0.69))
    core_dot = max(0.0, hdr_lib.dot3(d, core_dir))
    core_glow = pow(core_dot, 5.0) * band

    # Dark rift dust lane modulation along the galactic plane
    dust_wave = 0.5 + 0.5 * math.sin(dx * 11.0 + dz * 9.0 - dy * 7.0)
    rift = 1.0 - 0.52 * math.exp(-((gal_lat / 0.055) ** 2)) * dust_wave

    mw_r = (0.34 * band + 0.85 * core_glow) * rift
    mw_g = (0.38 * band + 0.68 * core_glow) * rift
    mw_b = (0.56 * band + 0.52 * core_glow) * rift

    # Subtle cyan/magenta emission nebula knots
    neb1 = pow(max(0.0, hdr_lib.dot3(d, hdr_lib.norm3((0.72, 0.34, 0.60)))), 14.0) * 0.65
    neb2 = pow(max(0.0, hdr_lib.dot3(d, hdr_lib.norm3((-0.44, -0.58, 0.68)))), 16.0) * 0.55

    # Deterministic bright navigational guide stars (Sirius, Canopus, Vega-like highlights for specular glints)
    s1 = hdr_lib.smoothstep(0.992, 0.9995, max(0.0, hdr_lib.dot3(d, hdr_lib.norm3((0.35, 0.78, 0.52))))) * 4.5
    s2 = hdr_lib.smoothstep(0.992, 0.9995, max(0.0, hdr_lib.dot3(d, hdr_lib.norm3((-0.81, 0.41, 0.42))))) * 3.8
    s3 = hdr_lib.smoothstep(0.992, 0.9995, max(0.0, hdr_lib.dot3(d, hdr_lib.norm3((0.18, -0.84, -0.51))))) * 3.2

    return (
        base[0] + mw_r + neb2 * 0.75 + s1 * 0.85 + s2 * 1.15 + s3 * 0.90,
        base[1] + mw_g + neb1 * 0.55 + neb2 * 0.25 + s1 * 0.92 + s2 * 0.88 + s3 * 0.95,
        base[2] + mw_b + neb1 * 0.85 + neb2 * 0.55 + s1 * 1.25 + s2 * 0.68 + s3 * 1.15,
    )


def main():
    hdr_lib.PRESETS["deep-space"] = preset_deep_space
    out_path = os.path.join(BUNDLE_DIR, "assets", "env", "deep-space.hdr")
    hdr_lib.write_hdr(out_path, "deep-space", width=256, height=128)
    hdr_lib.verify_hdr(out_path)
    print(f"OK deep-space.hdr ({os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    main()
