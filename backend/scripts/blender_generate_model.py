from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def make_material(name: str, rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.blend_method = 'BLEND' if rgba[3] < 1 else 'OPAQUE'
    if hasattr(mat, 'use_screen_refraction'):
        mat.use_screen_refraction = rgba[3] < 1
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs[0].default_value = rgba
        alpha_input = bsdf.inputs.get('Alpha')
        if alpha_input:
            alpha_input.default_value = rgba[3]
    return mat


def _parse_bool(value: str | None) -> bool:
    return (value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _segment_length(start: tuple[float, float], end: tuple[float, float]) -> float:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    return math.hypot(dx, dy)


def _snap_axis(start: tuple[float, float], end: tuple[float, float]) -> tuple[tuple[float, float], tuple[float, float]] | None:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    adx, ady = abs(dx), abs(dy)
    if adx == 0 and ady == 0:
        return None
    if adx >= ady * 1.7:
        y = (start[1] + end[1]) / 2.0
        return (start[0], y), (end[0], y)
    if ady >= adx * 1.7:
        x = (start[0] + end[0]) / 2.0
        return (x, start[1]), (x, end[1])
    return None


def _canonical_key(start: tuple[float, float], end: tuple[float, float], grid: float = 0.05) -> tuple[tuple[int, int], tuple[int, int]]:
    a = (int(round(start[0] / grid)), int(round(start[1] / grid)))
    b = (int(round(end[0] / grid)), int(round(end[1] / grid)))
    return (a, b) if a <= b else (b, a)


def _merge_axis_segments(
    items: list[tuple[float, float, float]],
    *,
    coord_tol: float = 0.08,
    gap_tol: float = 0.2,
    min_length: float = 0.18,
    is_horizontal: bool,
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    merged: list[tuple[tuple[float, float], tuple[float, float]]] = []
    if not items:
        return merged

    groups: list[dict[str, object]] = []
    for coord, start, end in sorted(items, key=lambda item: item[0]):
        if not groups or abs(coord - float(groups[-1]['coord'])) > coord_tol:
            groups.append({'coord': coord, 'items': [(start, end)]})
            continue
        group_items = groups[-1]['items']
        assert isinstance(group_items, list)
        group_items.append((start, end))
        groups[-1]['coord'] = (float(groups[-1]['coord']) * (len(group_items) - 1) + coord) / len(group_items)

    for group in groups:
        coord = float(group['coord'])
        intervals = sorted(group['items'])  # type: ignore[arg-type]
        spans: list[list[float]] = []
        for start, end in intervals:
            if not spans or start - spans[-1][1] > gap_tol:
                spans.append([float(start), float(end)])
            else:
                spans[-1][1] = max(spans[-1][1], float(end))
        for start, end in spans:
            if end - start < min_length:
                continue
            if is_horizontal:
                merged.append(((start, coord), (end, coord)))
            else:
                merged.append(((coord, start), (coord, end)))
    return merged


def normalize_walls(walls: list[dict], pixels_per_meter: float) -> list[dict]:
    horizontal: list[tuple[float, float, float]] = []
    vertical: list[tuple[float, float, float]] = []
    diagonal: list[dict] = []

    for wall in walls:
        start = wall.get('start', [0, 0])
        end = wall.get('end', [0, 0])
        if len(start) < 2 or len(end) < 2:
            continue
        s = (float(start[0]) / pixels_per_meter, float(start[1]) / pixels_per_meter)
        e = (float(end[0]) / pixels_per_meter, float(end[1]) / pixels_per_meter)
        snapped = _snap_axis(s, e)
        if snapped:
            s, e = snapped
        length = _segment_length(s, e)
        if length < 0.18:
            continue
        if abs(s[1] - e[1]) <= abs(s[0] - e[0]):
            horizontal.append((s[1], min(s[0], e[0]), max(s[0], e[0])))
            continue
        if abs(s[0] - e[0]) <= abs(s[1] - e[1]) * 1.7:
            vertical.append((s[0], min(s[1], e[1]), max(s[1], e[1])))
            continue
        diagonal.append(
            {
                'id': wall.get('id', 'wall'),
                'start': [s[0], s[1]],
                'end': [e[0], e[1]],
                'thickness_m': float(wall.get('thickness_m', 0.12)),
                'height_m': float(wall.get('height_m', 2.8)),
            }
        )

    merged = _merge_axis_segments(horizontal, is_horizontal=True)
    merged.extend(_merge_axis_segments(vertical, is_horizontal=False))

    cleaned: list[dict] = []
    seen: set[tuple[tuple[int, int], tuple[int, int]]] = set()

    for start, end in merged:
        key = _canonical_key(start, end)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(
            {
                'id': f'wall_{len(cleaned) + 1}',
                'start': [start[0], start[1]],
                'end': [end[0], end[1]],
                'thickness_m': 0.12,
                'height_m': 2.8,
            }
        )

    for wall in diagonal:
        start = (float(wall['start'][0]), float(wall['start'][1]))
        end = (float(wall['end'][0]), float(wall['end'][1]))
        key = _canonical_key(start, end)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(wall)

    cleaned.sort(key=lambda wall: _segment_length(tuple(wall['start']), tuple(wall['end'])), reverse=True)
    return cleaned


def normalize_windows(windows: list[dict], pixels_per_meter: float) -> list[dict]:
    normalized: list[dict] = []
    for opening in windows:
        center = opening.get('center', [0, 0])
        if len(center) < 2:
            continue
        normalized.append(
            {
                'id': opening.get('id', 'window'),
                'wall_id': opening.get('wall_id'),
                'center': [float(center[0]) / pixels_per_meter, float(center[1]) / pixels_per_meter],
                'width_m': max(float(opening.get('width_m', 0.9)), 0.15),
                'height_m': float(opening.get('height_m', 1.2)),
            }
        )
    return normalized


def _segment_is_horizontal(start: tuple[float, float], end: tuple[float, float]) -> bool:
    return abs(start[1] - end[1]) <= abs(start[0] - end[0])


def _subtract_openings_from_span(
    span: tuple[float, float],
    openings: list[dict],
    *,
    wall_coord: float,
    is_horizontal: bool,
) -> list[tuple[float, float]]:
    spans = [span]
    gap_pad = 0.03
    min_span = 0.15

    for opening in openings:
        center = opening.get('center', [0, 0])
        if len(center) < 2:
            continue
        width = float(opening.get('width_m', 0.9))
        if width <= 0:
            continue

        opening_coord = float(center[1] if is_horizontal else center[0])
        if abs(opening_coord - wall_coord) > 0.25:
            continue

        half = width / 2.0
        gap_start = (float(center[0]) - half - gap_pad) if is_horizontal else (float(center[1]) - half - gap_pad)
        gap_end = (float(center[0]) + half + gap_pad) if is_horizontal else (float(center[1]) + half + gap_pad)

        updated: list[tuple[float, float]] = []
        for start, end in spans:
            if gap_end <= start or gap_start >= end:
                updated.append((start, end))
                continue
            if gap_start > start + min_span:
                updated.append((start, min(gap_start, end)))
            if gap_end < end - min_span:
                updated.append((max(gap_end, start), end))
        spans = updated

    return [segment for segment in spans if segment[1] - segment[0] >= min_span]


def add_wall_with_openings(wall: dict, openings: list[dict], mat: bpy.types.Material) -> None:
    start = wall.get('start', [0, 0])
    end = wall.get('end', [0, 0])
    if len(start) < 2 or len(end) < 2:
        return

    sx, sy = float(start[0]), float(start[1])
    ex, ey = float(end[0]), float(end[1])
    thickness = float(wall.get('thickness_m', 0.12))
    height = float(wall.get('height_m', 2.8))
    length = _segment_length((sx, sy), (ex, ey))
    if length <= 0.2:
        return

    is_horizontal = _segment_is_horizontal((sx, sy), (ex, ey))
    if is_horizontal:
        wall_coord = (sy + ey) / 2.0
        span_start, span_end = sorted((sx, ex))
    else:
        wall_coord = (sx + ex) / 2.0
        span_start, span_end = sorted((sy, ey))

    spans = _subtract_openings_from_span((span_start, span_end), openings, wall_coord=wall_coord, is_horizontal=is_horizontal)
    for seg_start, seg_end in spans:
        if seg_end - seg_start <= 0.2:
            continue
        if is_horizontal:
            add_wall((seg_start, wall_coord), (seg_end, wall_coord), thickness, height, mat)
        else:
            add_wall((wall_coord, seg_start), (wall_coord, seg_end), thickness, height, mat)


def add_floor(width: float, depth: float, mat: bpy.types.Material) -> None:
    bpy.ops.mesh.primitive_plane_add(size=1, location=(width / 2, depth / 2, 0))
    obj = bpy.context.active_object
    obj.scale = (width / 2, depth / 2, 1)
    obj.data.materials.append(mat)


def add_wall(start: tuple[float, float], end: tuple[float, float], thickness: float, height: float, mat: bpy.types.Material) -> None:
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    length = (dx**2 + dy**2) ** 0.5
    # Skip tiny wall fragments produced by noisy vectorization.
    if length <= 0.2:
        return

    cx, cy = (sx + ex) / 2.0, (sy + ey) / 2.0
    angle = 0.0
    if dx != 0 or dy != 0:
        import math

        angle = math.atan2(dy, dx)

    bpy.ops.mesh.primitive_cube_add(location=(cx, cy, height / 2))
    wall = bpy.context.active_object
    wall.scale = (length / 2, thickness / 2, height / 2)
    wall.rotation_euler[2] = angle
    wall.data.materials.append(mat)


def add_room_marker(name: str, poly: list[list[float]]) -> None:
    if not poly:
        return
    x = sum(p[0] for p in poly) / len(poly)
    y = sum(p[1] for p in poly) / len(poly)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(x, y, 0.1))
    obj = bpy.context.active_object
    obj.name = f'room::{name}'
    obj['room_name'] = name


def add_furniture_placeholder(position: list[float], size: list[float], mat: bpy.types.Material, name: str) -> None:
    x = position[0] if len(position) > 0 else 0
    y = position[1] if len(position) > 1 else 0
    z = size[2] / 2 if len(size) > 2 else 0.4
    sx = size[0] / 2 if len(size) > 0 else 0.5
    sy = size[1] / 2 if len(size) > 1 else 0.5
    sz = size[2] / 2 if len(size) > 2 else 0.4
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z))
    obj = bpy.context.active_object
    obj.scale = (sx, sy, sz)
    obj.name = f'furniture::{name}'
    obj.data.materials.append(mat)


def add_lights_and_camera(width: float, depth: float) -> None:
    bpy.ops.object.light_add(type='SUN', location=(width * 0.5, depth * 0.5, 8.0))
    sun = bpy.context.active_object
    sun.data.energy = 3.0

    bpy.ops.object.camera_add(location=(width * 1.1, -depth * 0.8, 5.0))
    camera = bpy.context.active_object
    import math

    camera.rotation_euler = (math.radians(68), 0, math.radians(45))
    bpy.context.scene.camera = camera


def _distance_point_to_wall(center: tuple[float, float], wall: dict) -> tuple[float, tuple[float, float]]:
    start = wall.get('start', [0, 0])
    end = wall.get('end', [0, 0])
    sx, sy = float(start[0]), float(start[1])
    ex, ey = float(end[0]), float(end[1])
    dx, dy = ex - sx, ey - sy
    length_sq = dx * dx + dy * dy
    if length_sq <= 1e-8:
        return math.inf, (sx, sy)

    t = max(0.0, min(1.0, ((center[0] - sx) * dx + (center[1] - sy) * dy) / length_sq))
    px, py = sx + dx * t, sy + dy * t
    return math.hypot(center[0] - px, center[1] - py), (px, py)


def group_windows_by_wall(windows: list[dict], walls: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    wall_ids = {str(wall.get('id')) for wall in walls}

    for window in windows:
        center = window.get('center', [0, 0])
        if len(center) < 2:
            continue

        requested_wall_id = str(window.get('wall_id')) if window.get('wall_id') else None
        if requested_wall_id in wall_ids:
            grouped.setdefault(requested_wall_id, []).append(window)
            continue

        window_center = (float(center[0]), float(center[1]))
        nearest = min(
            walls,
            key=lambda wall: _distance_point_to_wall(window_center, wall)[0],
            default=None,
        )
        if nearest is None:
            continue

        distance, projected = _distance_point_to_wall(window_center, nearest)
        if distance > 0.45:
            continue

        snapped = dict(window)
        snapped['center'] = [projected[0], projected[1]]
        grouped.setdefault(str(nearest['id']), []).append(snapped)

    return grouped


def _add_oriented_box(
    *,
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    angle: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler[2] = angle
    obj.data.materials.append(mat)
    return obj


def add_window_glass(opening: dict, wall: dict, glass_mat: bpy.types.Material, frame_mat: bpy.types.Material) -> None:
    center = opening.get('center', [0, 0])
    if len(center) < 2:
        return

    start = wall.get('start', [0, 0])
    end = wall.get('end', [0, 0])
    sx, sy = float(start[0]), float(start[1])
    ex, ey = float(end[0]), float(end[1])
    dx, dy = ex - sx, ey - sy
    length = math.hypot(dx, dy)
    if length <= 0.2:
        return

    wall_height = float(wall.get('height_m', 2.8))
    window_width = min(max(float(opening.get('width_m', 0.9)), 0.35), max(length - 0.1, 0.35))
    window_height = min(max(float(opening.get('height_m', 1.2)), 0.65), max(wall_height - 0.65, 0.65))
    sill_height = min(0.9, max(0.35, wall_height - window_height - 0.25))
    center_z = sill_height + window_height / 2.0
    angle = math.atan2(dy, dx)

    distance, projected = _distance_point_to_wall((float(center[0]), float(center[1])), wall)
    if distance > 0.55:
        return

    px, py = projected
    glass = _add_oriented_box(
        name=f"window::{opening.get('id', 'window')}",
        location=(px, py, center_z),
        scale=(window_width / 2.0, 0.018, window_height / 2.0),
        angle=angle,
        mat=glass_mat,
    )
    glass['opening_id'] = opening.get('id', 'window')
    glass['wall_id'] = wall.get('id')

    frame_depth = 0.035
    frame_thick = 0.045
    dir_x, dir_y = dx / length, dy / length
    for label, z in (('sill', sill_height), ('head', sill_height + window_height)):
        _add_oriented_box(
            name=f"window-frame::{opening.get('id', 'window')}::{label}",
            location=(px, py, z),
            scale=(window_width / 2.0 + frame_thick, frame_depth, frame_thick),
            angle=angle,
            mat=frame_mat,
        )

    for label, offset in (('left', -window_width / 2.0), ('right', window_width / 2.0)):
        _add_oriented_box(
            name=f"window-frame::{opening.get('id', 'window')}::{label}",
            location=(px + dir_x * offset, py + dir_y * offset, center_z),
            scale=(frame_thick, frame_depth, window_height / 2.0 + frame_thick),
            angle=angle,
            mat=frame_mat,
        )


def build_scene(payload: dict) -> None:
    clear_scene()

    debug_markers = _parse_bool(os.getenv('BLENDER_EXPORT_DEBUG_MARKERS'))
    ppm = payload.get('scale', {}).get('pixels_per_meter')
    pixels_per_meter = float(ppm) if ppm else 100.0

    raw_walls = payload.get('walls', [])
    walls = normalize_walls(raw_walls, pixels_per_meter)
    windows = normalize_windows(payload.get('windows', []), pixels_per_meter)
    windows_by_wall = group_windows_by_wall(windows, walls)
    rooms = payload.get('rooms', [])
    furniture = payload.get('furniture', [])

    all_points = []
    for room in rooms:
        all_points.extend(room.get('polygon', []))
    for wall in raw_walls:
        all_points.append(wall.get('start', [0, 0]))
        all_points.append(wall.get('end', [0, 0]))

    max_x = max((p[0] for p in all_points), default=100.0) / pixels_per_meter
    max_y = max((p[1] for p in all_points), default=100.0) / pixels_per_meter
    width = max(max_x + 1.0, 4.0)
    depth = max(max_y + 1.0, 4.0)

    wall_mat = make_material('Wall', (0.94, 0.94, 0.9, 1.0))
    floor_mat = make_material('Floor', (0.73, 0.62, 0.48, 1.0))
    furniture_mat = make_material('Furniture', (0.75, 0.75, 0.75, 1.0))
    glass_mat = make_material('Sunlit Window Glass', (0.55, 0.84, 1.0, 0.34))
    frame_mat = make_material('Window Frame', (0.16, 0.18, 0.2, 1.0))

    add_floor(width, depth, floor_mat)

    for wall in walls:
        wall_windows = windows_by_wall.get(str(wall['id']), [])
        add_wall_with_openings(wall, wall_windows, wall_mat)
        for opening in wall_windows:
            add_window_glass(opening, wall, glass_mat, frame_mat)

    for room in rooms:
        poly = room.get('polygon', [])
        scaled_poly = [[p[0] / pixels_per_meter, p[1] / pixels_per_meter] for p in poly]
        if debug_markers:
            add_room_marker(room.get('name', room.get('id', 'Room')), scaled_poly)

    for item in furniture:
        pos = item.get('position', [0, 0])
        size = item.get('size_m', [1, 1, 0.8])
        scaled_pos = [pos[0] / pixels_per_meter, pos[1] / pixels_per_meter]
        add_furniture_placeholder(scaled_pos, size, furniture_mat, item.get('name', item.get('id', 'item')))

    add_lights_and_camera(width, depth)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    import sys

    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1 :]
    else:
        argv = []
    args = parser.parse_args(argv)

    payload = json.loads(Path(args.input).read_text(encoding='utf-8'))
    build_scene(payload)

    bpy.ops.export_scene.gltf(filepath=str(args.output), export_format='GLB')


if __name__ == '__main__':
    main()
