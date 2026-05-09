from __future__ import annotations

import math

from app.models.schema import LayoutMetadata, LayoutSchema, Room, Wall
from app.services.image_vectorizer import VectorizedData
from app.services.llm_layout_metadata_extractor import LlmRoomHint


class SchemaGenerator:
    @staticmethod
    def _segment_length(start: tuple[float, float], end: tuple[float, float]) -> float:
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        return math.hypot(dx, dy)

    @staticmethod
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

    @staticmethod
    def _canonical_key(start: tuple[float, float], end: tuple[float, float], grid: float = 8.0) -> tuple[tuple[int, int], tuple[int, int]]:
        a = (int(round(start[0] / grid)), int(round(start[1] / grid)))
        b = (int(round(end[0] / grid)), int(round(end[1] / grid)))
        return (a, b) if a <= b else (b, a)

    @staticmethod
    def _poly_bounds(poly: list[list[float]]) -> tuple[float, float, float, float] | None:
        if not poly:
            return None
        xs = [float(p[0]) for p in poly]
        ys = [float(p[1]) for p in poly]
        return min(xs), min(ys), max(xs), max(ys)

    @staticmethod
    def _bbox_area(bounds: tuple[float, float, float, float]) -> float:
        min_x, min_y, max_x, max_y = bounds
        return max(0.0, max_x - min_x) * max(0.0, max_y - min_y)

    @staticmethod
    def _rect_from_bounds(bounds: tuple[float, float, float, float]) -> list[list[float]]:
        min_x, min_y, max_x, max_y = bounds
        return [[min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y]]

    def _layout_bounds(
        self,
        polygons: list[list[list[float]]],
        lines: list[tuple[tuple[float, float], tuple[float, float]]],
    ) -> tuple[float, float, float, float] | None:
        points: list[tuple[float, float]] = []
        for poly in polygons:
            points.extend((float(point[0]), float(point[1])) for point in poly)
        for start, end in lines:
            points.append((float(start[0]), float(start[1])))
            points.append((float(end[0]), float(end[1])))
        if not points:
            return None
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        return min(xs), min(ys), max(xs), max(ys)

    def _select_main_polygons(
        self,
        polygons: list[list[list[float]]],
        room_hints: list[LlmRoomHint],
        layout_bounds: tuple[float, float, float, float] | None,
    ) -> list[list[list[float]]]:
        if not polygons:
            return []
        layout_area = self._bbox_area(layout_bounds) if layout_bounds else 0.0
        min_area = max(2500.0, layout_area * 0.006)
        max_area = layout_area * 0.72 if layout_area else float('inf')

        candidates: list[tuple[list[list[float]], float, float, float]] = []
        for poly in polygons:
            bounds = self._poly_bounds(poly)
            if not bounds:
                continue
            width = bounds[2] - bounds[0]
            height = bounds[3] - bounds[1]
            area = self._bbox_area(bounds)
            if width < 40.0 or height < 40.0 or area < min_area:
                continue
            if area > max_area and len(polygons) > 1:
                continue
            center_y = (bounds[1] + bounds[3]) / 2.0
            center_x = (bounds[0] + bounds[2]) / 2.0
            candidates.append((self._rect_from_bounds(bounds), area, center_y, center_x))

        if not candidates:
            return []

        target_count = len(room_hints) if room_hints else 8
        target_count = min(max(target_count, 1), 12)
        selected = sorted(candidates, key=lambda item: item[1], reverse=True)[:target_count]
        return [poly for poly, _, _, _ in sorted(selected, key=lambda item: (item[2], item[3]))]

    def _fallback_main_room_polygons(
        self,
        room_hints: list[LlmRoomHint],
        layout_bounds: tuple[float, float, float, float] | None,
    ) -> list[list[list[float]]]:
        if not layout_bounds:
            return []

        min_x, min_y, max_x, max_y = layout_bounds
        width = max_x - min_x
        height = max_y - min_y
        if width <= 0 or height <= 0:
            return []

        def box(x0: float, y0: float, x1: float, y1: float) -> list[list[float]]:
            return self._rect_from_bounds(
                (
                    min_x + (width * x0),
                    min_y + (height * y0),
                    min_x + (width * x1),
                    min_y + (height * y1),
                )
            )

        bedroom_count = sum(1 for hint in room_hints if hint.room_type == 'bedroom')
        bedroom_index = 0
        fallback: list[list[list[float]]] = []
        generic_index = 0

        for hint in room_hints[:12]:
            room_type = hint.room_type
            label = hint.label.lower()
            if room_type == 'bedroom':
                if bedroom_count <= 1:
                    fallback.append(box(0.06, 0.05, 0.48, 0.38))
                else:
                    left = 0.04 + (bedroom_index * (0.66 / bedroom_count))
                    right = min(left + (0.56 / bedroom_count), 0.70)
                    fallback.append(box(left, 0.05, right, 0.39))
                bedroom_index += 1
            elif room_type in {'living', 'dining'}:
                fallback.append(box(0.50, 0.06, 0.95, 0.62))
            elif room_type == 'kitchen':
                fallback.append(box(0.18, 0.70, 0.58, 0.96))
            elif room_type == 'bathroom':
                fallback.append(box(0.08, 0.46, 0.48, 0.68))
            elif room_type == 'store' or 'shelter' in label:
                fallback.append(box(0.70, 0.48, 0.95, 0.78))
            elif room_type in {'utility', 'other'} and ('service' in label or 'yard' in label):
                fallback.append(box(0.28, 0.70, 0.48, 0.96))
            elif room_type == 'balcony' or 'ledge' in label:
                fallback.append(box(0.03, 0.62, 0.28, 0.82))
            elif room_type == 'corridor':
                fallback.append(box(0.48, 0.42, 0.72, 0.88))
            else:
                col = generic_index % 2
                row = generic_index // 2
                fallback.append(box(0.08 + (col * 0.42), 0.42 + (row * 0.18), 0.38 + (col * 0.42), 0.58 + (row * 0.18)))
                generic_index += 1

        return fallback

    @staticmethod
    def _default_room_hints() -> list[LlmRoomHint]:
        return [
            LlmRoomHint(label='Bedroom', room_type='bedroom'),
            LlmRoomHint(label='Living/Dining', room_type='living'),
            LlmRoomHint(label='Kitchen', room_type='kitchen'),
            LlmRoomHint(label='Bath/WC', room_type='bathroom'),
        ]

    def _merge_collinear(
        self,
        segments: list[tuple[tuple[float, float], tuple[float, float]]],
        *,
        coord_tol: float = 30.0,
        gap_tol: float = 36.0,
        min_length: float = 70.0,
    ) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        horizontal: list[tuple[float, float, float]] = []
        vertical: list[tuple[float, float, float]] = []

        for start, end in segments:
            snapped = self._snap_axis(start, end)
            if not snapped:
                continue
            s, e = snapped
            if self._segment_length(s, e) < min_length:
                continue
            if abs(s[1] - e[1]) <= abs(s[0] - e[0]):
                horizontal.append((s[1], min(s[0], e[0]), max(s[0], e[0])))
            else:
                vertical.append((s[0], min(s[1], e[1]), max(s[1], e[1])))

        def merge_axis(items: list[tuple[float, float, float]], is_horizontal: bool) -> list[tuple[tuple[float, float], tuple[float, float]]]:
            output: list[tuple[tuple[float, float], tuple[float, float]]] = []
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
                merged: list[list[float]] = []
                for start, end in intervals:
                    if not merged or start - merged[-1][1] > gap_tol:
                        merged.append([float(start), float(end)])
                    else:
                        merged[-1][1] = max(merged[-1][1], float(end))
                for start, end in merged:
                    if end - start < min_length:
                        continue
                    if is_horizontal:
                        output.append(((start, coord), (end, coord)))
                    else:
                        output.append(((coord, start), (coord, end)))
            return output

        merged = merge_axis(horizontal, True) + merge_axis(vertical, False)
        return sorted(merged, key=lambda seg: self._segment_length(seg[0], seg[1]), reverse=True)

    def _walls_from_rooms(self, polygons: list[list[list[float]]]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        segments: dict[tuple[tuple[int, int], tuple[int, int]], tuple[tuple[float, float], tuple[float, float], float]] = {}
        for poly in polygons:
            if len(poly) < 3:
                continue
            points = [(float(p[0]), float(p[1])) for p in poly]
            for idx, start in enumerate(points):
                end = points[(idx + 1) % len(points)]
                snapped = self._snap_axis(start, end)
                if not snapped:
                    continue
                s, e = snapped
                length = self._segment_length(s, e)
                if length < 20.0:
                    continue
                key = self._canonical_key(s, e)
                prev = segments.get(key)
                if not prev or length > prev[2]:
                    segments[key] = (s, e, length)
        ordered = sorted(segments.values(), key=lambda seg: seg[2], reverse=True)[:24]
        return [(s, e) for s, e, _ in ordered]

    def _walls_from_lines(
        self, lines: list[tuple[tuple[float, float], tuple[float, float]]]
    ) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        return self._merge_collinear(lines)[:32]

    def _merge_outline_and_partitions(
        self,
        outline: list[tuple[tuple[float, float], tuple[float, float]]],
        candidates: list[tuple[tuple[float, float], tuple[float, float]]],
    ) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        merged = list(outline)
        outline_keys = {self._canonical_key(s, e) for s, e in outline}

        # Add extra non-duplicate structural partitions from detected line work.
        added = 0
        for s, e in candidates:
            key = self._canonical_key(s, e)
            if key in outline_keys:
                continue
            merged.append((s, e))
            outline_keys.add(key)
            added += 1
            if added >= 18:
                break
        return sorted(merged, key=lambda seg: self._segment_length(seg[0], seg[1]), reverse=True)[:42]

    def build(
        self,
        *,
        project_id: str,
        layout_id: str,
        source_page: int,
        metadata: LayoutMetadata,
        vectorized: VectorizedData,
        room_hints: list[LlmRoomHint] | None = None,
    ) -> LayoutSchema:
        room_hints = room_hints or []
        effective_room_hints = room_hints or self._default_room_hints()
        rooms: list[Room] = []
        layout_bounds = self._layout_bounds(vectorized.room_polygons, vectorized.wall_segments)
        selected_polygons = self._select_main_polygons(vectorized.room_polygons, effective_room_hints, layout_bounds)
        if selected_polygons:
            sorted_polygons = sorted(
                selected_polygons,
                key=lambda poly: (
                    sum(point[1] for point in poly) / max(1, len(poly)),
                    sum(point[0] for point in poly) / max(1, len(poly)),
                ),
            )
        else:
            sorted_polygons = self._fallback_main_room_polygons(effective_room_hints, layout_bounds)
        for idx, poly in enumerate(sorted_polygons, start=1):
            hint = effective_room_hints[idx - 1] if idx - 1 < len(effective_room_hints) else None
            room_type = hint.room_type if hint else ('bedroom' if idx <= 2 else 'living')
            room_name = hint.label if hint and hint.label else f'Room {idx}'
            rooms.append(
                Room(
                    id=f'room_{idx}',
                    name=room_name,
                    type=room_type,
                    polygon=poly,
                    clickable=True,
                    source_page=source_page,
                )
            )

        outline_segments = self._walls_from_rooms(sorted_polygons)
        line_segments = self._walls_from_lines(vectorized.wall_segments)
        wall_segments = self._merge_outline_and_partitions(outline_segments, line_segments)
        if len(wall_segments) < 4:
            wall_segments = line_segments

        walls: list[Wall] = []
        for idx, seg in enumerate(wall_segments, start=1):
            start, end = seg
            walls.append(Wall(id=f'wall_{idx}', start=[start[0], start[1]], end=[end[0], end[1]]))

        return LayoutSchema(
            project_id=project_id,
            layout_id=layout_id,
            source_page=source_page,
            flat_type=metadata.flat_type,
            floor_area_sqm=metadata.approx_floor_area_sqm,
            finish_type=metadata.finish_type,
            notes=metadata.notes,
            rooms=rooms,
            walls=walls,
            doors=[],
            windows=[],
            furniture=[],
            todos=vectorized.todos,
        )
