import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'assets'))

import blender_pbr_lib as lib


def _make_pickup_wreck(out_dir: str):
    lib.reset_scene()

    # Materials cleanly named for reactive appearance tinting (e.g., charring on explosion)
    rust_paint = lib.make_mat('RustTruck', (0.24, 0.29, 0.22), metallic=0.38, roughness=0.64)
    rust_chassis = lib.make_mat('RustChassis', (0.11, 0.105, 0.10), metallic=0.65, roughness=0.78)
    rust_spot = lib.make_mat('RustSpot', (0.34, 0.15, 0.06), metallic=0.30, roughness=0.88)
    interior_dark = lib.make_mat('InteriorDark', (0.08, 0.082, 0.09), metallic=0.10, roughness=0.88)
    chrome_trim = lib.make_mat('ChromeTrim', (0.48, 0.50, 0.53), metallic=0.85, roughness=0.30)
    windshield = lib.make_mat('Windshield', (0.20, 0.32, 0.38), metallic=0.15, roughness=0.12, alpha=0.64)
    shattered_glass = lib.make_mat('ShatteredGlass', (0.62, 0.76, 0.84), metallic=0.25, roughness=0.18, alpha=0.78)
    headlight_glow = lib.make_mat('HeadlightGlow', (0.96, 0.90, 0.72), metallic=0.08, roughness=0.16,
                                  emission=(1.0, 0.90, 0.62), emission_strength=1.8)
    headlight_dead = lib.make_mat('HeadlightDead', (0.06, 0.06, 0.07), metallic=0.45, roughness=0.72)
    hazard_amber = lib.make_mat('HazardAmber', (0.95, 0.55, 0.08), metallic=0.18, roughness=0.22,
                                emission=(1.0, 0.52, 0.06), emission_strength=1.45)
    tail_red = lib.make_mat('TailRed', (0.58, 0.05, 0.05), metallic=0.20, roughness=0.28,
                            emission=(0.75, 0.06, 0.05), emission_strength=0.45)
    rubber = lib.make_mat('Rubber', (0.06, 0.062, 0.066), metallic=0.02, roughness=0.92)
    stripe = lib.make_mat('QuarantineStripe', (0.86, 0.66, 0.10), metallic=0.22, roughness=0.48)
    cargo_crate = lib.make_mat('DarkCargo', (0.18, 0.22, 0.16), metallic=0.15, roughness=0.82)

    # 1. Chassis + pickup bed + cab interior + cargo (bounds kept strictly within X[-1.12,1.12], Y[-2.28,2.20], Z[0,1.88])
    ch = lib.PartBuilder('Chassis')
    # Main ladder frame rails & crossmembers
    ch.box(size=(0.14, 4.10, 0.14), offset=(-0.56, -0.05, 0.36), mat=rust_chassis)
    ch.box(size=(0.14, 4.10, 0.14), offset=(0.56, -0.05, 0.36), mat=rust_chassis)
    for cy in (-1.92, -0.95, 0.05, 0.95, 1.75):
        ch.box(size=(1.18, 0.12, 0.12), offset=(0.0, cy, 0.36), mat=rust_chassis)
    # Front/rear solid axle tubes + differential pumpkins
    ch.cylinder(radius1=0.06, radius2=0.06, depth=1.84, segments=12, offset=(0.0, 1.38, 0.41),
                local_rot=(0.0, math.pi / 2, 0.0), mat=rust_chassis)
    ch.cylinder(radius1=0.06, radius2=0.06, depth=1.84, segments=12, offset=(0.0, -1.36, 0.41),
                local_rot=(0.0, math.pi / 2, 0.0), mat=rust_chassis)
    ch.sphere(radius=(0.13, 0.15, 0.13), offset=(0.0, 1.38, 0.41), mat=rust_chassis)
    ch.sphere(radius=(0.14, 0.16, 0.14), offset=(0.0, -1.36, 0.41), mat=rust_chassis)
    # Rear step bumper + hitch + dual exhaust pipe
    ch.box(size=(1.98, 0.16, 0.18), offset=(0.0, -2.20, 0.46), mat=rust_chassis, bevel=0.025)
    ch.box(size=(0.18, 0.14, 0.12), offset=(0.0, -2.22, 0.38), mat=chrome_trim)
    ch.cylinder(radius1=0.045, radius2=0.045, depth=0.65, segments=10, offset=(-0.64, -1.94, 0.31),
                local_rot=(math.pi / 2, 0.0, 0.0), mat=chrome_trim)
    # Lower rocker panels + front fenders flanking hood
    ch.box(size=(1.94, 1.10, 0.18), offset=(0.0, 0.34, 0.50), mat=rust_chassis, bevel=0.02)
    ch.box(size=(0.24, 1.24, 0.54), offset=(-0.86, 1.50, 0.78), mat=rust_paint, bevel=0.03)
    ch.box(size=(0.24, 1.24, 0.54), offset=(0.86, 1.50, 0.78), mat=rust_paint, bevel=0.03)
    # Rust spots on front fenders
    ch.box(size=(0.25, 0.36, 0.16), offset=(-0.865, 1.65, 0.88), mat=rust_spot)
    ch.box(size=(0.25, 0.32, 0.14), offset=(0.865, 1.32, 0.74), mat=rust_spot)
    # Pickup cargo bed floor + side walls + wheel tubs
    ch.box(size=(1.86, 2.12, 0.12), offset=(0.0, -1.14, 0.54), mat=rust_chassis)
    ch.box(size=(0.16, 2.12, 0.58), offset=(-0.90, -1.14, 0.84), mat=rust_paint, bevel=0.025)
    ch.box(size=(0.16, 2.12, 0.58), offset=(0.90, -1.14, 0.84), mat=rust_paint, bevel=0.025)
    ch.box(size=(1.84, 0.12, 0.58), offset=(0.0, -0.14, 0.84), mat=rust_paint, bevel=0.02)
    ch.box(size=(0.30, 0.76, 0.28), offset=(-0.72, -1.36, 0.70), mat=rust_chassis, bevel=0.03)
    ch.box(size=(0.30, 0.76, 0.28), offset=(0.72, -1.36, 0.70), mat=rust_chassis, bevel=0.03)
    # Quarantine stripes on bed sides
    ch.box(size=(1.97, 1.75, 0.08), offset=(0.0, -1.14, 0.86), mat=stripe)
    # Brake tail lights at rear corners
    ch.box(size=(0.14, 0.06, 0.24), offset=(-0.90, -2.18, 0.86), mat=tail_red, bevel=0.01)
    ch.box(size=(0.14, 0.06, 0.24), offset=(0.90, -2.18, 0.86), mat=tail_red, bevel=0.01)
    # Cargo bed gear (supply crate + rusted reserve drum + spare jerrycan)
    ch.box(size=(0.72, 0.56, 0.42), offset=(-0.36, -0.82, 0.81), local_rot=(0.0, 0.0, 0.14), mat=cargo_crate, bevel=0.02)
    ch.box(size=(0.48, 0.62, 0.32), offset=(0.42, -1.52, 0.76), local_rot=(0.0, 0.0, -0.22), mat=rust_spot, bevel=0.02)
    # Cab interior visible through shattered windshield / ajar doors
    ch.box(size=(1.66, 0.82, 0.10), offset=(0.0, 0.36, 0.58), mat=interior_dark)
    ch.box(size=(0.56, 0.44, 0.16), offset=(-0.44, 0.24, 0.68), mat=interior_dark, bevel=0.03)
    ch.box(size=(0.56, 0.44, 0.16), offset=(0.44, 0.24, 0.68), mat=interior_dark, bevel=0.03)
    ch.box(size=(0.54, 0.14, 0.54), offset=(-0.44, 0.06, 0.98), local_rot=(-0.18, 0.0, 0.0), mat=interior_dark, bevel=0.03)
    ch.box(size=(0.54, 0.14, 0.54), offset=(0.44, 0.06, 0.98), local_rot=(-0.18, 0.0, 0.0), mat=interior_dark, bevel=0.03)
    ch.box(size=(1.66, 0.28, 0.28), offset=(0.0, 0.74, 0.92), mat=interior_dark, bevel=0.02)
    ch.cylinder(radius1=0.035, radius2=0.035, depth=0.38, segments=10, offset=(-0.44, 0.62, 0.98),
                local_rot=(1.05, 0.0, 0.0), mat=chrome_trim)
    ch.torus(major_radius=0.17, minor_radius=0.022, major_seg=18, minor_seg=8, offset=(-0.44, 0.48, 1.07),
             local_rot=(1.05, 0.0, 0.0), mat=interior_dark)
    ch.build()

    # 2. Cabin roof + A/B/C pillars
    cab = lib.PartBuilder('Cabin')
    cab.box(size=(1.86, 0.16, 0.56), offset=(0.0, -0.02, 1.38), mat=rust_paint, bevel=0.02)
    # Rear cab window frame recess
    cab.box(size=(1.28, 0.18, 0.34), offset=(0.0, -0.02, 1.38), mat=windshield)
    # B-pillars & angled A-pillars
    cab.box(size=(0.11, 0.14, 0.68), offset=(-0.88, 0.02, 1.38), mat=rust_paint, bevel=0.015)
    cab.box(size=(0.11, 0.14, 0.68), offset=(0.88, 0.02, 1.38), mat=rust_paint, bevel=0.015)
    cab.box(size=(0.10, 0.12, 0.76), offset=(-0.86, 0.70, 1.38), local_rot=(0.42, 0.0, 0.0), mat=rust_paint, bevel=0.015)
    cab.box(size=(0.10, 0.12, 0.76), offset=(0.86, 0.70, 1.38), local_rot=(0.42, 0.0, 0.0), mat=rust_paint, bevel=0.015)
    # Roof shell + rust cap + side roof rails
    cab.box(size=(1.76, 0.92, 0.10), offset=(0.0, 0.34, 1.72), mat=rust_paint, bevel=0.03)
    cab.box(size=(1.10, 0.62, 0.04), offset=(0.12, 0.28, 1.76), mat=rust_spot)
    cab.box(size=(0.07, 0.80, 0.06), offset=(-0.74, 0.34, 1.79), mat=rust_chassis)
    cab.box(size=(0.07, 0.80, 0.06), offset=(0.74, 0.34, 1.79), mat=rust_chassis)
    cab.build()

    # 3. Exposed engine block beneath hood (visible once hood pops open)
    eng = lib.PartBuilder('EngineBlock', location=(0.0, 1.48, 0.72))
    eng.box(size=(0.56, 0.68, 0.42), offset=(0.0, 0.0, 0.0), mat=rust_chassis, bevel=0.03)
    eng.box(size=(0.16, 0.60, 0.12), offset=(-0.22, 0.0, 0.24), mat=chrome_trim, bevel=0.02)
    eng.box(size=(0.16, 0.60, 0.12), offset=(0.22, 0.0, 0.24), mat=chrome_trim, bevel=0.02)
    eng.cylinder(radius1=0.22, radius2=0.20, depth=0.12, segments=16, offset=(0.0, 0.02, 0.28), mat=rust_spot)
    eng.box(size=(0.86, 0.10, 0.44), offset=(0.0, 0.48, 0.02), mat=rust_chassis)
    eng.build()

    # 4. Hood (hinge pivot at firewall y=0.88, z=1.04)
    hood = lib.PartBuilder('Hood', location=(0.0, 0.88, 1.04))
    hood.box(size=(1.50, 1.24, 0.10), offset=(0.0, 0.62, 0.02), local_rot=(-0.05, 0.0, 0.0), mat=rust_paint, bevel=0.03)
    hood.box(size=(0.68, 0.96, 0.06), offset=(0.0, 0.54, 0.07), local_rot=(-0.05, 0.0, 0.0), mat=rust_paint, bevel=0.02)
    hood.box(size=(0.52, 0.42, 0.03), offset=(-0.28, 0.88, 0.04), local_rot=(-0.05, 0.0, 0.0), mat=rust_spot)
    hood.build()

    # 5. Grille + BullBar
    grille = lib.PartBuilder('Grille', location=(0.0, 2.12, 0.80))
    grille.box(size=(1.32, 0.10, 0.42), offset=(0.0, 0.0, 0.0), mat=rust_chassis, bevel=0.02)
    for gz in (-0.12, 0.0, 0.12):
        grille.box(size=(1.18, 0.12, 0.04), offset=(0.0, 0.01, gz), mat=chrome_trim)
    grille.box(size=(1.88, 0.08, 0.08), offset=(0.0, 0.02, -0.22), mat=stripe)
    grille.build()

    bull = lib.PartBuilder('BullBar', location=(0.0, 2.15, 0.56))
    bull.box(size=(1.94, 0.12, 0.18), offset=(0.0, 0.0, -0.06), mat=rust_chassis, bevel=0.025)
    bull.cylinder(radius1=0.04, radius2=0.04, depth=1.32, segments=12, offset=(0.0, 0.03, 0.24),
                  local_rot=(0.0, math.pi / 2, 0.0), mat=chrome_trim)
    bull.cylinder(radius1=0.04, radius2=0.04, depth=1.18, segments=12, offset=(0.0, 0.03, 0.08),
                  local_rot=(0.0, math.pi / 2, 0.0), mat=chrome_trim)
    bull.box(size=(0.08, 0.10, 0.40), offset=(-0.46, 0.01, 0.08), mat=rust_chassis, bevel=0.01)
    bull.box(size=(0.08, 0.10, 0.40), offset=(0.46, 0.01, 0.08), mat=rust_chassis, bevel=0.01)
    bull.build()

    # 6. Doors (hinge pivot at front A-pillar so rotation.y swings them ajar in glTF)
    for side_name, sx in (('Door_L', -1.0), ('Door_R', 1.0)):
        door = lib.PartBuilder(side_name, location=(sx * 0.94, 0.80, 0.80))
        door.box(size=(0.12, 0.86, 0.52), offset=(0.0, -0.43, 0.0), mat=rust_paint, bevel=0.02)
        door.box(size=(0.13, 0.82, 0.08), offset=(0.0, -0.43, 0.06), mat=stripe)
        door.box(size=(0.08, 0.14, 0.05), offset=(sx * 0.05, -0.74, 0.14), mat=chrome_trim)
        # Side mirror stalk & mirror head
        door.box(size=(0.16, 0.05, 0.04), offset=(sx * 0.10, -0.10, 0.30), mat=rust_chassis)
        door.box(size=(0.08, 0.10, 0.18), offset=(sx * 0.17, -0.10, 0.36), mat=rust_chassis, bevel=0.015)
        door.build()

    # 7. Tailgate (hinged at bottom bed edge)
    tg = lib.PartBuilder('Tailgate', location=(0.0, -2.14, 0.56))
    tg.box(size=(1.74, 0.10, 0.54), offset=(0.0, 0.0, 0.27), mat=rust_paint, bevel=0.02)
    tg.box(size=(1.50, 0.12, 0.10), offset=(0.0, -0.01, 0.30), mat=stripe)
    tg.box(size=(0.24, 0.13, 0.08), offset=(0.0, -0.01, 0.45), mat=chrome_trim)
    tg.build()

    # 8. Windshield Intact & Shattered (Shattered sits strictly inside Intact bounding volume!)
    ws = lib.PartBuilder('Windshield_Intact', location=(0.0, 0.70, 1.38))
    ws.box(size=(1.60, 0.06, 0.68), offset=(0.0, 0.0, 0.0), local_rot=(0.42, 0.0, 0.0), mat=windshield)
    ws.build()

    wss = lib.PartBuilder('Windshield_Shattered', location=(0.0, 0.70, 1.38))
    wss.box(size=(0.44, 0.05, 0.24), offset=(-0.56, -0.08, 0.18), local_rot=(0.42, 0.18, 0.0), mat=shattered_glass)
    wss.box(size=(0.48, 0.05, 0.22), offset=(0.54, 0.09, -0.19), local_rot=(0.42, -0.22, 0.0), mat=shattered_glass)
    wss.box(size=(0.36, 0.05, 0.18), offset=(0.58, -0.07, 0.20), local_rot=(0.42, 0.14, 0.0), mat=shattered_glass)
    wss.box(size=(0.50, 0.05, 0.18), offset=(-0.48, 0.08, -0.20), local_rot=(0.42, -0.16, 0.0), mat=shattered_glass)
    wss.build()

    # 9. Headlights & recessed dead housings
    for label, hx in (('L', -0.74), ('R', 0.74)):
        hl = lib.PartBuilder(f'Headlight_{label}', location=(hx, 2.13, 0.84))
        hl.box(size=(0.24, 0.07, 0.16), offset=(0.0, 0.02, 0.0), mat=headlight_glow, bevel=0.015)
        hl.build()

        hld = lib.PartBuilder(f'HeadlightDead_{label}', location=(hx, 2.10, 0.84))
        hld.box(size=(0.24, 0.08, 0.16), offset=(0.0, 0.0, 0.0), mat=headlight_dead, bevel=0.015)
        hld.build()

    # 10. Roof strobe Lightbar (stays under z=1.88)
    lb = lib.PartBuilder('Lightbar', location=(0.0, 0.45, 1.81))
    lb.box(size=(0.86, 0.22, 0.10), offset=(0.0, 0.0, 0.0), mat=rust_chassis, bevel=0.02)
    lb.box(size=(0.28, 0.24, 0.12), offset=(-0.26, 0.0, 0.01), mat=hazard_amber, bevel=0.02)
    lb.box(size=(0.28, 0.24, 0.12), offset=(0.26, 0.0, 0.01), mat=hazard_amber, bevel=0.02)
    lb.box(size=(0.20, 0.22, 0.11), offset=(0.0, 0.0, 0.01), mat=tail_red, bevel=0.015)
    lb.build()

    # 11. Wheels with off-road tires + steel 5-lug rims
    wheel_coords = [
        ('Wheel_FL', -0.98, 1.38, 0.41),
        ('Wheel_FR', 0.98, 1.38, 0.41),
        ('Wheel_RL', -0.98, -1.36, 0.41),
        ('Wheel_RR', 0.98, -1.36, 0.41),
    ]
    for wname, wx, wy, wz in wheel_coords:
        wh = lib.PartBuilder(wname, location=(wx, wy, wz))
        wh.cylinder(radius1=0.41, radius2=0.41, depth=0.26, segments=22, offset=(0.0, 0.0, 0.0),
                    local_rot=(0.0, math.pi / 2, 0.0), mat=rubber, bevel=0.04)
        wh.cylinder(radius1=0.24, radius2=0.24, depth=0.28, segments=16, offset=(0.0, 0.0, 0.0),
                    local_rot=(0.0, math.pi / 2, 0.0), mat=chrome_trim, bevel=0.02)
        wh.cylinder(radius1=0.10, radius2=0.10, depth=0.30, segments=12, offset=(0.0, 0.0, 0.0),
                    local_rot=(0.0, math.pi / 2, 0.0), mat=rust_chassis)
        wh.build()

    return lib.export_glb(os.path.join(out_dir, 'pickup-wreck.glb'))


def _make_hazard_barrel(out_dir: str):
    lib.reset_scene()
    red = lib.make_mat('HazardRed', (0.76, 0.14, 0.08), metallic=0.46, roughness=0.52)
    yellow = lib.make_mat('HazardYellow', (0.94, 0.72, 0.10), metallic=0.22, roughness=0.42)
    dark = lib.make_mat('DarkMetal', (0.14, 0.14, 0.15), metallic=0.72, roughness=0.58)
    brass = lib.make_mat('BrassBung', (0.68, 0.54, 0.24), metallic=0.82, roughness=0.35)

    drum = lib.PartBuilder('Drum')
    drum.cylinder(radius1=0.41, radius2=0.41, depth=1.14, segments=22, offset=(0.0, 0.0, 0.58), mat=red)
    # Rolled steel ribs & top/bottom chimes
    for rz in (0.04, 0.37, 0.79, 1.12):
        drum.torus(major_radius=0.412, minor_radius=0.032, major_seg=24, minor_seg=10, offset=(0.0, 0.0, rz), mat=dark)
    # Recessed top lip & weld seam
    drum.cylinder(radius1=0.37, radius2=0.37, depth=0.04, segments=20, offset=(0.0, 0.0, 1.13), mat=dark)
    drum.box(size=(0.03, 0.03, 1.04), offset=(0.40, 0.0, 0.58), mat=dark)
    drum.build()

    band = lib.PartBuilder('WarningBand')
    band.cylinder(radius1=0.422, radius2=0.422, depth=0.22, segments=22, offset=(0.0, 0.0, 0.58), mat=yellow)
    band.box(size=(0.14, 0.87, 0.14), offset=(0.0, 0.0, 0.58), local_rot=(0.0, math.pi / 4, 0.0), mat=dark)
    band.build()

    cap = lib.PartBuilder('BungCap', location=(0.18, 0.10, 1.145))
    cap.cylinder(radius1=0.055, radius2=0.055, depth=0.04, segments=12, offset=(0.0, 0.0, 0.0), mat=brass)
    cap.cylinder(radius1=0.032, radius2=0.032, depth=0.04, segments=10, offset=(-0.30, -0.14, 0.0), mat=dark)
    cap.build()

    return lib.export_glb(os.path.join(out_dir, 'hazard-barrel.glb'))


def _make_streetlamp(out_dir: str):
    lib.reset_scene()
    iron = lib.make_mat('CastIron', (0.12, 0.13, 0.15), metallic=0.80, roughness=0.46)
    lamp_glow = lib.make_mat('GasLamp', (1.0, 0.82, 0.44), metallic=0.10, roughness=0.18,
                             emission=(1.0, 0.78, 0.36), emission_strength=2.2)
    dead_glass = lib.make_mat('DeadGlass', (0.14, 0.16, 0.18), metallic=0.30, roughness=0.45)

    post = lib.PartBuilder('Post')
    # Ornate pedestal base + fluted shaft + decorative collars
    post.cylinder(radius1=0.24, radius2=0.20, depth=0.26, segments=8, offset=(0.0, 0.0, 0.13), mat=iron, bevel=0.02)
    post.cylinder(radius1=0.17, radius2=0.12, depth=0.72, segments=8, offset=(0.0, 0.0, 0.60), mat=iron)
    post.torus(major_radius=0.13, minor_radius=0.03, major_seg=16, minor_seg=8, offset=(0.0, 0.0, 0.96), mat=iron)
    post.cylinder(radius1=0.09, radius2=0.065, depth=2.92, segments=12, offset=(0.0, 0.0, 2.42), mat=iron)
    post.torus(major_radius=0.10, minor_radius=0.025, major_seg=16, minor_seg=8, offset=(0.0, 0.0, 3.86), mat=iron)
    # 4 gothic scroll brackets supporting lantern sill
    for ang in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2):
        cx = math.cos(ang) * 0.14
        cy = math.sin(ang) * 0.14
        post.box(size=(0.18, 0.04, 0.06), offset=(cx, cy, 4.02), local_rot=(0.0, -0.55, ang), mat=iron)
    post.cylinder(radius1=0.21, radius2=0.18, depth=0.08, segments=6, offset=(0.0, 0.0, 4.10), mat=iron)
    # Lantern cage ribs & peaked cap + spire
    for i in range(6):
        ang = i * math.pi / 3
        post.cylinder(radius1=0.018, radius2=0.015, depth=0.44, segments=6,
                      offset=(math.cos(ang) * 0.185, math.sin(ang) * 0.185, 4.33), mat=iron)
    post.cylinder(radius1=0.24, radius2=0.06, depth=0.24, segments=6, offset=(0.0, 0.0, 4.64), mat=iron)
    post.cylinder(radius1=0.03, radius2=0.005, depth=0.14, segments=8, offset=(0.0, 0.0, 4.76), mat=iron)
    post.build()

    bulb = lib.PartBuilder('Bulb', location=(0.0, 0.0, 4.33))
    bulb.cylinder(radius1=0.125, radius2=0.155, depth=0.38, segments=6, offset=(0.0, 0.0, 0.0), mat=lamp_glow)
    bulb.build()

    broken = lib.PartBuilder('BulbBroken', location=(0.0, 0.0, 4.20))
    broken.box(size=(0.06, 0.05, 0.14), offset=(-0.03, 0.02, 0.02), local_rot=(0.2, -0.3, 0.4), mat=dead_glass)
    broken.box(size=(0.05, 0.06, 0.12), offset=(0.04, -0.02, 0.01), local_rot=(-0.3, 0.2, -0.5), mat=dead_glass)
    broken.build()

    return lib.export_glb(os.path.join(out_dir, 'streetlamp.glb'))


def _make_watchtower(out_dir: str):
    lib.reset_scene()
    timber = lib.make_mat('Timber', (0.28, 0.19, 0.12), metallic=0.05, roughness=0.88)
    sandbag = lib.make_mat('Sandbag', (0.46, 0.40, 0.29), metallic=0.0, roughness=0.95)
    steel = lib.make_mat('TowerSteel', (0.20, 0.22, 0.24), metallic=0.68, roughness=0.58)
    beacon = lib.make_mat('BeaconRed', (0.95, 0.12, 0.08), metallic=0.1, roughness=0.2,
                          emission=(1.0, 0.12, 0.08), emission_strength=2.2)
    flood = lib.make_mat('FloodGlow', (0.92, 0.94, 0.80), metallic=0.1, roughness=0.2,
                         emission=(0.95, 0.96, 0.82), emission_strength=1.4)

    tw = lib.PartBuilder('Watchtower')
    # 4 corner concrete footings + splayed timber uprights
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            tw.box(size=(0.34, 0.34, 0.26), offset=(sx * 1.28, sy * 1.28, 0.13), mat=steel, bevel=0.02)
            tw.box(size=(0.18, 0.18, 4.30), offset=(sx * 1.24, sy * 1.24, 2.24),
                   local_rot=(sy * 0.03, -sx * 0.03, 0.0), mat=timber, bevel=0.015)
    # Two horizontal girder rings + X diagonal bracing
    for hz in (1.55, 2.95):
        for sy in (-1.0, 1.0):
            tw.box(size=(2.56, 0.12, 0.14), offset=(0.0, sy * 1.22, hz), mat=timber)
        for sx in (-1.0, 1.0):
            tw.box(size=(0.12, 2.56, 0.14), offset=(sx * 1.22, 0.0, hz), mat=timber)
    for bmin, bmax in ((0.28, 1.55), (1.55, 2.95), (2.95, 4.22)):
        zc = (bmin + bmax) * 0.5
        for sy in (-1.0, 1.0):
            tw.box(size=(2.68, 0.07, 0.09), offset=(0.0, sy * 1.22, zc), local_rot=(0.0, 0.46, 0.0), mat=timber)
            tw.box(size=(2.68, 0.07, 0.09), offset=(0.0, sy * 1.22, zc), local_rot=(0.0, -0.46, 0.0), mat=timber)
    # Ladder on front/side edge
    tw.box(size=(0.06, 0.06, 4.28), offset=(-0.28, -1.28, 2.14), mat=steel)
    tw.box(size=(0.06, 0.06, 4.28), offset=(0.28, -1.28, 2.14), mat=steel)
    for r in range(11):
        tw.cylinder(radius1=0.024, radius2=0.024, depth=0.56, segments=8,
                    offset=(0.0, -1.28, 0.35 + r * 0.36), local_rot=(0.0, math.pi / 2, 0.0), mat=steel)
    # Observation deck + corrugated steel skirt + sandbag parapet
    tw.box(size=(2.94, 2.94, 0.16), offset=(0.0, 0.0, 4.28), mat=timber, bevel=0.03)
    for sy in (-1.0, 1.0):
        tw.box(size=(2.92, 0.10, 0.88), offset=(0.0, sy * 1.42, 4.78), mat=steel)
        for sb in range(-3, 4):
            tw.icosphere(radius=(0.24, 0.16, 0.13), subdivisions=2, offset=(sb * 0.40, sy * 1.38, 5.26), mat=sandbag)
    for sx in (-1.0, 1.0):
        tw.box(size=(0.10, 2.92, 0.88), offset=(sx * 1.42, 0.0, 4.78), mat=steel)
        for sb in range(-2, 3):
            tw.icosphere(radius=(0.16, 0.24, 0.13), subdivisions=2, offset=(sx * 1.38, sb * 0.44, 5.26), mat=sandbag)
    # Canopy posts + sloped corrugated tin roof + searchlights + beacon (top <= 7.00)
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            tw.box(size=(0.14, 0.14, 2.18), offset=(sx * 1.30, sy * 1.30, 5.42), mat=timber)
    tw.box(size=(3.00, 3.00, 0.10), offset=(0.0, 0.0, 6.56), local_rot=(0.08, 0.0, 0.0), mat=steel, bevel=0.02)
    # Twin courtyard floodlights under canopy eave
    for fx in (-0.85, 0.85):
        tw.box(size=(0.26, 0.22, 0.18), offset=(fx, 1.36, 6.26), local_rot=(-0.45, 0.0, 0.0), mat=steel)
        tw.box(size=(0.20, 0.06, 0.14), offset=(fx, 1.44, 6.21), local_rot=(-0.45, 0.0, 0.0), mat=flood)
    tw.cylinder(radius1=0.08, radius2=0.06, depth=0.26, segments=10, offset=(0.0, 0.0, 6.72), mat=steel)
    tw.sphere(radius=(0.11, 0.11, 0.13), offset=(0.0, 0.0, 6.87), mat=beacon)
    tw.build()
    return lib.export_glb(os.path.join(out_dir, 'watchtower.glb'))


def _make_supply_bench(out_dir: str):
    lib.reset_scene()
    wood = lib.make_mat('WoodTop', (0.34, 0.22, 0.13), metallic=0.04, roughness=0.82)
    steel = lib.make_mat('BenchSteel', (0.20, 0.22, 0.25), metallic=0.72, roughness=0.48)
    ammo_green = lib.make_mat('AmmoCan', (0.20, 0.28, 0.16), metallic=0.35, roughness=0.65)
    med_white = lib.make_mat('MedBox', (0.86, 0.88, 0.90), metallic=0.10, roughness=0.45)
    med_red = lib.make_mat('MedCross', (0.86, 0.12, 0.10), metallic=0.05, roughness=0.42)
    lantern = lib.make_mat('ArmoryLantern', (1.0, 0.78, 0.34), metallic=0.1, roughness=0.2,
                           emission=(1.0, 0.75, 0.28), emission_strength=2.4)
    brass = lib.make_mat('BrassShell', (0.82, 0.66, 0.24), metallic=0.85, roughness=0.30)

    sb = lib.PartBuilder('SupplyBench')
    # Steel legs + lower shelf + cross stretcher
    for lx in (-1.08, 1.08):
        for ly in (-0.36, 0.36):
            sb.box(size=(0.09, 0.09, 0.82), offset=(lx, ly, 0.41), mat=steel, bevel=0.01)
    sb.box(size=(2.18, 0.72, 0.05), offset=(0.0, 0.0, 0.24), mat=steel)
    # 5 hardwood planks across tabletop
    for i, py in enumerate((-0.34, -0.17, 0.0, 0.17, 0.34)):
        sb.box(size=(2.38, 0.15, 0.08), offset=(0.0, py, 0.84), mat=wood, bevel=0.015)
    # Ammo crate & brass shell rows
    sb.box(size=(0.56, 0.34, 0.26), offset=(-0.58, -0.06, 1.01), local_rot=(0.0, 0.0, 0.12), mat=ammo_green, bevel=0.02)
    for bi in range(4):
        sb.cylinder(radius1=0.024, radius2=0.020, depth=0.11, segments=8,
                    offset=(-0.22 + bi * 0.065, 0.16, 0.935), mat=brass)
    # Medical kit + crisp raised cross
    sb.box(size=(0.44, 0.30, 0.16), offset=(0.18, 0.04, 0.96), mat=med_white, bevel=0.02)
    sb.box(size=(0.18, 0.05, 0.03), offset=(0.18, 0.04, 1.05), mat=med_red)
    sb.box(size=(0.05, 0.18, 0.03), offset=(0.18, 0.04, 1.05), mat=med_red)
    # Corner steel vise
    sb.box(size=(0.18, 0.24, 0.14), offset=(0.98, 0.28, 0.95), mat=steel, bevel=0.015)
    # Hurricane oil lantern
    sb.cylinder(radius1=0.13, radius2=0.11, depth=0.10, segments=14, offset=(0.80, -0.12, 0.93), mat=steel)
    sb.cylinder(radius1=0.09, radius2=0.10, depth=0.22, segments=12, offset=(0.80, -0.12, 1.09), mat=lantern)
    sb.cylinder(radius1=0.12, radius2=0.05, depth=0.09, segments=12, offset=(0.80, -0.12, 1.22), mat=steel)
    sb.build()
    return lib.export_glb(os.path.join(out_dir, 'supply-bench.glb'))


def _add_branch(builder, p0, p1, r1, r2, segments, mat):
    from mathutils import Vector
    a = Vector(p0)
    b = Vector(p1)
    v = b - a
    length = v.length
    if length < 0.01:
        return
    mid = (a + b) * 0.5
    rot = Vector((0.0, 0.0, 1.0)).rotation_difference(v.normalized()).to_euler()
    builder.cylinder(
        radius1=r1,
        radius2=r2,
        depth=length + r1 * 0.45,
        segments=segments,
        offset=(mid.x, mid.y, mid.z),
        local_rot=(rot.x, rot.y, rot.z),
        mat=mat
    )


def _make_dead_tree(out_dir: str):
    lib.reset_scene()
    bark = lib.make_mat('DeadBark', (0.14, 0.115, 0.105), metallic=0.04, roughness=0.94)
    moss = lib.make_mat('BarkMoss', (0.12, 0.17, 0.11), metallic=0.02, roughness=0.95)

    tr = lib.PartBuilder('DeadTree')
    # Continuous flared gnarled roots meeting lower trunk base cleanly
    for r in range(5):
        ang = r * (2 * math.pi / 5) + 0.2
        rx = math.cos(ang)
        ry = math.sin(ang)
        _add_branch(tr, (rx * 0.22, ry * 0.22, 0.42), (rx * 0.92, ry * 0.92, -0.06), 0.19, 0.05, 8, moss if r % 2 == 0 else bark)

    # Continuous twisting segmented trunk
    p0 = (0.0, 0.0, 0.0)
    p1 = (0.08, -0.05, 1.45)
    p2 = (-0.08, 0.08, 2.75)
    p3 = (0.04, 0.02, 3.85)
    p4 = (-0.05, -0.10, 4.95)
    _add_branch(tr, p0, p1, 0.40, 0.30, 10, bark)
    _add_branch(tr, p1, p2, 0.30, 0.21, 10, bark)
    _add_branch(tr, p2, p3, 0.21, 0.13, 8, bark)
    _add_branch(tr, p3, p4, 0.13, 0.05, 8, bark)

    # Connected primary & secondary crooked limbs sprouting directly from trunk joints
    limbs = [
        (p2, (0.88, 0.42, 3.70), 0.14, 0.075),
        ((0.88, 0.42, 3.70), (1.42, 0.74, 4.65), 0.075, 0.022),
        ((0.88, 0.42, 3.70), (1.18, -0.18, 4.35), 0.06, 0.018),
        (p2, (-0.92, -0.36, 3.85), 0.135, 0.07),
        ((-0.92, -0.36, 3.85), (-1.48, -0.78, 4.78), 0.07, 0.02),
        ((-0.92, -0.36, 3.85), (-1.15, 0.25, 4.55), 0.055, 0.016),
        (p3, (0.36, -0.86, 4.75), 0.10, 0.05),
        ((0.36, -0.86, 4.75), (0.68, -1.35, 5.45), 0.05, 0.015),
        (p3, (-0.42, 0.84, 4.88), 0.095, 0.045),
        ((-0.42, 0.84, 4.88), (-0.82, 1.32, 5.55), 0.045, 0.015),
        (p4, (0.42, 0.38, 5.65), 0.05, 0.014),
        (p4, (-0.46, -0.28, 5.68), 0.045, 0.014),
    ]
    for j0, j1, r_a, r_b in limbs:
        _add_branch(tr, j0, j1, r_a, r_b, 7, bark)

    tr.build()
    return lib.export_glb(os.path.join(out_dir, 'dead-tree.glb'))


def make_enhanced_props(out_dir: str):
    res = {}
    res['pickup-wreck.glb'] = _make_pickup_wreck(out_dir)
    res['hazard-barrel.glb'] = _make_hazard_barrel(out_dir)
    res['streetlamp.glb'] = _make_streetlamp(out_dir)
    res['watchtower.glb'] = _make_watchtower(out_dir)
    res['supply-bench.glb'] = _make_supply_bench(out_dir)
    res['dead-tree.glb'] = _make_dead_tree(out_dir)
    return res


if __name__ == '__main__':
    out = os.path.join(REPO_ROOT, 'bundles', 'DeadHours', 'assets', 'models')
    summary = make_enhanced_props(out)
    for k, v in sorted(summary.items()):
        print(f"Enhanced {k}: {v['bytes']} bytes, nodes={v['nodes']}")
