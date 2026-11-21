"""
Generate 3D PBR .glb assets for the SoftN 'Voice Simulator' app using Blender 5.2:
  1. mouth-avatar.glb      — High-resolution Concentric-Loop 3D Human Mouth & Complete Oral Cavity Rig:
                               - Concentric orbicularis-oris topology (144 radial x 46 profile rings = 6,624 quads)
                                 focused 100% on realistic human lips & inner oral mucosa (no head/mic clutter!)
                               - Sculpted Cupid's bow, philtral notch, superior labial tubercle (M-wave stomion),
                                 bilobed lower vermilion pillow, commissure hooding, 3D horseshoe dental-arch wrap
                               - True glTF-native PNG Albedo + Roughness + Tangent-Space Normal Map textures
                                 (fine organic vertical vermilion sulci, satin white-roll, wet glossy inner mucosa,
                                 velvety dark pharynx interior)
                               - 12 Articulatory Morph Targets on Mouth_Lips:
                                 Jaw_Open, Lip_Close, Lip_Round, Lip_Spread, Lip_Dental, Upper_Lip_Raise,
                                 Lower_Lip_Depress, Corner_Up, Corner_Down, Cheek_Puff, Feminine_Mouth,
                                 Asymmetry_Natural
                               - Complete Smooth Internal Oral Anatomy:
                                 Upper_Teeth (12 sculpted incisors/canines/premolars/molars + smooth continuous
                                              scalloped gingiva arch + hard palate vault with palatal rugae)
                                 Velum_Uvula (soft palate arch + tonsillar pillars + articulated teardrop uvula)
                                 Jaw_Pivot (exact TMJ hinge matching Jaw_Open morph!)
                                   -> Lower_Teeth (12 sculpted lower teeth + smooth mandibular gingiva + floor)
                                   -> Lingual_Frenulum
                                   -> Tongue_Root -> Tongue_Body (median sulcus + papillae normal map)
                                      -> Tongue_Blade -> Tongue_Tip
  2. vocal-anatomy-rig.glb — Optional Sagittal Cutaway Human Vocal-Tract X-Ray Rig.
"""

import math
import os
import sys
import tempfile
import bmesh
import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
if ASSETS_ROOT not in sys.path:
    sys.path.insert(0, ASSETS_ROOT)

from blender_pbr_lib import PartBuilder, make_empty, make_mat, reset_scene  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUT_DIR = os.path.join(
    REPO_ROOT, "bundles", "games", "VoiceSimulator", "assets", "models"
)
TMP_TEX_DIR = os.path.join(tempfile.gettempdir(), "softn_voicesim_tex")


def export_glb_ext(filepath: str, export_morph: bool = False) -> int:
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        export_yup=True,
        export_apply=not export_morph,
        export_normals=True,
        export_materials="EXPORT",
        export_morph=export_morph,
        export_morph_normal=export_morph,
        export_morph_tangent=False,
        export_lights=False,
        export_cameras=False,
    )
    size = os.path.getsize(filepath)
    print(f"  Exported {os.path.basename(filepath)} ({size:,} bytes)")
    return size


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 == edge0:
        return 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def save_and_pack_image(name: str, w: int, h: int, flat_rgba, non_color: bool = False) -> bpy.types.Image:
    """
    Save generated RGBA float buffer to a clean 8-bit PNG on disk, reload, and pack into .blend
    so Blender 5.2's glTF 2.0 exporter embeds clean, uncorrupted PNG textures.
    """
    os.makedirs(TMP_TEX_DIR, exist_ok=True)
    png_path = os.path.join(TMP_TEX_DIR, f"{name}.png")
    tmp_img = bpy.data.images.new(f"_{name}_tmp", width=w, height=h, alpha=False, float_buffer=False)
    tmp_img.pixels.foreach_set(flat_rgba)
    tmp_img.filepath_raw = png_path
    tmp_img.file_format = "PNG"
    tmp_img.save()
    bpy.data.images.remove(tmp_img)

    loaded = bpy.data.images.load(png_path)
    loaded.name = name
    if non_color:
        loaded.colorspace_settings.name = "Non-Color"
    loaded.pack()
    return loaded


def height_grid_to_normal_rgba(w: int, h: int, height_grid, strength: float = 2.2):
    """Convert a 2D height grid [py][px] in [0, 1] into a tangent-space normal map RGBA list."""
    out = [0.0] * (w * h * 4)
    for py in range(h):
        py_prev = max(0, py - 1)
        py_next = min(h - 1, py + 1)
        for px in range(w):
            px_prev = (px - 1) % w
            px_next = (px + 1) % w
            dh_du = (height_grid[py][px_next] - height_grid[py][px_prev]) * strength
            dh_dv = (height_grid[py_next][px] - height_grid[py_prev][px]) * strength
            nx = -dh_du
            ny = -dh_dv
            nz = 1.0
            inv_len = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            idx = (py * w + px) * 4
            out[idx] = nx * inv_len * 0.5 + 0.5
            out[idx + 1] = ny * inv_len * 0.5 + 0.5
            out[idx + 2] = nz * inv_len * 0.5 + 0.5
            out[idx + 3] = 1.0
    return out


# ---------------------------------------------------------------------------
# Procedural glTF-Native PBR Textures for Lips, Mucosa & Tongue Papillae
# ---------------------------------------------------------------------------

def create_lip_pbr_material() -> bpy.types.Material:
    """
    UV-mapped PBR material (`Mat_Lips`) with glTF-native PNG Albedo, Roughness, and Normal Map:
      u in [0, 1]: radial angle around mouth loop
      v in [0, 1]: concentric ring index (outer back shell -> vermilion border -> dry vermilion
                   -> stomion -> wet glossy inner mucosa -> deep dark pharynx cavity)
    """
    w, h = 512, 256
    alb_px = [0.0] * (w * h * 4)
    rgh_px = [0.0] * (w * h * 4)
    h_grid = [[0.5] * w for _ in range(h)]

    for py in range(h):
        vf = py / (h - 1)
        w_outer_lip = smoothstep(0.225, 0.270, vf)
        w_white_roll = math.exp(-(((vf - 0.260) / 0.020) ** 2))
        w_dry_verm = smoothstep(0.265, 0.34, vf) * (1.0 - smoothstep(0.53, 0.63, vf))
        w_wet_mucosa = smoothstep(0.55, 0.64, vf) * (1.0 - smoothstep(0.78, 0.89, vf))
        w_deep_throat = smoothstep(0.75, 0.94, vf)

        for px in range(w):
            uf = px / (w - 1)
            theta = uf * 2.0 * math.pi
            cx = math.cos(theta)
            sy = math.sin(theta)
            corner_fade = max(0.0, 1.0 - (abs(cx) ** 2.4))

            # Organic vertical vermilion sulci (delicate natural lip lines)
            s1 = math.sin(cx * 54.0 + 0.40 * math.sin(cx * 15.0 + sy * 1.8))
            s2 = math.sin(cx * 112.0 + 0.65 * math.cos(cx * 29.0 - sy * 1.4))
            s3 = math.sin(cx * 198.0 + sy * 3.5)
            sulci = (0.50 * s1 + 0.34 * s2 + 0.16 * s3) * w_dry_verm * corner_fade
            groove_dip = max(0.0, -sulci)

            # Dark matte studio capsule behind lip silhouette
            cr, cg, cb = 0.055, 0.062, 0.088

            # Warm lifelike rose-coral-terracotta vermilion
            lip_r = 0.745 + 0.048 * w_white_roll - 0.048 * groove_dip
            lip_g = 0.328 + 0.058 * w_white_roll - 0.042 * groove_dip
            lip_b = 0.348 + 0.052 * w_white_roll - 0.036 * groove_dip

            # Deeper moist crimson-rose on wet inner labial mucosa
            wet_r, wet_g, wet_b = 0.635, 0.188, 0.238
            lip_r = lip_r * (1.0 - 0.68 * w_wet_mucosa) + wet_r * (0.68 * w_wet_mucosa)
            lip_g = lip_g * (1.0 - 0.68 * w_wet_mucosa) + wet_g * (0.68 * w_wet_mucosa)
            lip_b = lip_b * (1.0 - 0.68 * w_wet_mucosa) + wet_b * (0.68 * w_wet_mucosa)

            # Subtle commissure corner pocket shading
            corner_pocket = (abs(cx) ** 3.8) * smoothstep(0.34, 0.60, vf) * (1.0 - w_deep_throat)
            lip_r *= 1.0 - 0.22 * corner_pocket
            lip_g *= 1.0 - 0.26 * corner_pocket
            lip_b *= 1.0 - 0.22 * corner_pocket

            # Smooth transition into deep dark oral/pharynx cavity
            thr_r, thr_g, thr_b = 0.070, 0.014, 0.022
            lip_r = lip_r * (1.0 - w_deep_throat) + thr_r * w_deep_throat
            lip_g = lip_g * (1.0 - w_deep_throat) + thr_g * w_deep_throat
            lip_b = lip_b * (1.0 - w_deep_throat) + thr_b * w_deep_throat

            r_out = cr * (1.0 - w_outer_lip) + lip_r * w_outer_lip
            g_out = cg * (1.0 - w_outer_lip) + lip_g * w_outer_lip
            b_out = cb * (1.0 - w_outer_lip) + lip_b * w_outer_lip

            # Roughness: satin dry vermilion (0.29) -> glossy wet inner lip (0.10) -> dark throat (0.58)
            rgh_lip = 0.295 + 0.055 * groove_dip - 0.025 * w_white_roll
            rgh_lip = rgh_lip * (1.0 - w_wet_mucosa) + 0.100 * w_wet_mucosa
            rgh_lip = rgh_lip * (1.0 - w_deep_throat) + 0.58 * w_deep_throat
            rgh_val = 0.68 * (1.0 - w_outer_lip) + rgh_lip * w_outer_lip

            h_grid[py][px] = 0.5 + 0.16 * sulci + 0.08 * w_white_roll * corner_fade

            idx = (py * w + px) * 4
            alb_px[idx : idx + 4] = [max(0.0, min(1.0, r_out)), max(0.0, min(1.0, g_out)), max(0.0, min(1.0, b_out)), 1.0]
            rgh_px[idx : idx + 4] = [rgh_val, rgh_val, rgh_val, 1.0]

    nrm_px = height_grid_to_normal_rgba(w, h, h_grid, strength=1.8)

    albedo_img = save_and_pack_image("LipAlbedo", w, h, alb_px, non_color=False)
    rough_img = save_and_pack_image("LipRoughness", w, h, rgh_px, non_color=True)
    normal_img = save_and_pack_image("LipNormal", w, h, nrm_px, non_color=True)

    mat = bpy.data.materials.new(name="Mat_Lips")
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.38
        bsdf.inputs["Coat Roughness"].default_value = 0.14
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.20

    tex_alb = nt.nodes.new("ShaderNodeTexImage")
    tex_alb.image = albedo_img
    nt.links.new(tex_alb.outputs["Color"], bsdf.inputs["Base Color"])

    tex_rgh = nt.nodes.new("ShaderNodeTexImage")
    tex_rgh.image = rough_img
    nt.links.new(tex_rgh.outputs["Color"], bsdf.inputs["Roughness"])

    tex_nrm = nt.nodes.new("ShaderNodeTexImage")
    tex_nrm.image = normal_img
    nrm_node = nt.nodes.new("ShaderNodeNormalMap")
    nrm_node.inputs["Strength"].default_value = 0.55
    nt.links.new(tex_nrm.outputs["Color"], nrm_node.inputs["Color"])
    nt.links.new(nrm_node.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def create_tongue_pbr_material() -> bpy.types.Material:
    """Velvety papillary dorsal tongue surface with glTF-native Albedo & Normal Map."""
    w, h = 256, 256
    px_c = [0.0] * (w * h * 4)
    h_grid = [[0.5] * w for _ in range(h)]

    for py in range(h):
        vf = py / (h - 1)
        for px in range(w):
            uf = px / (w - 1)
            n1 = math.sin(uf * 92.0 + math.cos(vf * 81.0) * 1.7)
            n2 = math.cos(vf * 106.0 - math.sin(uf * 74.0) * 1.5)
            pap = 0.5 * (n1 * n2)
            sulcus = math.exp(-(((uf - 0.5) / 0.06) ** 2))
            r = 0.79 - 0.065 * sulcus + 0.030 * pap
            g = 0.32 - 0.050 * sulcus + 0.022 * pap
            b = 0.38 - 0.040 * sulcus + 0.022 * pap
            idx = (py * w + px) * 4
            px_c[idx : idx + 4] = [r, g, b, 1.0]
            h_grid[py][px] = 0.5 + 0.14 * pap - 0.12 * sulcus

    nrm_px = height_grid_to_normal_rgba(w, h, h_grid, strength=1.5)
    img = save_and_pack_image("TongueAlbedo", w, h, px_c, non_color=False)
    nrm = save_and_pack_image("TongueNormal", w, h, nrm_px, non_color=True)

    mat = bpy.data.materials.new(name="Mat_Tongue")
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.25
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.62
        bsdf.inputs["Coat Roughness"].default_value = 0.12
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.28

    tex_c = nt.nodes.new("ShaderNodeTexImage")
    tex_c.image = img
    nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])

    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = nrm
    nrm_node = nt.nodes.new("ShaderNodeNormalMap")
    nrm_node.inputs["Strength"].default_value = 0.45
    nt.links.new(tex_n.outputs["Color"], nrm_node.inputs["Color"])
    nt.links.new(nrm_node.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ---------------------------------------------------------------------------
# Smooth Continuous Gingiva Arch + Anatomically Contoured Teeth
# ---------------------------------------------------------------------------

def build_smooth_gingiva_arch(
    name: str,
    is_upper: bool,
    arch_rx: float,
    arch_y0: float,
    arch_depth: float,
    tooth_angles,
    mat: bpy.types.Material,
    parent_obj,
):
    """
    Build a seamless, continuous wet-pink horseshoe gingiva (gum) ridge with smooth scalloped
    gingival collars around every tooth position — zero beaded seams!
    """
    bm = bmesh.new()
    n_u = 72  # along horseshoe arch (-1.34 .. +1.34 rad)
    n_v = 20  # cross-sectional wrap from labial vestibule -> scalloped tooth margin -> lingual palate/floor
    sign_z = 1.0 if is_upper else -1.0

    grid = []
    for iu in range(n_u):
        ut = -1.0 + (2.0 * iu) / (n_u - 1)
        ang = ut * 1.34
        end_taper = 1.0 - 0.30 * (abs(ut) ** 3.0)

        # Scallop wave: dips toward tooth root over each tooth center, rises into interdental papilla between teeth!
        scallop = 0.0
        for tang in tooth_angles:
            scallop += math.exp(-(((abs(ang) - tang) / 0.078) ** 2))
        scallop = min(1.0, scallop)  # 1 at tooth center, 0 at interdental papilla

        cx_a = math.sin(ang) * arch_rx
        cy_a = arch_y0 + (1.0 - math.cos(ang)) * arch_depth

        # Radial outward vector in XY plane of arch
        nx_a = math.sin(ang)
        ny_a = -math.cos(ang)

        row = []
        for iv in range(n_v):
            phi = (math.pi * iv) / (n_v - 1)  # 0 = labial base, pi/2 = tooth-neck crest, pi = lingual base
            # Cross-section thickness & height
            rad_thick = 0.0175 * math.cos(phi) * end_taper
            # Crest reaches near tooth cervical margin; recedes over tooth center to form natural crescent collar!
            z_base = sign_z * 0.056
            z_crest = sign_z * (0.011 + 0.016 * scallop)
            # Interpolate between base (phi=0, pi) and scalloped tooth collar crest (phi=pi/2)
            crest_w = math.sin(phi) ** 0.85
            pz = z_base * (1.0 - crest_w) + z_crest * crest_w
            px = cx_a + nx_a * rad_thick
            py = cy_a + ny_a * rad_thick
            row.append(bm.verts.new((px, py, pz)))
        grid.append(row)

    for iu in range(n_u - 1):
        for iv in range(n_v - 1):
            v00 = grid[iu][iv]
            v01 = grid[iu][iv + 1]
            v11 = grid[iu + 1][iv + 1]
            v10 = grid[iu + 1][iv]
            f = bm.faces.new((v00, v01, v11, v10))
            f.smooth = True

    # Cap ends cleanly
    for end_row, rev in [(grid[0], True), (grid[-1], False)]:
        pts = list(reversed(end_row)) if rev else end_row
        f = bm.faces.new(pts)
        f.smooth = True

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent_obj
    return obj


def build_sculpted_tooth_mesh(
    name: str,
    width: float,
    thickness: float,
    crown_h: float,
    tooth_kind: str,
    is_upper: bool,
    mat: bpy.types.Material,
) -> bpy.types.Mesh:
    """
    Smooth, anatomically contoured tooth crown whose cervical root tucks cleanly INSIDE
    the scalloped gingiva arch (zero exposed root tips!).
    """
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=0.5)

    for v in bm.verts:
        # Map sphere coords in [-0.5, +0.5] into smooth rounded tooth crown!
        nx = v.co.x * 2.0  # -1..+1 mesial-distal
        ny = v.co.y * 2.0  # -1 (labial) .. +1 (lingual)
        nz = v.co.z * 2.0  # -1..+1 vertical

        # Squarish-rounded crown profile (superellipse blend) so incisors have crisp-yet-smooth flat faces!
        sx = math.copysign(abs(nx) ** 0.68, nx)
        sy = math.copysign(abs(ny) ** 0.75, ny)

        t_bite = (0.5 - v.co.z) if is_upper else (0.5 + v.co.z)
        t_bite = max(0.0, min(1.0, t_bite))

        # Taper gently at cervical neck (t_bite=0) so root tucks inside gingiva!
        w_scale = 0.72 + 0.30 * (t_bite ** 0.55) - 0.06 * (t_bite ** 3.0)

        if tooth_kind == "incisor":
            thick_scale = 0.96 * (1.0 - 0.62 * (t_bite ** 1.4)) + 0.18
            # Flatter chisel biting edge
            sz = math.copysign(abs(nz) ** 0.62, nz)
            edge_round = 0.05 * (nx ** 4) * t_bite
            pz = (sz * 0.5 + (0.04 if is_upper else -0.04) * edge_round) * crown_h
        elif tooth_kind == "canine":
            thick_scale = 1.04 * (1.0 - 0.52 * (t_bite ** 1.35)) + 0.22
            w_scale *= 1.0 - 0.22 * (t_bite ** 2.2)
            cusp_pull = 0.16 * (1.0 - abs(nx)) * (t_bite ** 1.6)
            sz = math.copysign(abs(nz) ** 0.72, nz)
            pz = (sz * 0.5 + (-cusp_pull if is_upper else cusp_pull) * 0.5) * crown_h
        elif tooth_kind == "premolar":
            thick_scale = 0.98 - 0.18 * (t_bite ** 1.6)
            sz = math.copysign(abs(nz) ** 0.68, nz)
            pz = sz * 0.5 * crown_h
        else:
            thick_scale = 1.0 - 0.12 * (t_bite ** 1.8)
            sz = math.copysign(abs(nz) ** 0.64, nz)
            pz = sz * 0.5 * crown_h

        labial_bow = -0.07 * (1.0 - nx * nx) * math.sin(t_bite * math.pi)
        px = (sx * 0.5) * width * w_scale
        py = ((sy * 0.5) * thickness * thick_scale) + labial_bow * thickness
        v.co = Vector((px, py, pz))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
        f.material_index = 0

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return mesh


# ---------------------------------------------------------------------------
# 1. Hero Concentric-Loop 3D Human Mouth & Complete Oral Cavity (mouth-avatar.glb)
# ---------------------------------------------------------------------------

def build_mouth_avatar() -> int:
    reset_scene()

    mat_lips = create_lip_pbr_material()
    mat_tongue = create_tongue_pbr_material()

    def make_oral_mat(name, color, roughness, coat=0.0, subsurface=0.0):
        m = make_mat(name, color=color, metallic=0.0, roughness=roughness)
        bsdf = m.node_tree.nodes["Principled BSDF"]
        if coat > 0.0 and "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = coat
            bsdf.inputs["Coat Roughness"].default_value = 0.12
        if subsurface > 0.0 and "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = subsurface
        return m

    mat_teeth = make_oral_mat("Mat_Teeth", color=(0.94, 0.91, 0.84), roughness=0.14, coat=0.84, subsurface=0.18)
    mat_gums = make_oral_mat("Mat_Gums", color=(0.76, 0.31, 0.36), roughness=0.20, coat=0.72, subsurface=0.30)
    mat_uvula = make_oral_mat("Mat_Uvula", color=(0.72, 0.24, 0.30), roughness=0.16, coat=0.78, subsurface=0.32)

    mouth_root = make_empty("Mouth_Root", location=(0.0, 0.0, 0.0))
    mouth_pivot = make_empty("Mouth_Pivot", location=(0.0, 0.0, 0.0), parent=mouth_root)

    tmj_y = 0.260
    tmj_z = 0.080
    max_jaw_angle = 0.42

    # -----------------------------------------------------------------------
    # A. Concentric Orbicularis-Oris Mouth & Enclosed Oral Cavity Mesh
    # -----------------------------------------------------------------------
    n_theta = 144
    n_rings = 46

    def compute_ring_point(ir: int, it: int):
        vf = ir / (n_rings - 1)
        theta = (2.0 * math.pi * it) / n_theta
        cx = math.cos(theta)
        sy = math.sin(theta)
        ax = abs(cx)

        # 1. Stomion M-wave line (gentle central tubercle + soft corner tuck)
        z_stomion = (
            -0.0080 * math.exp(-((cx / 0.25) ** 2))
            + 0.0060 * math.exp(-(((ax - 0.38) / 0.23) ** 2))
            - 0.0050 * (ax ** 3.0)
        )

        # 2. Smooth Organic Vermilion Border Contour (graceful Cupid's bow + bilobed lower lip)
        cupid_peaks = 0.021 * math.exp(-(((ax - 0.22) / 0.165) ** 2))
        philtral_dip = -0.010 * math.exp(-((cx / 0.115) ** 2))
        upper_taper = max(0.0, 1.0 - (ax ** 2.15)) ** 0.74
        h_upper = (0.105 + cupid_peaks + philtral_dip) * upper_taper

        lower_lobes = 0.013 * math.exp(-(((ax - 0.19) / 0.21) ** 2))
        lower_taper = max(0.0, 1.0 - (ax ** 1.98)) ** 0.68
        h_lower = (0.112 + lower_lobes) * lower_taper

        if sy >= 0.0:
            z_border = z_stomion + sy * (0.86 + 0.14 * sy) * h_upper
        else:
            nsy = -sy
            z_border = z_stomion - nsy * (0.86 + 0.14 * nsy) * h_lower

        x_border = 0.342 * cx * (1.0 - 0.04 * (sy * sy))
        x_stomion = 0.286 * cx

        slit_half = 0.0022 * (1.0 - 0.72 * (cx * cx)) + 0.0007
        z_contact = z_stomion + sy * slit_half

        def arch_y(x_val: float, corner_extra: float = 0.0) -> float:
            return -0.140 + 0.52 * (x_val * x_val) + corner_extra * (ax ** 3.2)

        if vf <= 0.25:
            # Sleek enclosed outer back-capsule strictly tucked inside lip silhouette (0.86x)!
            t = vf / 0.25
            st = smoothstep(0.0, 1.0, t)
            cap_bulge = math.sin(t * math.pi) * 0.10
            x = x_border * (0.04 + 0.84 * (st ** 0.76))
            z = (z_border * 0.88) * (0.05 + 0.95 * (st ** 0.78)) + sy * cap_bulge * 0.10
            y_front_edge = arch_y(x_border, 0.024) + 0.022
            y = 0.238 * (1.0 - st) + y_front_edge * st + cap_bulge * 0.10
            b_roll = smoothstep(0.19, 0.25, vf)
            x = x * (1.0 - b_roll) + x_border * b_roll
            z = z * (1.0 - b_roll) + z_border * b_roll
            y = y * (1.0 - b_roll) + (arch_y(x_border, 0.024) - 0.003) * b_roll

        elif vf <= 0.59:
            # Vermilion border -> Plump Dry Vermilion Cushion -> Stomion Margin
            t = (vf - 0.25) / (0.59 - 0.25)
            st = smoothstep(0.0, 1.0, t)
            x = x_border * (1.0 - st) + x_stomion * st
            z = z_border * (1.0 - st) + z_contact * st

            pillow_profile = math.sin(t * math.pi) ** 0.78
            if sy >= 0.0:
                tubercle = 0.014 * math.exp(-((cx / 0.25) ** 2)) * math.sin(t * math.pi)
                commissure_hood = 0.008 * (ax ** 2.2) * (1.0 - ax) * 4.0 * sy
                bulge = (0.035 * (1.0 - 0.58 * (ax ** 2.0)) + tubercle + commissure_hood) * pillow_profile
            else:
                lobe_full = 0.013 * math.exp(-(((ax - 0.18) / 0.24) ** 2)) * math.sin(t * math.pi)
                bulge = (0.037 * (1.0 - 0.62 * (ax ** 2.0)) + lobe_full) * pillow_profile

            white_roll = 0.0045 * math.exp(-(((t - 0.06) / 0.06) ** 2)) * (1.0 - 0.6 * ax * ax)
            base_y = arch_y(x, 0.024 * (1.0 - 0.3 * st))
            stomion_tuck = 0.024 * (t ** 2.2)
            y = base_y - bulge - white_roll + stomion_tuck

        elif vf <= 0.78:
            # Wet Inner Labial Mucosa rolling backward over teeth into cozy buccal vestibule
            t = (vf - 0.59) / (0.78 - 0.59)
            st = smoothstep(0.0, 1.0, t)
            x_vest = 0.224 * cx
            z_vest = sy * (0.072 * (1.0 - 0.42 * (ax ** 2.0)) + 0.014)
            x = x_stomion * (1.0 - st) + x_vest * st
            roll_up = t ** 0.72
            z = z_contact * (1.0 - roll_up) + z_vest * roll_up
            y_start = arch_y(x_stomion, 0.017) + 0.024
            y_vest = -0.048 + 0.42 * (x_vest * x_vest)
            y = y_start * (1.0 - st) + y_vest * st

        else:
            # Buccal Corridor -> Oropharynx -> Deep Dark Throat Pole
            t = (vf - 0.78) / (1.0 - 0.78)
            st = smoothstep(0.0, 1.0, t)
            x_vest = 0.224 * cx
            z_vest = sy * (0.072 * (1.0 - 0.42 * (ax ** 2.0)) + 0.014)
            x = x_vest * (1.0 - (st ** 0.85))
            z = z_vest * (1.0 - (st ** 0.85))
            y_vest = -0.048 + 0.42 * (x_vest * x_vest)
            y = y_vest * (1.0 - st) + 0.202 * st

        return x, y, z

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    pole_outer = bm.verts.new((0.0, 0.240, 0.0))
    ring_verts = []
    ring_meta = [(0.0, 0.0, 0.0, 0.0)]

    for ir in range(n_rings):
        vf = ir / (n_rings - 1)
        row = []
        for it in range(n_theta):
            theta = (2.0 * math.pi * it) / n_theta
            x, y, z = compute_ring_point(ir, it)
            v = bm.verts.new((x, y, z))
            row.append(v)
            ring_meta.append((vf, theta, math.cos(theta), math.sin(theta)))
        ring_verts.append(row)

    pole_inner = bm.verts.new((0.0, 0.205, 0.0))
    ring_meta.append((1.0, 0.0, 0.0, 0.0))

    bm.verts.ensure_lookup_table()

    for it in range(n_theta):
        it_next = (it + 1) % n_theta
        f = bm.faces.new((pole_outer, ring_verts[0][it_next], ring_verts[0][it]))
        f.smooth = True
        for loop, u_val in zip(f.loops, [(it + 0.5) / n_theta, (it + 1) / n_theta, it / n_theta]):
            loop[uv_layer].uv = (u_val, 0.0)

    for ir in range(n_rings - 1):
        vf0 = ir / (n_rings - 1)
        vf1 = (ir + 1) / (n_rings - 1)
        for it in range(n_theta):
            it_next = (it + 1) % n_theta
            u0 = it / n_theta
            u1 = (it + 1) / n_theta
            f = bm.faces.new((ring_verts[ir][it], ring_verts[ir][it_next], ring_verts[ir + 1][it_next], ring_verts[ir + 1][it]))
            f.smooth = True
            f.loops[0][uv_layer].uv = (u0, vf0)
            f.loops[1][uv_layer].uv = (u1, vf0)
            f.loops[2][uv_layer].uv = (u1, vf1)
            f.loops[3][uv_layer].uv = (u0, vf1)

    last_r = n_rings - 1
    for it in range(n_theta):
        it_next = (it + 1) % n_theta
        f = bm.faces.new((ring_verts[last_r][it], ring_verts[last_r][it_next], pole_inner))
        f.smooth = True
        for loop, u_val in zip(f.loops, [it / n_theta, (it + 1) / n_theta, (it + 0.5) / n_theta]):
            loop[uv_layer].uv = (u_val, 1.0)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    lips_mesh = bpy.data.meshes.new("Mouth_Lips_Mesh")
    bm.to_mesh(lips_mesh)
    bm.free()

    lips_obj = bpy.data.objects.new("Mouth_Lips", lips_mesh)
    bpy.context.collection.objects.link(lips_obj)
    lips_obj.parent = mouth_pivot
    lips_obj.data.materials.append(mat_lips)

    # -----------------------------------------------------------------------
    # B. 12 Anatomically Accurate Facial-Muscle Morph Targets on Mouth_Lips
    # -----------------------------------------------------------------------
    basis_coords = [v.co.copy() for v in lips_mesh.vertices]
    lips_obj.shape_key_add(name="Basis", from_mix=False)

    def add_lip_morph(name: str, fn):
        sk = lips_obj.shape_key_add(name=name, from_mix=False)
        for idx, base_co in enumerate(basis_coords):
            vf, theta, cx, sy = ring_meta[idx]
            nx, ny, nz = fn(vf, theta, cx, sy, base_co.x, base_co.y, base_co.z)
            sk.data[idx].co = Vector((nx, ny, nz))

    def morph_jaw_open(vf, theta, cx, sy, x, y, z):
        w_jaw = smoothstep(-1.0, 0.92, -sy)
        pole_keep = 1.0 - 0.35 * smoothstep(0.88, 1.0, vf)
        ang = max_jaw_angle * w_jaw * pole_keep
        ca = math.cos(ang)
        sa = math.sin(ang)
        dy = y - tmj_y
        dz = z - tmj_z
        ny = tmj_y + (dy * ca - dz * sa)
        nz = tmj_z + (dy * sa + dz * ca)
        lip_zone = smoothstep(0.16, 0.30, vf) * (1.0 - smoothstep(0.76, 0.92, vf))
        corner_narrow = 0.075 * lip_zone * (1.0 - 0.35 * sy * sy)
        nx = x * (1.0 - corner_narrow)
        return nx, ny, nz

    add_lip_morph("Jaw_Open", morph_jaw_open)

    def morph_lip_close(vf, theta, cx, sy, x, y, z):
        w_verm = smoothstep(0.24, 0.42, vf) * (1.0 - smoothstep(0.66, 0.80, vf))
        if w_verm <= 0.0001:
            return x, y, z
        ax = abs(cx)
        z_mid = -0.0080 * math.exp(-((cx / 0.25) ** 2)) + 0.0060 * math.exp(-(((ax - 0.38) / 0.23) ** 2)) - 0.0050 * (ax ** 3.0)
        nz = z * (1.0 - 0.50 * w_verm) + z_mid * (0.50 * w_verm)
        ny = y - 0.009 * w_verm * (1.0 - ax * ax)
        nx = x * (1.0 - 0.03 * w_verm)
        return nx, ny, nz

    add_lip_morph("Lip_Close", morph_lip_close)

    def morph_lip_round(vf, theta, cx, sy, x, y, z):
        w_lip = smoothstep(0.14, 0.30, vf) * (1.0 - smoothstep(0.74, 0.90, vf))
        if w_lip <= 0.0001:
            return x, y, z
        ax = abs(cx)
        nx = x * (1.0 - 0.31 * w_lip)
        protrude = 0.056 * w_lip * (1.0 - 0.42 * ax * ax)
        ny = y - protrude
        margin_flare = smoothstep(0.42, 0.60, vf) * (1.0 - smoothstep(0.62, 0.75, vf))
        nz = z + sy * 0.016 * margin_flare * (1.0 - 0.65 * ax * ax)
        return nx, ny, nz

    add_lip_morph("Lip_Round", morph_lip_round)

    def morph_lip_spread(vf, theta, cx, sy, x, y, z):
        w_lip = smoothstep(0.14, 0.28, vf) * (1.0 - smoothstep(0.75, 0.90, vf))
        if w_lip <= 0.0001:
            return x, y, z
        ax = abs(cx)
        nx = x * (1.0 + 0.165 * w_lip)
        ny = y + 0.018 * w_lip * (ax ** 1.6)
        nz = z * (1.0 - 0.07 * w_lip) + (0.005 * w_lip * (ax ** 2.0))
        return nx, ny, nz

    add_lip_morph("Lip_Spread", morph_lip_spread)

    def morph_lip_dental(vf, theta, cx, sy, x, y, z):
        w_lip = smoothstep(0.18, 0.32, vf) * (1.0 - smoothstep(0.72, 0.86, vf))
        if w_lip <= 0.0001:
            return x, y, z
        ax = abs(cx)
        center_w = max(0.0, 1.0 - (ax ** 2.2))
        if sy < 0.0:
            low_w = (-sy) * w_lip * center_w
            return x, y + 0.044 * low_w, z + 0.022 * low_w
        else:
            up_w = sy * w_lip * center_w
            return x, y - 0.005 * up_w, z + 0.015 * up_w

    add_lip_morph("Lip_Dental", morph_lip_dental)

    def morph_upper_raise(vf, theta, cx, sy, x, y, z):
        if sy <= -0.15:
            return x, y, z
        w_up = smoothstep(-0.15, 0.65, sy) * smoothstep(0.18, 0.34, vf) * (1.0 - smoothstep(0.70, 0.84, vf))
        center_lat = max(0.0, 1.0 - (abs(cx) ** 2.6))
        return x, y - 0.006 * w_up * center_lat, z + 0.024 * w_up * center_lat

    add_lip_morph("Upper_Lip_Raise", morph_upper_raise)

    def morph_lower_depress(vf, theta, cx, sy, x, y, z):
        if sy >= 0.15:
            return x, y, z
        w_lo = smoothstep(-0.15, 0.65, -sy) * smoothstep(0.18, 0.34, vf) * (1.0 - smoothstep(0.70, 0.84, vf))
        center_lat = max(0.0, 1.0 - (abs(cx) ** 2.4))
        return x, y - 0.008 * w_lo * center_lat, z - 0.024 * w_lo * center_lat

    add_lip_morph("Lower_Lip_Depress", morph_lower_depress)

    def morph_corner_up(vf, theta, cx, sy, x, y, z):
        w_lip = smoothstep(0.14, 0.28, vf) * (1.0 - smoothstep(0.75, 0.90, vf))
        w_corner = (abs(cx) ** 1.5) * w_lip
        return x * (1.0 + 0.095 * w_lip), y + 0.015 * w_corner, z + 0.032 * w_corner

    add_lip_morph("Corner_Up", morph_corner_up)

    def morph_corner_down(vf, theta, cx, sy, x, y, z):
        w_lip = smoothstep(0.14, 0.28, vf) * (1.0 - smoothstep(0.75, 0.90, vf))
        w_corner = (abs(cx) ** 1.6) * w_lip
        return x, y + 0.006 * w_corner, z - 0.022 * w_corner

    add_lip_morph("Corner_Down", morph_corner_down)

    def morph_cheek_puff(vf, theta, cx, sy, x, y, z):
        w_puff = smoothstep(0.14, 0.30, vf) * (1.0 - smoothstep(0.56, 0.72, vf))
        return x * (1.0 + 0.045 * w_puff), y - 0.016 * w_puff, z * (1.0 + 0.04 * w_puff)

    add_lip_morph("Cheek_Puff", morph_cheek_puff)

    def morph_feminine(vf, theta, cx, sy, x, y, z):
        w_verm = smoothstep(0.20, 0.34, vf) * (1.0 - smoothstep(0.64, 0.78, vf))
        w_all = 1.0 - 0.3 * smoothstep(0.85, 1.0, vf)
        ax = abs(cx)
        nx = x * (1.0 - 0.065 * w_all)
        pillow_boost = math.sin(max(0.0, min(1.0, (vf - 0.24) / 0.36)) * math.pi) * (1.0 - 0.55 * ax * ax)
        ny = y - 0.014 * pillow_boost * w_verm
        cupid_extra = 0.011 * math.exp(-(((ax - 0.21) / 0.14) ** 2)) * max(0.0, sy) * smoothstep(0.20, 0.30, vf) * (1.0 - smoothstep(0.42, 0.54, vf))
        lower_plump = -0.013 * (1.0 - 0.65 * ax * ax) * max(0.0, -sy) * smoothstep(0.20, 0.32, vf) * (1.0 - smoothstep(0.46, 0.58, vf))
        return nx, ny, z + cupid_extra + lower_plump

    add_lip_morph("Feminine_Mouth", morph_feminine)

    def morph_asymmetry(vf, theta, cx, sy, x, y, z):
        w_lip = smoothstep(0.14, 0.30, vf) * (1.0 - smoothstep(0.72, 0.88, vf))
        right_bias = max(0.0, cx) ** 1.8
        left_bias = max(0.0, -cx) ** 1.8
        return x + 0.007 * right_bias * w_lip, y, z + 0.011 * right_bias * w_lip - 0.005 * left_bias * w_lip

    add_lip_morph("Asymmetry_Natural", morph_asymmetry)

    # -----------------------------------------------------------------------
    # C. Upper Dental Arch (Snug Edge-to-Edge Teeth + Smooth Gingiva + Hard Palate)
    # -----------------------------------------------------------------------
    upper_dental_root = make_empty("Upper_Teeth", location=(0.0, 0.0, 0.0), parent=mouth_pivot)

    # Compute exact cumulative arc angles so adjacent teeth gently kiss edge-to-edge!
    def pack_arch_specs(raw_specs, arch_rx: float):
        packed = []
        cursor_arc = 0.0012  # hairline midline contact
        for tw, tt, th, tkind, z_tip in raw_specs:
            center_arc = cursor_arc + tw * 0.485
            ang = center_arc / arch_rx
            packed.append((ang, tw, tt, th, tkind, z_tip))
            cursor_arc += tw * 0.965
        return packed

    upper_specs = pack_arch_specs(
        [
            (0.044, 0.021, 0.050, "incisor", -0.005),
            (0.034, 0.020, 0.045, "incisor", -0.002),
            (0.038, 0.025, 0.052, "canine", -0.006),
            (0.036, 0.032, 0.043, "premolar", 0.000),
            (0.037, 0.035, 0.041, "premolar", 0.002),
            (0.045, 0.042, 0.039, "molar", 0.004),
        ],
        arch_rx=0.184,
    )
    build_smooth_gingiva_arch(
        "Upper_Gingiva",
        is_upper=True,
        arch_rx=0.184,
        arch_y0=-0.105,
        arch_depth=0.198,
        tooth_angles=[s[0] for s in upper_specs],
        mat=mat_gums,
        parent_obj=upper_dental_root,
    )

    palate = PartBuilder("Hard_Palate", location=(0.0, 0.0, 0.0), parent=upper_dental_root)
    palate.sphere(radius=(0.156, 0.140, 0.018), u_segments=20, v_segments=12, offset=(0.0, 0.022, 0.050), mat=mat_gums)
    for ri in range(4):
        ry = -0.048 + ri * 0.024
        rw = 0.088 + ri * 0.012
        palate.cylinder(
            radius1=0.0036,
            radius2=0.0036,
            depth=rw,
            segments=12,
            offset=(0.0, ry, 0.043 + ri * 0.002),
            local_rot=(0.0, math.pi * 0.5, 0.0),
            mat=mat_gums,
        )
    palate.build()

    for sgn in [-1.0, 1.0]:
        side_tag = "L" if sgn < 0 else "R"
        for t_i, (ang_b, tw, tt, th, tkind, z_tip) in enumerate(upper_specs):
            ang = sgn * ang_b
            tx = math.sin(ang) * 0.184
            ty = -0.105 + (1.0 - math.cos(ang)) * 0.198
            tz = z_tip + th * 0.5
            tmesh = build_sculpted_tooth_mesh(f"UTooth_{side_tag}{t_i+1}", tw, tt, th, tkind, True, mat_teeth)
            tobj = bpy.data.objects.new(f"UpperTooth_{side_tag}{t_i+1}", tmesh)
            bpy.context.collection.objects.link(tobj)
            tobj.parent = upper_dental_root
            tobj.location = (tx, ty, tz)
            tobj.rotation_euler = Euler((0.06, 0.0, -ang), "XYZ")

    # -----------------------------------------------------------------------
    # D. Soft Palate Arch & Teardrop Uvula (Velum_Uvula)
    # -----------------------------------------------------------------------
    velum = PartBuilder("Velum_Uvula", location=(0.0, 0.125, 0.042), parent=mouth_pivot)
    velum.sphere(radius=(0.118, 0.048, 0.016), u_segments=20, v_segments=12, offset=(0.0, 0.0, 0.006), mat=mat_gums)
    velum.sphere(radius=(0.014, 0.013, 0.026), u_segments=18, v_segments=14, offset=(0.0, -0.006, -0.022), mat=mat_uvula)
    velum.build()

    # -----------------------------------------------------------------------
    # E. Articulated Jaw_Pivot -> Snug Lower Dental Arch + Seamless Sculpted Tongue!
    # -----------------------------------------------------------------------
    jaw_pivot = make_empty("Jaw_Pivot", location=(0.0, tmj_y, tmj_z), parent=mouth_pivot)
    lower_dental_root = make_empty("Lower_Teeth", location=(0.0, -tmj_y, -tmj_z), parent=jaw_pivot)

    lower_specs = pack_arch_specs(
        [
            (0.030, 0.018, 0.043, "incisor", -0.007),
            (0.032, 0.019, 0.044, "incisor", -0.007),
            (0.036, 0.023, 0.048, "canine", -0.005),
            (0.035, 0.030, 0.040, "premolar", -0.009),
            (0.036, 0.033, 0.039, "premolar", -0.010),
            (0.044, 0.040, 0.037, "molar", -0.011),
        ],
        arch_rx=0.170,
    )
    build_smooth_gingiva_arch(
        "Lower_Gingiva",
        is_upper=False,
        arch_rx=0.170,
        arch_y0=-0.092,
        arch_depth=0.188,
        tooth_angles=[s[0] for s in lower_specs],
        mat=mat_gums,
        parent_obj=lower_dental_root,
    )

    # Wide seamless sublingual & buccal floor closing any dark floor crescents
    sublingual = PartBuilder("Sublingual_Floor", location=(0.0, 0.0, 0.0), parent=lower_dental_root)
    sublingual.sphere(radius=(0.205, 0.165, 0.022), u_segments=22, v_segments=12, offset=(0.0, 0.025, -0.050), mat=mat_gums)
    sublingual.build()

    for sgn in [-1.0, 1.0]:
        side_tag = "L" if sgn < 0 else "R"
        for t_i, (ang_b, tw, tt, th, tkind, z_tip) in enumerate(lower_specs):
            ang = sgn * ang_b
            tx = math.sin(ang) * 0.170
            ty = -0.092 + (1.0 - math.cos(ang)) * 0.188
            tz = z_tip - th * 0.5
            tmesh = build_sculpted_tooth_mesh(f"LTooth_{side_tag}{t_i+1}", tw, tt, th, tkind, False, mat_teeth)
            tobj = bpy.data.objects.new(f"LowerTooth_{side_tag}{t_i+1}", tmesh)
            bpy.context.collection.objects.link(tobj)
            tobj.parent = lower_dental_root
            tobj.location = (tx, ty, tz)
            tobj.rotation_euler = Euler((-0.05, 0.0, -ang), "XYZ")

    frenulum = PartBuilder("Lingual_Frenulum", location=(0.0, -0.042 - tmj_y, -0.038 - tmj_z), parent=jaw_pivot)
    frenulum.box(size=(0.006, 0.034, 0.028), offset=(0.0, 0.0, 0.0), local_rot=(0.30, 0.0, 0.0), mat=mat_uvula, bevel=0.003)
    frenulum.build()

    # Single Continuous Organic Muscular Tongue Mesh (`Tongue_Body`) + 5 Tongue Morph Targets!
    tongue_root = make_empty("Tongue_Root", location=(0.0, -tmj_y, -tmj_z), parent=jaw_pivot)

    tbm = bmesh.new()
    tuv = tbm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_uvsphere(tbm, u_segments=44, v_segments=32, radius=1.0)
    tongue_meta = []  # store longitudinal t_ant in [0=root .. 1=tip] per vertex!
    for v in tbm.verts:
        vx, vy, vz = v.co.x, v.co.y, v.co.z
        # Map vy from +1 (posterior root at y=+0.095) to -1 (anterior tip at y=-0.086)
        t_ant = max(0.0, min(1.0, (1.0 - vy) * 0.5))
        # Taper width smoothly from broad posterior body (0.128) to agile rounded tip (0.072)
        rx = 0.132 * (1.0 - 0.42 * (t_ant ** 1.55))
        # Thickness: muscular posterior dorsum (0.036) tapering gently to sleek anterior tip (0.017)
        rz = 0.036 * (1.0 - 0.52 * (t_ant ** 1.40))
        # Dorsal median sulcus groove along centerline
        groove = 0.16 * math.exp(-((vx / 0.27) ** 2)) * max(0.0, vz) * (1.0 - 0.45 * (t_ant ** 2.2))
        # Subtle natural longitudinal arch (highest over mid-dorsum, resting neatly behind lower incisors)
        arch_z = -0.024 + 0.014 * math.sin(t_ant * math.pi * 0.85) - 0.008 * (t_ant ** 2.0)
        px = vx * rx
        py = 0.095 * (1.0 - t_ant) + (-0.086) * t_ant
        pz = arch_z + (vz - groove) * rz
        v.co = Vector((px, py, pz))
        tongue_meta.append((t_ant, vx, vz))

    for f in tbm.faces:
        f.smooth = True
        for loop in f.loops:
            u_c = 0.5 + (loop.vert.co.x / 0.27)
            v_c = (loop.vert.co.y + 0.09) / 0.19
            loop[tuv].uv = (max(0.0, min(1.0, u_c)), max(0.0, min(1.0, v_c)))

    bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
    t_mesh = bpy.data.meshes.new("Tongue_Body_Mesh")
    tbm.to_mesh(t_mesh)
    tbm.free()
    t_mesh.materials.append(mat_tongue)

    t_obj = bpy.data.objects.new("Tongue_Body", t_mesh)
    bpy.context.collection.objects.link(t_obj)
    t_obj.parent = tongue_root

    t_basis = [v.co.copy() for v in t_mesh.vertices]
    t_obj.shape_key_add(name="Basis", from_mix=False)

    def add_tongue_morph(mname: str, fn):
        sk = t_obj.shape_key_add(name=mname, from_mix=False)
        for idx, bco in enumerate(t_basis):
            t_ant, vx, vz = tongue_meta[idx]
            nx, ny, nz = fn(t_ant, vx, vz, bco.x, bco.y, bco.z)
            sk.data[idx].co = Vector((nx, ny, nz))

    # 1. Tongue_Tip_Up: Alveolar tap/ridge lift (/t, d, n, l, s, z/)
    add_tongue_morph(
        "Tongue_Tip_Up",
        lambda t_ant, vx, vz, x, y, z: (
            x * (1.0 - 0.10 * smoothstep(0.45, 1.0, t_ant)),
            y - 0.012 * smoothstep(0.50, 1.0, t_ant),
            z + 0.056 * (smoothstep(0.35, 1.0, t_ant) ** 1.35),
        ),
    )

    # 2. Tongue_Interdental: Protrudes tip cleanly forward between upper & lower incisors (/th, dh/)
    add_tongue_morph(
        "Tongue_Interdental",
        lambda t_ant, vx, vz, x, y, z: (
            x * (1.0 - 0.14 * smoothstep(0.40, 1.0, t_ant)),
            y - 0.044 * smoothstep(0.30, 1.0, t_ant),
            z + 0.028 * smoothstep(0.35, 1.0, t_ant),
        ),
    )

    # 3. Tongue_High_Front: Palatal blade arch toward hard palate (/i, I, ey, y, sh, ch/)
    add_tongue_morph(
        "Tongue_High_Front",
        lambda t_ant, vx, vz, x, y, z: (
            x * 1.03,
            y - 0.016 * math.sin(t_ant * math.pi),
            z + 0.042 * math.exp(-(((t_ant - 0.62) / 0.32) ** 2)),
        ),
    )

    # 4. Tongue_High_Back: Velar dorsum bunching toward soft palate (/k, g, ng, u, o, w/)
    add_tongue_morph(
        "Tongue_High_Back",
        lambda t_ant, vx, vz, x, y, z: (
            x * (1.0 + 0.05 * (1.0 - t_ant)),
            y + 0.022 * (1.0 - 0.5 * t_ant),
            z + 0.048 * math.exp(-(((t_ant - 0.28) / 0.30) ** 2)) - 0.010 * smoothstep(0.65, 1.0, t_ant),
        ),
    )

    # 5. Tongue_Retroflex: Rhotic /r/ curl & mid-palatal bunching
    add_tongue_morph(
        "Tongue_Retroflex",
        lambda t_ant, vx, vz, x, y, z: (
            x * (1.0 - 0.08 * smoothstep(0.55, 1.0, t_ant)),
            y + 0.024 * smoothstep(0.55, 1.0, t_ant),
            z + 0.046 * smoothstep(0.50, 1.0, t_ant) + 0.018 * math.exp(-(((t_ant - 0.40) / 0.24) ** 2)),
        ),
    )

    return export_glb_ext(os.path.join(OUT_DIR, "mouth-avatar.glb"), export_morph=True)


def clean_obsolete_models():
    os.makedirs(OUT_DIR, exist_ok=True)
    for fname in [
        "avatar-speaker.glb",
        "studio-mic.glb",
        "control-console.glb",
        "studio-stage.glb",
        "sound-ring.glb",
        "vocal-anatomy-rig.glb",
    ]:
        fpath = os.path.join(OUT_DIR, fname)
        if os.path.exists(fpath):
            os.remove(fpath)


def main():
    print("Building glTF-native high-resolution 3D Mouth & Oral Cavity asset...")
    clean_obsolete_models()
    total = build_mouth_avatar()
    print(f"Done! Total 3D asset payload: {total:,} bytes ({total / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
