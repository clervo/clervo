#!/usr/bin/env python3

"""Build Clervo Worlds as authored Blender geometry, renders, and a runtime GLB."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[4]
MEDIA = ROOT / "apps" / "site" / "media"
BLENDER_DIR = MEDIA / "blender"
RENDER_DIR = MEDIA / "renders"
OPTIMIZED_DIR = MEDIA / "optimized"
RUNTIME_DIR = ROOT / "apps" / "site" / "public-assets"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def material(name: str, color: tuple[float, float, float, float], metallic: float, roughness: float,
             emission: tuple[float, float, float, float] | None = None,
             strength: float = 0.0) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    node = value.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = color
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if emission is not None:
        node.inputs["Emission Color"].default_value = emission
        node.inputs["Emission Strength"].default_value = strength
    return value


def terrain_height(x: float, y: float) -> float:
    return -0.62 + math.sin(x * 0.72) * 0.075 + math.cos(y * 0.83) * 0.065 + math.sin((x + y) * 1.38) * 0.028


def terrain(name: str, value: bpy.types.Material) -> bpy.types.Object:
    columns, rows = 44, 34
    vertices = []
    faces = []
    for row in range(rows + 1):
        y = -5.2 + row * 10.4 / rows
        for column in range(columns + 1):
            x = -7.2 + column * 14.4 / columns
            vertices.append((x, y, terrain_height(x, y)))
    for row in range(rows):
        for column in range(columns):
            start = row * (columns + 1) + column
            faces.append((start, start + 1, start + columns + 2, start + columns + 1))
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def cube(name: str, dimensions: tuple[float, float, float], location: tuple[float, float, float],
         value: bpy.types.Material, bevel: float = 0.025) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Physical edge radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    obj.data.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def bar_xz(name: str, start: tuple[float, float], end: tuple[float, float], y: float,
           value: bpy.types.Material) -> bpy.types.Object:
    sx, sz = start
    ex, ez = end
    dx, dz = ex - sx, ez - sz
    obj = cube(name, (math.hypot(dx, dz), 0.20, 0.12), ((sx + ex) / 2, y, (sz + ez) / 2), value, 0.025)
    obj.rotation_euler[1] = -math.atan2(dz, dx)
    return obj


def cylinder(name: str, radius: float, depth: float, location: tuple[float, float, float],
             value: bpy.types.Material, vertices: int = 28) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def torus(name: str, major_radius: float, minor_radius: float, location: tuple[float, float, float],
          value: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius,
                                    major_segments=32, minor_segments=8, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def sphere(name: str, radius: float, location: tuple[float, float, float],
           value: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale.y = 0.58
    obj.data.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def triangular_prism(name: str, center_y: float, width: float, height: float, depth: float,
                     value: bpy.types.Material) -> bpy.types.Object:
    points = [(-width / 2, 0.0), (width / 2, 0.0), (0.0, height)]
    vertices = [(x, center_y - depth / 2, z) for x, z in points] + [(x, center_y + depth / 2, z) for x, z in points]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(value)
    bevel = obj.modifiers.new("Micro bevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 3
    obj["clervo_canonical"] = True
    return obj


def route(name: str, points: list[tuple[float, float, float]], value: bpy.types.Material,
          bevel: float) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_CURVE", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera(name: str, location: tuple[float, float, float], lens: float) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.lens = lens
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0.0, 0.45, -0.15))
    return obj


def area_light(name: str, location: tuple[float, float, float], energy: float, size: float,
               color: tuple[float, float, float]) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0.0, 0.5, -0.3))


def build() -> tuple[bpy.types.Scene, dict[str, bpy.types.Object]]:
    clear_scene()
    scene = bpy.context.scene
    scene.name = "CLERVO_CANONICAL_WORLDS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.world.color = (0.002, 0.003, 0.003)
    scene.view_settings.look = "AgX - Medium High Contrast"

    ground = material("CLERVO_WORLDS_TERRAIN", (0.013, 0.018, 0.018, 1), 0.58, 0.78)
    obsidian = material("CLERVO_WORLDS_OBSIDIAN", (0.018, 0.024, 0.024, 1), 0.88, 0.31)
    metal = material("CLERVO_WORLDS_METAL", (0.048, 0.058, 0.058, 1), 0.94, 0.24)
    cyan = material("CLERVO_WORLDS_VERIFIED", (0.0, 0.07, 0.075, 1), 0.35, 0.24,
                    (0.035, 0.85, 0.92, 1), 1.8)
    red = material("CLERVO_WORLDS_RECOVERY", (0.10, 0.001, 0.003, 1), 0.34, 0.26,
                   (1.0, 0.026, 0.040, 1), 2.1)
    gold = material("CLERVO_WORLDS_DELIVERY", (0.12, 0.065, 0.004, 1), 0.56, 0.22,
                    (0.93, 0.66, 0.17, 1), 1.8)
    dim_cyan = material("CLERVO_WORLDS_VERIFIED_DIM", (0.0, 0.035, 0.038, 1), 0.42, 0.36,
                        (0.035, 0.85, 0.92, 1), 0.42)

    master = bpy.data.objects.new("CLERVO_WORLDS_MASTER", None)
    bpy.context.collection.objects.link(master)
    master["clervo_identity"] = "bounded_outcome_network"
    objects: dict[str, bpy.types.Object] = {"master": master}
    objects["void_floor"] = cube("WorldVoidFloor", (40.0, 40.0, 0.20), (0.0, 0.0, -1.03), ground, 0.0)
    objects["terrain"] = terrain("WorldTerrain", ground)

    tower_points = [
        (-6.1, -3.7, 0.82), (-4.8, -1.0, 1.36), (-5.4, 2.6, 0.72), (-3.5, 3.9, 1.75),
        (-2.7, -3.0, 1.08), (-1.5, -0.9, 1.56), (-2.1, 2.2, 0.88), (1.0, -4.0, 0.76),
        (1.7, -1.8, 1.22), (2.8, 1.2, 1.62), (4.8, -3.2, 1.34), (5.7, -0.4, 0.86),
        (4.4, 2.7, 1.52), (6.2, 3.7, 0.78), (0.4, 3.9, 1.06), (-0.3, 0.9, 0.66),
    ]
    for index, (x, y, height) in enumerate(tower_points):
        z = terrain_height(x, y) + height / 2
        objects[f"tower_{index}"] = cube(f"WorldTower_{index + 1:02d}", (0.13, 0.13, height), (x, y, z), metal, 0.018)
        if index % 3 == 0:
            objects[f"tower_light_{index}"] = cube(f"TowerSignal_{index + 1:02d}", (0.035, 0.15, height * 0.52),
                                                      (x, y - 0.075, z), cyan, 0.008)

    node_specs = [
        ("ResearchNode", -5.2, -2.4, cyan), ("ExecutionNode", -2.3, 1.1, cyan),
        ("PredictionNode", 0.8, -2.8, cyan), ("RecoveryNode", 3.4, -0.7, red),
        ("ReceiptNode", 5.2, 2.1, gold), ("IntelligenceNode", 1.9, 3.5, gold),
    ]
    for name, x, y, value in node_specs:
        z = terrain_height(x, y) + 0.08
        objects[name] = torus(name, 0.29, 0.035, (x, y, z), value)
        objects[f"{name}_base"] = cylinder(f"{name}Base", 0.19, 0.055, (x, y, z - 0.01), metal)
        objects[f"{name}_beacon"] = cylinder(f"{name}Beacon", 0.045, 0.38, (x, y, z + 0.19), value)

    target = (0.0, 2.9, terrain_height(0.0, 2.9) + 0.14)
    route_materials = [cyan, cyan, cyan, red, gold, gold]
    for index, ((_, x, y, _), value) in enumerate(zip(node_specs, route_materials)):
        start_z = terrain_height(x, y) + 0.09
        mid_x = x * 0.48 + (-0.38 if index % 2 else 0.34)
        mid_y = (y + target[1]) * 0.5
        points = [
            (x, y, start_z),
            (mid_x, mid_y, terrain_height(mid_x, mid_y) + 0.10),
            target,
        ]
        objects[f"route_{index}"] = route(f"WorldRoute_{index + 1:02d}", points, value, 0.014)

    for index, (start_index, end_index) in enumerate(((0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 1), (0, 2), (2, 5))):
        _, sx, sy, _ = node_specs[start_index]
        _, ex, ey, _ = node_specs[end_index]
        mx, my = (sx + ex) / 2, (sy + ey) / 2
        objects[f"link_{index}"] = route(
            f"WorldMeshLink_{index + 1:02d}",
            [
                (sx, sy, terrain_height(sx, sy) + 0.07),
                (mx, my, terrain_height(mx, my) + 0.075),
                (ex, ey, terrain_height(ex, ey) + 0.07),
            ],
            dim_cyan,
            0.006,
        )

    objects["prism"] = triangular_prism("WorldPrismBeacon", 3.25, 1.55, 1.72, 0.48, obsidian)
    prism_floor = terrain_height(0.0, 3.25)
    objects["prism"].location.z = prism_floor
    frame_points = [(-0.78, prism_floor), (0.78, prism_floor), (0.0, prism_floor + 1.72)]
    for index, (start, end) in enumerate(zip(frame_points, frame_points[1:] + frame_points[:1])):
        objects[f"prism_frame_{index}"] = bar_xz(f"WorldPrismFrame_{index + 1:02d}", start, end, 2.96, metal)
    objects["prism_core"] = sphere("WorldPrismCore", 0.18, (0.0, 2.93, prism_floor + 0.82), cyan)
    objects["delivery"] = torus("VerifiedOutcomeDock", 0.46, 0.055,
                                  (-4.8, -3.9, terrain_height(-4.8, -3.9) + 0.08), cyan)

    for key, obj in objects.items():
        if key != "master" and obj.parent is None:
            obj.parent = master

    objects["camera_desktop"] = camera("Camera_Worlds_Desktop", (8.8, -12.6, 8.8), 54)
    objects["camera_portrait"] = camera("Camera_Worlds_Portrait", (4.2, -15.2, 12.5), 58)
    area_light("World_Key", (-5.0, -6.0, 9.0), 1450, 6.0, (0.70, 0.82, 0.80))
    area_light("World_Rim", (7.0, 4.0, 6.0), 980, 5.0, (0.30, 0.45, 0.43))
    area_light("World_Warm", (2.0, -1.0, 4.0), 420, 4.0, (0.34, 0.22, 0.08))
    return scene, objects


def render(scene: bpy.types.Scene, objects: dict[str, bpy.types.Object]) -> None:
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    for label, camera_obj, width, height in (
        ("desktop", objects["camera_desktop"], 960, 600),
        ("portrait", objects["camera_portrait"], 600, 960),
    ):
        scene.camera = camera_obj
        scene.render.resolution_x = width
        scene.render.resolution_y = height
        scene.render.filepath = str(RENDER_DIR / f"clervo-worlds-{label}.png")
        bpy.ops.render.render(write_still=True)


def write_webp(scene: bpy.types.Scene) -> None:
    OPTIMIZED_DIR.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 86
    for source in sorted(RENDER_DIR.glob("clervo-worlds-*.png")):
        image = bpy.data.images.load(str(source), check_existing=False)
        try:
            image.save_render(str(OPTIMIZED_DIR / f"{source.stem}.webp"), scene=scene)
        finally:
            bpy.data.images.remove(image)


def export_runtime(objects: dict[str, bpy.types.Object]) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for key, obj in objects.items():
        if key not in {"camera_desktop", "camera_portrait"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = objects["terrain"]
    bpy.ops.export_scene.gltf(filepath=str(RUNTIME_DIR / "clervo-worlds.glb"), export_format="GLB",
                              use_selection=True, export_animations=False, export_extras=True,
                              export_cameras=False, export_lights=False, export_apply=True)


def write_manifest() -> None:
    paths = [
        BLENDER_DIR / "clervo-worlds-v1.blend",
        RUNTIME_DIR / "clervo-worlds.glb",
        *sorted(RENDER_DIR.glob("clervo-worlds-*.png")),
        *sorted(OPTIMIZED_DIR.glob("clervo-worlds-*.webp")),
    ]
    manifest = {
        "schemaVersion": "clervo.canonical-worlds-media.v1",
        "canonicalObject": "CLERVO_WORLDS_MASTER",
        "blenderVersion": bpy.app.version_string,
        "source": "apps/site/media/blender/clervo-worlds-v1.blend",
        "generator": "apps/site/media/blender/build_clervo_worlds.py",
        "runtimeAsset": "apps/site/public-assets/clervo-worlds.glb",
        "cameras": ["Camera_Worlds_Desktop", "Camera_Worlds_Portrait"],
        "generatedMediaUsedAsProductProof": False,
        "artifacts": [
            {
                "path": str(value.relative_to(ROOT)),
                "sizeBytes": value.stat().st_size,
                "sha256": hashlib.sha256(value.read_bytes()).hexdigest(),
            }
            for value in paths
        ],
    }
    (MEDIA / "canonical-worlds-media.v1.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    BLENDER_DIR.mkdir(parents=True, exist_ok=True)
    scene, objects = build()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDER_DIR / "clervo-worlds-v1.blend"))
    export_runtime(objects)
    render(scene, objects)
    write_webp(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDER_DIR / "clervo-worlds-v1.blend"))
    write_manifest()
    print(f"CLERVO canonical Worlds: PASS ({bpy.app.version_string})")


if __name__ == "__main__":
    main()
