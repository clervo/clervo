#!/usr/bin/env python3

"""Build the canonical Clervo triangular prism, state renders, and runtime GLB."""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[4]
MEDIA = ROOT / "apps" / "site" / "media"
BLENDER_DIR = MEDIA / "blender"
RENDER_DIR = MEDIA / "renders"
OPTIMIZED_DIR = MEDIA / "optimized"
RUNTIME_DIR = ROOT / "apps" / "site" / "public-assets"

VOID = (0.004, 0.005, 0.005, 1.0)
COLORS = {
    "idle": (0.025, 0.032, 0.032, 1.0),
    "risk": (1.0, 0.026, 0.040, 1.0),
    "qualified": (0.035, 0.85, 0.92, 1.0),
    "approval": (0.94, 0.52, 0.10, 1.0),
    "verified": (0.92, 0.96, 0.95, 1.0),
    "receipt": (0.93, 0.66, 0.17, 1.0),
}
STATE_FRAMES = {"idle": 1, "risk": 32, "qualified": 72, "approval": 112, "verified": 152, "receipt": 192}


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def material(name: str, color: tuple[float, float, float, float], metallic: float, roughness: float,
             emission: tuple[float, float, float, float] | None = None, emission_strength: float = 0.0,
             transmission: float = 0.0) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    node = value.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = color
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if "Transmission Weight" in node.inputs:
        node.inputs["Transmission Weight"].default_value = transmission
    if emission is not None:
        node.inputs["Emission Color"].default_value = emission
        node.inputs["Emission Strength"].default_value = emission_strength
    return value


def cube(name: str, dimensions: tuple[float, float, float], location: tuple[float, float, float],
         value: bpy.types.Material, rotation_y: float = 0.0, bevel: float = 0.04) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.rotation_euler[1] = rotation_y
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Physical edge radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    obj.data.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def triangular_prism(name: str, points: list[tuple[float, float]], depth: float,
                     y: float, value: bpy.types.Material, bevel: float = 0.035) -> bpy.types.Object:
    vertices = [(x, y - depth / 2, z) for x, z in points] + [(x, y + depth / 2, z) for x, z in points]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(value)
    if bevel > 0:
        modifier = obj.modifiers.new("Micro bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    obj["clervo_canonical"] = True
    return obj


def bar_between(name: str, start: tuple[float, float], end: tuple[float, float], depth: float,
                width: float, value: bpy.types.Material) -> bpy.types.Object:
    sx, sz = start
    ex, ez = end
    dx, dz = ex - sx, ez - sz
    return cube(name, (math.hypot(dx, dz), depth, width), ((sx + ex) / 2, -0.56, (sz + ez) / 2),
                value, rotation_y=-math.atan2(dz, dx), bevel=0.055)


def cylinder(name: str, radius: float, depth: float, location: tuple[float, float, float],
             rotation: tuple[float, float, float], value: bpy.types.Material, vertices: int = 32) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(value)
    bevel = obj.modifiers.new("Micro bevel", "BEVEL")
    bevel.width = 0.018
    bevel.segments = 3
    obj["clervo_canonical"] = True
    return obj


def torus(name: str, major_radius: float, minor_radius: float, location: tuple[float, float, float],
          value: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius,
                                    major_segments=40, minor_segments=10, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(value)
    obj["clervo_canonical"] = True
    return obj


def route(name: str, points: list[tuple[float, float, float]], value: bpy.types.Material,
          bevel: float = 0.018) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_CURVE", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
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
    data.sensor_width = 36
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0.0, 0.0, 0.05))
    obj["clervo_camera"] = "portrait" if "Portrait" in name else "desktop"
    return obj


def area_light(name: str, location: tuple[float, float, float], energy: float, size: float,
               color: tuple[float, float, float]) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0.0, 0.0, 0.0))
    return obj


def point_light(name: str, location: tuple[float, float, float], energy: float) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "POINT")
    data.energy = energy
    data.color = COLORS["risk"][:3]
    data.shadow_soft_size = 0.8
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def key_transform(obj: bpy.types.Object, frame: int, location: tuple[float, float, float], rotation_y: float = 0.0) -> None:
    obj.location = location
    obj.rotation_euler[1] = rotation_y
    obj.keyframe_insert(data_path="location", frame=frame)
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def key_emission(value: bpy.types.Material, frames: list[tuple[int, float]]) -> None:
    socket = value.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"]
    for frame, strength in frames:
        socket.default_value = strength
        socket.keyframe_insert("default_value", frame=frame)


def configure_scene() -> bpy.types.Scene:
    scene = bpy.context.scene
    scene.name = "CLERVO_CANONICAL_PRISM"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_depth = "8"
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 216
    scene.world.color = VOID[:3]
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene


def build() -> tuple[bpy.types.Scene, dict[str, bpy.types.Object], bpy.types.Material]:
    clear_scene()
    scene = configure_scene()
    shell = material("CLERVO_MAT_OBSIDIAN", (0.018, 0.022, 0.022, 1), 0.74, 0.28)
    metal = material("CLERVO_MAT_BLACK_METAL", (0.055, 0.065, 0.065, 1), 0.92, 0.20)
    edge = material("CLERVO_MAT_EDGE", (0.075, 0.085, 0.085, 1), 0.95, 0.28)
    glass = material("CLERVO_MAT_SMOKED_GLASS", (0.006, 0.018, 0.020, 1), 0.18, 0.17, transmission=0.35)
    signal = material("CLERVO_MAT_STATE", (0.012, 0.020, 0.020, 1), 0.35, 0.24, COLORS["risk"], 0.0)
    red = material("CLERVO_MAT_REQUEST", (0.12, 0.001, 0.004, 1), 0.30, 0.22, COLORS["risk"], 0.0)
    cyan = material("CLERVO_MAT_QUALIFIED", (0.0, 0.09, 0.10, 1), 0.24, 0.20, COLORS["qualified"], 0.0)
    gold = material("CLERVO_MAT_RECEIPT", (0.14, 0.075, 0.006, 1), 0.52, 0.20, COLORS["receipt"], 0.0)

    master = bpy.data.objects.new("CLERVO_PRISM_MASTER", None)
    bpy.context.collection.objects.link(master)
    master["clervo_identity"] = "persistent_outcome_instrument"
    master["clervo_sequence"] = "dormant>request>qualify>approve>verify>receipt"

    points = [(-2.55, -2.25), (2.55, -2.25), (0.0, 2.72)]
    objects: dict[str, bpy.types.Object] = {}
    for index, (start, end) in enumerate(zip(points, points[1:] + points[:1])):
        objects[f"frame_{index}"] = bar_between(f"FrameRail_{index + 1:02d}", start, end, 0.44, 0.26, metal)

    objects["backplate"] = triangular_prism("EvidenceBackplate", points, 0.12, 0.18, glass, 0.06)
    objects["left_shell"] = triangular_prism("ShellPetalLeft", [points[0], (0.0, -2.25), points[2]], 0.18, -0.38, shell, 0.05)
    objects["right_shell"] = triangular_prism("ShellPetalRight", [(0.0, -2.25), points[1], points[2]], 0.18, -0.38, shell, 0.05)
    objects["center_seal"] = cube("CoreCenterSeal", (0.20, 0.18, 3.72), (0.0, -0.52, -0.03), metal, bevel=0.018)

    # Inner spine, ring stack, and deterministic route filaments.
    objects["spine"] = cube("CoreSpine", (0.18, 0.22, 3.55), (0.0, -0.04, -0.05), metal, bevel=0.05)
    for index in range(7):
        z = -1.35 + index * 0.46
        ring = torus(f"CoreRing_{index + 1:02d}", 0.30 + index * 0.008, 0.045,
                     (0.0, -0.10, z), edge)
        ring.parent = master
        objects[f"ring_{index}"] = ring
    objects["aperture"] = cylinder("VerificationAperture", 0.18, 0.16, (0.0, -0.18, 0.15),
                                    (math.pi / 2, 0.0, 0.0), signal, 48)
    objects["request_port"] = cylinder("RequestPort", 0.13, 0.24, (-2.30, -0.30, -0.32),
                                        (0.0, math.pi / 2, 0.0), red, 40)
    objects["outcome_lens"] = cylinder("OutcomeLens", 0.15, 0.26, (2.30, -0.30, -0.32),
                                        (0.0, math.pi / 2, 0.0), gold, 40)

    for index in range(8):
        z = -1.22 + index * 0.33
        width = 2.55 * (2.72 - z) / 4.97
        item = route(f"RouteCyan_{index + 1:02d}", [(-0.78 * width, -0.14, z), (-0.42 * width, -0.16, z + 0.10),
                    (-0.06, -0.18, z - 0.05), (0.42 * width, -0.16, z + 0.06)], cyan)
        item.parent = master
        objects[f"cyan_{index}"] = item
    for index in range(6):
        z = -0.88 + index * 0.34
        width = 2.55 * (2.72 - z) / 4.97
        item = route(f"RouteGold_{index + 1:02d}", [(0.08, -0.18, z), (0.38 * width, -0.16, z + 0.06),
                    (0.72 * width, -0.14, z - 0.02), (2.18, -0.18, -0.32)], gold, 0.020)
        item.parent = master
        objects[f"gold_{index}"] = item

    objects["request_beam"] = route("RequestBeam", [(-4.5, -0.31, -0.32), (-2.42, -0.31, -0.32)], red, 0.022)
    objects["outcome_beam"] = route("OutcomeBeam", [(2.42, -0.31, -0.32), (4.5, -0.31, -0.32)], gold, 0.024)
    objects["receipt"] = cube("ReceiptWafer", (1.05, 0.11, 0.58), (0.52, -0.20, -1.64), metal, bevel=0.055)
    objects["receipt_signal"] = cube("ReceiptSeal", (0.72, 0.035, 0.045), (0.0, -0.075, 0.0), gold, bevel=0.015)
    objects["receipt_signal"].parent = objects["receipt"]

    for obj in objects.values():
        if obj.parent is None:
            obj.parent = master

    left_base = (0.0, 0.0, 0.0)
    right_base = (0.0, 0.0, 0.0)
    for frame in (STATE_FRAMES["idle"], STATE_FRAMES["risk"]):
        key_transform(objects["left_shell"], frame, left_base)
        key_transform(objects["right_shell"], frame, right_base)
    for state, distance, angle in (("qualified", 0.52, 0.045), ("approval", 0.76, 0.065),
                                   ("verified", 1.04, 0.08), ("receipt", 1.16, 0.09)):
        frame = STATE_FRAMES[state]
        key_transform(objects["left_shell"], frame, (-distance, 0.0, 0.0), -angle)
        key_transform(objects["right_shell"], frame, (distance, 0.0, 0.0), angle)
    objects["left_shell"].animation_data.action.name = "CLERVO_Shell_Left"
    objects["right_shell"].animation_data.action.name = "CLERVO_Shell_Right"

    for state, depth in (("idle", 0.0), ("risk", -0.02), ("qualified", -0.08), ("approval", -0.14),
                         ("verified", -0.20), ("receipt", -0.24)):
        key_transform(objects["aperture"], STATE_FRAMES[state], (0.0, -0.18 + depth, 0.15))
    objects["aperture"].animation_data.action.name = "CLERVO_Verification_Aperture"

    for state, x, y in (("idle", 0.52, -0.20), ("approval", 0.52, -0.22), ("verified", 0.52, -0.24),
                        ("receipt", 2.05, -0.50)):
        key_transform(objects["receipt"], STATE_FRAMES[state], (x, y, -1.64))
    objects["receipt"].animation_data.action.name = "CLERVO_Receipt_Ejection"

    key_emission(red, [(1, 0.0), (30, 0.0), (32, 3.0), (192, 1.0)])
    key_emission(cyan, [(1, 0.0), (32, 0.0), (72, 2.0), (192, 1.8)])
    key_emission(gold, [(1, 0.0), (112, 0.0), (152, 1.5), (192, 3.0)])

    objects["camera_desktop"] = camera("Camera_Desktop_Canonical", (0.15, -12.4, 0.25), 58)
    objects["camera_portrait"] = camera("Camera_Portrait_Canonical", (0.0, -16.2, 0.12), 58)
    area_light("Key_Softbox", (-4.5, -5.4, 5.2), 1180, 4.2, (0.82, 0.89, 0.88))
    area_light("Edge_Rim", (5.0, -1.6, 2.8), 920, 3.3, (0.33, 0.43, 0.43))
    area_light("Lower_Warm", (-2.5, -2.2, -4.0), 540, 3.0, (0.29, 0.18, 0.10))
    objects["semantic_light"] = point_light("Semantic_State_Light", (0.0, -2.4, 0.1), 360)
    backdrop = cube("Void_Backdrop", (18.0, 0.18, 18.0), (0.0, 2.0, 0.0),
                    material("CLERVO_MAT_VOID", VOID, 0.0, 0.98), bevel=0.0)
    backdrop["clervo_runtime_export"] = False
    return scene, objects, signal


def set_signal(signal: bpy.types.Material, light: bpy.types.Object, state: str) -> None:
    color = COLORS[state]
    node = signal.node_tree.nodes.get("Principled BSDF")
    node.inputs["Emission Color"].default_value = color
    node.inputs["Emission Strength"].default_value = 0.0 if state == "idle" else (0.35 if state == "verified" else 1.5)
    light.data.color = color[:3]
    light.data.energy = 0 if state == "idle" else (90 if state == "verified" else 260)


def render_states(scene: bpy.types.Scene, objects: dict[str, bpy.types.Object], signal: bpy.types.Material) -> None:
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    for state, frame in STATE_FRAMES.items():
        scene.frame_set(frame)
        set_signal(signal, objects["semantic_light"], state)
        for label, camera_obj, width, height in (("desktop", objects["camera_desktop"], 960, 600),
                                                  ("portrait", objects["camera_portrait"], 600, 960)):
            scene.camera = camera_obj
            scene.render.resolution_x = width
            scene.render.resolution_y = height
            scene.render.filepath = str(RENDER_DIR / f"clervo-prism-{label}-{state}.png")
            bpy.ops.render.render(write_still=True)


def write_runtime_variants(scene: bpy.types.Scene) -> None:
    OPTIMIZED_DIR.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 86
    for source in sorted(RENDER_DIR.glob("clervo-prism-*.png")):
        image = bpy.data.images.load(str(source), check_existing=False)
        try:
            image.save_render(str(OPTIMIZED_DIR / f"{source.stem}.webp"), scene=scene)
        finally:
            bpy.data.images.remove(image)


def export_runtime(objects: dict[str, bpy.types.Object]) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for key, obj in objects.items():
        if not key.startswith("camera_") and key != "semantic_light":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = objects["aperture"]
    bpy.ops.export_scene.gltf(filepath=str(RUNTIME_DIR / "clervo-prism.glb"), export_format="GLB",
                              use_selection=True, export_animations=True, export_extras=True,
                              export_cameras=False, export_lights=False, export_apply=True)


def write_manifest() -> None:
    artifact_paths = [BLENDER_DIR / "clervo-prism-v1.blend", RUNTIME_DIR / "clervo-prism.glb",
                      *sorted(RENDER_DIR.glob("clervo-prism-*.png")), *sorted(OPTIMIZED_DIR.glob("clervo-prism-*.webp"))]
    manifest = {
        "schemaVersion": "clervo.canonical-media.v1",
        "canonicalObject": "CLERVO_PRISM_MASTER",
        "blenderVersion": bpy.app.version_string,
        "source": "apps/site/media/blender/clervo-prism-v1.blend",
        "generator": "apps/site/media/blender/build_clervo_prism.py",
        "runtimeAsset": "apps/site/public-assets/clervo-prism.glb",
        "cameras": ["Camera_Desktop_Canonical", "Camera_Portrait_Canonical"],
        "actions": ["CLERVO_Shell_Left", "CLERVO_Shell_Right", "CLERVO_Verification_Aperture", "CLERVO_Receipt_Ejection"],
        "states": list(STATE_FRAMES),
        "semanticColorOrder": ["risk", "qualified", "approval", "verified", "receipt"],
        "generatedMediaUsedAsProductProof": False,
        "artifacts": [{"path": str(value.relative_to(ROOT)), "sizeBytes": value.stat().st_size,
                       "sha256": hashlib.sha256(value.read_bytes()).hexdigest()} for value in artifact_paths],
    }
    (MEDIA / "canonical-media.v1.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    BLENDER_DIR.mkdir(parents=True, exist_ok=True)
    if "--manifest-only" in sys.argv:
        write_manifest()
        print(f"CLERVO canonical prism manifest: PASS ({bpy.app.version_string})")
        return
    scene, objects, signal = build()
    if "--preview" in sys.argv:
        for state in ("idle", "verified"):
            scene.frame_set(STATE_FRAMES[state])
            set_signal(signal, objects["semantic_light"], state)
            scene.camera = objects["camera_desktop"]
            scene.render.resolution_x = 480
            scene.render.resolution_y = 300
            scene.render.resolution_percentage = 100
            scene.render.filepath = f"/tmp/clervo-prism-preview-{state}.png"
            bpy.ops.render.render(write_still=True)
        print("CLERVO canonical prism preview: PASS")
        return
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDER_DIR / "clervo-prism-v1.blend"))
    export_runtime(objects)
    render_states(scene, objects, signal)
    write_runtime_variants(scene)
    scene.frame_set(1)
    set_signal(signal, objects["semantic_light"], "idle")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDER_DIR / "clervo-prism-v1.blend"))
    write_manifest()
    print(f"CLERVO canonical prism: PASS ({bpy.app.version_string}, {len(STATE_FRAMES)} states)")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"CLERVO canonical prism: FAIL: {error}", file=sys.stderr)
        raise
