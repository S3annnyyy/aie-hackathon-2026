from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


class VectorizedData:
    def __init__(self) -> None:
        self.wall_segments: list[tuple[tuple[float, float], tuple[float, float]]] = []
        self.window_segments: list[tuple[tuple[float, float], tuple[float, float]]] = []
        self.room_polygons: list[list[list[float]]] = []
        self.todos: list[str] = []


class ImageVectorizer:
    @staticmethod
    def _segment_length(start: tuple[float, float], end: tuple[float, float]) -> float:
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        return float(np.hypot(dx, dy))

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

    @classmethod
    def _merge_segments(
        cls,
        segments: list[tuple[tuple[float, float], tuple[float, float]]],
        *,
        coord_tol: float,
        gap_tol: float,
        min_length: float,
    ) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        horizontal: list[tuple[float, float, float]] = []
        vertical: list[tuple[float, float, float]] = []

        for start, end in segments:
            snapped = cls._snap_axis(start, end)
            if not snapped:
                continue
            s, e = snapped
            if cls._segment_length(s, e) < min_length:
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
        return sorted(merged, key=lambda seg: cls._segment_length(seg[0], seg[1]), reverse=True)

    @classmethod
    def _extract_openings(
        cls,
        segments: list[tuple[tuple[float, float], tuple[float, float]]],
        *,
        width: int,
        height: int,
    ) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        horizontal: list[tuple[float, float, float]] = []
        vertical: list[tuple[float, float, float]] = []

        for start, end in segments:
            snapped = cls._snap_axis(start, end)
            if not snapped:
                continue
            s, e = snapped
            if abs(s[1] - e[1]) <= abs(s[0] - e[0]):
                horizontal.append((s[1], min(s[0], e[0]), max(s[0], e[0])))
            else:
                vertical.append((s[0], min(s[1], e[1]), max(s[1], e[1])))

        openings: list[tuple[tuple[float, float], tuple[float, float]]] = []
        if not horizontal and not vertical:
            return openings

        edge_tol = max(18.0, min(width, height) * 0.045)
        gap_min = max(16.0, min(width, height) * 0.015)
        gap_max = max(60.0, min(width, height) * 0.24)

        def collect_gaps(items: list[tuple[float, float, float]], *, is_horizontal: bool) -> None:
            if not items:
                return
            coords = [coord for coord, _, _ in items]
            if is_horizontal:
                boundary_coords = {min(coords), max(coords)}
            else:
                boundary_coords = {min(coords), max(coords)}
            for coord in sorted(boundary_coords):
                group = [item for item in items if abs(item[0] - coord) <= edge_tol]
                if len(group) < 2:
                    continue
                intervals = sorted((start, end) for _, start, end in group)
                merged: list[list[float]] = []
                for start, end in intervals:
                    if not merged or start - merged[-1][1] > gap_min * 0.5:
                        merged.append([float(start), float(end)])
                    else:
                        merged[-1][1] = max(merged[-1][1], float(end))

                for idx in range(len(merged) - 1):
                    left = merged[idx]
                    right = merged[idx + 1]
                    gap_start = left[1]
                    gap_end = right[0]
                    gap = gap_end - gap_start
                    if gap < gap_min or gap > gap_max:
                        continue
                    left_len = left[1] - left[0]
                    right_len = right[1] - right[0]
                    if left_len < gap_min or right_len < gap_min:
                        continue
                    if is_horizontal:
                        openings.append(((gap_start, coord), (gap_end, coord)))
                    else:
                        openings.append(((coord, gap_start), (coord, gap_end)))

        collect_gaps(horizontal, is_horizontal=True)
        collect_gaps(vertical, is_horizontal=False)
        return openings

    @staticmethod
    def _remove_border_connected_regions(mask: np.ndarray) -> np.ndarray:
        work = mask.copy()
        h, w = work.shape
        flood_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)

        border_points: list[tuple[int, int]] = []
        step_x = max(1, w // 30)
        step_y = max(1, h // 30)
        border_points.extend((x, 0) for x in range(0, w, step_x))
        border_points.extend((x, h - 1) for x in range(0, w, step_x))
        border_points.extend((0, y) for y in range(0, h, step_y))
        border_points.extend((w - 1, y) for y in range(0, h, step_y))

        for x, y in border_points:
            if work[y, x] > 0:
                cv2.floodFill(work, flood_mask, (x, y), 0)
        return work

    def process(self, crop_path: Path) -> VectorizedData:
        output = VectorizedData()
        image = cv2.imread(str(crop_path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            output.todos.append('TODO: Crop image could not be read; manual room/wall drawing needed.')
            return output

        h, w = image.shape

        # Prefer heavy structural lines. Adaptive thresholding catches labels,
        # fixture outlines, doors, and furniture, which makes the 3D model noisy.
        dark_walls = cv2.inRange(image, 0, 120)
        structural_mask = cv2.morphologyEx(
            dark_walls,
            cv2.MORPH_OPEN,
            cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
            iterations=1,
        )
        structural_mask = cv2.morphologyEx(
            structural_mask,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
            iterations=1,
        )

        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(45, w // 30), 1))
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(45, h // 30)))
        min_horizontal = max(60, int(w * 0.06))
        min_vertical = max(60, int(h * 0.06))

        for mask, orient in (
            (cv2.morphologyEx(structural_mask, cv2.MORPH_OPEN, horizontal_kernel), 'h'),
            (cv2.morphologyEx(structural_mask, cv2.MORPH_OPEN, vertical_kernel), 'v'),
        ):
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                x, y, bw, bh = cv2.boundingRect(contour)
                if orient == 'h':
                    if bw < min_horizontal or bw < bh * 1.2:
                        continue
                    cy = float(y + (bh / 2.0))
                    output.wall_segments.append(((float(x), cy), (float(x + bw), cy)))
                else:
                    if bh < min_vertical or bh < bw * 1.2:
                        continue
                    cx = float(x + (bw / 2.0))
                    output.wall_segments.append(((cx, float(y)), (cx, float(y + bh))))

        binary_inv = structural_mask
        wall_mask = cv2.morphologyEx(
            binary_inv,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)),
            iterations=1,
        )
        wall_mask = cv2.dilate(
            wall_mask,
            cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
            iterations=1,
        )

        min_line_len = max(70, min(h, w) // 7)
        lines = cv2.HoughLinesP(
            wall_mask,
            1,
            np.pi / 180,
            threshold=120,
            minLineLength=min_line_len,
            maxLineGap=16,
        )
        if lines is not None:
            for line in lines[:120]:
                x1, y1, x2, y2 = line[0]
                length = float(np.hypot(x2 - x1, y2 - y1))
                if length < min_line_len:
                    continue
                output.wall_segments.append(((float(x1), float(y1)), (float(x2), float(y2))))

        output.wall_segments = self._merge_segments(
            output.wall_segments,
            coord_tol=max(8.0, min(h, w) * 0.02),
            gap_tol=max(16.0, min(h, w) * 0.04),
            min_length=max(50.0, min(h, w) * 0.045),
        )
        output.window_segments = self._extract_openings(output.wall_segments, width=w, height=h)
        if output.window_segments:
            output.todos.append('TODO: Exterior wall openings were inferred from line gaps; verify window placement.')

        # Room regions are enclosed free-space areas bounded by walls.
        free_space = cv2.bitwise_not(wall_mask)
        interior_space = self._remove_border_connected_regions(free_space)
        interior_space = cv2.morphologyEx(
            interior_space,
            cv2.MORPH_OPEN,
            cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
            iterations=1,
        )

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(interior_space, connectivity=8)
        min_room_area = max(700, int((w * h) * 0.004))
        max_room_area = int((w * h) * 0.6)
        components: list[np.ndarray] = []
        for label in range(1, num_labels):
            area = int(stats[label, cv2.CC_STAT_AREA])
            if area < min_room_area or area > max_room_area:
                continue
            component_mask = np.where(labels == label, 255, 0).astype(np.uint8)
            components.append(component_mask)

        for component_mask in components[:60]:
            contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue
            contour = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(contour)
            if area < min_room_area:
                continue
            epsilon = 0.012 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            poly = [[float(p[0][0]), float(p[0][1])] for p in approx]
            if len(poly) >= 3:
                output.room_polygons.append(poly)

        if not output.wall_segments:
            output.todos.append('TODO: Automatic wall detection confidence is low; verify wall lines manually.')
        if not output.room_polygons:
            output.todos.append('TODO: Automatic room boundary detection failed; draw room polygons manually.')
        output.todos.append('TODO: Door/window inference is approximate and should be corrected in schema editor.')
        return output
