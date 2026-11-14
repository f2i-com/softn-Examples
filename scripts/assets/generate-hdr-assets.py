#!/usr/bin/env python3
"""
Deterministic Radiance (.hdr) equirectangular environment generator for SoftN v0.0.40 bundles.

Strict conformance with @softn/components panorama-headers.ts:
- Header uses LF newlines: "#?RADIANCE\\nFORMAT=32-bit_rle_rgbe\\n\\n-Y <H> +X <W>\\n"
- Flat 4-byte RGBE pixels (4 * W * H bytes), avoiding (2, 2, <128) in pixel (0, 0)
  so hdrPixels() cleanly parses as uncompressed flat RGBE.
"""

import math
import os
import struct
import sys


def float_to_rgbe(r: float, g: float, b: float) -> tuple[int, int, int, int]:
    v = max(r, g, b)
    if v < 1e-32:
        return (0, 0, 0, 0)
    m, e = math.frexp(v)
    scale = (m * 256.0) / v
    rb = max(0, min(255, int(r * scale)))
    gb = max(0, min(255, int(g * scale)))
    bb = max(0, min(255, int(b * scale)))
    eb = max(0, min(255, e + 128))
    return (rb, gb, bb, eb)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def mix3(a, b, t: float):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def dot3(a, b) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm3(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if l < 1e-12:
        return (0.0, 1.0, 0.0)
    return (v[0] / l, v[1] / l, v[2] / l)


def dir_from_uv(u: float, v: float):
    # Equirectangular projection: u in [0,1] -> phi in [0, 2pi], v in [0,1] -> theta in [0, pi] (top to bottom)
    theta = v * math.pi
    phi = (u - 0.5) * 2.0 * math.pi
    st = math.sin(theta)
    return (st * math.cos(phi), math.cos(theta), st * math.sin(phi))


def preset_night_moon(d):
    dx, dy, dz = d
    zenith = (0.014, 0.025, 0.068)
    horizon = (0.048, 0.072, 0.115)
    ground = (0.012, 0.014, 0.020)
    if dy >= 0.0:
        col = mix3(horizon, zenith, pow(dy, 0.52))
    else:
        col = mix3(horizon, ground, smoothstep(0.0, -0.45, dy))

    # Faint billowing night cloud wisps
    wisp = 0.5 + 0.5 * math.sin(dx * 5.3 + dz * 3.7) * math.cos(dy * 9.0 + dx * 2.4)
    if dy > 0.02:
        cloud_t = smoothstep(0.55, 0.92, wisp) * smoothstep(0.02, 0.3, dy) * (1.0 - smoothstep(0.65, 0.95, dy))
        col = mix3(col, (0.07, 0.10, 0.16), cloud_t * 0.45)

    # Full moon HDR disc + silvery corona
    moon_dir = norm3((0.45, 0.62, -0.64))
    md = max(0.0, dot3(d, moon_dir))
    corona = pow(md, 14.0) * 0.45 + pow(md, 96.0) * 1.4
    disc = smoothstep(0.9965, 0.9988, md) * 16.0
    col = (
        col[0] + corona * 0.62 + disc * 0.85,
        col[1] + corona * 0.78 + disc * 0.94,
        col[2] + corona * 1.05 + disc * 1.10,
    )

    # Subtle distant warm horizon glow (quarantine barricade fires in the distance)
    ember_dir = norm3((-0.78, 0.03, 0.62))
    ed = max(0.0, dot3(d, ember_dir))
    ember = pow(ed, 18.0) * 0.35 * smoothstep(-0.15, 0.12, dy) * (1.0 - smoothstep(0.12, 0.45, dy))
    col = (col[0] + ember * 1.2, col[1] + ember * 0.42, col[2] + ember * 0.12)
    return col


def preset_cavern_torch(d):
    dx, dy, dz = d
    zenith = (0.018, 0.020, 0.036)
    horizon = (0.045, 0.035, 0.030)
    ground = (0.014, 0.011, 0.010)
    if dy >= 0.0:
        col = mix3(horizon, zenith, pow(dy, 0.6))
    else:
        col = mix3(horizon, ground, smoothstep(0.0, -0.5, dy))

    # Two warm torchlight reflections + cool arcane rim for metallic rune crystals
    t1 = max(0.0, dot3(d, norm3((0.7, 0.25, 0.65))))
    t2 = max(0.0, dot3(d, norm3((-0.75, 0.22, -0.58))))
    arcane = max(0.0, dot3(d, norm3((0.0, 0.88, -0.45))))
    col = (
        col[0] + pow(t1, 10.0) * 2.8 + pow(t2, 12.0) * 2.2 + pow(arcane, 16.0) * 0.4,
        col[1] + pow(t1, 10.0) * 1.35 + pow(t2, 12.0) * 1.05 + pow(arcane, 16.0) * 1.1,
        col[2] + pow(t1, 10.0) * 0.35 + pow(t2, 12.0) * 0.28 + pow(arcane, 16.0) * 2.4,
    )
    return col


def preset_sunny_meadow(d):
    dx, dy, dz = d
    zenith = (0.16, 0.42, 0.92)
    horizon = (0.72, 0.84, 0.95)
    ground = (0.14, 0.18, 0.11)
    if dy >= 0.0:
        col = mix3(horizon, zenith, pow(dy, 0.48))
    else:
        col = mix3((0.36, 0.38, 0.30), ground, smoothstep(0.0, -0.35, dy))

    # Soft cumulus bands
    if dy > 0.05:
        cloud = 0.5 + 0.5 * math.sin(dx * 4.2 + 0.8) * math.cos(dz * 4.7 - 0.5)
        ct = smoothstep(0.58, 0.92, cloud) * smoothstep(0.05, 0.28, dy) * (1.0 - smoothstep(0.55, 0.9, dy))
        col = mix3(col, (1.15, 1.16, 1.18), ct * 0.55)

    # Golden afternoon sun HDR source
    sun_dir = norm3((0.52, 0.64, 0.56))
    sd = max(0.0, dot3(d, sun_dir))
    halo = pow(sd, 12.0) * 0.9 + pow(sd, 96.0) * 3.5
    disc = smoothstep(0.994, 0.9985, sd) * 22.0
    col = (
        col[0] + halo * 1.10 + disc * 1.12,
        col[1] + halo * 0.95 + disc * 1.02,
        col[2] + halo * 0.72 + disc * 0.84,
    )
    return col


def preset_studio_dusk(d):
    dx, dy, dz = d
    top = (0.06, 0.08, 0.13)
    mid = (0.12, 0.14, 0.19)
    bottom = (0.03, 0.035, 0.045)
    if dy >= 0.0:
        col = mix3(mid, top, pow(dy, 0.6))
    else:
        col = mix3(mid, bottom, smoothstep(0.0, -0.5, dy))

    # Softbox key (upper front-right), cool cyan strip left, warm amber rim back
    k1 = max(0.0, dot3(d, norm3((0.55, 0.65, 0.52))))
    k2 = max(0.0, dot3(d, norm3((-0.82, 0.25, 0.50))))
    k3 = max(0.0, dot3(d, norm3((0.15, 0.30, -0.94))))
    s1 = smoothstep(0.92, 0.98, k1) * 14.0 + pow(k1, 10.0) * 1.1
    s2 = smoothstep(0.90, 0.96, k2) * 5.2 + pow(k2, 8.0) * 0.7
    s3 = smoothstep(0.93, 0.98, k3) * 6.5 + pow(k3, 12.0) * 0.7
    col = (
        col[0] + s1 * 1.02 + s2 * 0.35 + s3 * 1.15,
        col[1] + s1 * 0.98 + s2 * 0.85 + s3 * 0.68,
        col[2] + s1 * 0.92 + s2 * 1.15 + s3 * 0.32,
    )
    return col


def preset_deep_hull(d):
    dx, dy, dz = d
    top = (0.015, 0.024, 0.034)
    mid = (0.028, 0.040, 0.048)
    bottom = (0.010, 0.014, 0.018)
    if dy >= 0.0:
        col = mix3(mid, top, pow(dy, 0.55))
    else:
        col = mix3(mid, bottom, smoothstep(0.0, -0.5, dy))

    # Wet bulkhead specular glint strips (subtle amber instrument glow + cold abyssal cyan overhead)
    cold = max(0.0, dot3(d, norm3((0.2, 0.85, 0.45))))
    warm = max(0.0, dot3(d, norm3((-0.75, 0.15, -0.64))))
    col = (
        col[0] + pow(cold, 12.0) * 0.35 + smoothstep(0.95, 0.99, warm) * 3.8 + pow(warm, 14.0) * 0.45,
        col[1] + pow(cold, 12.0) * 0.85 + smoothstep(0.95, 0.99, warm) * 1.85 + pow(warm, 14.0) * 0.25,
        col[2] + pow(cold, 12.0) * 1.10 + smoothstep(0.95, 0.99, warm) * 0.65 + pow(warm, 14.0) * 0.10,
    )
    return col


PRESETS = {
    "night-moon": preset_night_moon,
    "cavern-torch": preset_cavern_torch,
    "sunny-meadow": preset_sunny_meadow,
    "studio-dusk": preset_studio_dusk,
    "deep-hull": preset_deep_hull,
}


def write_hdr(out_path: str, preset_name: str, width: int = 256, height: int = 128):
    if preset_name not in PRESETS:
        raise ValueError(f"Unknown preset {preset_name!r}; valid: {sorted(PRESETS)}")
    fn = PRESETS[preset_name]
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    header = f"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {height} +X {width}\n".encode("ascii")
    buf = bytearray(width * height * 4)
    idx = 0
    for y in range(height):
        v = (y + 0.5) / height
        for x in range(width):
            u = (x + 0.5) / width
            r, g, b = fn(dir_from_uv(u, v))
            rb, gb, bb, eb = float_to_rgbe(r, g, b)
            if idx == 0 and rb == 2 and gb == 2 and bb < 128:
                rb = 3  # Guard against false RLE scanline detection in Three/hdrPixels
            buf[idx] = rb
            buf[idx + 1] = gb
            buf[idx + 2] = bb
            buf[idx + 3] = eb
            idx += 4

    with open(out_path, "wb") as f:
        f.write(header)
        f.write(buf)


def verify_hdr(path: str):
    with open(path, "rb") as f:
        data = f.read()
    assert data.startswith(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n"), f"{path}: bad magic/format"
    nl_count = 0
    pos = 0
    while nl_count < 4 and pos < min(len(data), 1024):
        if data[pos] == 10:
            nl_count += 1
        pos += 1
    assert nl_count == 4, f"{path}: malformed header"
    pix = data[pos:]
    assert not (pix[0] == 2 and pix[1] == 2 and pix[2] < 128), f"{path}: accidental RLE marker"
    assert len(pix) == 256 * 128 * 4, f"{path}: unexpected pixel count {len(pix)}"


if __name__ == "__main__":
    # Optional CLI: generate-hdr-assets.py <preset> <out_path>
    if len(sys.argv) == 3:
        write_hdr(sys.argv[2], sys.argv[1])
        verify_hdr(sys.argv[2])
        print(f"Wrote {sys.argv[2]} ({os.path.getsize(sys.argv[2])} bytes)")
    else:
        print("Presets:", ", ".join(sorted(PRESETS)))
