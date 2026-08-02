#!/usr/bin/env python3

"""Build the canonical Clervo V6 prism, renders, and runtime GLB."""

from __future__ import annotations

import json
import hashlib
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

VOID = (0.005, 0.006, 0.006, 1.0)
METAL = (0.12, 0.14, 0.14, 1.0)
METAL_EDGE = (0.42, 0.46, 0.45, 1.0)
CORE = (0.018, 0.022, 0.022, 1.0)
COLORS = {
    "idle": (0.08, 0.09, 0.09, 1.0),
    "risk": (1.0, 0.074, 0.085, 1.0),
    "qualified": (0.095, 0.687, 0.806, 1.0),
    "approval": (0.745, 0.391, 0.070, 1.0),
    "verified": (0.904, 0.930, 0.922, 1.0),
    "receipt": (0.673, 0.477, 0.145, 1.0),
}
STATE_FRAMES = {
    "idle": 1,
    "risk": 32,
    "qualified": 72,
    "approval": 112,
    "verified": 152,
    "receipt": 192,
}


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    node = value.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = color
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if emission is not None:
        node.inputs["Emission Color"].default_value = emission
        node.inputs["Emission Strength"].default_value = emission_strength
    return value


def cube(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    value: bpy.types.Material,
    rotation_y: float = 0.0,
    bevel: float = 0.04,
) -> bpy.types.Object:
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


def bar_between(
    name: str,
    start: tuple[float, float],
    end: tuple[float, float],
    depth: float,
    width: float,
    value: bpy.types.Material,
) -> bpy.types.Object:
    sx, sz = start
    ex, ez = end
    dx, dz = ex - sx, ez - sz
    length = math.hypot(dx, dz)
    angle = -math.atan2(dz, dx)
    return cube(
        name,
        (length, depth, width),
        ((sx + ex) / 2, 0.0, (sz + ez) / 2),
        value,
        rotation_y=angle,
        bevel=0.075,
    )


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def camera(name: str, location: tuple[float, float, float], lens: float) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36
    data.dof.use_dof = False
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0.0, 0.0, 0.0))
    obj["clervo_camera"] = "portrait" if "Portrait" in name else "desktop"
    return obj


def area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> bpy.types.Object:
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
    data.shadow_soft_size = 1.4
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def keyframe(obj: bpy.types.Object, frame: int, location: tuple[float, float, float]) -> None:
    obj.location = location
    obj.keyframe_insert(data_path="location", frame=frame)


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
    shell = material("CLERVO_MAT_SHELL", METAL, 0.86, 0.29)
    edge = material("CLERVO_MAT_EDGE", METAL_EDGE, 0.92, 0.21)
    core = material("CLERVO_MAT_CORE", CORE, 0.48, 0.61)
    signal = material("CLERVO_MAT_SIGNAL", CORE, 0.36, 0.31, COLORS["risk"], 2.4)
    gold = material("CLERVO_MAT_RECEIPT", (0.31, 0.22, 0.07, 1.0), 0.78, 0.28, COLORS["receipt"], 0.22)

    assembly = bpy.data.objects.new("CLERVO_PRISM_MASTER", None)
    bpy.context.collection.objects.link(assembly)
    assembly["clervo_identity"] = "persistent_outcome_instrument"
    assembly["clervo_color_order"] = "risk,qualified,approval,verified,receipt"

    radius = 2.75
    corners = [(0, radius), (radius, 0), (0, -radius), (-radius, 0)]
    objects: dict[str, bpy.types.Object] = {}
    for index in range(4):
        objects[f"frame_{index}"] = bar_between(
            f"FrameRail_{index + 1:02d}",
            corners[index],
            corners[(index + 1) % 4],
            0.52,
            0.34,
            shell,
        )
    objects["backplate"] = cube(
        "EvidenceBackplate",
        (3.35, 0.16, 3.35),
        (0, 0.18, 0),
        core,
        rotation_y=math.pi / 4,
        bevel=0.10,
    )
    objects["aperture"] = cube(
        "VerificationAperture",
        (2.12, 0.18, 2.12),
        (0, -0.18, 0),
        signal,
        rotation_y=math.pi / 4,
        bevel=0.08,
    )
    clamp_positions = [
        ("Clamp_Top", (0, -0.34, 2.76), (0.72, 0.38, 0.23)),
        ("Clamp_Right", (2.76, -0.34, 0), (0.23, 0.38, 0.72)),
        ("Clamp_Bottom", (0, -0.34, -2.76), (0.72, 0.38, 0.23)),
        ("Clamp_Left", (-2.76, -0.34, 0), (0.23, 0.38, 0.72)),
    ]
    for name, location, dimensions in clamp_positions:
        objects[name] = cube(name, dimensions, location, edge, bevel=0.055)
    objects["receipt"] = cube(
        "ReceiptWafer",
        (1.15, 0.12, 0.68),
        (0.65, -0.36, -1.55),
        gold,
        bevel=0.06,
    )
    for obj in objects.values():
        obj.parent = assembly

    keyframe(objects["aperture"], STATE_FRAMES["idle"], (0, -0.02, 0))
    keyframe(objects["aperture"], STATE_FRAMES["risk"], (0, -0.09, 0))
    keyframe(objects["aperture"], STATE_FRAMES["qualified"], (0, -0.20, 0))
    keyframe(objects["aperture"], STATE_FRAMES["approval"], (0, -0.32, 0))
    keyframe(objects["aperture"], STATE_FRAMES["verified"], (0, -0.43, 0))
    keyframe(objects["aperture"], STATE_FRAMES["receipt"], (-0.2, -0.50, 0))
    objects["aperture"].animation_data.action.name = "CLERVO_Verification_Aperture"

    keyframe(objects["receipt"], STATE_FRAMES["idle"], (0.65, 0.12, -1.55))
    keyframe(objects["receipt"], STATE_FRAMES["approval"], (0.65, -0.10, -1.55))
    keyframe(objects["receipt"], STATE_FRAMES["verified"], (0.65, -0.34, -1.55))
    keyframe(objects["receipt"], STATE_FRAMES["receipt"], (2.15, -0.56, -1.55))
    objects["receipt"].animation_data.action.name = "CLERVO_Receipt_Ejection"

    desktop = camera("Camera_Desktop_Canonical", (0.1, -11.6, 0.15), 58)
    portrait = camera("Camera_Portrait_Canonical", (0.0, -13.4, 0.0), 64)
    objects["camera_desktop"] = desktop
    objects["camera_portrait"] = portrait

    area_light("Key_Softbox", (-4.4, -5.0, 5.4), 1050, 4.0, (0.84, 0.89, 0.88))
    area_light("Edge_Rim", (5.0, 1.8, 2.6), 880, 3.2, (0.39, 0.45, 0.44))
    area_light("Lower_Fill", (-2.8, -1.4, -4.2), 520, 3.0, (0.18, 0.21, 0.21))
    objects["semantic_light"] = point_light("Semantic_State_Light", (0.0, -3.0, 0.0), 420)

    background = cube(
        "Void_Backdrop",
        (18.0, 0.18, 18.0),
        (0.0, 2.0, 0.0),
        material("CLERVO_MAT_VOID", VOID, 0.0, 0.96),
        bevel=0.0,
    )
    background["clervo_runtime_export"] = False
    return scene, objects, signal


def set_signal(signal: bpy.types.Material, light: bpy.types.Object, state: str) -> None:
    color = COLORS[state]
    node = signal.node_tree.nodes.get("Principled BSDF")
    node.inputs["Emission Color"].default_value = color
    node.inputs["Emission Strength"].default_value = 0.0 if state == "idle" else (1.5 if state == "verified" else 2.7)
    light.data.color = color[:3]
    light.data.energy = 0 if state == "idle" else (320 if state == "verified" else 470)


def render_states(
    scene: bpy.types.Scene,
    objects: dict[str, bpy.types.Object],
    signal: bpy.types.Material,
) -> None:
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    formats = [
        ("desktop", objects["camera_desktop"], 960, 600),
        ("portrait", objects["camera_portrait"], 600, 960),
    ]
    for state, frame in STATE_FRAMES.items():
        scene.frame_set(frame)
        set_signal(signal, objects["semantic_light"], state)
        for label, camera_obj, width, height in formats:
            scene.camera = camera_obj
            scene.render.resolution_x = width
            scene.render.resolution_y = height
            scene.render.filepath = str(RENDER_DIR / f"clervo-prism-{label}-{state}.png")
            bpy.ops.render.render(write_still=True)


def write_runtime_variants(scene: bpy.types.Scene) -> None:
    OPTIMIZED_DIR.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 84
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
    bpy.ops.export_scene.gltf(
        filepath=str(RUNTIME_DIR / "clervo-prism.glb"),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
    )


def write_manifest() -> None:
    artifact_paths = [
        BLENDER_DIR / "clervo-prism-v1.blend",
        RUNTIME_DIR / "clervo-prism.glb",
        *sorted(RENDER_DIR.glob("clervo-prism-*.png")),
        *sorted(OPTIMIZED_DIR.glob("clervo-prism-*.webp")),
    ]
    manifest = {
        "schemaVersion": "clervo.canonical-media.v1",
        "canonicalObject": "CLERVO_PRISM_MASTER",
        "blenderVersion": bpy.app.version_string,
        "source": "apps/site/media/blender/clervo-prism-v1.blend",
        "generator": "apps/site/media/blender/build_clervo_prism.py",
        "runtimeAsset": "apps/site/public-assets/clervo-prism.glb",
        "cameras": ["Camera_Desktop_Canonical", "Camera_Portrait_Canonical"],
        "actions": ["CLERVO_Verification_Aperture", "CLERVO_Receipt_Ejection"],
        "states": list(STATE_FRAMES),
        "semanticColorOrder": ["risk", "qualified", "approval", "verified", "receipt"],
        "generatedMediaUsedAsProductProof": False,
        "artifacts": [
            {
                "path": str(value.relative_to(ROOT)),
                "sizeBytes": value.stat().st_size,
                "sha256": hashlib.sha256(value.read_bytes()).hexdigest(),
            }
            for value in artifact_paths
        ],
    }
    (MEDIA / "canonical-media.v1.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    BLENDER_DIR.mkdir(parents=True, exist_ok=True)
    if "--manifest-only" in sys.argv:
        write_manifest()
        print(f"CLERVO canonical prism manifest: PASS ({bpy.app.version_string})")
        return
    if "--variants-only" in sys.argv:
        scene = configure_scene()
        write_runtime_variants(scene)
        write_manifest()
        print(f"CLERVO canonical prism variants: PASS ({bpy.app.version_string})")
        return
    scene, objects, signal = build()
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
