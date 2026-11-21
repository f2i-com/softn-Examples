"""
Render 1280x800 promotional screenshot for Potato Peeler (`screenshots/PotatoPeeler.webp`)
using Blender 5.2 Cycles and the bundle's 17 PBR .glb assets + commissary-lamp.hdr.
"""

import os
import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "PotatoPeeler")
MODELS_DIR = os.path.join(BUNDLE_DIR, "assets", "models")
HDR_PATH = os.path.join(BUNDLE_DIR, "assets", "env", "commissary-lamp.hdr")
OUT_WEBP = os.path.join(REPO_ROOT, "screenshots", "PotatoPeeler.webp")


def clear_all():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(filename, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), scale=1.0):
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
    return wrapper, added


def tint_material_copy(objs, mat_prefix, base_rgb, metallic=None, emission_rgb=None, emission_str=0.0):
    for o in objs:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            if slot.material and slot.material.name.startswith(mat_prefix):
                m = slot.material.copy()
                slot.material = m
                if m.use_nodes:
                    for n in m.node_tree.nodes:
                        if n.type == "BSDF_PRINCIPLED":
                            n.inputs["Base Color"].default_value = (*base_rgb, 1.0)
                            if metallic is not None:
                                n.inputs["Metallic"].default_value = metallic
                            if emission_rgb is not None and "Emission Color" in n.inputs:
                                n.inputs["Emission Color"].default_value = (*emission_rgb, 1.0)
                                n.inputs["Emission Strength"].default_value = emission_str


def main():
    clear_all()
    scene = bpy.context.scene

    # 1. Environment HDRI
    world = bpy.data.worlds.new("CommissaryWorld")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.85
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDR_PATH)
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Note: glTF (x, y, z) corresponds to Blender (x, -z, y)
    import_glb("kitchen-station.glb", loc=(0.0, 0.0, 0.0))
    import_glb("samovar-prop.glb", loc=(1.28, 1.28, 1.395), scale=0.95)
    import_glb("burlap-sack.glb", loc=(-1.94, 0.28, -0.12), rot=(0.0, 0.0, -0.34), scale=0.96)
    _, pot_objs = import_glb("enamel-pot.glb", loc=(1.94, 0.22, -0.12), rot=(0.0, 0.0, 0.25), scale=0.95)
    tint_material_copy(pot_objs, "Mat_StarchWater", (0.58, 0.08, 0.10))
    import_glb("quota-scale.glb", loc=(-1.18, 0.88, -0.12), rot=(0.0, 0.0, -0.22), scale=0.95)

    # New v2.0 Commissary Counter Props: Podstakannik Hot Tea Glass + Brass Service Bell!
    import_glb("tea-glass.glb", loc=(1.24, 0.92, -0.12), rot=(0.0, 0.0, 0.45), scale=1.02)
    import_glb("commissar-bell.glb", loc=(-1.68, -0.38, -0.12), rot=(0.0, 0.0, -0.32), scale=1.02)

    # 2. Center Hero Potato (half-peeled showing golden flesh underneath!)
    _, center_objs = import_glb(
        "potato-whole.glb",
        loc=(-0.06, -0.06, 0.175),
        rot=(0.35, 0.06, -0.18),
        scale=0.82,
    )
    tint_material_copy(center_objs, "Mat_Skin", (0.34, 0.20, 0.10))
    hidden_patches = {"Skin_01", "Skin_02", "Skin_05", "Skin_06", "Skin_09", "Skin_10", "Sprout_1"}
    for o in center_objs:
        for hp in hidden_patches:
            if o.name.startswith(hp):
                o.hide_render = True
                o.hide_viewport = True

    # 3. Left Red October Potato (partially peeled) + Scuttling Colorado Saboteur Beetle!
    _, left_objs = import_glb(
        "potato-whole.glb",
        loc=(-0.68, -0.12, 0.17),
        rot=(-0.25, -0.04, 0.22),
        scale=0.76,
    )
    tint_material_copy(left_objs, "Mat_Skin", (0.56, 0.10, 0.09))
    for o in left_objs:
        if o.name.startswith("Skin_05") or o.name.startswith("Skin_06"):
            o.hide_render = True

    import_glb(
        "beetle-pest.glb",
        loc=(-0.98, 0.16, 0.02),
        rot=(0.0, 0.0, -1.05),
        scale=0.95,
    )

    # 4. Right Giant Boss Tsar-Kartoshka + VDNKh Gold Star Crown!
    _, right_objs = import_glb(
        "potato-whole.glb",
        loc=(0.68, -0.08, 0.21),
        rot=(0.18, 0.08, -0.24),
        scale=0.98,
    )
    tint_material_copy(
        right_objs,
        "Mat_Skin",
        (0.88, 0.56, 0.05),
        metallic=0.45,
        emission_rgb=(0.95, 0.62, 0.06),
        emission_str=0.32,
    )
    import_glb(
        "tsar-crown.glb",
        loc=(0.68, -0.08, 0.435),
        rot=(0.06, -0.04, 0.35),
        scale=0.92,
    )

    # 5. Flying 3D Peel Curls mid-air!
    curl_specs = [
        ((0.12, -0.06, 0.44), (0.6, 0.4, 0.8), 1.05),
        ((0.34, -0.02, 0.58), (1.4, -0.5, 1.2), 0.98),
        ((0.64, 0.05, 0.54), (-0.8, 0.9, 0.3), 0.95),
        ((-0.46, -0.10, 0.40), (0.9, -0.7, 0.5), 0.98),
    ]
    for cloc, crot, csc in curl_specs:
        _, c_objs = import_glb("peel-curl.glb", loc=cloc, rot=crot, scale=csc)
        tint_material_copy(c_objs, "Mat_Skin", (0.36, 0.21, 0.11))

    # 6. Hero Sputnik-2 Swivel Peeler sweeping over Center Potato + Kosmos-9 Ruby Laser-Lathe!
    import_glb(
        "peeler-swivel.glb",
        loc=(-0.04, -0.22, 0.40),
        rot=(0.65, 0.18, 2.85),
        scale=1.12,
    )
    import_glb(
        "peeler-laser.glb",
        loc=(0.98, -0.46, 0.48),
        rot=(0.42, -0.22, 2.65),
        scale=1.05,
    )

    # Glowing Ruby Laser Beam hitting Boss Tsar-Kartoshka!
    bpy.ops.mesh.primitive_cylinder_add(radius=0.014, depth=0.44, location=(0.82, -0.26, 0.35))
    beam = bpy.context.active_object
    beam.rotation_euler = Euler((0.92, -0.45, 0.35), "XYZ")
    bmat = bpy.data.materials.new("LaserBeamMat")
    bmat.use_nodes = True
    bsdf = bmat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1.0, 0.12, 0.18, 1.0)
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.10, 0.16, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 18.0
    beam.data.materials.append(bmat)

    # 7. Studio Commissary Key + Rim Lights
    key_data = bpy.data.lights.new("PendantKey", type="AREA")
    key_data.energy = 190.0
    key_data.color = (1.0, 0.88, 0.68)
    key_data.size = 2.4
    key_obj = bpy.data.objects.new("PendantKey", key_data)
    bpy.context.scene.collection.objects.link(key_obj)
    key_obj.location = (0.9, -2.3, 3.2)
    key_obj.rotation_euler = Euler((0.58, 0.22, 0.0), "XYZ")

    rim_data = bpy.data.lights.new("SnowWindowRim", type="AREA")
    rim_data.energy = 90.0
    rim_data.color = (0.70, 0.88, 1.0)
    rim_data.size = 2.6
    rim_obj = bpy.data.objects.new("SnowWindowRim", rim_data)
    bpy.context.scene.collection.objects.link(rim_obj)
    rim_obj.location = (-2.8, -1.5, 2.2)
    rim_obj.rotation_euler = Euler((0.72, -0.68, 0.0), "XYZ")

    warm_data = bpy.data.lights.new("SamovarGlow", type="POINT")
    warm_data.energy = 80.0
    warm_data.color = (1.0, 0.62, 0.24)
    warm_obj = bpy.data.objects.new("SamovarGlow", warm_data)
    bpy.context.scene.collection.objects.link(warm_obj)
    warm_obj.location = (1.15, 0.85, 1.65)

    # 8. Camera Framing
    cam_data = bpy.data.cameras.new("PromoCam")
    cam_data.lens = 25.0
    cam_obj = bpy.data.objects.new("PromoCam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = (0.0, -3.45, 1.85)
    direction = Vector((0.0, 0.35, 0.62)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    # 9. Render Settings (1280x800 WebP via Cycles CPU)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.06

    os.makedirs(os.path.dirname(OUT_WEBP), exist_ok=True)
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 90
    scene.render.filepath = OUT_WEBP
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {OUT_WEBP} ({os.path.getsize(OUT_WEBP)} bytes)")


if __name__ == "__main__":
    main()
