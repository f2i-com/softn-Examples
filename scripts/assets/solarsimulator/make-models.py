"""
Deterministic headless Blender 5.2 PBR asset generator for Solar Simulator.
Generates 12 astronomically proportioned, unit-radius (R = 1.0) sculpted 3D .glb models:
  1. sun-star.glb         - Granulated photosphere + chromosphere + 4 articulated solar flare arches
  2. planet-mercury.glb   - Cratered silicate globe with Caloris-style basins & lobate scarps
  3. planet-venus.glb     - Banded sulfuric cloud deck with chevron V-waves + Magma_Crust node
  4. planet-earth.glb     - Specular ocean + sculpted continents + Polar_Ice + rotating Cloud_Layer + Magma_Crust
  5. planet-mars.glb      - Rusty regolith + Olympus Mons + Valles Marineris + Polar_Ice + Magma_Crust
  6. planet-jupiter.glb   - Oblate (0.935) belted gas giant + Great_Red_Spot at 22 deg South
  7. planet-saturn.glb    - Oblate (0.902) golden gas giant + true-ratio C/B/Cassini/A ring system
  8. planet-uranus.glb    - Cyan-aquamarine ice giant + delicate charcoal-ice epsilon rings
  9. planet-neptune.glb   - Deep cobalt-azure ice giant + methane cirrus bands + Great Dark Spot
 10. planet-dwarf.glb     - Cratered icy-rocky dwarf planet / moon (Pluto heart / Ceres)
 11. asteroid-impactor.glb- Lumpy chondrite asteroid with craters, iron nodules & Fissure_Glow
 12. impact-ring.glb      - Expanding shockwave torus + ejecta plume crown

Usage:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --python scripts/assets/solarsimulator/make-models.py
"""

import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Euler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "SolarSimulator")
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts", "assets"))

from blender_pbr_lib import (  # noqa: E402
    PartBuilder,
    export_glb,
    make_empty,
    make_mat,
    reset_scene,
)

OUT_DIR = os.path.join(BUNDLE_DIR, "assets", "models")


def build_uv_globe(
    name: str,
    parent,
    materials: list,
    u_steps: int = 40,
    v_steps: int = 24,
    radius_fn=None,
    mat_fn=None,
    smooth: bool = True,
):
    """
    Creates a custom UV-sphere mesh where each vertex's (rx, ry, rz) or scalar radius
    and each face's material slot can be sculpted deterministically as a function of
    colatitude theta in [0, pi] (0 = +Z north pole, pi = -Z south pole) and
    longitude phi in [0, 2*pi).
    """
    bm = bmesh.new()
    verts = []
    for iv in range(v_steps + 1):
        theta = (iv / v_steps) * math.pi
        st = math.sin(theta)
        ct = math.cos(theta)
        row = []
        for iu in range(u_steps):
            phi = (iu / u_steps) * math.tau
            r_val = radius_fn(theta, phi) if radius_fn is not None else 1.0
            if isinstance(r_val, (tuple, list)):
                rx, ry, rz = r_val
            else:
                rx = ry = rz = float(r_val)
            x = st * math.cos(phi) * rx
            y = st * math.sin(phi) * ry
            z = ct * rz
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)

    for iv in range(v_steps):
        theta_mid = ((iv + 0.5) / v_steps) * math.pi
        for iu in range(u_steps):
            iu2 = (iu + 1) % u_steps
            phi_mid = ((iu + 0.5) / u_steps) * math.tau
            f = bm.faces.new((
                verts[iv][iu],
                verts[iv + 1][iu],
                verts[iv + 1][iu2],
                verts[iv][iu2],
            ))
            f.smooth = smooth
            f.material_index = int(mat_fn(theta_mid, phi_mid)) if mat_fn is not None else 0

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for m in materials:
        obj.data.materials.append(m)
    if parent is not None:
        obj.parent = parent
    return obj


def build_flat_annulus(
    name: str,
    parent,
    mat,
    r_inner: float,
    r_outer: float,
    thickness: float = 0.012,
    seg_u: int = 64,
    z_offset: float = 0.0,
):
    """Builds a thin double-sided 3D planetary ring annulus in Blender XY plane (glTF XZ plane)."""
    bm = bmesh.new()
    hz = thickness * 0.5
    top_in, top_out, bot_in, bot_out = [], [], [], []
    for i in range(seg_u):
        ang = (i / seg_u) * math.tau
        ca, sa = math.cos(ang), math.sin(ang)
        top_in.append(bm.verts.new((ca * r_inner, sa * r_inner, z_offset + hz)))
        top_out.append(bm.verts.new((ca * r_outer, sa * r_outer, z_offset + hz)))
        bot_in.append(bm.verts.new((ca * r_inner, sa * r_inner, z_offset - hz)))
        bot_out.append(bm.verts.new((ca * r_outer, sa * r_outer, z_offset - hz)))

    for i in range(seg_u):
        i2 = (i + 1) % seg_u
        ft = bm.faces.new((top_in[i], top_out[i], top_out[i2], top_in[i2]))
        fb = bm.faces.new((bot_in[i], bot_in[i2], bot_out[i2], bot_out[i]))
        fi = bm.faces.new((top_in[i], top_in[i2], bot_in[i2], bot_in[i]))
        fo = bm.faces.new((top_out[i], bot_out[i], bot_out[i2], top_out[i2]))
        for f in (ft, fb, fi, fo):
            f.smooth = True
            f.material_index = 0

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    return obj


def add_magma_crust_node(parent, base_radius: float = 1.009):
    """
    Builds a glowing molten impact/overheat lattice shell (`Magma_Crust`) slightly above the globe
    so planets heated > 750 K by a Red Giant or struck by a giant asteroid glow with magma veins!
    """
    mat_magma = make_mat(
        "Mat_Magma",
        color=(1.0, 0.34, 0.05),
        metallic=0.05,
        roughness=0.22,
        emission=(1.0, 0.28, 0.03),
        emission_strength=4.2,
    )
    mat_slag = make_mat(
        "Mat_Slag",
        color=(0.18, 0.08, 0.06),
        metallic=0.15,
        roughness=0.82,
        emission=(0.55, 0.08, 0.01),
        emission_strength=0.65,
    )

    def r_fn(theta, phi):
        v = math.sin(theta * 7.0 + 0.4) * math.cos(phi * 6.0 - 0.5)
        v2 = math.cos(theta * 11.0 - 0.8) * math.sin(phi * 9.0 + 1.1)
        return base_radius + 0.008 * max(0.0, v + 0.5 * v2)

    def m_fn(theta, phi):
        crack = abs(math.sin(theta * 5.0 + 0.3 * math.cos(phi * 4.0)) * math.cos(phi * 5.0 - 0.4 * math.sin(theta * 6.0)))
        return 0 if crack < 0.28 else 1

    return build_uv_globe(
        "Magma_Crust",
        parent=parent,
        materials=[mat_magma, mat_slag],
        u_steps=32,
        v_steps=20,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )


def crater_field(theta: float, phi: float, craters: list) -> tuple[float, bool]:
    """Evaluates multi-basin bowl + raised rim relief on a unit sphere."""
    px = math.sin(theta) * math.cos(phi)
    py = math.sin(theta) * math.sin(phi)
    pz = math.cos(theta)
    delta = 0.0
    in_floor = False
    for ctheta, cphi, ang_rad, depth in craters:
        cx = math.sin(ctheta) * math.cos(cphi)
        cy = math.sin(ctheta) * math.sin(cphi)
        cz = math.cos(ctheta)
        dot = max(-1.0, min(1.0, px * cx + py * cy + pz * cz))
        ang = math.acos(dot)
        u = ang / ang_rad
        if u < 1.32:
            if u < 0.82:
                bowl = (1.0 - (u / 0.82) ** 2)
                delta -= depth * bowl
                if u < 0.58:
                    in_floor = True
            else:
                rim = math.sin(((u - 0.82) / 0.50) * math.pi)
                delta += depth * 0.36 * rim
    return delta, in_floor


# ---------------------------------------------------------------------------
# 1. SUN / STAR (`sun-star.glb`)
# ---------------------------------------------------------------------------
def build_sun_star():
    reset_scene()
    root = make_empty("Sun_Root")

    mat_photo = make_mat(
        "Mat_Photosphere",
        color=(1.0, 0.78, 0.24),
        metallic=0.0,
        roughness=0.35,
        emission=(1.0, 0.68, 0.16),
        emission_strength=3.6,
    )
    mat_granule = make_mat(
        "Mat_Chromosphere",
        color=(1.0, 0.52, 0.10),
        metallic=0.0,
        roughness=0.42,
        emission=(1.0, 0.42, 0.06),
        emission_strength=2.6,
    )
    mat_spot = make_mat(
        "Mat_Sunspot",
        color=(0.55, 0.20, 0.04),
        metallic=0.0,
        roughness=0.60,
        emission=(0.45, 0.12, 0.02),
        emission_strength=0.9,
    )
    mat_flare = make_mat(
        "Mat_Prominence",
        color=(1.0, 0.56, 0.14),
        metallic=0.0,
        roughness=0.25,
        emission=(1.0, 0.48, 0.10),
        emission_strength=4.5,
    )

    def r_fn(theta, phi):
        conv = 0.008 * math.sin(theta * 14.0) * math.cos(phi * 14.0)
        conv2 = 0.005 * math.cos(theta * 21.0 + 0.7) * math.sin(phi * 19.0 - 0.4)
        return 1.0 + conv + conv2

    def m_fn(theta, phi):
        # Active latitude sunspot pair around +-18 deg from equator
        lat = (math.pi * 0.5) - theta
        if abs(lat - 0.30) < 0.08 and abs(phi - 1.2) < 0.10:
            return 2
        if abs(lat + 0.26) < 0.07 and abs(phi - 4.1) < 0.09:
            return 2
        cell = math.sin(theta * 12.0 + 0.5 * math.sin(phi * 5.0)) * math.cos(phi * 12.0)
        return 0 if cell >= -0.15 else 1

    build_uv_globe(
        "Photosphere_Core",
        parent=root,
        materials=[mat_photo, mat_granule, mat_spot],
        u_steps=44,
        v_steps=28,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )

    # 4 Articulated Solar Magnetic Prominence Arches around the limb
    arch_specs = [
        ("Flare_Arch_0", (0.96, 0.0, 0.16), (0.2, 0.0, 0.0), 0.22),
        ("Flare_Arch_1", (-0.88, 0.38, -0.18), (-0.25, 0.4, 0.8), 0.19),
        ("Flare_Arch_2", (0.18, 0.94, 0.22), (0.35, -0.2, 1.45), 0.21),
        ("Flare_Arch_3", (-0.22, -0.95, -0.12), (-0.18, 0.3, -1.35), 0.18),
    ]
    for aname, aloc, arot, arad in arch_specs:
        pb = PartBuilder(aname, location=aloc, rotation=arot, parent=root)
        pb.torus(major_radius=arad, minor_radius=0.026, major_seg=22, minor_seg=8, local_rot=(math.pi / 2, 0.0, 0.0), mat=mat_flare)
        pb.build()

    return export_glb(os.path.join(OUT_DIR, "sun-star.glb"))


# ---------------------------------------------------------------------------
# 2. MERCURY (`planet-mercury.glb`)
# ---------------------------------------------------------------------------
def build_mercury():
    reset_scene()
    root = make_empty("Mercury_Root")

    mat_plains = make_mat("Mat_SilicatePlains", color=(0.46, 0.43, 0.40), metallic=0.08, roughness=0.88)
    mat_basin = make_mat("Mat_CalorisBasin", color=(0.33, 0.31, 0.29), metallic=0.12, roughness=0.82)
    mat_rays = make_mat("Mat_BrightRays", color=(0.62, 0.59, 0.55), metallic=0.05, roughness=0.78)

    craters = [
        (1.15, 0.75, 0.42, 0.045),  # Caloris Basin
        (1.85, 2.30, 0.28, 0.035),
        (0.85, 3.80, 0.24, 0.030),
        (2.15, 4.90, 0.30, 0.036),
        (1.45, 5.55, 0.20, 0.026),
        (0.60, 1.95, 0.22, 0.028),
        (2.45, 1.10, 0.25, 0.030),
    ]

    def r_fn(theta, phi):
        d, _ = crater_field(theta, phi, craters)
        rough = 0.008 * math.sin(theta * 11.0) * math.cos(phi * 9.0)
        return 1.0 + d + rough

    def m_fn(theta, phi):
        d, in_floor = crater_field(theta, phi, craters)
        if in_floor:
            return 1
        if d > 0.006:
            return 2
        return 0

    build_uv_globe(
        "Mercury_Globe",
        parent=root,
        materials=[mat_plains, mat_basin, mat_rays],
        u_steps=42,
        v_steps=26,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )
    add_magma_crust_node(root)
    return export_glb(os.path.join(OUT_DIR, "planet-mercury.glb"))


# ---------------------------------------------------------------------------
# 3. VENUS (`planet-venus.glb`)
# ---------------------------------------------------------------------------
def build_venus():
    reset_scene()
    root = make_empty("Venus_Root")

    mat_cream = make_mat("Mat_SulfuricCream", color=(0.90, 0.78, 0.52), metallic=0.0, roughness=0.52)
    mat_amber = make_mat("Mat_VenusAmber", color=(0.78, 0.61, 0.34), metallic=0.0, roughness=0.58)
    mat_polar = make_mat("Mat_PolarCollar", color=(0.95, 0.88, 0.70), metallic=0.0, roughness=0.46)

    def r_fn(theta, phi):
        return 1.0 + 0.004 * math.sin(theta * 8.0 + math.cos(phi * 2.0))

    def m_fn(theta, phi):
        if theta < 0.36 or theta > math.pi - 0.36:
            return 2
        # Characteristic atmospheric Y / chevron wave
        lat = theta - math.pi * 0.5
        chevron = math.sin(lat * 9.0 + 1.3 * math.cos(phi - abs(lat) * 2.6))
        return 0 if chevron >= -0.1 else 1

    build_uv_globe(
        "Venus_Globe",
        parent=root,
        materials=[mat_cream, mat_amber, mat_polar],
        u_steps=42,
        v_steps=26,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )
    add_magma_crust_node(root)
    return export_glb(os.path.join(OUT_DIR, "planet-venus.glb"))


# ---------------------------------------------------------------------------
# 4. EARTH (`planet-earth.glb`)
# ---------------------------------------------------------------------------
def earth_land_mask(theta: float, phi: float) -> int:
    """
    Approximates Earth's continents on (theta, phi):
    Returns: 0 = deep ocean, 1 = green continent, 2 = arid ochre continent, 3 = polar ice cap
    """
    lat_deg = 90.0 - math.degrees(theta)
    lon_deg = (math.degrees(phi) + 180.0) % 360.0 - 180.0  # [-180, 180]

    # Polar ice caps (Antarctica + Arctic pack/Greenland)
    if lat_deg < -68.0 or lat_deg > 78.0:
        return 3
    if 61.0 <= lat_deg <= 81.0 and -56.0 <= lon_deg <= -20.0:
        return 3  # Greenland

    # North America
    if 18.0 <= lat_deg <= 70.0 and -162.0 <= lon_deg <= -58.0:
        w = 34.0 + (lat_deg - 25.0) * 0.45
        center = -102.0 - (lat_deg - 35.0) * 0.45
        if abs(lon_deg - center) < w * (0.72 + 0.25 * math.sin(lat_deg * 0.12)):
            return 2 if (24.0 <= lat_deg <= 38.0 and lon_deg < -102.0) else 1

    # South America
    if -54.0 <= lat_deg < 13.0 and -82.0 <= lon_deg <= -35.0:
        center = -60.0 - (lat_deg + 15.0) * 0.22
        half_w = max(5.0, 20.0 * math.cos((lat_deg + 14.0) * 0.036))
        if abs(lon_deg - center) < half_w:
            return 1

    # Africa
    if -35.0 <= lat_deg <= 36.0 and -17.0 <= lon_deg <= 51.0:
        center = 18.0 + (10.0 if lat_deg < 5.0 else 0.0)
        half_w = 28.0 if lat_deg > 4.0 else max(8.0, 21.0 * math.cos((lat_deg + 10.0) * 0.04))
        if abs(lon_deg - center) < half_w:
            return 2 if lat_deg > 14.0 else 1

    # Eurasia
    if 10.0 <= lat_deg <= 71.0 and -9.0 <= lon_deg <= 145.0:
        south_cut = 36.0 if lon_deg < 28.0 else (24.0 if lon_deg < 68.0 else 16.0)
        if lat_deg >= south_cut:
            return 2 if (22.0 <= lat_deg <= 46.0 and 38.0 <= lon_deg <= 104.0) else 1
        # India & SE Asia peninsulas
        if 8.0 <= lat_deg <= 26.0 and (70.0 <= lon_deg <= 87.0 or 96.0 <= lon_deg <= 108.0):
            return 1

    # Australia
    if -39.0 <= lat_deg <= -12.0 and 113.0 <= lon_deg <= 153.0:
        if ((lon_deg - 133.0) / 19.0) ** 2 + ((lat_deg + 25.0) / 13.0) ** 2 < 1.0:
            return 2 if abs(lon_deg - 131.0) < 12.0 else 1

    return 0


def build_earth():
    reset_scene()
    root = make_empty("Earth_Root")

    mat_ocean = make_mat("Mat_Ocean", color=(0.05, 0.24, 0.56), metallic=0.14, roughness=0.20)
    mat_land = make_mat("Mat_Continent", color=(0.17, 0.44, 0.19), metallic=0.0, roughness=0.76)
    mat_desert = make_mat("Mat_Desert", color=(0.68, 0.56, 0.34), metallic=0.0, roughness=0.82)
    mat_ice = make_mat("Mat_PolarIce", color=(0.93, 0.96, 0.99), metallic=0.02, roughness=0.35)
    mat_cloud = make_mat("Mat_Clouds", color=(0.97, 0.98, 1.0), metallic=0.0, roughness=0.45)

    def r_fn(theta, phi):
        cls = earth_land_mask(theta, phi)
        if cls == 0:
            return 1.000
        if cls == 3:
            return 1.012
        mtn = 0.006 * max(0.0, math.sin(theta * 14.0) * math.cos(phi * 11.0))
        return 1.015 + mtn

    build_uv_globe(
        "Earth_Globe",
        parent=root,
        materials=[mat_ocean, mat_land, mat_desert, mat_ice],
        u_steps=56,
        v_steps=34,
        radius_fn=r_fn,
        mat_fn=earth_land_mask,
    )

    # Independent rotating Cloud_Layer node (sculpted 3D cyclone/trade-wind cloud bands at R = 1.032)
    cloud_node = PartBuilder("Cloud_Layer", parent=root)
    cloud_bands = [
        (0.62, 0.35, 0.24),
        (1.05, 1.45, 0.30),
        (1.38, 2.85, 0.26),
        (1.68, 4.10, 0.32),
        (2.05, 5.20, 0.28),
        (2.38, 0.95, 0.25),
        (1.52, 0.15, 0.24),
        (1.18, 4.85, 0.26),
    ]
    for ctheta, cphi, span in cloud_bands:
        for k in range(5):
            ang_p = cphi + (k - 2) * (span * 0.42)
            ang_t = ctheta + math.sin(k * 1.4) * 0.06
            r_c = 1.030
            cx = math.sin(ang_t) * math.cos(ang_p) * r_c
            cy = math.sin(ang_t) * math.sin(ang_p) * r_c
            cz = math.cos(ang_t) * r_c
            cloud_node.sphere(
                radius=(0.13, 0.085, 0.022),
                u_segments=10,
                v_segments=6,
                offset=(cx, cy, cz),
                local_rot=(ang_t - math.pi * 0.5, 0.0, ang_p + math.pi * 0.5),
                mat=mat_cloud,
            )
    cloud_node.build()

    add_magma_crust_node(root, base_radius=1.019)
    return export_glb(os.path.join(OUT_DIR, "planet-earth.glb"))


# ---------------------------------------------------------------------------
# 5. MARS (`planet-mars.glb`)
# ---------------------------------------------------------------------------
def build_mars():
    reset_scene()
    root = make_empty("Mars_Root")

    mat_rust = make_mat("Mat_MarsOchre", color=(0.74, 0.31, 0.16), metallic=0.03, roughness=0.84)
    mat_basalt = make_mat("Mat_SyrtisBasalt", color=(0.42, 0.19, 0.12), metallic=0.06, roughness=0.88)
    mat_ice = make_mat("Mat_MarsIce", color=(0.94, 0.95, 0.97), metallic=0.02, roughness=0.38)

    craters = [
        (2.25, 1.22, 0.36, 0.042),  # Hellas Planitia giant southern basin
        (1.95, 4.40, 0.24, 0.028),  # Argyre Planitia
        (1.10, 2.75, 0.20, 0.022),
    ]

    def r_fn(theta, phi):
        d, _ = crater_field(theta, phi, craters)
        # Olympus Mons shield volcano near theta=1.24, phi=3.95
        ox = math.sin(theta) * math.cos(phi) - math.sin(1.24) * math.cos(3.95)
        oy = math.sin(theta) * math.sin(phi) - math.sin(1.24) * math.sin(3.95)
        oz = math.cos(theta) - math.cos(1.24)
        od = math.sqrt(ox * ox + oy * oy + oz * oz)
        olympus = 0.052 * max(0.0, 1.0 - (od / 0.22) ** 2) if od < 0.22 else 0.0
        # Valles Marineris equatorial canyon near theta=1.68, phi in [4.5, 5.4]
        canyon = 0.0
        if abs(theta - 1.68) < 0.085 and 4.45 <= phi <= 5.42:
            canyon = -0.034 * math.cos(((theta - 1.68) / 0.085) * math.pi * 0.5)
        return 1.0 + d + olympus + canyon

    def m_fn(theta, phi):
        if theta < 0.24 or theta > math.pi - 0.21:
            return 2
        if abs(theta - 1.68) < 0.09 and 4.45 <= phi <= 5.42:
            return 1
        swirl = math.sin(theta * 3.5 + 0.6) * math.cos(phi * 2.0 - 0.8)
        return 1 if swirl > 0.38 else 0

    build_uv_globe(
        "Mars_Globe",
        parent=root,
        materials=[mat_rust, mat_basalt, mat_ice],
        u_steps=48,
        v_steps=30,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )
    add_magma_crust_node(root)
    return export_glb(os.path.join(OUT_DIR, "planet-mars.glb"))


# ---------------------------------------------------------------------------
# 6. JUPITER (`planet-jupiter.glb`)
# ---------------------------------------------------------------------------
def build_jupiter():
    reset_scene()
    root = make_empty("Jupiter_Root")

    mat_zone = make_mat("Mat_ZoneCream", color=(0.88, 0.80, 0.66), metallic=0.0, roughness=0.52)
    mat_belt_rust = make_mat("Mat_BeltRust", color=(0.68, 0.36, 0.20), metallic=0.0, roughness=0.56)
    mat_belt_tan = make_mat("Mat_BeltOchre", color=(0.76, 0.58, 0.38), metallic=0.0, roughness=0.54)
    mat_polar = make_mat("Mat_JupiterPolar", color=(0.48, 0.46, 0.45), metallic=0.0, roughness=0.60)
    mat_grs = make_mat("Mat_GreatRedSpot", color=(0.80, 0.24, 0.14), metallic=0.0, roughness=0.46)

    def r_fn(theta, phi):
        # Real Jovian oblateness: equatorial 1.000, polar 0.935
        band = 1.0 + 0.004 * math.cos(theta * 14.0)
        return (band, band, 0.935 * band)

    def m_fn(theta, phi):
        if theta < 0.34 or theta > math.pi - 0.34:
            return 3
        # Great Red Spot around 22 deg South (theta ~ 1.95 rad, phi ~ 1.15 rad)
        d_lat = (theta - 1.95) / 0.14
        d_lon = ((phi - 1.15 + math.pi) % math.tau - math.pi) / 0.28
        if d_lat * d_lat + d_lon * d_lon < 1.0:
            return 4
        wave = 0.028 * math.sin(phi * 6.0 + theta * 4.0)
        b = math.sin((theta + wave) * 13.0)
        if b > 0.25:
            return 0
        if b < -0.28:
            return 1
        return 2

    build_uv_globe(
        "Jupiter_Globe",
        parent=root,
        materials=[mat_zone, mat_belt_rust, mat_belt_tan, mat_polar, mat_grs],
        u_steps=54,
        v_steps=34,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )
    return export_glb(os.path.join(OUT_DIR, "planet-jupiter.glb"))


# ---------------------------------------------------------------------------
# 7. SATURN (`planet-saturn.glb`) — Globe + True-Scale C, B, Cassini, A Rings
# ---------------------------------------------------------------------------
def build_saturn():
    reset_scene()
    root = make_empty("Saturn_Root")

    mat_gold = make_mat("Mat_SaturnCream", color=(0.90, 0.80, 0.56), metallic=0.0, roughness=0.50)
    mat_band = make_mat("Mat_SaturnOchre", color=(0.78, 0.65, 0.42), metallic=0.0, roughness=0.54)
    mat_hex = make_mat("Mat_NorthHexagon", color=(0.50, 0.56, 0.54), metallic=0.0, roughness=0.58)

    mat_ring_c = make_mat("Mat_RingC", color=(0.56, 0.50, 0.42), metallic=0.02, roughness=0.65)
    mat_ring_b = make_mat("Mat_RingB", color=(0.88, 0.80, 0.64), metallic=0.04, roughness=0.45)
    mat_ring_a = make_mat("Mat_RingA", color=(0.74, 0.68, 0.56), metallic=0.03, roughness=0.52)

    def r_fn(theta, phi):
        # Real Kronian oblateness: equatorial 1.000, polar 0.902
        return (1.0, 1.0, 0.902)

    def m_fn(theta, phi):
        if theta < 0.28:
            return 2  # Polar hexagon region
        return 0 if math.sin(theta * 15.0) >= -0.1 else 1

    build_uv_globe(
        "Saturn_Globe",
        parent=root,
        materials=[mat_gold, mat_band, mat_hex],
        u_steps=48,
        v_steps=30,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )

    # True NASA ring-to-equatorial-radius ratios:
    # C Ring: 1.24 - 1.52 | B Ring: 1.53 - 1.95 | Cassini Division: 1.95 - 2.03 | A Ring: 2.03 - 2.27
    rings_root = make_empty("Saturn_Rings", parent=root)
    build_flat_annulus("Rings_Inner_C", rings_root, mat_ring_c, 1.24, 1.51, thickness=0.010, seg_u=72)
    build_flat_annulus("Rings_Main_B", rings_root, mat_ring_b, 1.53, 1.95, thickness=0.014, seg_u=80)
    build_flat_annulus("Rings_Outer_A", rings_root, mat_ring_a, 2.03, 2.27, thickness=0.012, seg_u=80)

    return export_glb(os.path.join(OUT_DIR, "planet-saturn.glb"))


# ---------------------------------------------------------------------------
# 8. URANUS (`planet-uranus.glb`) — Pale Cyan Ice Giant + Narrow Epsilon Rings
# ---------------------------------------------------------------------------
def build_uranus():
    reset_scene()
    root = make_empty("Uranus_Root")

    mat_cyan = make_mat("Mat_UranusCyan", color=(0.54, 0.84, 0.88), metallic=0.02, roughness=0.42)
    mat_haze = make_mat("Mat_PolarHaze", color=(0.70, 0.91, 0.93), metallic=0.02, roughness=0.40)
    mat_ring = make_mat("Mat_EpsilonRing", color=(0.44, 0.52, 0.56), metallic=0.05, roughness=0.62)

    build_uv_globe(
        "Uranus_Globe",
        parent=root,
        materials=[mat_cyan, mat_haze],
        u_steps=42,
        v_steps=26,
        radius_fn=lambda t, p: (1.0, 1.0, 0.977),
        mat_fn=lambda t, p: 1 if (t < 0.45 or t > math.pi - 0.45) else 0,
    )

    rings_root = make_empty("Uranus_Rings", parent=root)
    build_flat_annulus("Ring_Inner", rings_root, mat_ring, 1.64, 1.70, thickness=0.008, seg_u=64)
    build_flat_annulus("Ring_Epsilon", rings_root, mat_ring, 1.92, 2.00, thickness=0.010, seg_u=64)

    return export_glb(os.path.join(OUT_DIR, "planet-uranus.glb"))


# ---------------------------------------------------------------------------
# 9. NEPTUNE (`planet-neptune.glb`) — Cobalt Ice Giant + Methane Cirrus
# ---------------------------------------------------------------------------
def build_neptune():
    reset_scene()
    root = make_empty("Neptune_Root")

    mat_cobalt = make_mat("Mat_NeptuneCobalt", color=(0.14, 0.31, 0.82), metallic=0.04, roughness=0.38)
    mat_band = make_mat("Mat_NeptuneDeep", color=(0.09, 0.21, 0.66), metallic=0.04, roughness=0.42)
    mat_cirrus = make_mat("Mat_MethaneCirrus", color=(0.76, 0.88, 1.0), metallic=0.0, roughness=0.34)

    def m_fn(theta, phi):
        # Great Dark Spot + bright companion cirrus streak
        d_lat = (theta - 1.92) / 0.13
        d_lon = ((phi - 2.1 + math.pi) % math.tau - math.pi) / 0.25
        if d_lat * d_lat + d_lon * d_lon < 1.0:
            return 1
        if abs(theta - 1.76) < 0.045 and abs(((phi - 2.15 + math.pi) % math.tau - math.pi)) < 0.36:
            return 2
        if abs(theta - 1.12) < 0.040 and abs(((phi - 4.5 + math.pi) % math.tau - math.pi)) < 0.42:
            return 2
        return 0 if math.sin(theta * 11.0) >= -0.25 else 1

    build_uv_globe(
        "Neptune_Globe",
        parent=root,
        materials=[mat_cobalt, mat_band, mat_cirrus],
        u_steps=44,
        v_steps=28,
        radius_fn=lambda t, p: (1.0, 1.0, 0.983),
        mat_fn=m_fn,
    )
    return export_glb(os.path.join(OUT_DIR, "planet-neptune.glb"))


# ---------------------------------------------------------------------------
# 10. DWARF PLANET / MOON (`planet-dwarf.glb`) — Pluto / Ceres / Luna
# ---------------------------------------------------------------------------
def build_dwarf():
    reset_scene()
    root = make_empty("Dwarf_Root")

    mat_ice_tan = make_mat("Mat_NitrogenTan", color=(0.72, 0.64, 0.56), metallic=0.02, roughness=0.76)
    mat_heart = make_mat("Mat_TombaughIce", color=(0.92, 0.89, 0.84), metallic=0.02, roughness=0.48)
    mat_tholin = make_mat("Mat_CthulhuDark", color=(0.38, 0.25, 0.20), metallic=0.04, roughness=0.86)

    craters = [
        (1.05, 2.20, 0.28, 0.035),
        (2.05, 4.10, 0.25, 0.032),
        (1.55, 5.10, 0.22, 0.028),
    ]

    def r_fn(theta, phi):
        d, _ = crater_field(theta, phi, craters)
        return 1.0 + d + 0.008 * math.sin(theta * 8.0) * math.cos(phi * 7.0)

    def m_fn(theta, phi):
        # Iconic bright nitrogen-ice basin (Tombaugh Regio / Occator bright spot)
        d_lat = (theta - 1.48) / 0.34
        d_lon = ((phi - 0.85 + math.pi) % math.tau - math.pi) / 0.38
        if d_lat * d_lat + d_lon * d_lon < 1.0:
            return 1
        if abs(theta - 1.72) < 0.28 and 2.5 <= phi <= 4.4:
            return 2
        return 0

    build_uv_globe(
        "Dwarf_Globe",
        parent=root,
        materials=[mat_ice_tan, mat_heart, mat_tholin],
        u_steps=36,
        v_steps=22,
        radius_fn=r_fn,
        mat_fn=m_fn,
    )
    add_magma_crust_node(root)
    return export_glb(os.path.join(OUT_DIR, "planet-dwarf.glb"))


# ---------------------------------------------------------------------------
# 11. ASTEROID IMPACTOR (`asteroid-impactor.glb`)
# ---------------------------------------------------------------------------
def build_asteroid_impactor():
    reset_scene()
    root = make_empty("Asteroid_Root")

    mat_rock = make_mat("Mat_ChondriteRock", color=(0.36, 0.32, 0.28), metallic=0.14, roughness=0.90)
    mat_iron = make_mat("Mat_NickelIron", color=(0.52, 0.50, 0.48), metallic=0.72, roughness=0.46)
    mat_glow = make_mat(
        "Mat_FissureGlow",
        color=(1.0, 0.45, 0.10),
        metallic=0.0,
        roughness=0.25,
        emission=(1.0, 0.38, 0.06),
        emission_strength=3.8,
    )

    craters = [
        (1.20, 0.60, 0.46, 0.14),
        (2.05, 2.50, 0.38, 0.11),
        (0.95, 4.20, 0.35, 0.10),
        (1.75, 5.40, 0.32, 0.09),
    ]

    def r_fn(theta, phi):
        d, _ = crater_field(theta, phi, craters)
        lobe1 = 0.16 * math.sin(2.0 * theta + 0.3) * math.cos(phi - 0.4)
        lobe2 = 0.11 * math.cos(3.0 * theta - 0.6) * math.sin(2.0 * phi + 0.8)
        lobe3 = 0.07 * math.sin(5.0 * theta) * math.cos(3.0 * phi - 1.1)
        s = max(0.62, 1.0 + lobe1 + lobe2 + lobe3 + d)
        return (1.18 * s, 0.88 * s, 0.92 * s)

    def m_fn(theta, phi):
        fissure = abs(math.sin(theta * 4.0 + 0.5 * math.cos(phi * 3.0)) * math.cos(phi * 3.0 - 0.4))
        if fissure < 0.11:
            return 2  # Glowing plasma entry / thermal fissure vein
        nodule = math.sin(theta * 7.0) * math.cos(phi * 6.0)
        return 1 if nodule > 0.52 else 0

    build_uv_globe(
        "Asteroid_Body",
        parent=root,
        materials=[mat_rock, mat_iron, mat_glow],
        u_steps=32,
        v_steps=20,
        radius_fn=r_fn,
        mat_fn=m_fn,
        smooth=False,
    )
    return export_glb(os.path.join(OUT_DIR, "asteroid-impactor.glb"))


# ---------------------------------------------------------------------------
# 12. IMPACT SHOCKWAVE & SUPERNOVA RING (`impact-ring.glb`)
# ---------------------------------------------------------------------------
def build_impact_ring():
    reset_scene()
    root = make_empty("Shockwave_Root")

    mat_shock = make_mat(
        "Mat_ShockPlasma",
        color=(1.0, 0.68, 0.22),
        metallic=0.0,
        roughness=0.18,
        emission=(1.0, 0.56, 0.14),
        emission_strength=5.0,
    )
    mat_plume = make_mat(
        "Mat_EjectaCore",
        color=(1.0, 0.32, 0.08),
        metallic=0.0,
        roughness=0.28,
        emission=(1.0, 0.25, 0.04),
        emission_strength=3.6,
    )

    pb = PartBuilder("Shock_Torus", parent=root)
    pb.torus(major_radius=1.0, minor_radius=0.075, major_seg=36, minor_seg=10, mat=mat_shock)
    pb.build()

    crown = PartBuilder("Plume_Crown", parent=root)
    for k in range(12):
        ang = (k / 12) * math.tau
        crown.cylinder(
            radius1=0.085,
            radius2=0.012,
            depth=0.48,
            segments=6,
            offset=(math.cos(ang) * 0.92, math.sin(ang) * 0.92, 0.14),
            local_rot=(math.sin(ang) * 0.72, -math.cos(ang) * 0.72, 0.0),
            mat=mat_plume,
        )
    crown.build()

    return export_glb(os.path.join(OUT_DIR, "impact-ring.glb"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    builders = [
        ("sun-star.glb", build_sun_star),
        ("planet-mercury.glb", build_mercury),
        ("planet-venus.glb", build_venus),
        ("planet-earth.glb", build_earth),
        ("planet-mars.glb", build_mars),
        ("planet-jupiter.glb", build_jupiter),
        ("planet-saturn.glb", build_saturn),
        ("planet-uranus.glb", build_uranus),
        ("planet-neptune.glb", build_neptune),
        ("planet-dwarf.glb", build_dwarf),
        ("asteroid-impactor.glb", build_asteroid_impactor),
        ("impact-ring.glb", build_impact_ring),
    ]
    total_bytes = 0
    for fname, fn in builders:
        info = fn()
        total_bytes += info["bytes"]
        print(f"OK {fname:24s} {info['bytes']:7d} B  nodes={info['nodes']}")
    print(f"Generated {len(builders)} Blender 5.2 PBR models ({total_bytes / 1024:.1f} KB total)")


if __name__ == "__main__":
    main()
