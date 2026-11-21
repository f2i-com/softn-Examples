"""
Deterministic headless Blender 5.2 PBR asset generator for Potato Peeler
(Ministry of Tubers — Kolkhoz Kitchen Station No. 7).

Usage:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --python scripts/assets/potatopeeler/make-models.py
"""

import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Euler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "PotatoPeeler")
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts", "assets"))

from blender_pbr_lib import (  # noqa: E402
    PartBuilder,
    export_glb,
    make_empty,
    make_mat,
    reset_scene,
)

OUT_DIR = os.path.join(BUNDLE_DIR, "assets", "models")


def potato_radius(theta: float, phi: float) -> tuple[float, float, float]:
    """
    Deterministic organic lumpy potato profile:
    theta in [0, pi] (pole to pole along X axis), phi in [0, 2*pi] around X axis.
    Returns (rx, ry, rz) base semi-axes with subtle organic tuber lobes.
    """
    lobe1 = 0.08 * math.sin(2.0 * theta + 0.4) * math.cos(phi - 0.3)
    lobe2 = 0.055 * math.cos(3.0 * theta - 0.5) * math.sin(2.0 * phi + 0.7)
    lobe3 = 0.035 * math.sin(theta * 4.0) * math.cos(3.0 * phi - 1.1)
    asym_x = 0.045 * math.cos(theta)
    s = 1.0 + lobe1 + lobe2 + lobe3
    rx = (0.31 + asym_x) * s
    ry = 0.205 * s
    rz = 0.225 * s
    return rx, ry, rz


def build_potato_whole():
    """
    Builds `potato-whole.glb` with:
      - `Flesh_Core` (Mat_Flesh): golden-ivory peeled inner tuber with subtle dimples
      - `Skin_00` .. `Skin_15` (Mat_Skin): 16 sculpted outer skin shell patches (4x4 grid)
        that peel off individually via Scene3D `parts: { Skin_XX: { visible: false } }`!
      - `Sprout_0` .. `Sprout_2` (Mat_Sprout): 3 small tuber eyes/sprouts on outer skin
    """
    reset_scene()
    root = make_empty("Potato_Root")

    mat_flesh = make_mat("Mat_Flesh", color=(0.95, 0.84, 0.48), metallic=0.0, roughness=0.46)
    mat_skin = make_mat("Mat_Skin", color=(0.50, 0.33, 0.19), metallic=0.0, roughness=0.86)
    mat_sprout = make_mat("Mat_Sprout", color=(0.30, 0.20, 0.13), metallic=0.0, roughness=0.78)

    # 1. Inner Flesh_Core mesh (high-res organic ellipsoid along X, up Z, depth Y)
    bm_core = bmesh.new()
    u_steps = 28
    v_steps = 18
    grid_verts = []
    for iv in range(v_steps + 1):
        theta = (iv / v_steps) * math.pi
        st = math.sin(theta)
        ct = math.cos(theta)
        row = []
        for iu in range(u_steps):
            phi = (iu / u_steps) * math.tau
            rx, ry, rz = potato_radius(theta, phi)
            # Slight eye dimples on flesh
            dimple = 1.0 - 0.018 * max(0.0, math.sin(theta * 5.0) * math.cos(phi * 3.0))
            x = ct * rx * dimple
            y = st * math.cos(phi) * ry * dimple
            z = st * math.sin(phi) * rz * dimple
            row.append(bm_core.verts.new((x, y, z)))
        grid_verts.append(row)

    for iv in range(v_steps):
        for iu in range(u_steps):
            iu2 = (iu + 1) % u_steps
            v00 = grid_verts[iv][iu]
            v01 = grid_verts[iv][iu2]
            v11 = grid_verts[iv + 1][iu2]
            v10 = grid_verts[iv + 1][iu]
            f = bm_core.faces.new((v00, v10, v11, v01))
            f.smooth = True
            f.material_index = 0

    bmesh.ops.recalc_face_normals(bm_core, faces=bm_core.faces)
    mesh_core = bpy.data.meshes.new("Flesh_Core_mesh")
    bm_core.to_mesh(mesh_core)
    bm_core.free()
    obj_core = bpy.data.objects.new("Flesh_Core", mesh_core)
    bpy.context.collection.objects.link(obj_core)
    obj_core.data.materials.append(mat_flesh)
    obj_core.parent = root

    # 2. 16 Peelable Skin Patches: 4 axial bands (along X) x 4 circumferential quadrants
    # Each patch is a solidified curved shell slightly proud of Flesh_Core (inner 0.996, outer 1.055)
    bands = 4
    quads = 4
    sub_v = 5
    sub_u = 7
    eps_t = 0.018  # tiny overlap so unpeeled potato looks completely seamless
    eps_p = 0.022

    for bi in range(bands):
        for qi in range(quads):
            idx = bi * quads + qi
            part_name = f"Skin_{idx:02d}"
            t0 = max(0.02, (bi / bands) * math.pi - (eps_t if bi > 0 else 0.0))
            t1 = min(math.pi - 0.02, ((bi + 1) / bands) * math.pi + (eps_t if bi < bands - 1 else 0.0))
            p0 = (qi / quads) * math.tau - eps_p
            p1 = ((qi + 1) / quads) * math.tau + eps_p

            bm = bmesh.new()
            outer_grid = []
            inner_grid = []
            for sv in range(sub_v + 1):
                theta = t0 + (t1 - t0) * (sv / sub_v)
                st = math.sin(theta)
                ct = math.cos(theta)
                o_row = []
                i_row = []
                for su in range(sub_u + 1):
                    phi = p0 + (p1 - p0) * (su / sub_u)
                    rx, ry, rz = potato_radius(theta, phi)
                    bump = 1.052 + 0.012 * math.sin(theta * 9.0 + idx) * math.cos(phi * 7.0 - idx * 0.4)
                    ox = ct * rx * bump
                    oy = st * math.cos(phi) * ry * bump
                    oz = st * math.sin(phi) * rz * bump
                    ix = ct * rx * 0.992
                    iy = st * math.cos(phi) * ry * 0.992
                    iz = st * math.sin(phi) * rz * 0.992
                    o_row.append(bm.verts.new((ox, oy, oz)))
                    i_row.append(bm.verts.new((ix, iy, iz)))
                outer_grid.append(o_row)
                inner_grid.append(i_row)

            # Outer faces (skin)
            for sv in range(sub_v):
                for su in range(sub_u):
                    f = bm.faces.new((
                        outer_grid[sv][su],
                        outer_grid[sv + 1][su],
                        outer_grid[sv + 1][su + 1],
                        outer_grid[sv][su + 1],
                    ))
                    f.smooth = True
                    f.material_index = 0
                    # Inner faces (flesh underside)
                    fi = bm.faces.new((
                        inner_grid[sv][su],
                        inner_grid[sv][su + 1],
                        inner_grid[sv + 1][su + 1],
                        inner_grid[sv + 1][su],
                    ))
                    fi.smooth = True
                    fi.material_index = 1

            # Stitch rim edges so peeled edges look thick & tactile
            for su in range(sub_u):
                f_top = bm.faces.new((outer_grid[0][su], outer_grid[0][su + 1], inner_grid[0][su + 1], inner_grid[0][su]))
                f_bot = bm.faces.new((outer_grid[sub_v][su + 1], outer_grid[sub_v][su], inner_grid[sub_v][su], inner_grid[sub_v][su + 1]))
                f_top.material_index = 0
                f_bot.material_index = 0
            for sv in range(sub_v):
                f_l = bm.faces.new((outer_grid[sv + 1][0], outer_grid[sv][0], inner_grid[sv][0], inner_grid[sv + 1][0]))
                f_r = bm.faces.new((outer_grid[sv][sub_u], outer_grid[sv + 1][sub_u], inner_grid[sv + 1][sub_u], inner_grid[sv][sub_u]))
                f_l.material_index = 0
                f_r.material_index = 0

            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            mesh_p = bpy.data.meshes.new(part_name + "_mesh")
            bm.to_mesh(mesh_p)
            bm.free()
            obj_p = bpy.data.objects.new(part_name, mesh_p)
            bpy.context.collection.objects.link(obj_p)
            obj_p.data.materials.append(mat_skin)
            obj_p.data.materials.append(mat_flesh)
            obj_p.parent = root

    # 3. Three small potato eye sprouts attached to root
    sprout_coords = [
        (0.95, 0.65),
        (1.65, 2.55),
        (2.15, 4.45),
    ]
    for si, (stheta, sphi) in enumerate(sprout_coords):
        rx, ry, rz = potato_radius(stheta, sphi)
        sx = math.cos(stheta) * rx * 1.05
        sy = math.sin(stheta) * math.cos(sphi) * ry * 1.05
        sz = math.sin(stheta) * math.sin(sphi) * rz * 1.05
        pb = PartBuilder(f"Sprout_{si}", location=(sx, sy, sz), parent=root)
        pb.sphere(radius=(0.022, 0.018, 0.018), u_segments=8, v_segments=6, mat=mat_sprout)
        pb.cylinder(radius1=0.009, radius2=0.004, depth=0.028, segments=6, offset=(0.0, 0.0, 0.016), mat=mat_sprout)
        pb.build()

    return export_glb(os.path.join(OUT_DIR, "potato-whole.glb"))


def build_peel_curl():
    """Curled helical potato-peel ribbon launched when scraping."""
    reset_scene()
    mat_skin = make_mat("Mat_Skin", color=(0.50, 0.33, 0.19), metallic=0.0, roughness=0.84)
    mat_flesh = make_mat("Mat_Flesh", color=(0.95, 0.85, 0.50), metallic=0.0, roughness=0.45)

    bm = bmesh.new()
    steps = 14
    width = 0.036
    thick = 0.006
    top_l, top_r, bot_l, bot_r = [], [], [], []
    for i in range(steps + 1):
        t = i / steps
        ang = t * math.pi * 1.85
        r = 0.055 - t * 0.018
        cx = (t - 0.5) * 0.14
        cy = math.cos(ang) * r
        cz = math.sin(ang) * r
        nx = 0.0
        ny = math.cos(ang)
        nz = math.sin(ang)
        w = width * (1.0 - 0.35 * abs(t - 0.5))
        top_l.append(bm.verts.new((cx - w, cy + ny * thick, cz + nz * thick)))
        top_r.append(bm.verts.new((cx + w, cy + ny * thick, cz + nz * thick)))
        bot_l.append(bm.verts.new((cx - w, cy, cz)))
        bot_r.append(bm.verts.new((cx + w, cy, cz)))

    for i in range(steps):
        f1 = bm.faces.new((top_l[i], top_r[i], top_r[i + 1], top_l[i + 1]))
        f1.smooth = True
        f1.material_index = 0
        f2 = bm.faces.new((bot_l[i], bot_l[i + 1], bot_r[i + 1], bot_r[i]))
        f2.smooth = True
        f2.material_index = 1

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Peel_Curl_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Peel_Curl", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat_skin)
    obj.data.materials.append(mat_flesh)
    return export_glb(os.path.join(OUT_DIR, "peel-curl.glb"))


def build_peeler_knife():
    """Tier 1: Rusty Canteen Knife ('M-54') — tip at origin/front (-Y -> glTF +Z)."""
    reset_scene()
    root = make_empty("Knife_Root")
    wood = make_mat("Mat_BirchHandle", color=(0.34, 0.20, 0.11), metallic=0.0, roughness=0.72)
    brass = make_mat("Mat_BrassRivet", color=(0.76, 0.58, 0.24), metallic=0.82, roughness=0.36)
    steel = make_mat("Mat_TarnishedSteel", color=(0.56, 0.58, 0.60), metallic=0.86, roughness=0.38)
    rust = make_mat("Mat_RustSpot", color=(0.44, 0.22, 0.12), metallic=0.35, roughness=0.82)

    pb = PartBuilder("Knife_Body", parent=root)
    # Handle along +Y (back), blade pointing -Y (front)
    pb.box(size=(0.036, 0.22, 0.048), offset=(0.0, 0.16, 0.0), bevel=0.008, mat=wood)
    pb.cylinder(radius1=0.022, radius2=0.020, depth=0.024, offset=(0.0, 0.045, 0.0), local_rot=(math.pi / 2, 0, 0), mat=brass)
    # Rivets
    for ry in (0.11, 0.17, 0.23):
        pb.cylinder(radius1=0.005, radius2=0.005, depth=0.040, offset=(0.0, ry, 0.0), local_rot=(0, math.pi / 2, 0), mat=brass)
    # Blade spine & edge
    pb.box(size=(0.007, 0.24, 0.036), offset=(0.0, -0.08, 0.002), bevel=0.002, mat=steel, taper_top=(0.35, 1.0))
    pb.box(size=(0.009, 0.07, 0.018), offset=(0.0, -0.04, 0.008), mat=rust)
    pb.box(size=(0.005, 0.08, 0.024), offset=(0.0, -0.21, -0.004), local_rot=(0.18, 0, 0), mat=steel)
    pb.build()
    return export_glb(os.path.join(OUT_DIR, "peeler-knife.glb"))


def build_peeler_swivel():
    """Tier 2: Stamped Steel Y-Peeler ('Sputnik-2') with red Bakelite grip & articulated Blade_Swivel."""
    reset_scene()
    root = make_empty("Swivel_Root")
    bakelite = make_mat("Mat_RedBakelite", color=(0.68, 0.11, 0.09), metallic=0.08, roughness=0.28)
    chrome = make_mat("Mat_StampedChrome", color=(0.82, 0.85, 0.88), metallic=0.92, roughness=0.18)
    brass = make_mat("Mat_StarBadge", color=(0.88, 0.68, 0.20), metallic=0.85, roughness=0.26)

    pb = PartBuilder("Swivel_Frame", parent=root)
    pb.cylinder(radius1=0.024, radius2=0.019, depth=0.22, offset=(0.0, 0.16, 0.0), local_rot=(math.pi / 2, 0, 0), bevel=0.004, mat=bakelite)
    pb.torus(major_radius=0.018, minor_radius=0.005, offset=(0.0, 0.275, 0.0), mat=bakelite)
    pb.cylinder(radius1=0.012, radius2=0.012, depth=0.010, offset=(0.0, 0.15, 0.022), mat=brass)
    # Y-Yoke arms
    pb.box(size=(0.012, 0.13, 0.014), offset=(-0.052, -0.01, 0.0), local_rot=(0, 0, -0.36), bevel=0.003, mat=chrome)
    pb.box(size=(0.012, 0.13, 0.014), offset=(0.052, -0.01, 0.0), local_rot=(0, 0, 0.36), bevel=0.003, mat=chrome)
    # Eye gouger loop on right ear
    pb.torus(major_radius=0.016, minor_radius=0.0035, offset=(0.092, -0.065, 0.0), local_rot=(0, math.pi / 2, 0), mat=chrome)
    pb.build()

    blade = PartBuilder("Blade_Swivel", location=(0.0, -0.068, 0.0), parent=root)
    blade.box(size=(0.145, 0.022, 0.006), offset=(0.0, 0.0, 0.004), bevel=0.001, mat=chrome)
    blade.box(size=(0.145, 0.020, 0.006), offset=(0.0, 0.0, -0.004), bevel=0.001, mat=chrome)
    blade.build()
    return export_glb(os.path.join(OUT_DIR, "peeler-swivel.glb"))


def build_peeler_double():
    """Tier 3: Heavy Kolkhoz Dual-Blade Planer ('Urozhai-2') with olive steel & twin brass-mounted blades."""
    reset_scene()
    root = make_empty("Double_Root")
    olive = make_mat("Mat_OliveEnamel", color=(0.24, 0.33, 0.22), metallic=0.35, roughness=0.42)
    brass = make_mat("Mat_BrassMount", color=(0.82, 0.64, 0.22), metallic=0.88, roughness=0.25)
    steel = make_mat("Mat_HighCarbon", color=(0.86, 0.88, 0.92), metallic=0.95, roughness=0.14)
    red_grip = make_mat("Mat_CrimsonWrap", color=(0.72, 0.12, 0.10), metallic=0.05, roughness=0.52)

    pb = PartBuilder("Planer_Frame", parent=root)
    pb.box(size=(0.052, 0.22, 0.034), offset=(0.0, 0.17, 0.0), bevel=0.008, mat=red_grip)
    pb.box(size=(0.22, 0.045, 0.028), offset=(0.0, 0.04, 0.0), bevel=0.005, mat=olive)
    pb.box(size=(0.018, 0.14, 0.024), offset=(-0.102, -0.02, 0.0), bevel=0.004, mat=brass)
    pb.box(size=(0.018, 0.14, 0.024), offset=(0.102, -0.02, 0.0), bevel=0.004, mat=brass)
    pb.build()

    blade = PartBuilder("Blade_Twin", location=(0.0, -0.055, 0.0), parent=root)
    blade.box(size=(0.19, 0.026, 0.006), offset=(0.0, -0.022, 0.006), local_rot=(0.22, 0, 0), mat=steel)
    blade.box(size=(0.19, 0.026, 0.006), offset=(0.0, 0.018, -0.005), local_rot=(-0.22, 0, 0), mat=steel)
    blade.cylinder(radius1=0.010, radius2=0.010, depth=0.22, offset=(0.0, 0.0, 0.0), local_rot=(0, math.pi / 2, 0), mat=brass)
    blade.build()
    return export_glb(os.path.join(OUT_DIR, "peeler-double.glb"))


def build_peeler_crank():
    """Tier 4: Hand-Cranked Cast-Iron Mechanical Lathe ('Ural-M') with articulated Crank_Handle & Cutter_Head."""
    reset_scene()
    root = make_empty("Crank_Root")
    iron = make_mat("Mat_CastIronGreen", color=(0.18, 0.28, 0.24), metallic=0.58, roughness=0.48)
    brass = make_mat("Mat_GearBrass", color=(0.85, 0.66, 0.22), metallic=0.88, roughness=0.24)
    steel = make_mat("Mat_LatheSteel", color=(0.82, 0.85, 0.89), metallic=0.92, roughness=0.18)
    wood = make_mat("Mat_KnobWood", color=(0.45, 0.14, 0.10), metallic=0.05, roughness=0.45)

    pb = PartBuilder("Lathe_Body", parent=root)
    pb.box(size=(0.14, 0.18, 0.06), offset=(0.0, 0.12, 0.0), bevel=0.008, mat=iron)
    pb.cylinder(radius1=0.048, radius2=0.048, depth=0.09, offset=(0.0, 0.12, 0.035), mat=iron)
    pb.cylinder(radius1=0.018, radius2=0.018, depth=0.24, offset=(0.0, 0.02, 0.035), local_rot=(math.pi / 2, 0, 0), mat=steel)
    pb.build()

    crank = PartBuilder("Crank_Handle", location=(0.0, 0.22, 0.035), parent=root)
    crank.torus(major_radius=0.075, minor_radius=0.010, local_rot=(math.pi / 2, 0, 0), mat=brass)
    crank.box(size=(0.14, 0.012, 0.014), local_rot=(0, 0, 0), mat=brass)
    crank.box(size=(0.014, 0.012, 0.14), local_rot=(0, 0, 0), mat=brass)
    crank.cylinder(radius1=0.013, radius2=0.011, depth=0.065, offset=(0.072, 0.034, 0.0), local_rot=(math.pi / 2, 0, 0), mat=wood)
    crank.build()

    cutter = PartBuilder("Cutter_Head", location=(0.0, -0.09, 0.02), parent=root)
    cutter.cylinder(radius1=0.045, radius2=0.032, depth=0.05, local_rot=(math.pi / 2, 0, 0), mat=brass)
    for k in range(4):
        a = k * (math.pi / 2)
        cutter.box(
            size=(0.012, 0.065, 0.026),
            offset=(math.cos(a) * 0.042, -0.025, math.sin(a) * 0.042),
            local_rot=(0, a, 0),
            mat=steel,
        )
    cutter.build()
    return export_glb(os.path.join(OUT_DIR, "peeler-crank.glb"))


def build_peeler_rotary():
    """Tier 5: Motorized Centrifugal Abrasive Peeler ('Buran-3000') with spinning Rotor_Drum & glowing lamp."""
    reset_scene()
    root = make_empty("Rotary_Root")
    seafoam = make_mat("Mat_SovietSeafoam", color=(0.22, 0.48, 0.44), metallic=0.42, roughness=0.34)
    chrome = make_mat("Mat_MotorChrome", color=(0.86, 0.89, 0.92), metallic=0.94, roughness=0.16)
    red_cap = make_mat("Mat_RedNose", color=(0.76, 0.12, 0.10), metallic=0.25, roughness=0.32)
    amber = make_mat(
        "Mat_TubeLamp",
        color=(1.0, 0.72, 0.18),
        metallic=0.0,
        roughness=0.2,
        emission=(1.0, 0.62, 0.12),
        emission_strength=3.2,
    )

    pb = PartBuilder("Motor_Housing", parent=root)
    pb.cylinder(radius1=0.072, radius2=0.064, depth=0.24, offset=(0.0, 0.12, 0.02), local_rot=(math.pi / 2, 0, 0), bevel=0.008, mat=seafoam)
    pb.box(size=(0.042, 0.15, 0.075), offset=(0.0, 0.16, 0.085), bevel=0.006, mat=red_cap)
    # Pilot vacuum lamp on top
    pb.sphere(radius=(0.018, 0.018, 0.022), offset=(0.0, 0.06, 0.095), mat=amber)
    # Cooling fins
    for fi in range(4):
        pb.torus(major_radius=0.073, minor_radius=0.005, offset=(0.0, 0.05 + fi * 0.04, 0.02), local_rot=(math.pi / 2, 0, 0), mat=chrome)
    pb.build()

    rotor = PartBuilder("Rotor_Drum", location=(0.0, -0.04, 0.01), parent=root)
    rotor.cylinder(radius1=0.095, radius2=0.082, depth=0.048, local_rot=(math.pi / 2, 0, 0), mat=chrome)
    rotor.cylinder(radius1=0.032, radius2=0.022, depth=0.065, offset=(0.0, -0.02, 0.0), local_rot=(math.pi / 2, 0, 0), mat=red_cap)
    for bi in range(6):
        ang = (bi / 6) * math.tau
        rotor.box(
            size=(0.016, 0.036, 0.075),
            offset=(math.cos(ang) * 0.062, -0.026, math.sin(ang) * 0.062),
            local_rot=(0.3, ang, 0),
            mat=chrome,
        )
    rotor.build()
    return export_glb(os.path.join(OUT_DIR, "peeler-rotary.glb"))


def build_peeler_laser():
    """Tier 6: Experimental Cybernetic Ruby-Laser Peeler ('KOSMOS-9') with Emitter_Ring & Ruby_Crystal."""
    reset_scene()
    root = make_empty("Laser_Root")
    titanium = make_mat("Mat_CosmoTitanium", color=(0.74, 0.77, 0.82), metallic=0.90, roughness=0.22)
    copper = make_mat("Mat_CopperCoil", color=(0.84, 0.46, 0.24), metallic=0.92, roughness=0.24)
    crimson = make_mat("Mat_SovietFin", color=(0.74, 0.09, 0.09), metallic=0.35, roughness=0.28)
    ruby = make_mat(
        "Mat_RubyCore",
        color=(1.0, 0.16, 0.22),
        metallic=0.1,
        roughness=0.12,
        emission=(1.0, 0.14, 0.18),
        emission_strength=4.8,
    )

    pb = PartBuilder("Laser_Chassis", parent=root)
    pb.cylinder(radius1=0.058, radius2=0.048, depth=0.28, offset=(0.0, 0.13, 0.02), local_rot=(math.pi / 2, 0, 0), mat=titanium)
    for ci in range(4):
        pb.torus(major_radius=0.062, minor_radius=0.008, offset=(0.0, 0.02 + ci * 0.048, 0.02), local_rot=(math.pi / 2, 0, 0), mat=copper)
    for fi in range(3):
        ang = (fi / 3) * math.tau
        pb.box(
            size=(0.010, 0.18, 0.045),
            offset=(math.cos(ang) * 0.066, 0.15, 0.02 + math.sin(ang) * 0.066),
            local_rot=(0, ang, 0),
            mat=crimson,
        )
    pb.build()

    ring = PartBuilder("Emitter_Ring", location=(0.0, -0.045, 0.02), parent=root)
    ring.torus(major_radius=0.078, minor_radius=0.011, local_rot=(math.pi / 2, 0, 0), mat=copper)
    for pi in range(3):
        ang = (pi / 3) * math.tau
        ring.box(size=(0.016, 0.05, 0.016), offset=(math.cos(ang) * 0.075, -0.02, math.sin(ang) * 0.075), mat=titanium)
    ring.build()

    core = PartBuilder("Ruby_Crystal", location=(0.0, -0.075, 0.02), parent=root)
    core.cylinder(radius1=0.028, radius2=0.006, depth=0.095, segments=8, local_rot=(-math.pi / 2, 0, 0), mat=ruby)
    core.sphere(radius=(0.032, 0.032, 0.032), offset=(0.0, 0.035, 0.0), mat=ruby)
    core.build()
    return export_glb(os.path.join(OUT_DIR, "peeler-laser.glb"))


def build_kitchen_station():
    """
    Soviet Commissary Kitchen Workstation (`kitchen-station.glb`):
    - Heavy butcher-block oak cutting board centered at (0, 0, 0), top surface at Z = 0.0!
    - Steel & timber commissary counter table underneath
    - Institutional seafoam & cream tiled backsplash wall behind (+Y in Blender -> -Z in glTF, wait:
      with export_yup=True, Blender (x, y, z) -> glTF (x, z, -y)!
      So Blender +Y becomes glTF -Z (behind the table when camera is at +Z looking toward 0)!
      Let's double check: in Blender, +Z is UP (glTF +Y), +X is RIGHT (glTF +X), +Y is INTO SCREEN (glTF -Z), -Y is TOWARD CAMERA (glTF +Z)!
    """
    reset_scene()
    root = make_empty("Station_Root")

    oak = make_mat("Mat_ButcherOak", color=(0.56, 0.39, 0.22), metallic=0.0, roughness=0.62)
    oak_dark = make_mat("Mat_ButcherGroove", color=(0.36, 0.24, 0.13), metallic=0.0, roughness=0.72)
    counter = make_mat("Mat_OliveSteel", color=(0.22, 0.28, 0.23), metallic=0.48, roughness=0.52)
    counter_top = make_mat("Mat_ZincCounter", color=(0.46, 0.49, 0.48), metallic=0.62, roughness=0.44)
    tile_low = make_mat("Mat_SeafoamTile", color=(0.24, 0.39, 0.36), metallic=0.08, roughness=0.34)
    tile_high = make_mat("Mat_CreamWall", color=(0.76, 0.72, 0.60), metallic=0.02, roughness=0.58)
    red_banner = make_mat("Mat_SovietRed", color=(0.68, 0.10, 0.09), metallic=0.12, roughness=0.42)
    brass = make_mat("Mat_PropagandaBrass", color=(0.88, 0.68, 0.20), metallic=0.86, roughness=0.26)
    iron = make_mat("Mat_SteamPipe", color=(0.20, 0.21, 0.22), metallic=0.72, roughness=0.46)

    pb = PartBuilder("Commissary_Bench", parent=root)
    # Butcher block cutting board: top at Z = 0.0, width 2.85, depth 1.35
    pb.box(size=(2.85, 1.36, 0.12), offset=(0.0, 0.0, -0.06), bevel=0.018, mat=oak)
    # Recessed dark border strips & corner iron brackets
    pb.box(size=(2.68, 0.03, 0.012), offset=(0.0, -0.59, -0.002), mat=oak_dark)
    pb.box(size=(2.68, 0.03, 0.012), offset=(0.0, 0.59, -0.002), mat=oak_dark)
    for sx in (-1.38, 1.38):
        for sy in (-0.64, 0.64):
            pb.box(size=(0.12, 0.12, 0.13), offset=(sx, sy, -0.06), bevel=0.006, mat=iron)

    # Broad zinc & olive-steel commissary counter beneath cutting board (top at Z = -0.12)
    pb.box(size=(6.8, 2.8, 0.10), offset=(0.0, 0.25, -0.17), bevel=0.015, mat=counter_top)
    pb.box(size=(6.6, 2.6, 1.50), offset=(0.0, 0.28, -0.97), bevel=0.02, mat=counter)

    # Back institutional wall at Blender +Y = 1.55 (which exports to glTF Z = -1.55, behind the board!)
    pb.box(size=(8.4, 0.18, 1.45), offset=(0.0, 1.58, 0.52), mat=tile_low)
    pb.box(size=(8.4, 0.20, 0.09), offset=(0.0, 1.56, 1.26), mat=red_banner)
    pb.box(size=(8.4, 0.18, 2.40), offset=(0.0, 1.58, 2.48), mat=tile_high)

    # Wooden spice/radio shelf on back wall
    pb.box(size=(4.6, 0.42, 0.07), offset=(0.0, 1.32, 1.36), bevel=0.008, mat=oak_dark)
    for bx in (-1.9, 0.0, 1.9):
        pb.box(size=(0.08, 0.36, 0.22), offset=(bx, 1.40, 1.22), mat=iron)

    # Industrial steam pipe & red valve wheel on left backsplash
    pb.cylinder(radius1=0.055, radius2=0.055, depth=3.6, offset=(-2.85, 1.42, 1.1), mat=iron)
    pb.cylinder(radius1=0.042, radius2=0.042, depth=2.4, offset=(-1.6, 1.44, 2.15), local_rot=(0, math.pi / 2, 0), mat=iron)
    pb.torus(major_radius=0.15, minor_radius=0.022, offset=(-2.85, 1.32, 0.95), local_rot=(math.pi / 2, 0, 0), mat=red_banner)

    # Center Constructivist Red Banner Plaque + 5-Pointed Brass Soviet Star!
    pb.box(size=(1.75, 0.06, 0.68), offset=(0.0, 1.47, 2.02), bevel=0.012, mat=red_banner)
    pb.box(size=(1.83, 0.04, 0.74), offset=(0.0, 1.48, 2.02), bevel=0.01, mat=brass)
    pb.box(size=(1.69, 0.065, 0.62), offset=(0.0, 1.465, 2.02), mat=red_banner)
    # 5-pointed star built from 5 tapered diamond rays around (0, 1.42, 2.02)
    for si in range(5):
        ang = (si / 5) * math.tau
        pb.cylinder(
            radius1=0.078,
            radius2=0.008,
            depth=0.24,
            segments=4,
            offset=(math.sin(ang) * 0.11, 1.42, 2.02 + math.cos(ang) * 0.11),
            local_rot=(0, ang, 0),
            mat=brass,
            smooth=False,
        )
    pb.cylinder(radius1=0.085, radius2=0.06, depth=0.05, segments=10, offset=(0.0, 1.42, 2.02), local_rot=(math.pi / 2, 0, 0), mat=brass)
    pb.build()

    return export_glb(os.path.join(OUT_DIR, "kitchen-station.glb"))


def build_burlap_sack():
    """Overflowing Kolkhoz Burlap Potato Sack (`burlap-sack.glb`) on left side of counter."""
    reset_scene()
    root = make_empty("Sack_Root")
    jute = make_mat("Mat_CoarseJute", color=(0.58, 0.45, 0.28), metallic=0.0, roughness=0.94)
    rope = make_mat("Mat_HempTwine", color=(0.72, 0.60, 0.38), metallic=0.0, roughness=0.88)
    red = make_mat("Mat_StencilRed", color=(0.66, 0.11, 0.09), metallic=0.0, roughness=0.78)
    tuber = make_mat("Mat_RawTuber", color=(0.48, 0.32, 0.18), metallic=0.0, roughness=0.85)

    pb = PartBuilder("Sack_Body", parent=root)
    pb.sphere(radius=(0.48, 0.42, 0.44), offset=(0.0, 0.0, 0.36), mat=jute)
    pb.cylinder(radius1=0.38, radius2=0.29, depth=0.28, offset=(0.0, 0.0, 0.66), mat=jute)
    pb.torus(major_radius=0.31, minor_radius=0.028, offset=(0.0, 0.0, 0.72), mat=rope)
    # Rolled burlap collar
    pb.torus(major_radius=0.34, minor_radius=0.052, offset=(0.0, 0.0, 0.80), mat=jute)
    # Red star patch on front (-Y -> glTF +Z)
    pb.cylinder(radius1=0.13, radius2=0.13, depth=0.02, segments=5, offset=(0.04, -0.40, 0.42), local_rot=(math.pi / 2, 0, 0), mat=red)
    # Heap of raw potatoes spilling out top
    spots = [
        (-0.12, -0.06, 0.82, 0.15),
        (0.13, -0.04, 0.84, 0.14),
        (0.0, 0.11, 0.86, 0.15),
        (-0.04, -0.14, 0.78, 0.13),
        (0.08, 0.08, 0.91, 0.13),
    ]
    for px, py, pz, pr in spots:
        pb.sphere(radius=(pr * 1.25, pr * 0.92, pr * 0.88), offset=(px, py, pz), local_rot=(0.2, 0.3, px * 2), mat=tuber)
    pb.build()
    return export_glb(os.path.join(OUT_DIR, "burlap-sack.glb"))


def build_enamel_pot():
    """Soviet Seafoam Enamel Stockpot (`enamel-pot.glb`) on right side of counter."""
    reset_scene()
    root = make_empty("Pot_Root")
    enamel = make_mat("Mat_EnamelMint", color=(0.56, 0.74, 0.66), metallic=0.18, roughness=0.24)
    rim = make_mat("Mat_DarkRim", color=(0.12, 0.14, 0.15), metallic=0.35, roughness=0.32)
    inside = make_mat("Mat_CreamEnamel", color=(0.88, 0.86, 0.78), metallic=0.10, roughness=0.28)
    water = make_mat("Mat_StarchWater", color=(0.46, 0.66, 0.68), metallic=0.15, roughness=0.12)
    zinc = make_mat("Mat_ZincBucket", color=(0.55, 0.58, 0.60), metallic=0.78, roughness=0.38)
    peel_mat = make_mat("Mat_ScrapPeel", color=(0.46, 0.30, 0.16), metallic=0.0, roughness=0.86)

    pb = PartBuilder("Pot_Body", parent=root)
    # Outer pot wall & inner cavity look
    pb.cylinder(radius1=0.46, radius2=0.50, depth=0.56, segments=24, offset=(0.0, 0.0, 0.28), mat=enamel)
    pb.torus(major_radius=0.50, minor_radius=0.024, major_seg=24, offset=(0.0, 0.0, 0.56), mat=rim)
    pb.cylinder(radius1=0.45, radius2=0.45, depth=0.04, segments=24, offset=(0.0, 0.0, 0.44), mat=inside)
    # Loop handles
    pb.torus(major_radius=0.11, minor_radius=0.020, offset=(-0.52, 0.0, 0.44), local_rot=(0, 0.35, 0), mat=enamel)
    pb.torus(major_radius=0.11, minor_radius=0.020, offset=(0.52, 0.0, 0.44), local_rot=(0, -0.35, 0), mat=enamel)
    # Small galvanized peel-scrap pail tucked right beside the pot
    pb.cylinder(radius1=0.22, radius2=0.27, depth=0.34, segments=18, offset=(-0.46, -0.44, 0.17), mat=zinc)
    pb.torus(major_radius=0.27, minor_radius=0.014, major_seg=18, offset=(-0.46, -0.44, 0.34), mat=rim)
    pb.sphere(radius=(0.21, 0.21, 0.09), offset=(-0.46, -0.44, 0.31), mat=peel_mat)
    pb.build()

    ws = PartBuilder("Water_Surface", location=(0.0, 0.0, 0.465), parent=root)
    ws.cylinder(radius1=0.44, radius2=0.44, depth=0.015, segments=24, mat=water)
    ws.build()

    return export_glb(os.path.join(OUT_DIR, "enamel-pot.glb"))


def build_quota_scale():
    """
    Vintage Soviet GOST Mechanical Dial Scale + Brass Samovar (`quota-scale.glb`)
    with articulated `Scale_Needle` & `Scale_Pan`!
    """
    reset_scene()
    root = make_empty("Scale_Root")
    body_red = make_mat("Mat_ScaleCrimson", color=(0.68, 0.12, 0.10), metallic=0.28, roughness=0.34)
    dial_face = make_mat("Mat_DialCream", color=(0.94, 0.90, 0.78), metallic=0.02, roughness=0.38)
    brass = make_mat("Mat_SamovarBrass", color=(0.86, 0.68, 0.24), metallic=0.90, roughness=0.20)
    dark = make_mat("Mat_DialInk", color=(0.12, 0.12, 0.13), metallic=0.2, roughness=0.5)

    pb = PartBuilder("Scale_Base", parent=root)
    pb.box(size=(0.38, 0.30, 0.34), offset=(0.0, 0.0, 0.17), bevel=0.022, mat=body_red, taper_top=(0.82, 0.82))
    # Circular dial face on front (-Y -> glTF +Z)
    pb.cylinder(radius1=0.145, radius2=0.145, depth=0.03, segments=24, offset=(0.0, -0.145, 0.20), local_rot=(math.pi / 2, 0, 0), mat=brass)
    pb.cylinder(radius1=0.128, radius2=0.128, depth=0.034, segments=24, offset=(0.0, -0.148, 0.20), local_rot=(math.pi / 2, 0, 0), mat=dial_face)
    for ti in range(9):
        ang = -2.1 + (ti / 8) * 4.2
        pb.box(
            size=(0.010, 0.01, 0.026),
            offset=(math.sin(ang) * 0.102, -0.167, 0.20 + math.cos(ang) * 0.102),
            local_rot=(0, ang, 0),
            mat=dark,
        )
    pb.build()

    pan = PartBuilder("Scale_Pan", location=(0.0, 0.0, 0.37), parent=root)
    pan.cylinder(radius1=0.04, radius2=0.04, depth=0.07, offset=(0.0, 0.0, -0.02), mat=brass)
    pan.cylinder(radius1=0.18, radius2=0.24, depth=0.055, segments=20, offset=(0.0, 0.0, 0.03), mat=brass)
    pan.build()

    needle = PartBuilder("Scale_Needle", location=(0.0, -0.172, 0.20), parent=root)
    needle.cylinder(radius1=0.018, radius2=0.018, depth=0.02, local_rot=(math.pi / 2, 0, 0), mat=dark)
    needle.box(size=(0.012, 0.012, 0.105), offset=(0.0, -0.004, 0.045), mat=body_red)
    needle.build()

    return export_glb(os.path.join(OUT_DIR, "quota-scale.glb"))


def build_samovar():
    """Gleaming Soviet Brass Samovar + Mayak Kitchen Radio (`samovar-prop.glb`) for the back shelf."""
    reset_scene()
    root = make_empty("Samovar_Root")
    brass = make_mat("Mat_PolishedBrass", color=(0.88, 0.69, 0.24), metallic=0.92, roughness=0.18)
    wood = make_mat("Mat_RadioVeneer", color=(0.38, 0.21, 0.11), metallic=0.04, roughness=0.48)
    grille = make_mat("Mat_RadioCloth", color=(0.78, 0.72, 0.56), metallic=0.05, roughness=0.76)
    dial_glow = make_mat(
        "Mat_RadioDial",
        color=(1.0, 0.78, 0.32),
        metallic=0.0,
        roughness=0.2,
        emission=(1.0, 0.72, 0.24),
        emission_strength=2.4,
    )

    pb = PartBuilder("Samovar_Urn", parent=root)
    pb.box(size=(0.24, 0.24, 0.05), offset=(-0.38, 0.0, 0.025), bevel=0.006, mat=brass)
    pb.cylinder(radius1=0.08, radius2=0.14, depth=0.16, offset=(-0.38, 0.0, 0.13), mat=brass)
    pb.sphere(radius=(0.18, 0.18, 0.22), offset=(-0.38, 0.0, 0.36), mat=brass)
    pb.cylinder(radius1=0.12, radius2=0.15, depth=0.14, offset=(-0.38, 0.0, 0.58), mat=brass)
    pb.cylinder(radius1=0.045, radius2=0.055, depth=0.16, offset=(-0.38, 0.0, 0.72), mat=brass)
    pb.torus(major_radius=0.075, minor_radius=0.015, offset=(-0.58, 0.0, 0.42), local_rot=(0, 0.4, 0), mat=wood)
    pb.torus(major_radius=0.075, minor_radius=0.015, offset=(-0.18, 0.0, 0.42), local_rot=(0, -0.4, 0), mat=wood)
    pb.cylinder(radius1=0.018, radius2=0.014, depth=0.09, offset=(-0.38, -0.19, 0.26), local_rot=(math.pi / 2, 0, 0), mat=brass)
    pb.build()

    radio = PartBuilder("Mayak_Radio", location=(0.42, 0.0, 0.16), parent=root)
    radio.box(size=(0.46, 0.20, 0.30), bevel=0.014, mat=wood)
    radio.box(size=(0.26, 0.02, 0.21), offset=(-0.06, -0.098, 0.01), mat=grille)
    radio.box(size=(0.12, 0.02, 0.11), offset=(0.14, -0.098, 0.05), mat=dial_glow)
    radio.cylinder(radius1=0.024, radius2=0.024, depth=0.03, offset=(0.11, -0.105, -0.06), local_rot=(math.pi / 2, 0, 0), mat=brass)
    radio.cylinder(radius1=0.024, radius2=0.024, depth=0.03, offset=(0.17, -0.105, -0.06), local_rot=(math.pi / 2, 0, 0), mat=brass)
    radio.cylinder(radius1=0.006, radius2=0.004, depth=0.38, offset=(0.18, 0.04, 0.31), local_rot=(0, 0.28, 0), mat=brass)
    radio.build()

    return export_glb(os.path.join(OUT_DIR, "samovar-prop.glb"))


def build_tea_glass():
    """
    Soviet Podstakannik Tea Glass (`tea-glass.glb`) with stamped brass filigree cup holder,
    faceted crystal glass, dynamic `Tea_Liquid` + lemon slice, and articulated `Tea_Spoon`.
    """
    reset_scene()
    root = make_empty("Tea_Root")
    brass = make_mat("Mat_PodstakannikBrass", color=(0.88, 0.68, 0.22), metallic=0.92, roughness=0.20)
    crimson = make_mat("Mat_StarCrest", color=(0.74, 0.11, 0.10), metallic=0.18, roughness=0.34)
    glass = make_mat("Mat_CrystalGlass", color=(0.86, 0.92, 0.94), metallic=0.05, roughness=0.10)
    tea = make_mat(
        "Mat_TeaLiquid",
        color=(0.76, 0.24, 0.05),
        metallic=0.08,
        roughness=0.14,
        emission=(0.85, 0.32, 0.04),
        emission_strength=0.45,
    )
    lemon = make_mat("Mat_LemonSlice", color=(0.98, 0.86, 0.18), metallic=0.0, roughness=0.36)
    silver = make_mat("Mat_SilverSpoon", color=(0.86, 0.88, 0.90), metallic=0.94, roughness=0.16)

    holder = PartBuilder("Cup_Holder", parent=root)
    # Saucer & base skirt
    holder.cylinder(radius1=0.16, radius2=0.20, depth=0.022, segments=24, offset=(0.0, 0.0, 0.011), mat=brass)
    holder.cylinder(radius1=0.105, radius2=0.112, depth=0.16, segments=20, offset=(0.0, 0.0, 0.095), mat=brass)
    holder.torus(major_radius=0.112, minor_radius=0.010, major_seg=20, offset=(0.0, 0.0, 0.175), mat=brass)
    holder.torus(major_radius=0.106, minor_radius=0.010, major_seg=20, offset=(0.0, 0.0, 0.025), mat=brass)
    # Ornate curved loop handle on right (+X)
    holder.torus(major_radius=0.072, minor_radius=0.013, major_seg=18, offset=(0.135, 0.0, 0.105), local_rot=(math.pi / 2, 0, 0), mat=brass)
    # Red star medallion embossed on front (-Y -> glTF +Z)
    holder.cylinder(radius1=0.042, radius2=0.042, depth=0.016, segments=5, offset=(0.0, -0.108, 0.105), local_rot=(math.pi / 2, 0, 0), mat=crimson)
    # Faceted tall tea glass rising out of holder
    holder.cylinder(radius1=0.096, radius2=0.102, depth=0.25, segments=12, offset=(0.0, 0.0, 0.145), mat=glass)
    holder.torus(major_radius=0.101, minor_radius=0.006, major_seg=16, offset=(0.0, 0.0, 0.27), mat=glass)
    holder.build()

    liq = PartBuilder("Tea_Liquid", location=(0.0, 0.0, 0.13), parent=root)
    liq.cylinder(radius1=0.090, radius2=0.094, depth=0.19, segments=16, offset=(0.0, 0.0, 0.0), mat=tea)
    liq.cylinder(radius1=0.048, radius2=0.048, depth=0.012, segments=14, offset=(-0.025, -0.02, 0.096), local_rot=(0.22, -0.18, 0.0), mat=lemon)
    liq.build()

    spoon = PartBuilder("Tea_Spoon", location=(0.02, 0.01, 0.22), parent=root)
    spoon.cylinder(radius1=0.006, radius2=0.008, depth=0.22, segments=10, offset=(0.02, 0.0, 0.03), local_rot=(0.0, 0.28, 0.0), mat=silver)
    spoon.sphere(radius=(0.022, 0.015, 0.008), offset=(-0.01, 0.0, -0.06), mat=silver)
    spoon.build()

    return export_glb(os.path.join(OUT_DIR, "tea-glass.glb"))


def build_beetle_pest():
    """
    Colorado Potato Beetle (`beetle-pest.glb` — Колорадский Жук):
    Cream-yellow domed elytra with black longitudinal stripes, orange-spotted pronotum,
    and articulated scuttling `Legs_Left` / `Legs_Right`.
    """
    reset_scene()
    root = make_empty("Beetle_Root")
    shell_yel = make_mat("Mat_BeetleYellow", color=(0.95, 0.78, 0.18), metallic=0.08, roughness=0.26)
    stripe_blk = make_mat("Mat_BeetleBlack", color=(0.08, 0.07, 0.07), metallic=0.12, roughness=0.30)
    thorax_org = make_mat("Mat_BeetleOrange", color=(0.88, 0.42, 0.08), metallic=0.06, roughness=0.34)

    body = PartBuilder("Beetle_Body", parent=root)
    # Domed oval elytra along Y (-Y forward -> glTF +Z forward)
    body.sphere(radius=(0.095, 0.125, 0.075), offset=(0.0, 0.02, 0.068), mat=shell_yel)
    # Longitudinal black stripes across the back
    for sx in (-0.062, -0.030, 0.0, 0.030, 0.062):
        z_arch = 0.078 + math.sqrt(max(0.0, 1.0 - (sx / 0.095) ** 2)) * 0.048
        body.box(size=(0.011, 0.19, 0.022), offset=(sx, 0.02, z_arch - 0.01), bevel=0.003, mat=stripe_blk)
    # Orange pronotum + head at front (-Y)
    body.sphere(radius=(0.068, 0.048, 0.050), offset=(0.0, -0.10, 0.058), mat=thorax_org)
    body.sphere(radius=(0.042, 0.036, 0.034), offset=(0.0, -0.142, 0.046), mat=stripe_blk)
    # Cute/menacing antennae
    body.cylinder(radius1=0.005, radius2=0.003, depth=0.075, offset=(-0.028, -0.175, 0.068), local_rot=(0.85, 0.0, 0.45), mat=stripe_blk)
    body.cylinder(radius1=0.005, radius2=0.003, depth=0.075, offset=(0.028, -0.175, 0.068), local_rot=(0.85, 0.0, -0.45), mat=stripe_blk)
    body.build()

    legs_l = PartBuilder("Legs_Left", location=(-0.075, -0.01, 0.042), parent=root)
    for ly in (-0.065, 0.0, 0.065):
        legs_l.cylinder(radius1=0.007, radius2=0.004, depth=0.085, offset=(-0.028, ly, -0.012), local_rot=(0.0, -0.95, 0.0), mat=stripe_blk)
    legs_l.build()

    legs_r = PartBuilder("Legs_Right", location=(0.075, -0.01, 0.042), parent=root)
    for ly in (-0.065, 0.0, 0.065):
        legs_r.cylinder(radius1=0.007, radius2=0.004, depth=0.085, offset=(0.028, ly, -0.012), local_rot=(0.0, 0.95, 0.0), mat=stripe_blk)
    legs_r.build()

    return export_glb(os.path.join(OUT_DIR, "beetle-pest.glb"))


def build_commissar_bell():
    """
    Brass Commissary Service Bell (`commissar-bell.glb`) to summon Boss Tsar-Kartoshka on demand!
    Articulated `Bell_Dome` and `Bell_Plunger`.
    """
    reset_scene()
    root = make_empty("Bell_Root")
    iron = make_mat("Mat_BellIron", color=(0.14, 0.15, 0.15), metallic=0.65, roughness=0.45)
    brass = make_mat("Mat_BellBrass", color=(0.92, 0.72, 0.22), metallic=0.94, roughness=0.16)
    red = make_mat("Mat_BellCrimson", color=(0.76, 0.12, 0.10), metallic=0.22, roughness=0.34)

    base = PartBuilder("Bell_Base", parent=root)
    base.cylinder(radius1=0.165, radius2=0.145, depth=0.032, segments=24, offset=(0.0, 0.0, 0.016), mat=iron)
    base.torus(major_radius=0.148, minor_radius=0.008, major_seg=24, offset=(0.0, 0.0, 0.032), mat=red)
    base.cylinder(radius1=0.018, radius2=0.018, depth=0.16, segments=12, offset=(0.0, 0.0, 0.10), mat=iron)
    base.build()

    dome = PartBuilder("Bell_Dome", location=(0.0, 0.0, 0.095), parent=root)
    dome.sphere(radius=(0.135, 0.135, 0.095), offset=(0.0, 0.0, 0.01), mat=brass)
    dome.torus(major_radius=0.132, minor_radius=0.010, major_seg=24, offset=(0.0, 0.0, -0.032), mat=brass)
    dome.build()

    plunger = PartBuilder("Bell_Plunger", location=(0.0, 0.0, 0.215), parent=root)
    plunger.cylinder(radius1=0.010, radius2=0.010, depth=0.045, segments=12, offset=(0.0, 0.0, -0.015), mat=brass)
    plunger.cylinder(radius1=0.032, radius2=0.036, depth=0.018, segments=16, offset=(0.0, 0.0, 0.012), mat=red)
    plunger.build()

    return export_glb(os.path.join(OUT_DIR, "commissar-bell.glb"))


def build_tsar_crown():
    """
    VDNKh Gold Prize Star & Wheat Wreath Crown (`tsar-crown.glb`) perched atop Boss Tsar-Kartoshka!
    """
    reset_scene()
    root = make_empty("Crown_Root")
    gold = make_mat(
        "Mat_CrownGold",
        color=(0.98, 0.78, 0.16),
        metallic=0.95,
        roughness=0.15,
        emission=(0.85, 0.55, 0.05),
        emission_strength=0.45,
    )
    ruby = make_mat(
        "Mat_CrownRuby",
        color=(0.86, 0.08, 0.12),
        metallic=0.25,
        roughness=0.18,
        emission=(0.95, 0.10, 0.14),
        emission_strength=0.85,
    )

    pb = PartBuilder("Crown_Body", parent=root)
    pb.torus(major_radius=0.115, minor_radius=0.018, major_seg=20, offset=(0.0, 0.0, 0.022), mat=gold)
    for i in range(8):
        ang = (i / 8.0) * math.tau
        px = math.cos(ang) * 0.112
        py = math.sin(ang) * 0.112
        pb.cylinder(
            radius1=0.018,
            radius2=0.003,
            depth=0.075,
            segments=6,
            offset=(px, py, 0.068),
            local_rot=(0.0, 0.0, ang),
            mat=gold if i % 2 == 0 else ruby,
        )
    # Upright Red Star crest in center
    pb.cylinder(
        radius1=0.055,
        radius2=0.055,
        depth=0.022,
        segments=5,
        offset=(0.0, 0.0, 0.105),
        local_rot=(math.pi / 2, 0.0, 0.0),
        mat=ruby,
    )
    pb.build()

    return export_glb(os.path.join(OUT_DIR, "tsar-crown.glb"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    builders = [
        ("potato-whole.glb", build_potato_whole),
        ("peel-curl.glb", build_peel_curl),
        ("peeler-knife.glb", build_peeler_knife),
        ("peeler-swivel.glb", build_peeler_swivel),
        ("peeler-double.glb", build_peeler_double),
        ("peeler-crank.glb", build_peeler_crank),
        ("peeler-rotary.glb", build_peeler_rotary),
        ("peeler-laser.glb", build_peeler_laser),
        ("kitchen-station.glb", build_kitchen_station),
        ("burlap-sack.glb", build_burlap_sack),
        ("enamel-pot.glb", build_enamel_pot),
        ("quota-scale.glb", build_quota_scale),
        ("samovar-prop.glb", build_samovar),
        ("tea-glass.glb", build_tea_glass),
        ("beetle-pest.glb", build_beetle_pest),
        ("commissar-bell.glb", build_commissar_bell),
        ("tsar-crown.glb", build_tsar_crown),
    ]
    total_bytes = 0
    for filename, fn in builders:
        info = fn()
        total_bytes += info["bytes"]
        print(f"OK {filename:22s} | {info['bytes']:7d} B | nodes={info['nodes']}")
    print(f"Generated {len(builders)} Blender 5.2 GLB models ({total_bytes / 1024:.1f} KB total)")


if __name__ == "__main__":
    main()
