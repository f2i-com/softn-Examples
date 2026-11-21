"""
Render 1280x800 promotional screenshot for Solar Simulator (`screenshots/SolarSimulator.webp`)
using Blender 5.2 Cycles and the bundle's 12 PBR .glb celestial assets + deep-space.hdr.
"""

import math
import os
import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "SolarSimulator")
MODELS_DIR = os.path.join(BUNDLE_DIR, "assets", "models")
HDR_PATH = os.path.join(BUNDLE_DIR, "assets", "env", "deep-space.hdr")
OUT_WEBP = os.path.join(REPO_ROOT, "screenshots", "SolarSimulator.webp")


def clear_all():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(filename, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), scale=1.0, hide_magma=True):
    filepath = os.path.join(MODELS_DIR, filename)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    added = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in added if o.parent is None]
    wrapper = bpy.data.objects.new(f"Wrap_{filename}", None)
    bpy.context.scene.collection.objects.link(wrapper)
    for r in roots:
        r.parent = wrapper
    wrapper.location = loc
    wrapper.rotation_euler = Euler(rot, "XYZ")
    if isinstance(scale, (int, float)):
        wrapper.scale = (scale, scale, scale)
    else:
        wrapper.scale = scale

    if hide_magma:
        for o in added:
            if "Magma_Crust" in o.name:
                o.hide_render = True
                o.hide_viewport = True

    return wrapper, added


def boost_star_emission(objs, rgb=(1.0, 0.72, 0.22), strength=6.5):
    for o in objs:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            if slot.material and slot.material.use_nodes:
                m = slot.material.copy()
                slot.material = m
                for n in m.node_tree.nodes:
                    if n.type == "BSDF_PRINCIPLED" and "Emission Color" in n.inputs:
                        n.inputs["Emission Color"].default_value = (*rgb, 1.0)
                        n.inputs["Emission Strength"].default_value = strength


def add_orbit_ring(radius, color_rgb, strength=2.6, thickness=0.016, center=(-2.6, 0.0, 0.0), tilt=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius,
        minor_radius=thickness,
        major_segments=128,
        minor_segments=12,
        location=center,
        rotation=tilt,
    )
    ring = bpy.context.active_object
    mat = bpy.data.materials.new(f"OrbitMat_{radius:.2f}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color_rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.4
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*color_rgb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    ring.data.materials.append(mat)
    return ring


def main():
    clear_all()
    scene = bpy.context.scene

    # 1. Cosmic Milky Way HDRI World
    world = bpy.data.worlds.new("DeepSpaceWorld")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.28
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDR_PATH)
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Distant 3D Pinpoint Background Stars
    star_mat = bpy.data.materials.new("PinpointStarMat")
    star_mat.use_nodes = True
    s_bsdf = star_mat.node_tree.nodes["Principled BSDF"]
    if "Emission Color" in s_bsdf.inputs:
        s_bsdf.inputs["Emission Color"].default_value = (0.88, 0.94, 1.0, 1.0)
        s_bsdf.inputs["Emission Strength"].default_value = 9.0
    seed = 424242
    for si in range(95):
        seed = (seed * 1664525 + 1013904223) % 4294967296
        sx = -18.0 + (seed / 4294967296) * 38.0
        seed = (seed * 1664525 + 1013904223) % 4294967296
        sy = 12.0 + (seed / 4294967296) * 14.0
        seed = (seed * 1664525 + 1013904223) % 4294967296
        sz = -6.0 + (seed / 4294967296) * 16.0
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.032 + (si % 3) * 0.014, location=(sx, sy, sz))
        st_obj = bpy.context.active_object
        st_obj.data.materials.append(star_mat)

    sun_center = (-2.55, 0.35, 0.0)

    # 2. Primary Sculpted Sun (keep native sunspots, chromosphere & prominences crisp!) + Companion Red-Orange Star
    import_glb(
        "sun-star.glb",
        loc=sun_center,
        rot=(0.25, -0.35, 0.55),
        scale=1.18,
        hide_magma=False,
    )

    _, comp_objs = import_glb(
        "sun-star.glb",
        loc=(-1.25, 2.55, 0.68),
        rot=(0.1, 0.3, -0.4),
        scale=0.44,
        hide_magma=False,
    )
    boost_star_emission(comp_objs, rgb=(0.98, 0.24, 0.08), strength=2.2)

    # 3. Glowing Orbital Ellipses + Habitable Zone Ring
    orbit_defs = [
        (1.65, (0.66, 0.64, 0.62), 1.8, 0.011, (0.04, -0.02, 0.0)),
        (2.35, (0.98, 0.80, 0.18), 2.1, 0.012, (-0.02, 0.03, 0.0)),
        (3.25, (0.22, 0.74, 0.98), 3.2, 0.015, (0.0, 0.0, 0.0)),
        (3.55, (0.16, 0.88, 0.58), 1.5, 0.010, (0.0, 0.0, 0.0)),
        (4.30, (0.98, 0.45, 0.12), 2.5, 0.014, (0.03, 0.02, 0.0)),
        (5.75, (0.98, 0.58, 0.24), 2.4, 0.016, (-0.02, 0.01, 0.0)),
        (7.25, (0.99, 0.88, 0.32), 2.4, 0.017, (0.04, -0.03, 0.0)),
        (8.65, (0.38, 0.90, 0.98), 2.0, 0.016, (-0.03, 0.02, 0.0)),
    ]
    for rad, col, em, thk, tilt in orbit_defs:
        add_orbit_ring(rad, col, strength=em, thickness=thk, center=sun_center, tilt=tilt)

    # 4. Sculpted Solar System Planets Along Their Orbits
    # Mercury & Venus
    import_glb("planet-mercury.glb", loc=(-1.05, -0.35, 0.04), rot=(0.0, 0.0, 0.5), scale=0.17)
    import_glb("planet-venus.glb", loc=(-0.55, -0.88, -0.04), rot=(0.05, 0.0, 1.1), scale=0.26)

    # Hero Earth + Orbiting Moon in Foreground!
    import_glb("planet-earth.glb", loc=(0.24, -1.32, 0.02), rot=(0.41, 0.0, -0.65), scale=0.36)
    import_glb("planet-dwarf.glb", loc=(0.68, -1.58, 0.16), rot=(0.1, 0.0, 0.4), scale=0.10)

    # Mars Struck by Massive Glowing Impactor Asteroid + Shockwave Ring!
    mars_pos = (1.58, -0.82, 0.10)
    import_glb("planet-mars.glb", loc=mars_pos, rot=(0.44, 0.0, 0.35), scale=0.28, hide_magma=False)
    import_glb(
        "asteroid-impactor.glb",
        loc=(1.22, -1.16, 0.36),
        rot=(0.6, 0.4, -0.8),
        scale=0.16,
        hide_magma=False,
    )
    import_glb(
        "impact-ring.glb",
        loc=(1.44, -0.95, 0.18),
        rot=(0.45, -0.35, 0.2),
        scale=0.42,
        hide_magma=False,
    )

    # Banded Jupiter with Great Red Spot + Ringed Saturn + Tilted Uranus + Neptune!
    import_glb("planet-jupiter.glb", loc=(2.85, 0.22, 0.06), rot=(0.06, 0.0, -0.55), scale=0.68)
    import_glb("planet-saturn.glb", loc=(3.88, 2.05, 0.22), rot=(0.46, -0.18, 0.42), scale=0.58)
    import_glb("planet-uranus.glb", loc=(5.05, 3.65, -0.12), rot=(1.45, 0.2, 0.3), scale=0.38)
    import_glb("planet-neptune.glb", loc=(2.35, 4.95, 0.28), rot=(0.48, 0.0, -0.3), scale=0.35)

    # 5. Solar Sunlight + Cosmic Rim Illumination
    sun_light_data = bpy.data.lights.new("SolarPoint", type="POINT")
    sun_light_data.energy = 1450.0
    sun_light_data.color = (1.0, 0.93, 0.80)
    sun_light_data.shadow_soft_size = 0.85
    sun_light = bpy.data.objects.new("SolarPoint", sun_light_data)
    bpy.context.scene.collection.objects.link(sun_light)
    sun_light.location = (-2.35, 0.25, 0.35)

    fill_data = bpy.data.lights.new("CosmicRim", type="SUN")
    fill_data.energy = 1.35
    fill_data.color = (0.68, 0.84, 1.0)
    fill_obj = bpy.data.objects.new("CosmicRim", fill_data)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = Euler((0.95, -0.45, 0.65), "XYZ")

    impact_glow_data = bpy.data.lights.new("ImpactFlash", type="POINT")
    impact_glow_data.energy = 85.0
    impact_glow_data.color = (1.0, 0.42, 0.16)
    impact_glow = bpy.data.objects.new("ImpactFlash", impact_glow_data)
    bpy.context.scene.collection.objects.link(impact_glow)
    impact_glow.location = (1.36, -1.05, 0.28)

    # 6. Wide Cinematic Observatory Camera
    cam_data = bpy.data.cameras.new("SolarPromoCam")
    cam_data.lens = 26.0
    cam_obj = bpy.data.objects.new("SolarPromoCam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = (0.65, -5.85, 2.55)
    target = Vector((0.62, 0.25, 0.05))
    direction = target - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    # 7. Render Settings (1280x800 WebP via Cycles CPU + AgX)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.12

    os.makedirs(os.path.dirname(OUT_WEBP), exist_ok=True)
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 90
    scene.render.filepath = OUT_WEBP
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {OUT_WEBP} ({os.path.getsize(OUT_WEBP)} bytes)")


if __name__ == "__main__":
    main()
