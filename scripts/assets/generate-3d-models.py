"""Batch Blender 5.2 PBR .glb asset generator for SoftN 3D examples & Showcase."""
import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from blender_pbr_lib import reset_scene, make_mat, make_empty, PartBuilder, export_glb

ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))


def find_bundle_dir(bundle):
    bundles_root = os.path.join(ROOT, "bundles")
    direct = os.path.join(bundles_root, bundle)
    if os.path.isdir(direct) and os.path.exists(os.path.join(direct, "manifest.json")):
        return direct
    for category in os.listdir(bundles_root):
        candidate = os.path.join(bundles_root, category, bundle)
        if os.path.exists(os.path.join(candidate, "manifest.json")):
            return candidate
    raise FileNotFoundError(f"Could not find bundle {bundle!r} under {bundles_root}")


def out_path(bundle, name):
    return os.path.join(find_bundle_dir(bundle), "assets", "models", name)


# ---- Blockscape ----

def build_voxel_pickaxe(path):
    reset_scene()
    oak = make_mat("oak", (0.48, 0.31, 0.16), roughness=0.78)
    oak_dark = make_mat("oak_dark", (0.34, 0.21, 0.10), roughness=0.82)
    diamond = make_mat("diamond", (0.20, 0.88, 0.96), metallic=0.35, roughness=0.14, emission=(0.12, 0.72, 0.9), emission_strength=0.6)
    iron = make_mat("iron", (0.72, 0.76, 0.80), metallic=0.88, roughness=0.28)

    root = make_empty("Root")
    handle = PartBuilder("Handle", location=(0.0, 0.0, 0.0), parent=root)
    handle.box((0.055, 0.56, 0.055), offset=(0.0, 0.24, -0.02), bevel=0.008, mat=oak)
    handle.box((0.072, 0.06, 0.072), offset=(0.0, -0.04, -0.02), bevel=0.01, mat=oak_dark)
    handle.box((0.078, 0.09, 0.078), offset=(0.0, 0.50, -0.02), bevel=0.01, mat=iron)
    handle.build()

    head = PartBuilder("Head", location=(0.0, 0.52, -0.02), parent=root)
    head.box((0.12, 0.09, 0.09), offset=(0.0, 0.0, 0.0), bevel=0.01, mat=diamond)
    head.box((0.24, 0.072, 0.072), offset=(-0.14, -0.03, 0.0), local_rot=(0.0, 0.0, 0.22), bevel=0.009, mat=diamond, taper_top=(0.75, 0.75))
    head.box((0.24, 0.072, 0.072), offset=(0.14, -0.03, 0.0), local_rot=(0.0, 0.0, -0.22), bevel=0.009, mat=diamond, taper_top=(0.75, 0.75))
    head.box((0.10, 0.05, 0.05), offset=(-0.27, -0.09, 0.0), local_rot=(0.0, 0.0, 0.50), bevel=0.006, mat=iron)
    head.box((0.10, 0.05, 0.05), offset=(0.27, -0.09, 0.0), local_rot=(0.0, 0.0, -0.50), bevel=0.006, mat=iron)
    head.build()
    return export_glb(path)


def build_voxel_torch(path):
    reset_scene()
    wood = make_mat("torch_wood", (0.42, 0.26, 0.13), roughness=0.82)
    band = make_mat("torch_band", (0.25, 0.27, 0.30), metallic=0.85, roughness=0.4)
    flame = make_mat("torch_flame", (1.0, 0.78, 0.25), emission=(1.0, 0.56, 0.12), emission_strength=4.5, roughness=0.2)

    p = PartBuilder("Torch")
    p.box((0.16, 0.16, 0.56), offset=(0.0, 0.0, 0.28), bevel=0.015, mat=wood)
    p.box((0.185, 0.185, 0.08), offset=(0.0, 0.0, 0.48), bevel=0.01, mat=band)
    p.box((0.16, 0.16, 0.16), offset=(0.0, 0.0, 0.62), bevel=0.02, mat=flame)
    p.build()
    return export_glb(path)


def build_treasure_chest(path):
    reset_scene()
    wood = make_mat("chest_wood", (0.46, 0.27, 0.14), roughness=0.72)
    iron = make_mat("chest_iron", (0.30, 0.34, 0.40), metallic=0.88, roughness=0.35)
    gold = make_mat("chest_gold", (0.95, 0.74, 0.20), metallic=0.92, roughness=0.22)

    p = PartBuilder("TreasureChest")
    p.box((0.88, 0.58, 0.42), offset=(0.0, 0.0, 0.21), bevel=0.02, mat=wood)
    p.box((0.92, 0.62, 0.07), offset=(0.0, 0.0, 0.05), bevel=0.01, mat=iron)
    p.box((0.92, 0.62, 0.07), offset=(0.0, 0.0, 0.38), bevel=0.01, mat=iron)
    p.box((0.90, 0.60, 0.22), offset=(0.0, 0.0, 0.52), bevel=0.04, mat=wood, taper_top=(0.9, 0.85))
    p.box((0.08, 0.63, 0.24), offset=(-0.30, 0.0, 0.52), bevel=0.01, mat=iron)
    p.box((0.08, 0.63, 0.24), offset=(0.30, 0.0, 0.52), bevel=0.01, mat=iron)
    p.box((0.14, 0.08, 0.16), offset=(0.0, -0.31, 0.40), bevel=0.01, mat=gold)
    p.build()
    return export_glb(path)


# ---- MazeEscape3D ----

def build_wall_sconce(path):
    reset_scene()
    iron = make_mat("wrought_iron", (0.20, 0.22, 0.25), metallic=0.88, roughness=0.45)
    wood = make_mat("sconce_wood", (0.38, 0.23, 0.12), roughness=0.8)
    ember = make_mat("sconce_ember", (1.0, 0.68, 0.20), emission=(1.0, 0.45, 0.08), emission_strength=5.2, roughness=0.2)

    p = PartBuilder("WallSconce")
    p.box((0.18, 0.05, 0.34), offset=(0.0, 0.0, 0.15), bevel=0.01, mat=iron)
    p.cylinder(0.045, 0.065, 0.42, 10, offset=(0.0, -0.14, 0.22), local_rot=(0.42, 0.0, 0.0), mat=wood)
    p.torus(0.08, 0.02, 14, 8, offset=(0.0, -0.11, 0.18), local_rot=(0.42, 0.0, 0.0), mat=iron)
    p.sphere((0.075, 0.075, 0.12), offset=(0.0, -0.23, 0.44), mat=ember)
    p.build()
    return export_glb(path)


def build_rune_crystal(path):
    reset_scene()
    cyan = make_mat("rune_cyan", (0.22, 0.92, 0.98), metallic=0.15, roughness=0.12, emission=(0.18, 0.85, 1.0), emission_strength=3.6)
    gold = make_mat("rune_gold", (0.94, 0.78, 0.32), metallic=0.92, roughness=0.22)

    root = make_empty("Root")
    core = PartBuilder("Crystal_Core", location=(0.0, 0.0, 0.0), parent=root)
    core.cylinder(0.0, 0.22, 0.38, 6, offset=(0.0, 0.0, 0.19), mat=cyan, smooth=False)
    core.cylinder(0.22, 0.0, 0.38, 6, offset=(0.0, 0.0, -0.19), mat=cyan, smooth=False)
    core.build()

    ring = PartBuilder("Ring", location=(0.0, 0.0, 0.0), parent=root)
    ring.torus(0.36, 0.032, 24, 10, local_rot=(0.45, 0.0, 0.0), mat=gold)
    ring.build()
    return export_glb(path)


def build_exit_portal(path):
    reset_scene()
    stone = make_mat("portal_stone", (0.34, 0.38, 0.44), roughness=0.88)
    gold = make_mat("portal_gold", (0.96, 0.78, 0.25), metallic=0.92, roughness=0.22, emission=(0.8, 0.55, 0.1), emission_strength=0.6)
    vortex = make_mat("portal_vortex", (0.32, 0.95, 0.65), emission=(0.25, 0.95, 0.60), emission_strength=3.4, roughness=0.1, alpha=0.88)

    root = make_empty("Root")
    arch = PartBuilder("Portal_Arch", location=(0.0, 0.0, 0.0), parent=root)
    arch.cylinder(0.95, 0.88, 0.18, 12, offset=(0.0, 0.0, 0.09), mat=stone, bevel=0.02)
    arch.box((0.26, 0.28, 1.95), offset=(-0.72, 0.0, 1.05), bevel=0.03, mat=stone)
    arch.box((0.26, 0.28, 1.95), offset=(0.72, 0.0, 1.05), bevel=0.03, mat=stone)
    arch.box((1.78, 0.32, 0.28), offset=(0.0, 0.0, 2.12), bevel=0.04, mat=stone)
    arch.box((0.55, 0.36, 0.22), offset=(0.0, 0.0, 2.34), bevel=0.02, mat=gold)
    arch.build()

    ring = PartBuilder("Portal_Ring", location=(0.0, 0.0, 1.15), parent=root)
    ring.torus(0.62, 0.055, 28, 10, local_rot=(math.pi * 0.5, 0.0, 0.0), mat=gold)
    ring.cylinder(0.56, 0.56, 0.04, 24, local_rot=(math.pi * 0.5, 0.0, 0.0), mat=vortex)
    ring.build()
    return export_glb(path)


def build_stone_obelisk(path):
    reset_scene()
    granite = make_mat("obelisk_granite", (0.28, 0.32, 0.38), roughness=0.85)
    moss = make_mat("obelisk_moss", (0.22, 0.44, 0.26), roughness=0.9)
    p = PartBuilder("StoneObelisk")
    p.box((0.68, 0.68, 0.24), offset=(0.0, 0.0, 0.12), bevel=0.03, mat=granite)
    p.box((0.46, 0.46, 1.45), offset=(0.0, 0.0, 0.96), bevel=0.02, mat=granite, taper_top=(0.68, 0.68))
    p.cylinder(0.22, 0.0, 0.34, 4, offset=(0.0, 0.0, 1.85), local_rot=(0.0, 0.0, math.pi * 0.25), mat=granite, smooth=False)
    p.box((0.48, 0.48, 0.10), offset=(0.0, 0.0, 0.28), bevel=0.015, mat=moss)
    p.build()
    return export_glb(path)


# ---- TrainYard ----

def build_steam_loco(path):
    reset_scene()
    steel = make_mat("loco_steel", (0.16, 0.19, 0.24), metallic=0.85, roughness=0.38)
    red = make_mat("loco_red", (0.76, 0.16, 0.14), metallic=0.25, roughness=0.35)
    brass = make_mat("loco_brass", (0.92, 0.72, 0.22), metallic=0.92, roughness=0.22)
    cab_glass = make_mat("loco_glass", (0.72, 0.90, 1.0), metallic=0.1, roughness=0.08, emission=(0.8, 0.7, 0.35), emission_strength=0.45)
    headlamp = make_mat("loco_lamp", (1.0, 0.95, 0.75), emission=(1.0, 0.9, 0.65), emission_strength=4.2)

    root = make_empty("Root")
    boiler = PartBuilder("Boiler", location=(0.0, 0.0, 0.0), parent=root)
    boiler.box((1.35, 3.85, 0.35), offset=(0.0, 0.0, 0.55), bevel=0.03, mat=steel)
    boiler.box((1.28, 0.35, 0.42), offset=(0.0, -2.05, 0.42), bevel=0.02, mat=red, taper_bottom=(0.8, 1.4))
    boiler.cylinder(0.56, 0.56, 2.55, 20, offset=(0.0, -0.58, 1.24), local_rot=(math.pi * 0.5, 0.0, 0.0), mat=steel)
    boiler.torus(0.57, 0.04, 20, 8, offset=(0.0, -1.65, 1.24), local_rot=(math.pi * 0.5, 0.0, 0.0), mat=brass)
    boiler.torus(0.57, 0.04, 20, 8, offset=(0.0, -0.55, 1.24), local_rot=(math.pi * 0.5, 0.0, 0.0), mat=brass)
    boiler.cylinder(0.20, 0.20, 0.16, 14, offset=(0.0, -1.92, 1.38), local_rot=(math.pi * 0.5, 0.0, 0.0), mat=headlamp)
    # 6 driving wheels
    for wy in (-1.2, 0.0, 1.2):
        for wx in (-0.70, 0.70):
            boiler.cylinder(0.40, 0.40, 0.12, 16, offset=(wx, wy, 0.40), local_rot=(0.0, math.pi * 0.5, 0.0), mat=red)
            boiler.cylinder(0.42, 0.42, 0.07, 16, offset=(wx, wy, 0.40), local_rot=(0.0, math.pi * 0.5, 0.0), mat=brass)
    boiler.build()

    cab = PartBuilder("Cab", location=(0.0, 1.18, 1.42), parent=root)
    cab.box((1.42, 1.25, 1.22), offset=(0.0, 0.0, 0.0), bevel=0.03, mat=red)
    cab.box((1.52, 1.40, 0.12), offset=(0.0, 0.0, 0.64), bevel=0.02, mat=steel)
    cab.box((1.45, 0.52, 0.42), offset=(0.0, -0.15, 0.22), mat=cab_glass)
    cab.build()

    stack = PartBuilder("Smokestack", location=(0.0, -1.42, 1.98), parent=root)
    stack.cylinder(0.18, 0.26, 0.62, 14, offset=(0.0, 0.0, 0.0), mat=steel, bevel=0.02)
    stack.torus(0.24, 0.04, 16, 8, offset=(0.0, 0.0, 0.30), mat=brass)
    stack.build()

    bell = PartBuilder("Bell", location=(0.0, -0.65, 1.95), parent=root)
    bell.cylinder(0.16, 0.08, 0.24, 14, offset=(0.0, 0.0, 0.0), mat=brass)
    bell.build()
    return export_glb(path)


def build_freight_hopper(path):
    reset_scene()
    chassis = make_mat("car_chassis", (0.18, 0.20, 0.24), metallic=0.8, roughness=0.45)
    body = make_mat("car_body", (0.18, 0.46, 0.72), metallic=0.2, roughness=0.42)
    timber = make_mat("car_coal", (0.12, 0.12, 0.14), roughness=0.92)
    p = PartBuilder("FreightHopper")
    p.box((1.28, 3.15, 0.24), offset=(0.0, 0.0, 0.42), bevel=0.02, mat=chassis)
    p.box((1.34, 2.95, 0.92), offset=(0.0, 0.0, 0.98), bevel=0.02, mat=body, taper_bottom=(0.86, 0.92))
    p.box((1.20, 2.75, 0.22), offset=(0.0, 0.0, 1.44), bevel=0.05, mat=timber)
    for wy in (-1.05, 1.05):
        for wx in (-0.66, 0.66):
            p.cylinder(0.30, 0.30, 0.12, 14, offset=(wx, wy, 0.30), local_rot=(0.0, math.pi * 0.5, 0.0), mat=chassis)
    p.build()
    return export_glb(path)


def build_harbor_tug(path):
    reset_scene()
    hull = make_mat("tug_hull", (0.14, 0.28, 0.42), roughness=0.48)
    red_stripe = make_mat("tug_red", (0.78, 0.20, 0.16), roughness=0.42)
    white = make_mat("tug_white", (0.92, 0.93, 0.95), roughness=0.35)
    brass = make_mat("tug_brass", (0.9, 0.72, 0.24), metallic=0.9, roughness=0.25)

    root = make_empty("Root")
    h = PartBuilder("Hull", location=(0.0, 0.0, 0.0), parent=root)
    h.box((1.95, 4.4, 0.75), offset=(0.0, 0.0, 0.38), bevel=0.14, mat=hull, taper_bottom=(0.76, 0.85))
    h.box((2.05, 4.5, 0.18), offset=(0.0, 0.0, 0.76), bevel=0.04, mat=red_stripe)
    h.build()

    b = PartBuilder("Bridge", location=(0.0, -0.35, 1.38), parent=root)
    b.box((1.35, 1.55, 1.05), offset=(0.0, 0.0, 0.0), bevel=0.04, mat=white)
    b.box((1.45, 1.65, 0.12), offset=(0.0, 0.0, 0.55), bevel=0.02, mat=red_stripe)
    b.build()

    f = PartBuilder("Funnel", location=(0.0, 0.85, 1.55), parent=root)
    f.cylinder(0.28, 0.24, 1.1, 14, offset=(0.0, 0.0, 0.0), mat=red_stripe, bevel=0.02)
    f.cylinder(0.25, 0.25, 0.24, 14, offset=(0.0, 0.0, 0.52), mat=hull)
    f.cylinder(0.06, 0.06, 0.35, 10, offset=(0.0, -0.32, 0.2), mat=brass)
    f.build()
    return export_glb(path)


def build_signal_gantry(path):
    reset_scene()
    steel = make_mat("gantry_steel", (0.34, 0.38, 0.44), metallic=0.82, roughness=0.38)
    green_glow = make_mat("sig_green", (0.2, 0.95, 0.45), emission=(0.15, 0.95, 0.45), emission_strength=3.8)
    amber_glow = make_mat("sig_amber", (1.0, 0.72, 0.15), emission=(1.0, 0.65, 0.12), emission_strength=2.2)
    p = PartBuilder("SignalGantry")
    p.box((0.28, 0.28, 4.4), offset=(0.0, 0.0, 2.2), bevel=0.02, mat=steel)
    p.box((1.35, 0.22, 0.22), offset=(0.55, 0.0, 4.05), bevel=0.02, mat=steel)
    p.box((0.36, 0.30, 0.78), offset=(1.05, 0.0, 3.65), bevel=0.02, mat=steel)
    p.sphere(0.11, offset=(1.05, -0.16, 3.82), mat=green_glow)
    p.sphere(0.11, offset=(1.05, -0.16, 3.48), mat=amber_glow)
    p.build()
    return export_glb(path)


# ---- PredatorPrey ----

def build_rabbit(path):
    reset_scene()
    fur = make_mat("rabbit_fur", (0.92, 0.88, 0.82), roughness=0.88)
    inner = make_mat("rabbit_ear", (0.95, 0.66, 0.70), roughness=0.75)
    eye = make_mat("rabbit_eye", (0.06, 0.05, 0.06), metallic=0.1, roughness=0.12)

    body = PartBuilder("Body", location=(0.0, 0.0, 0.26))
    body.sphere((0.20, 0.30, 0.19), offset=(0.0, 0.0, 0.0), mat=fur)
    b_obj = body.build()

    head = PartBuilder("Head", location=(0.0, -0.24, 0.16), parent=b_obj)
    head.sphere((0.14, 0.15, 0.13), offset=(0.0, -0.04, 0.02), mat=fur)
    head.sphere(0.024, offset=(-0.09, -0.14, 0.05), mat=eye)
    head.sphere(0.024, offset=(0.09, -0.14, 0.05), mat=eye)
    head.sphere(0.026, offset=(0.0, -0.19, 0.01), mat=inner)
    h_obj = head.build()

    el = PartBuilder("Ear_L", location=(-0.06, -0.02, 0.12), parent=h_obj)
    el.box((0.05, 0.04, 0.24), offset=(0.0, 0.02, 0.12), local_rot=(0.24, 0.0, 0.10), bevel=0.014, mat=fur)
    el.box((0.028, 0.02, 0.17), offset=(0.0, 0.005, 0.11), local_rot=(0.24, 0.0, 0.10), bevel=0.008, mat=inner)
    el.build()

    er = PartBuilder("Ear_R", location=(0.06, -0.02, 0.12), parent=h_obj)
    er.box((0.05, 0.04, 0.24), offset=(0.0, 0.02, 0.12), local_rot=(0.24, 0.0, -0.10), bevel=0.014, mat=fur)
    er.box((0.028, 0.02, 0.17), offset=(0.0, 0.005, 0.11), local_rot=(0.24, 0.0, -0.10), bevel=0.008, mat=inner)
    er.build()

    for name, lx, ly, lz, lsz in [
        ("Leg_FL", -0.11, -0.15, -0.12, 0.16),
        ("Leg_FR", 0.11, -0.15, -0.12, 0.16),
        ("Leg_BL", -0.13, 0.16, -0.10, 0.20),
        ("Leg_BR", 0.13, 0.16, -0.10, 0.20),
    ]:
        lg = PartBuilder(name, location=(lx, ly, lz), parent=b_obj)
        lg.box((0.07, 0.11, lsz), offset=(0.0, 0.0, -lsz * 0.45), bevel=0.018, mat=fur)
        lg.build()

    tail = PartBuilder("Tail", location=(0.0, 0.29, 0.04), parent=b_obj)
    tail.sphere((0.07, 0.07, 0.07), mat=fur)
    tail.build()
    return export_glb(path)


def build_fox(path):
    reset_scene()
    coat = make_mat("fox_coat", (0.86, 0.36, 0.12), roughness=0.78)
    cream = make_mat("fox_cream", (0.96, 0.92, 0.84), roughness=0.82)
    dark = make_mat("fox_dark", (0.14, 0.12, 0.12), roughness=0.85)
    eye = make_mat("fox_eye", (0.96, 0.72, 0.18), emission=(0.4, 0.25, 0.04), emission_strength=0.4, roughness=0.12)

    body = PartBuilder("Body", location=(0.0, 0.0, 0.44))
    body.box((0.36, 0.78, 0.32), offset=(0.0, 0.0, 0.0), bevel=0.09, mat=coat)
    body.box((0.28, 0.56, 0.16), offset=(0.0, -0.05, -0.10), bevel=0.05, mat=cream)
    b_obj = body.build()

    head = PartBuilder("Head", location=(0.0, -0.44, 0.14), parent=b_obj)
    head.box((0.26, 0.26, 0.22), offset=(0.0, -0.04, 0.04), bevel=0.06, mat=coat)
    head.box((0.12, 0.22, 0.11), offset=(0.0, -0.22, 0.0), bevel=0.03, mat=coat, taper_top=(0.6, 0.6))
    head.box((0.10, 0.14, 0.06), offset=(0.0, -0.20, -0.04), bevel=0.02, mat=cream)
    head.sphere(0.03, offset=(0.0, -0.33, 0.01), mat=dark)
    head.sphere(0.026, offset=(-0.085, -0.16, 0.07), mat=eye)
    head.sphere(0.026, offset=(0.085, -0.16, 0.07), mat=eye)
    h_obj = head.build()

    el = PartBuilder("Ear_L", location=(-0.09, -0.01, 0.15), parent=h_obj)
    el.cylinder(0.055, 0.0, 0.14, 4, offset=(0.0, 0.0, 0.07), mat=coat, smooth=False)
    el.build()

    er = PartBuilder("Ear_R", location=(0.09, -0.01, 0.15), parent=h_obj)
    er.cylinder(0.055, 0.0, 0.14, 4, offset=(0.0, 0.0, 0.07), mat=coat, smooth=False)
    er.build()

    for name, lx, ly in [
        ("Leg_FL", -0.13, -0.28),
        ("Leg_FR", 0.13, -0.28),
        ("Leg_BL", -0.13, 0.28),
        ("Leg_BR", 0.13, 0.28),
    ]:
        lg = PartBuilder(name, location=(lx, ly, -0.08), parent=b_obj)
        lg.box((0.085, 0.095, 0.24), offset=(0.0, 0.0, -0.12), bevel=0.02, mat=coat)
        lg.box((0.075, 0.09, 0.16), offset=(0.0, 0.0, -0.28), bevel=0.015, mat=dark)
        lg.build()

    tail = PartBuilder("Tail", location=(0.0, 0.40, 0.05), parent=b_obj)
    tail.box((0.15, 0.42, 0.15), offset=(0.0, 0.22, -0.04), local_rot=(-0.35, 0.0, 0.0), bevel=0.05, mat=coat)
    tail.sphere((0.09, 0.13, 0.09), offset=(0.0, 0.42, -0.11), mat=cream)
    tail.build()
    return export_glb(path)


def build_pine_cluster(path):
    reset_scene()
    bark = make_mat("pine_bark", (0.34, 0.21, 0.11), roughness=0.92)
    needles = make_mat("pine_needles", (0.14, 0.40, 0.20), roughness=0.84)
    p = PartBuilder("PineCluster")
    p.cylinder(0.18, 0.12, 1.4, 8, offset=(0.0, 0.0, 0.7), mat=bark)
    p.cylinder(1.05, 0.05, 1.5, 7, offset=(0.0, 0.0, 1.7), mat=needles, smooth=False)
    p.cylinder(0.82, 0.05, 1.35, 7, offset=(0.0, 0.0, 2.55), mat=needles, smooth=False)
    p.cylinder(0.55, 0.0, 1.15, 7, offset=(0.0, 0.0, 3.30), mat=needles, smooth=False)
    p.build()
    return export_glb(path)


def build_burrow_mound(path):
    reset_scene()
    soil = make_mat("burrow_soil", (0.36, 0.25, 0.16), roughness=0.95)
    hole = make_mat("burrow_hole", (0.04, 0.03, 0.03), roughness=0.98)
    p = PartBuilder("BurrowMound")
    p.cylinder(0.95, 0.55, 0.26, 12, offset=(0.0, 0.0, 0.13), mat=soil, bevel=0.03)
    p.cylinder(0.36, 0.32, 0.18, 12, offset=(0.0, 0.0, 0.20), mat=hole)
    p.build()
    return export_glb(path)


# ---- HouseBuilder & SimLives ----

def build_garden_tree(path):
    reset_scene()
    trunk = make_mat("oak_bark", (0.38, 0.24, 0.14), roughness=0.9)
    leaves = make_mat("oak_leaf", (0.20, 0.54, 0.24), roughness=0.82)
    p = PartBuilder("GardenTree")
    p.cylinder(0.24, 0.16, 1.9, 10, offset=(0.0, 0.0, 0.95), mat=trunk)
    p.icosphere((1.25, 1.20, 1.05), 2, offset=(0.0, 0.0, 2.45), mat=leaves)
    p.icosphere((0.88, 0.85, 0.78), 2, offset=(0.55, 0.35, 2.95), mat=leaves)
    p.icosphere((0.82, 0.82, 0.75), 2, offset=(-0.52, -0.30, 2.85), mat=leaves)
    p.build()
    return export_glb(path)


def build_patio_lamp(path):
    reset_scene()
    iron = make_mat("lamp_iron", (0.16, 0.18, 0.22), metallic=0.85, roughness=0.35)
    glow = make_mat("lamp_glow", (1.0, 0.9, 0.65), emission=(1.0, 0.82, 0.45), emission_strength=3.2)
    p = PartBuilder("PatioLamp")
    p.cylinder(0.18, 0.12, 0.18, 10, offset=(0.0, 0.0, 0.09), mat=iron)
    p.cylinder(0.05, 0.04, 1.85, 10, offset=(0.0, 0.0, 1.02), mat=iron)
    p.box((0.28, 0.28, 0.34), offset=(0.0, 0.0, 2.08), bevel=0.02, mat=glow)
    p.cylinder(0.26, 0.04, 0.16, 4, offset=(0.0, 0.0, 2.33), local_rot=(0.0, 0.0, math.pi * 0.25), mat=iron, smooth=False)
    p.build()
    return export_glb(path)


def build_garden_fountain(path):
    reset_scene()
    marble = make_mat("fountain_marble", (0.82, 0.84, 0.86), roughness=0.35)
    water = make_mat("fountain_water", (0.20, 0.68, 0.92), roughness=0.08, metallic=0.1, emission=(0.1, 0.45, 0.65), emission_strength=0.45, alpha=0.85)
    p = PartBuilder("GardenFountain")
    p.cylinder(1.35, 1.25, 0.35, 20, offset=(0.0, 0.0, 0.18), mat=marble, bevel=0.03)
    p.cylinder(1.18, 1.18, 0.08, 20, offset=(0.0, 0.0, 0.31), mat=water)
    p.cylinder(0.24, 0.20, 0.95, 14, offset=(0.0, 0.0, 0.72), mat=marble)
    p.cylinder(0.68, 0.48, 0.22, 18, offset=(0.0, 0.0, 1.20), mat=marble, bevel=0.02)
    p.cylinder(0.56, 0.56, 0.06, 18, offset=(0.0, 0.0, 1.29), mat=water)
    p.sphere(0.18, offset=(0.0, 0.0, 1.48), mat=water)
    p.build()
    return export_glb(path)


def build_hearth_stove(path):
    reset_scene()
    cast = make_mat("stove_iron", (0.14, 0.15, 0.18), metallic=0.82, roughness=0.48)
    brick = make_mat("stove_brick", (0.58, 0.26, 0.18), roughness=0.88)
    fire = make_mat("stove_fire", (1.0, 0.60, 0.14), emission=(1.0, 0.48, 0.08), emission_strength=4.8)
    p = PartBuilder("HearthStove")
    p.box((1.20, 0.76, 0.16), offset=(0.0, 0.0, 0.08), bevel=0.02, mat=brick)
    p.box((0.92, 0.62, 0.95), offset=(0.0, 0.0, 0.62), bevel=0.04, mat=cast)
    p.box((0.52, 0.12, 0.44), offset=(0.0, -0.30, 0.52), mat=fire)
    p.cylinder(0.14, 0.14, 1.6, 12, offset=(0.0, 0.05, 1.72), mat=cast)
    p.build()
    return export_glb(path)


# ---- ThreeDemo & Showcase ----

def build_chrono_orrery(path):
    reset_scene()
    obsidian = make_mat("orrery_base", (0.10, 0.12, 0.16), metallic=0.45, roughness=0.28)
    brass = make_mat("orrery_brass", (0.94, 0.74, 0.28), metallic=0.94, roughness=0.18)
    copper = make_mat("orrery_copper", (0.86, 0.46, 0.24), metallic=0.90, roughness=0.22)
    steel = make_mat("orrery_steel", (0.72, 0.78, 0.86), metallic=0.92, roughness=0.15)
    sun = make_mat("orrery_sun", (1.0, 0.86, 0.42), emission=(1.0, 0.66, 0.18), emission_strength=4.5, roughness=0.1)

    root = make_empty("Root")
    base = PartBuilder("Base", location=(0.0, 0.0, 0.0), parent=root)
    base.cylinder(0.68, 0.52, 0.24, 24, offset=(0.0, 0.0, 0.12), mat=obsidian, bevel=0.03)
    base.cylinder(0.14, 0.10, 0.72, 16, offset=(0.0, 0.0, 0.58), mat=brass)
    base.torus(0.58, 0.03, 24, 8, offset=(0.0, 0.0, 0.25), mat=brass)
    base.build()

    center = make_empty("Gimbal_Pivot", location=(0.0, 0.0, 1.48), parent=root)

    ro = PartBuilder("Ring_Outer", location=(0.0, 0.0, 0.0), parent=center)
    ro.torus(0.86, 0.035, 36, 10, local_rot=(0.45, 0.0, 0.0), mat=brass)
    ro.sphere(0.08, offset=(0.86, 0.0, 0.0), mat=steel)
    ro.build()

    rm = PartBuilder("Ring_Mid", location=(0.0, 0.0, 0.0), parent=center)
    rm.torus(0.64, 0.030, 32, 10, local_rot=(-0.65, 0.35, 0.0), mat=copper)
    rm.sphere(0.065, offset=(0.0, 0.64, 0.0), mat=brass)
    rm.build()

    ri = PartBuilder("Ring_Inner", location=(0.0, 0.0, 0.0), parent=center)
    ri.torus(0.44, 0.024, 28, 10, local_rot=(0.30, -0.75, 0.0), mat=steel)
    ri.build()

    core = PartBuilder("Core_Orb", location=(0.0, 0.0, 0.0), parent=center)
    core.icosphere(0.22, 2, mat=sun, smooth=True)
    core.build()
    return export_glb(path)


def build_crystal_relic(path):
    reset_scene()
    slate = make_mat("relic_slate", (0.14, 0.17, 0.22), metallic=0.25, roughness=0.45)
    crystal = make_mat("relic_crystal", (0.68, 0.32, 1.0), metallic=0.15, roughness=0.08, emission=(0.55, 0.22, 1.0), emission_strength=3.4)
    gold = make_mat("relic_gold", (0.96, 0.78, 0.32), metallic=0.92, roughness=0.20)

    root = make_empty("Root")
    ped = PartBuilder("Pedestal", location=(0.0, 0.0, 0.0), parent=root)
    ped.cylinder(0.62, 0.46, 0.68, 8, offset=(0.0, 0.0, 0.34), mat=slate, bevel=0.02, smooth=False)
    ped.torus(0.48, 0.03, 24, 8, offset=(0.0, 0.0, 0.68), mat=gold)
    ped.build()

    shard = PartBuilder("Floating_Shard", location=(0.0, 0.0, 1.38), parent=root)
    shard.cylinder(0.0, 0.28, 0.56, 6, offset=(0.0, 0.0, 0.28), mat=crystal, smooth=False)
    shard.cylinder(0.28, 0.0, 0.46, 6, offset=(0.0, 0.0, -0.23), mat=crystal, smooth=False)
    shard.build()

    halo = PartBuilder("Halo_Ring", location=(0.0, 0.0, 1.38), parent=root)
    halo.torus(0.46, 0.026, 28, 8, local_rot=(0.35, 0.0, 0.0), mat=gold)
    halo.build()
    return export_glb(path)


def main():
    jobs = [
        ("Blockscape/voxel-pickaxe", lambda: build_voxel_pickaxe(out_path("Blockscape", "voxel-pickaxe.glb"))),
        ("Blockscape/voxel-torch", lambda: build_voxel_torch(out_path("Blockscape", "voxel-torch.glb"))),
        ("Blockscape/treasure-chest", lambda: build_treasure_chest(out_path("Blockscape", "treasure-chest.glb"))),
        ("MazeEscape3D/wall-sconce", lambda: build_wall_sconce(out_path("MazeEscape3D", "wall-sconce.glb"))),
        ("MazeEscape3D/rune-crystal", lambda: build_rune_crystal(out_path("MazeEscape3D", "rune-crystal.glb"))),
        ("MazeEscape3D/exit-portal", lambda: build_exit_portal(out_path("MazeEscape3D", "exit-portal.glb"))),
        ("MazeEscape3D/stone-obelisk", lambda: build_stone_obelisk(out_path("MazeEscape3D", "stone-obelisk.glb"))),
        ("TrainYard/steam-loco-detail", lambda: build_steam_loco(out_path("TrainYard", "steam-loco-detail.glb"))),
        ("TrainYard/freight-hopper", lambda: build_freight_hopper(out_path("TrainYard", "freight-hopper.glb"))),
        ("TrainYard/harbor-tug", lambda: build_harbor_tug(out_path("TrainYard", "harbor-tug.glb"))),
        ("TrainYard/signal-gantry", lambda: build_signal_gantry(out_path("TrainYard", "signal-gantry.glb"))),
        ("PredatorPrey/rabbit", lambda: build_rabbit(out_path("PredatorPrey", "rabbit.glb"))),
        ("PredatorPrey/fox", lambda: build_fox(out_path("PredatorPrey", "fox.glb"))),
        ("PredatorPrey/pine-cluster", lambda: build_pine_cluster(out_path("PredatorPrey", "pine-cluster.glb"))),
        ("PredatorPrey/burrow-mound", lambda: build_burrow_mound(out_path("PredatorPrey", "burrow-mound.glb"))),
        ("HouseBuilder/garden-tree", lambda: build_garden_tree(out_path("HouseBuilder", "garden-tree.glb"))),
        ("HouseBuilder/patio-lamp", lambda: build_patio_lamp(out_path("HouseBuilder", "patio-lamp.glb"))),
        ("SimLives/garden-fountain", lambda: build_garden_fountain(out_path("SimLives", "garden-fountain.glb"))),
        ("SimLives/hearth-stove", lambda: build_hearth_stove(out_path("SimLives", "hearth-stove.glb"))),
        ("ThreeDemo/chrono-orrery", lambda: build_chrono_orrery(out_path("ThreeDemo", "chrono-orrery.glb"))),
        ("ThreeDemo/crystal-relic", lambda: build_crystal_relic(out_path("ThreeDemo", "crystal-relic.glb"))),
        ("Showcase/chrono-orrery", lambda: build_chrono_orrery(out_path("Showcase", "chrono-orrery.glb"))),
    ]
    total = 0
    for label, fn in jobs:
        info = fn()
        total += info["bytes"]
        print(f"OK {label:32s} {info['bytes']:7d} B  nodes={info['nodes']}")
    print(f"Generated {len(jobs)} PBR .glb models ({total / 1024:.1f} KB total)")


if __name__ == "__main__":
    main()
