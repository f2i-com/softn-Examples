"""
Generate all PBR .glb 3D assets for DeadHours (Ravenshollow Quarantine Courtyard)
using Blender 5.2 and scripts/assets/blender_pbr_lib.py.

Run via:
  blender --background --factory-startup --python bundles/games/DeadHours/assets-src/make-models.py
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.abspath(os.path.join(HERE, '..'))
SCRIPTS = os.path.abspath(os.path.join(BUNDLE, '..', '..', '..', 'scripts', 'assets'))
OUT_DIR = os.path.join(BUNDLE, 'assets', 'models')
sys.path.insert(0, SCRIPTS)

import blender_pbr_lib as lib
Part = lib.PartBuilder


def make_zombie(filename: str, spec: dict):
    """
    Build an articulated zombie archetype facing Blender -Y (glTF +Z)
    with feet at Z=0.0 and named joint nodes:
    Torso (root) -> Head (-> Jaw), Arm_L, Arm_R, Leg_L, Leg_R
    """
    lib.reset_scene()
    scale = spec.get('scale', 1.0)
    skin = lib.make_mat('Skin', spec['skin'], roughness=0.72)
    coat = lib.make_mat('Coat', spec['coat'], roughness=0.86)
    pants = lib.make_mat('Pants', spec['pants'], roughness=0.88)
    boot = lib.make_mat('Boot', (0.09, 0.08, 0.07), roughness=0.65)
    eye = lib.make_mat('EyeGlow', spec['eye'], emission=spec['eye'], emission_strength=spec.get('eye_glow', 4.5), roughness=0.2)
    blood = lib.make_mat('Gore', (0.34, 0.03, 0.03), roughness=0.35)
    armor = lib.make_mat('Armor', spec.get('armor', (0.18, 0.20, 0.23)), metallic=0.75, roughness=0.42)
    sacs = lib.make_mat('Sac', spec.get('sac', (0.15, 0.85, 0.22)), emission=spec.get('sac', (0.15, 0.85, 0.22)), emission_strength=3.2, roughness=0.3)

    bulky = spec.get('bulky', 1.0)
    arm_len = 0.62 * scale
    leg_len = 0.78 * scale
    hip_z = 0.82 * scale

    torso = Part('Torso', location=(0.0, 0.0, hip_z))
    torso.box((0.40 * bulky * scale, 0.24 * bulky * scale, 0.56 * scale), offset=(0.0, 0.0, 0.28 * scale), mat=coat, bevel=0.025 * scale, taper_top=(1.18, 1.05))
    torso.box((0.28 * bulky * scale, 0.22 * bulky * scale, 0.14 * scale), offset=(0.0, 0.0, 0.02 * scale), mat=pants, bevel=0.015 * scale)
    # Torn chest wound / glowing brute core
    if spec.get('core'):
        torso.sphere((0.10 * scale, 0.07 * scale, 0.10 * scale), offset=(0.06 * scale, -0.11 * scale, 0.34 * scale), mat=sacs)
        torso.box((0.22 * scale, 0.28 * scale, 0.22 * scale), offset=(-0.22 * scale, 0.0, 0.52 * scale), mat=armor, bevel=0.02 * scale)
        torso.box((0.22 * scale, 0.28 * scale, 0.22 * scale), offset=(0.22 * scale, 0.0, 0.52 * scale), mat=armor, bevel=0.02 * scale)
    elif spec.get('sacs'):
        torso.sphere((0.12 * scale, 0.10 * scale, 0.13 * scale), offset=(0.08 * scale, 0.12 * scale, 0.40 * scale), mat=sacs)
        torso.sphere((0.09 * scale, 0.08 * scale, 0.10 * scale), offset=(-0.10 * scale, 0.11 * scale, 0.25 * scale), mat=sacs)
    else:
        torso.box((0.16 * scale, 0.04 * scale, 0.18 * scale), offset=(0.04 * scale, -0.11 * scale, 0.32 * scale), mat=blood)
    torso_obj = torso.build()

    head = Part('Head', location=(0.0, -0.04 * scale, 0.60 * scale), parent=torso_obj)
    head.box((0.25 * bulky * scale, 0.25 * bulky * scale, 0.24 * scale), offset=(0.0, -0.01 * scale, 0.16 * scale), mat=skin, bevel=0.03 * scale, taper_top=(0.94, 0.94))
    head.box((0.27 * bulky * scale, 0.07 * scale, 0.05 * scale), offset=(0.0, -0.12 * scale, 0.21 * scale), mat=skin, bevel=0.01 * scale)
    head.sphere((0.028 * scale, 0.022 * scale, 0.024 * scale), offset=(-0.055 * scale, -0.132 * scale, 0.175 * scale), mat=eye)
    head.sphere((0.028 * scale, 0.022 * scale, 0.024 * scale), offset=(0.055 * scale, -0.132 * scale, 0.175 * scale), mat=eye)
    if spec.get('helmet'):
        head.sphere((0.165 * bulky * scale, 0.165 * bulky * scale, 0.13 * scale), offset=(0.0, 0.0, 0.23 * scale), mat=armor)
    head_obj = head.build()

    jaw = Part('Jaw', location=(0.0, -0.02 * scale, 0.06 * scale), parent=head_obj)
    jaw.box((0.16 * bulky * scale, 0.15 * scale, 0.07 * scale), offset=(0.0, -0.04 * scale, -0.03 * scale), mat=skin, bevel=0.01 * scale)
    jaw.box((0.11 * scale, 0.03 * scale, 0.035 * scale), offset=(0.0, -0.105 * scale, -0.005 * scale), mat=blood)
    jaw.build()

    for side, sx in (('Arm_L', -1.0), ('Arm_R', 1.0)):
        arm = Part(side, location=(sx * 0.28 * bulky * scale, -0.02 * scale, 0.50 * scale), parent=torso_obj)
        arm.box((0.13 * bulky * scale, 0.13 * bulky * scale, 0.28 * scale), offset=(0.0, 0.0, -0.14 * scale), mat=coat, bevel=0.018 * scale)
        arm.box((0.10 * bulky * scale, 0.10 * bulky * scale, 0.28 * scale), offset=(0.0, 0.0, -0.40 * scale), mat=skin, bevel=0.015 * scale)
        arm.box((0.09 * bulky * scale, 0.11 * bulky * scale, 0.11 * scale), offset=(0.0, -0.02 * scale, -arm_len + 0.03 * scale), mat=blood, bevel=0.01 * scale)
        arm.build()

    for side, sx in (('Leg_L', -1.0), ('Leg_R', 1.0)):
        leg = Part(side, location=(sx * 0.11 * bulky * scale, 0.0, 0.0), parent=torso_obj)
        leg.box((0.14 * bulky * scale, 0.15 * bulky * scale, 0.62 * scale), offset=(0.0, 0.0, -0.34 * scale), mat=pants, bevel=0.015 * scale)
        leg.box((0.14 * bulky * scale, 0.24 * bulky * scale, 0.18 * scale), offset=(0.0, -0.04 * scale, -leg_len + 0.05 * scale), mat=boot, bevel=0.015 * scale)
        leg.build()

    return lib.export_glb(os.path.join(OUT_DIR, filename))


def make_pistol():
    """First-person pistol pointing down -Z (Blender +Y). Named Slide, Magazine."""
    lib.reset_scene()
    gunmetal = lib.make_mat('Gunmetal', (0.14, 0.16, 0.19), metallic=0.88, roughness=0.30)
    polymer = lib.make_mat('Polymer', (0.05, 0.055, 0.065), metallic=0.05, roughness=0.72)
    steel = lib.make_mat('Steel', (0.58, 0.62, 0.68), metallic=0.95, roughness=0.22)
    sight = lib.make_mat('Tritium', (0.15, 0.98, 0.45), emission=(0.15, 0.98, 0.45), emission_strength=4.0, roughness=0.2)

    rec = Part('Receiver')
    rec.box((0.034, 0.19, 0.028), offset=(0.0, 0.03, 0.0), mat=polymer, bevel=0.003)
    rec.box((0.032, 0.052, 0.115), offset=(0.0, -0.045, -0.065), local_rot=(0.24, 0.0, 0.0), mat=polymer, bevel=0.004)
    rec.box((0.012, 0.055, 0.035), offset=(0.0, 0.015, -0.032), mat=polymer, bevel=0.002)
    rec.cylinder(0.007, 0.007, 0.20, segments=12, offset=(0.0, 0.045, 0.022), local_rot=(math.pi / 2, 0.0, 0.0), mat=steel)
    rec_obj = rec.build()

    slide = Part('Slide', location=(0.0, 0.02, 0.025), parent=rec_obj)
    slide.box((0.036, 0.21, 0.034), offset=(0.0, 0.015, 0.0), mat=gunmetal, bevel=0.003)
    slide.box((0.024, 0.008, 0.009), offset=(0.0, -0.078, 0.020), mat=polymer)
    slide.box((0.006, 0.008, 0.009), offset=(-0.008, -0.078, 0.020), mat=sight)
    slide.box((0.006, 0.008, 0.009), offset=(0.008, -0.078, 0.020), mat=sight)
    slide.box((0.005, 0.010, 0.010), offset=(0.0, 0.110, 0.021), mat=sight)
    slide.build()

    mag = Part('Magazine', location=(0.0, -0.05, -0.09), parent=rec_obj)
    mag.box((0.026, 0.040, 0.095), offset=(0.0, 0.0, 0.02), local_rot=(0.24, 0.0, 0.0), mat=gunmetal, bevel=0.002)
    mag.build()

    return lib.export_glb(os.path.join(OUT_DIR, 'weapon-pistol.glb'))


def make_shotgun():
    """First-person pump shotgun pointing down -Z (Blender +Y). Named Pump."""
    lib.reset_scene()
    steel = lib.make_mat('BarrelSteel', (0.16, 0.17, 0.20), metallic=0.88, roughness=0.28)
    receiver_mat = lib.make_mat('Receiver', (0.10, 0.11, 0.13), metallic=0.82, roughness=0.38)
    wood = lib.make_mat('Walnut', (0.28, 0.14, 0.06), metallic=0.02, roughness=0.58)
    brass = lib.make_mat('Brass', (0.85, 0.65, 0.22), metallic=0.92, roughness=0.24)
    shell_red = lib.make_mat('ShellRed', (0.68, 0.08, 0.08), roughness=0.45)
    sight = lib.make_mat('BeadSight', (1.0, 0.55, 0.12), emission=(1.0, 0.55, 0.12), emission_strength=3.0)

    rec = Part('Receiver')
    rec.box((0.048, 0.24, 0.068), offset=(0.0, 0.0, 0.0), mat=receiver_mat, bevel=0.005)
    rec.box((0.042, 0.26, 0.065), offset=(0.0, -0.23, -0.025), local_rot=(0.12, 0.0, 0.0), mat=wood, bevel=0.006, taper_top=(0.9, 1.0))
    # Barrel + underbarrel tube
    rec.cylinder(0.013, 0.013, 0.56, segments=14, offset=(0.0, 0.36, 0.020), local_rot=(math.pi / 2, 0.0, 0.0), mat=steel)
    rec.cylinder(0.012, 0.012, 0.50, segments=12, offset=(0.0, 0.33, -0.010), local_rot=(math.pi / 2, 0.0, 0.0), mat=steel)
    rec.sphere((0.004, 0.004, 0.005), offset=(0.0, 0.625, 0.036), mat=sight)
    # Side-saddle shotgun shells
    for i in range(4):
        sy = -0.05 + i * 0.032
        rec.cylinder(0.0085, 0.0085, 0.042, segments=10, offset=(-0.030, sy, 0.005), mat=shell_red)
        rec.cylinder(0.0088, 0.0088, 0.012, segments=10, offset=(-0.030, sy, -0.016), mat=brass)
    rec_obj = rec.build()

    pump = Part('Pump', location=(0.0, 0.32, -0.010), parent=rec_obj)
    pump.box((0.052, 0.18, 0.050), offset=(0.0, 0.0, 0.0), mat=wood, bevel=0.007)
    pump.build()

    return lib.export_glb(os.path.join(OUT_DIR, 'weapon-shotgun.glb'))


def make_smg():
    """First-person tactical SMG pointing down -Z (Blender +Y). Named Bolt, Magazine."""
    lib.reset_scene()
    body = lib.make_mat('Upper', (0.12, 0.13, 0.16), metallic=0.78, roughness=0.36)
    grip = lib.make_mat('Poly', (0.06, 0.065, 0.075), roughness=0.72)
    steel = lib.make_mat('Silencer', (0.18, 0.20, 0.23), metallic=0.90, roughness=0.28)
    holo = lib.make_mat('HoloDot', (0.15, 0.85, 1.0), emission=(0.15, 0.85, 1.0), emission_strength=4.5, roughness=0.1)

    rec = Part('Receiver')
    rec.box((0.046, 0.32, 0.066), offset=(0.0, 0.04, 0.01), mat=body, bevel=0.004)
    rec.box((0.034, 0.050, 0.115), offset=(0.0, -0.07, -0.06), local_rot=(0.20, 0.0, 0.0), mat=grip, bevel=0.004)
    rec.cylinder(0.019, 0.019, 0.22, segments=14, offset=(0.0, 0.30, 0.015), local_rot=(math.pi / 2, 0.0, 0.0), mat=steel)
    # Holo optic rail & reticle glass
    rec.box((0.032, 0.072, 0.036), offset=(0.0, 0.02, 0.062), mat=grip, bevel=0.003)
    rec.sphere((0.004, 0.002, 0.004), offset=(0.0, 0.02, 0.065), mat=holo)
    rec_obj = rec.build()

    bolt = Part('Bolt', location=(0.024, 0.06, 0.025), parent=rec_obj)
    bolt.box((0.020, 0.028, 0.012), offset=(0.0, 0.0, 0.0), mat=steel, bevel=0.002)
    bolt.build()

    mag = Part('Magazine', location=(0.0, 0.08, -0.075), parent=rec_obj)
    mag.box((0.026, 0.042, 0.17), offset=(0.0, 0.01, -0.03), local_rot=(-0.15, 0.0, 0.0), mat=body, bevel=0.003)
    mag.build()

    return lib.export_glb(os.path.join(OUT_DIR, 'weapon-smg.glb'))


def make_frag_grenade():
    lib.reset_scene()
    olive = lib.make_mat('Olive', (0.20, 0.26, 0.15), metallic=0.15, roughness=0.58)
    steel = lib.make_mat('Spoon', (0.55, 0.58, 0.62), metallic=0.85, roughness=0.28)
    led = lib.make_mat('Blink', (1.0, 0.28, 0.12), emission=(1.0, 0.28, 0.12), emission_strength=4.5)
    g = Part('Grenade')
    g.sphere((0.07, 0.07, 0.095), u_segments=12, v_segments=8, offset=(0.0, 0.0, 0.095), mat=olive)
    g.torus(0.068, 0.009, 14, 6, offset=(0.0, 0.0, 0.095), mat=olive)
    g.cylinder(0.026, 0.028, 0.045, segments=10, offset=(0.0, 0.0, 0.20), mat=steel)
    g.box((0.018, 0.024, 0.08), offset=(0.0, -0.045, 0.155), local_rot=(0.35, 0.0, 0.0), mat=steel)
    g.sphere((0.015, 0.015, 0.015), offset=(0.0, 0.0, 0.228), mat=led)
    g.build()
    return lib.export_glb(os.path.join(OUT_DIR, 'frag-grenade.glb'))


def make_courtyard_props():
    results = {}

    # 1. Gothic Iron Gate + Stone Pillars
    lib.reset_scene()
    stone = lib.make_mat('Stone', (0.26, 0.27, 0.30), roughness=0.88)
    iron = lib.make_mat('WroughtIron', (0.09, 0.095, 0.11), metallic=0.85, roughness=0.44)
    gold = lib.make_mat('LanternGlow', (1.0, 0.72, 0.32), emission=(1.0, 0.68, 0.25), emission_strength=3.6)
    gate = Part('IronGate')
    for sx in (-2.4, 2.4):
        gate.box((0.75, 0.75, 3.6), offset=(sx, 0.0, 1.8), mat=stone, bevel=0.04)
        gate.box((0.92, 0.92, 0.28), offset=(sx, 0.0, 3.74), mat=stone, bevel=0.03)
        gate.box((0.26, 0.26, 0.38), offset=(sx, 0.0, 4.10), mat=gold)
    # Overhead iron arch beam & spikes
    gate.box((4.4, 0.16, 0.22), offset=(0.0, 0.0, 3.45), mat=iron, bevel=0.02)
    gate.box((4.2, 0.10, 0.10), offset=(0.0, 0.0, 1.85), mat=iron)
    gate.box((4.2, 0.10, 0.10), offset=(0.0, 0.0, 0.45), mat=iron)
    for px in (-1.8, -1.35, -0.9, -0.45, 0.45, 0.9, 1.35, 1.8):
        gate.cylinder(0.038, 0.01, 3.3, segments=6, offset=(px, 0.0, 1.75), mat=iron)
    gate.build()
    results['iron-gate.glb'] = lib.export_glb(os.path.join(OUT_DIR, 'iron-gate.glb'))

    # 2. Streetlamp
    lib.reset_scene()
    iron = lib.make_mat('CastIron', (0.09, 0.10, 0.12), metallic=0.85, roughness=0.40)
    bulb = lib.make_mat('GasLamp', (1.0, 0.78, 0.42), emission=(1.0, 0.74, 0.36), emission_strength=5.5)
    lamp = Part('Streetlamp')
    lamp.cylinder(0.24, 0.16, 0.65, segments=8, offset=(0.0, 0.0, 0.325), mat=iron)
    lamp.cylinder(0.08, 0.055, 3.6, segments=8, offset=(0.0, 0.0, 2.40), mat=iron)
    lamp.box((0.26, 0.26, 0.38), offset=(0.0, 0.0, 4.35), mat=bulb, bevel=0.02, taper_top=(1.25, 1.25))
    lamp.cylinder(0.24, 0.03, 0.28, segments=8, offset=(0.0, 0.0, 4.68), mat=iron)
    lamp.build()
    results['streetlamp.glb'] = lib.export_glb(os.path.join(OUT_DIR, 'streetlamp.glb'))

    # 3. Abandoned Quarantine Pickup Wreck
    lib.reset_scene()
    rust_paint = lib.make_mat('RustTruck', (0.24, 0.28, 0.23), metallic=0.35, roughness=0.68)
    rust_dark = lib.make_mat('RustChassis', (0.18, 0.11, 0.08), metallic=0.45, roughness=0.78)
    rubber = lib.make_mat('Rubber', (0.05, 0.05, 0.055), roughness=0.88)
    glass = lib.make_mat('Windshield', (0.14, 0.22, 0.26), metallic=0.25, roughness=0.15)
    hazard = lib.make_mat('HazardAmber', (0.85, 0.52, 0.08), emission=(0.85, 0.48, 0.05), emission_strength=2.2)
    truck = Part('PickupWreck')
    truck.box((1.95, 4.4, 0.55), offset=(0.0, 0.0, 0.68), mat=rust_paint, bevel=0.05)
    truck.box((1.84, 1.55, 0.85), offset=(0.0, 0.45, 1.35), mat=rust_paint, bevel=0.06, taper_top=(0.90, 0.88))
    truck.box((1.58, 0.08, 0.52), offset=(0.0, 1.15, 1.36), local_rot=(0.35, 0.0, 0.0), mat=glass)
    # Bed walls & tailgate
    truck.box((0.12, 1.85, 0.45), offset=(-0.90, -1.25, 1.15), mat=rust_paint)
    truck.box((0.12, 1.85, 0.45), offset=(0.90, -1.25, 1.15), mat=rust_paint)
    truck.box((1.86, 0.12, 0.40), offset=(0.0, -2.14, 1.10), local_rot=(-0.45, 0.0, 0.0), mat=rust_dark)
    truck.box((0.55, 0.24, 0.12), offset=(0.0, 0.45, 1.82), mat=hazard)
    for wx in (-0.98, 0.98):
        for wy in (-1.35, 1.38):
            truck.cylinder(0.42, 0.42, 0.26, segments=14, offset=(wx, wy, 0.42), local_rot=(0.0, math.pi / 2, 0.0), mat=rubber, bevel=0.03)
            truck.cylinder(0.22, 0.22, 0.28, segments=10, offset=(wx, wy, 0.42), local_rot=(0.0, math.pi / 2, 0.0), mat=rust_dark)
    truck.build()
    results['pickup-wreck.glb'] = lib.export_glb(os.path.join(OUT_DIR, 'pickup-wreck.glb'))

    # 4. Watchtower
    lib.reset_scene()
    timber = lib.make_mat('Timber', (0.24, 0.16, 0.10), roughness=0.85)
    sandbag = lib.make_mat('Sandbag', (0.42, 0.38, 0.29), roughness=0.92)
    steel = lib.make_mat('TowerSteel', (0.22, 0.24, 0.28), metallic=0.75, roughness=0.45)
    beacon = lib.make_mat('BeaconRed', (1.0, 0.18, 0.14), emission=(1.0, 0.18, 0.14), emission_strength=4.0)
    wt = Part('Watchtower')
    for lx in (-1.15, 1.15):
        for ly in (-1.15, 1.15):
            wt.box((0.20, 0.20, 4.4), offset=(lx, ly, 2.2), mat=timber, bevel=0.02)
    wt.box((2.75, 2.75, 0.22), offset=(0.0, 0.0, 4.35), mat=timber, bevel=0.02)
    wt.box((2.75, 0.26, 0.95), offset=(0.0, 1.25, 4.92), mat=sandbag, bevel=0.04)
    wt.box((2.75, 0.26, 0.95), offset=(0.0, -1.25, 4.92), mat=sandbag, bevel=0.04)
    wt.box((0.26, 2.40, 0.95), offset=(-1.25, 0.0, 4.92), mat=sandbag, bevel=0.04)
    wt.box((0.26, 2.40, 0.95), offset=(1.25, 0.0, 4.92), mat=sandbag, bevel=0.04)
    for rx in (-1.22, 1.22):
        for ry in (-1.22, 1.22):
            wt.cylinder(0.06, 0.06, 2.2, segments=8, offset=(rx, ry, 5.5), mat=steel)
    wt.box((3.0, 3.0, 0.18), offset=(0.0, 0.0, 6.65), mat=steel, bevel=0.03)
    wt.sphere((0.14, 0.14, 0.14), offset=(0.0, 0.0, 6.86), mat=beacon)
    wt.build()
    results['watchtower.glb'] = lib.export_glb(os.path.join(OUT_DIR, 'watchtower.glb'))

    # 5. Armory Supply Bench
    lib.reset_scene()
    bench_steel = lib.make_mat('BenchSteel', (0.18, 0.20, 0.24), metallic=0.80, roughness=0.40)
    wood_top = lib.make_mat('WoodTop', (0.30, 0.20, 0.12), roughness=0.72)
    ammo_green = lib.make_mat('AmmoCan', (0.16, 0.28, 0.16), metallic=0.30, roughness=0.55)
    med_white = lib.make_mat('MedBox', (0.85, 0.87, 0.90), roughness=0.35)
    med_red = lib.make_mat('MedCross', (0.85, 0.10, 0.10), emission=(0.85, 0.10, 0.10), emission_strength=1.4)
    lantern_cyan = lib.make_mat('ArmoryLantern', (0.28, 0.88, 1.0), emission=(0.28, 0.88, 1.0), emission_strength=4.5)
    sb = Part('SupplyBench')
    sb.box((2.4, 0.95, 0.12), offset=(0.0, 0.0, 0.92), mat=wood_top, bevel=0.02)
    for sx in (-1.05, 1.05):
        for sy in (-0.38, 0.38):
            sb.box((0.10, 0.10, 0.88), offset=(sx, sy, 0.44), mat=bench_steel)
    sb.box((0.55, 0.32, 0.26), offset=(-0.65, 0.05, 1.11), mat=ammo_green, bevel=0.02)
    sb.box((0.46, 0.34, 0.18), offset=(0.12, -0.05, 1.07), mat=med_white, bevel=0.02)
    sb.box((0.20, 0.06, 0.03), offset=(0.12, -0.05, 1.17), mat=med_red)
    sb.box((0.06, 0.20, 0.03), offset=(0.12, -0.05, 1.17), mat=med_red)
    sb.cylinder(0.11, 0.09, 0.28, segments=10, offset=(0.75, 0.0, 1.12), mat=lantern_cyan)
    sb.build()
    results['supply-bench.glb'] = lib.export_glb(os.path.join(OUT_DIR, 'supply-bench.glb'))

    # 6. Hazard Explosive Barrel
    lib.reset_scene()
    red_drum = lib.make_mat('HazardRed', (0.72, 0.10, 0.08), metallic=0.45, roughness=0.42)
    stripe = lib.make_mat('HazardYellow', (0.95, 0.72, 0.10), emission=(0.8, 0.55, 0.05), emission_strength=0.9, roughness=0.45)
    rib = lib.make_mat('DarkMetal', (0.16, 0.17, 0.20), metallic=0.85, roughness=0.35)
    hb = Part('HazardBarrel')
    hb.cylinder(0.42, 0.42, 1.16, segments=16, offset=(0.0, 0.0, 0.58), mat=red_drum, bevel=0.02)
    hb.cylinder(0.435, 0.435, 0.14, segments=16, offset=(0.0, 0.0, 0.58), mat=stripe)
    for rz in (0.04, 0.36, 0.80, 1.12):
        hb.torus(0.425, 0.022, 16, 6, offset=(0.0, 0.0, rz), mat=rib)
    hb.build()
    results['hazard-barrel.glb'] = lib.export_glb(os.path.join(OUT_DIR, 'hazard-barrel.glb'))

    # 7. Supply Drop Crate
    lib.reset_scene()
    olive = lib.make_mat('CrateOlive', (0.18, 0.24, 0.14), roughness=0.65)
    trim = lib.make_mat('CrateTrim', (0.38, 0.34, 0.22), metallic=0.6, roughness=0.40)
    beacon = lib.make_mat('CrateGlow', (0.25, 0.95, 0.55), emission=(0.25, 0.95, 0.55), emission_strength=4.0)
    cd = Part('CrateDrop')
    cd.box((0.68, 0.68, 0.52), offset=(0.0, 0.0, 0.26), mat=olive, bevel=0.03)
    cd.box((0.72, 0.72, 0.08), offset=(0.0, 0.0, 0.48), mat=trim, bevel=0.015)
    cd.box((0.26, 0.74, 0.06), offset=(0.0, 0.0, 0.28), mat=beacon)
    cd.build()
    results['crate-drop.glb'] = lib.export_glb(os.path.join(OUT_DIR, 'crate-drop.glb'))

    return results


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = {}
    summary['zombie-walker.glb'] = make_zombie('zombie-walker.glb', {
        'scale': 1.0,
        'skin': (0.42, 0.49, 0.40),
        'coat': (0.16, 0.19, 0.21),
        'pants': (0.11, 0.12, 0.15),
        'eye': (1.0, 0.75, 0.22),
        'eye_glow': 4.8,
    })
    summary['zombie-runner.glb'] = make_zombie('zombie-runner.glb', {
        'scale': 0.94,
        'bulky': 0.82,
        'skin': (0.50, 0.36, 0.35),
        'coat': (0.34, 0.12, 0.10),
        'pants': (0.14, 0.10, 0.10),
        'eye': (1.0, 0.18, 0.16),
        'eye_glow': 6.0,
    })
    summary['zombie-spitter.glb'] = make_zombie('zombie-spitter.glb', {
        'scale': 1.02,
        'bulky': 0.92,
        'skin': (0.34, 0.46, 0.32),
        'coat': (0.28, 0.30, 0.12),
        'pants': (0.10, 0.13, 0.10),
        'eye': (0.30, 1.0, 0.25),
        'eye_glow': 5.8,
        'sacs': True,
        'sac': (0.25, 0.95, 0.28),
    })
    summary['zombie-brute.glb'] = make_zombie('zombie-brute.glb', {
        'scale': 1.38,
        'bulky': 1.28,
        'skin': (0.36, 0.32, 0.34),
        'coat': (0.14, 0.15, 0.18),
        'pants': (0.09, 0.10, 0.12),
        'eye': (1.0, 0.35, 0.10),
        'eye_glow': 6.5,
        'core': True,
        'sac': (1.0, 0.38, 0.08),
        'helmet': True,
        'armor': (0.22, 0.24, 0.28),
    })
    summary['weapon-pistol.glb'] = make_pistol()
    summary['weapon-shotgun.glb'] = make_shotgun()
    summary['weapon-smg.glb'] = make_smg()
    summary['frag-grenade.glb'] = make_frag_grenade()
    summary.update(make_courtyard_props())
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from make_env_models import make_enhanced_props
    summary.update(make_enhanced_props(OUT_DIR))

    print('=== DEADHOURS MODELS GENERATED ===')
    total = 0
    for k, v in sorted(summary.items()):
        total += v['bytes']
        print(f"  {k:22s} {v['bytes']:7d} bytes  nodes={v['nodes']}")
    print(f"Total .glb size: {total} bytes ({total/1024:.1f} KB)")


if __name__ == '__main__':
    main()
