"""
Reusable headless Blender 5.2 PBR modelling & glTF (.glb) export library
for SoftN v0.0.40 3D games and showcases.

Coordinate conventions (with export_yup=True):
- Model characters facing Blender -Y (which exports to glTF +Z), up = Blender +Z (glTF +Y), right = +X.
  In SoftN Scene3D, `rotation: { x: 0, y: Math.atan2(dx, dz), z: 0 }` aims glTF +Z directly at `(dx, dz)`.
- Model first-person viewmodel weapons pointing along Blender +Y (exports to glTF -Z), up = +Z (glTF +Y), right = +X,
  matching camera view space directly.
"""

import math
import os
import json
import struct
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    return scene


def make_mat(
    name: str,
    color=(0.6, 0.6, 0.6),
    metallic: float = 0.0,
    roughness: float = 0.55,
    emission=None,
    emission_strength: float = 0.0,
    alpha: float = 1.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = None
    for n in nt.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            bsdf = n
            break
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')

    r, g, b = color[0], color[1], color[2]
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Metallic'].default_value = max(0.0, min(1.0, float(metallic)))
    bsdf.inputs['Roughness'].default_value = max(0.04, min(1.0, float(roughness)))
    if 'Alpha' in bsdf.inputs:
        bsdf.inputs['Alpha'].default_value = max(0.0, min(1.0, float(alpha)))
    if alpha < 0.99:
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else 'OPAQUE'
    if emission is not None and emission_strength > 0.0:
        er, eg, eb = emission[0], emission[1], emission[2]
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (er, eg, eb, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = (er, eg, eb, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = float(emission_strength)
    return mat


def make_empty(name: str, location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0), parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = 0.1
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    if parent is not None:
        obj.parent = parent
    return obj


class PartBuilder:
    """Builds a single named Mesh object with one or more sub-shapes and PBR materials."""

    def __init__(self, name: str, location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0), parent=None):
        self.name = name
        self.location = location
        self.rotation = rotation
        self.parent = parent
        self.bm = bmesh.new()
        self.materials = []
        self._mat_index = {}

    def _slot(self, mat) -> int:
        if mat is None:
            return 0
        key = id(mat)
        if key not in self._mat_index:
            self._mat_index[key] = len(self.materials)
            self.materials.append(mat)
        return self._mat_index[key]

    def _transform_new(self, verts, offset=(0.0, 0.0, 0.0), local_rot=(0.0, 0.0, 0.0)):
        rot_m = Euler(local_rot, 'XYZ').to_matrix()
        off = Vector(offset)
        for v in verts:
            v.co = (rot_m @ v.co) + off

    def box(
        self,
        size=(1.0, 1.0, 1.0),
        offset=(0.0, 0.0, 0.0),
        local_rot=(0.0, 0.0, 0.0),
        mat=None,
        bevel: float = 0.0,
        smooth: bool = True,
        taper_top=None,
        taper_bottom=None,
    ):
        slot = self._slot(mat)
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        sx, sy, sz = size
        for v in tmp.verts:
            vx, vy, vz = v.co.x * sx, v.co.y * sy, v.co.z * sz
            if taper_top is not None and v.co.z > 0:
                vx *= taper_top[0]
                vy *= taper_top[1]
            if taper_bottom is not None and v.co.z < 0:
                vx *= taper_bottom[0]
                vy *= taper_bottom[1]
            v.co = Vector((vx, vy, vz))
        if bevel > 0.0 and len(tmp.edges) > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
        self._transform_new(tmp.verts, offset, local_rot)
        for f in tmp.faces:
            f.smooth = smooth
            f.material_index = slot
        self._merge_tmp(tmp)
        return self

    def cylinder(
        self,
        radius1: float = 0.5,
        radius2: float = 0.5,
        depth: float = 1.0,
        segments: int = 12,
        offset=(0.0, 0.0, 0.0),
        local_rot=(0.0, 0.0, 0.0),
        mat=None,
        bevel: float = 0.0,
        smooth: bool = True,
    ):
        slot = self._slot(mat)
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=segments, radius1=radius1, radius2=radius2, depth=depth)
        if bevel > 0.0 and len(tmp.edges) > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
        self._transform_new(tmp.verts, offset, local_rot)
        for f in tmp.faces:
            f.smooth = smooth
            f.material_index = slot
        self._merge_tmp(tmp)
        return self

    def sphere(
        self,
        radius=(0.5, 0.5, 0.5),
        u_segments: int = 14,
        v_segments: int = 10,
        offset=(0.0, 0.0, 0.0),
        local_rot=(0.0, 0.0, 0.0),
        mat=None,
        smooth: bool = True,
    ):
        slot = self._slot(mat)
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=u_segments, v_segments=v_segments, radius=1.0)
        rx, ry, rz = radius if isinstance(radius, (tuple, list)) else (radius, radius, radius)
        for v in tmp.verts:
            v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))
        self._transform_new(tmp.verts, offset, local_rot)
        for f in tmp.faces:
            f.smooth = smooth
            f.material_index = slot
        self._merge_tmp(tmp)
        return self

    def icosphere(
        self,
        radius=(0.5, 0.5, 0.5),
        subdivisions: int = 2,
        offset=(0.0, 0.0, 0.0),
        local_rot=(0.0, 0.0, 0.0),
        mat=None,
        smooth: bool = False,
    ):
        slot = self._slot(mat)
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdivisions, radius=1.0)
        rx, ry, rz = radius if isinstance(radius, (tuple, list)) else (radius, radius, radius)
        for v in tmp.verts:
            v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))
        self._transform_new(tmp.verts, offset, local_rot)
        for f in tmp.faces:
            f.smooth = smooth
            f.material_index = slot
        self._merge_tmp(tmp)
        return self

    def torus(
        self,
        major_radius: float = 0.5,
        minor_radius: float = 0.08,
        major_seg: int = 24,
        minor_seg: int = 10,
        offset=(0.0, 0.0, 0.0),
        local_rot=(0.0, 0.0, 0.0),
        mat=None,
        smooth: bool = True,
    ):
        slot = self._slot(mat)
        tmp = bmesh.new()
        verts_ring = []
        for i in range(major_seg):
            a = (i / major_seg) * math.tau
            ca, sa = math.cos(a), math.sin(a)
            loop = []
            for j in range(minor_seg):
                b = (j / minor_seg) * math.tau
                cb, sb = math.cos(b), math.sin(b)
                r = major_radius + minor_radius * cb
                loop.append(tmp.verts.new((r * ca, r * sa, minor_radius * sb)))
            verts_ring.append(loop)
        for i in range(major_seg):
            i2 = (i + 1) % major_seg
            for j in range(minor_seg):
                j2 = (j + 1) % minor_seg
                f = tmp.faces.new((verts_ring[i][j], verts_ring[i2][j], verts_ring[i2][j2], verts_ring[i][j2]))
                f.smooth = smooth
                f.material_index = slot
        self._transform_new(tmp.verts, offset, local_rot)
        self._merge_tmp(tmp)
        return self

    def _merge_tmp(self, tmp):
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        vmap = {}
        for v in tmp.verts:
            vmap[v] = self.bm.verts.new(v.co)
        for f in tmp.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.smooth = f.smooth
            nf.material_index = f.material_index
        tmp.free()

    def build(self):
        mesh = bpy.data.meshes.new(self.name + '_mesh')
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        for m in self.materials:
            obj.data.materials.append(m)
        obj.location = self.location
        obj.rotation_euler = self.rotation
        if self.parent is not None:
            obj.parent = self.parent
        return obj


def export_glb(out_path: str, export_animations: bool = False):
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_materials='EXPORT',
        export_lights=False,
        export_cameras=False,
        export_animations=export_animations,
    )
    return inspect_glb(out_path)


def inspect_glb(glb_path: str):
    with open(glb_path, 'rb') as f:
        data = f.read()
    magic, version, total_len = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, f'{glb_path}: invalid GLB magic'
    json_len, chunk_type = struct.unpack_from('<II', data, 12)
    assert chunk_type == 0x4E4F534A, f'{glb_path}: missing JSON chunk'
    doc = json.loads(data[20:20 + json_len].decode('utf-8'))
    nodes = [n.get('name') for n in (doc.get('nodes') or [])]
    anims = [a.get('name') for a in (doc.get('animations') or [])]
    return {'bytes': len(data), 'nodes': nodes, 'animations': anims}
