"""
Render 1280x800 promotional screenshot for Voice Simulator (`screenshots/VoiceSimulator.webp`)
using Blender 5.2 Cycles and the focused high-resolution 3D Mouth (`mouth-avatar.glb`) + vocal-studio.hdr.
Single hero 3D mouth in expressive mid-syllable articulation — zero mic/desk clutter.
"""

import math
import os
import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
BUNDLE_DIR = os.path.join(REPO_ROOT, "bundles", "games", "VoiceSimulator")
MODELS_DIR = os.path.join(BUNDLE_DIR, "assets", "models")
HDR_PATH = os.path.join(BUNDLE_DIR, "assets", "env", "vocal-studio.hdr")
OUT_WEBP = os.path.join(REPO_ROOT, "screenshots", "VoiceSimulator.webp")


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


def set_shape_key(objs, key_name: str, value: float):
    for o in objs:
        if o.type == "MESH" and o.data.shape_keys and key_name in o.data.shape_keys.key_blocks:
            o.data.shape_keys.key_blocks[key_name].value = value


def find_node(objs, prefix: str):
    for o in objs:
        if o.name.startswith(prefix):
            return o
    return None


def rotate_node_xyz(node, rx=0.0, ry=0.0, rz=0.0):
    if node is None:
        return
    node.rotation_mode = "XYZ"
    node.rotation_euler.x += rx
    node.rotation_euler.y += ry
    node.rotation_euler.z += rz


def main():
    clear_all()
    scene = bpy.context.scene

    # 1. Subtle Dark Acoustic Studio HDRI World
    world = bpy.data.worlds.new("VocalStudioWorld")
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.50
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDR_PATH)
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Clean matte studio cyclorama backdrop behind the mouth
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 1.40, 0.0), rotation=(math.pi * 0.5, 0.0, 0.0))
    backdrop = bpy.context.active_object
    bmat = bpy.data.materials.new("Mat_Studio_Backdrop")
    bsdf = bmat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.018, 0.024, 0.040, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.80
    backdrop.data.materials.append(bmat)

    # 2. Single Hero 3D Mouth (`mouth-avatar.glb`) in lifelike mid-speech articulation!
    _, mouth_objs = import_glb("mouth-avatar.glb", loc=(0.0, 0.0, 0.0), rot=(0.03, 0.0, -0.11), scale=1.0)

    jaw_open = 0.58
    set_shape_key(mouth_objs, "Jaw_Open", jaw_open)
    set_shape_key(mouth_objs, "Lip_Round", 0.22)
    set_shape_key(mouth_objs, "Upper_Lip_Raise", 0.20)
    set_shape_key(mouth_objs, "Corner_Up", 0.28)
    set_shape_key(mouth_objs, "Feminine_Mouth", 0.35)
    set_shape_key(mouth_objs, "Asymmetry_Natural", 0.16)

    # Set rotation_mode='XYZ' on glTF-imported nodes before applying Euler angles!
    rotate_node_xyz(find_node(mouth_objs, "Jaw_Pivot"), rx=+0.42 * jaw_open)
    set_shape_key(mouth_objs, "Tongue_Tip_Up", 0.36)
    set_shape_key(mouth_objs, "Tongue_High_Front", 0.22)

    # 3. Three-Point Macro Portrait Studio Lighting
    key_data = bpy.data.lights.new("WarmKey", type="AREA")
    key_data.energy = 15.5
    key_data.color = (1.0, 0.95, 0.90)
    key_data.size = 0.95
    key_obj = bpy.data.objects.new("WarmKey", key_data)
    bpy.context.scene.collection.objects.link(key_obj)
    key_obj.location = (-0.60, -1.05, 0.52)
    key_obj.rotation_euler = (Vector((0.0, -0.08, -0.02)) - key_obj.location).to_track_quat("-Z", "Y").to_euler()

    rim_data = bpy.data.lights.new("CyanRim", type="AREA")
    rim_data.energy = 11.5
    rim_data.color = (0.55, 0.85, 1.0)
    rim_data.size = 0.95
    rim_obj = bpy.data.objects.new("CyanRim", rim_data)
    bpy.context.scene.collection.objects.link(rim_obj)
    rim_obj.location = (0.78, -0.75, 0.45)
    rim_obj.rotation_euler = (Vector((0.0, -0.05, 0.0)) - rim_obj.location).to_track_quat("-Z", "Y").to_euler()

    # Soft oral-interior fill from front so upper/lower teeth, scalloped gums, tongue & uvula shine naturally
    fill_data = bpy.data.lights.new("OralFill", type="AREA")
    fill_data.energy = 6.5
    fill_data.color = (1.0, 0.93, 0.95)
    fill_data.size = 0.70
    fill_obj = bpy.data.objects.new("OralFill", fill_data)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.location = (0.04, -1.05, -0.10)
    fill_obj.rotation_euler = (Vector((0.0, 0.02, -0.02)) - fill_obj.location).to_track_quat("-Z", "Y").to_euler()

    bg_spot_data = bpy.data.lights.new("BackdropGlow", type="POINT")
    bg_spot_data.energy = 24.0
    bg_spot_data.color = (0.18, 0.50, 0.95)
    bg_spot_data.shadow_soft_size = 0.75
    bg_spot = bpy.data.objects.new("BackdropGlow", bg_spot_data)
    bpy.context.scene.collection.objects.link(bg_spot)
    bg_spot.location = (0.0, 0.85, 0.04)

    # 4. Balanced Macro Framing showing the complete sculpted mouth + soft studio margin
    cam_data = bpy.data.cameras.new("MouthMacroCam")
    cam_data.lens = 62.0
    cam_obj = bpy.data.objects.new("MouthMacroCam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = (-0.09, -1.52, 0.03)
    direction = Vector((0.0, -0.06, -0.030)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    # 5. Render 1280x800 WebP
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 56
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.05

    os.makedirs(os.path.dirname(OUT_WEBP), exist_ok=True)
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 92
    scene.render.filepath = OUT_WEBP
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {OUT_WEBP} ({os.path.getsize(OUT_WEBP)} bytes)")


if __name__ == "__main__":
    main()
