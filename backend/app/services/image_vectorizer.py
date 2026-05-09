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

    @staticmethod
    def _has_nearby_dark_band(
        dark_mask: np.ndarray,
        *,
        x: int,
        y: int,
        w: int,
        h: int,
        is_horizontal: bool,
    ) -> bool:
        img_h, img_w = dark_mask.shape
        margin = max(4, min(18, max(w, h) // 6))
        if is_horizontal:
            above = dark_mask[max(0, y - margin):y, max(0, x - 2):min(img_w, x + w + 2)]
            below = dark_mask[min(img_h, y + h):min(img_h, y + h + margin), max(0, x - 2):min(img_w, x + w + 2)]
            bands = [above, below]
        else:
            left = dark_mask[max(0, y - 2):min(img_h, y + h + 2), max(0, x - margin):x]
            right = dark_mask[max(0, y - 2):min(img_h, y + h + 2), min(img_w, x + w):min(img_w, x + w + margin)]
            bands = [left, right]

        for band in bands:
            if band.size and float(np.count_nonzero(band)) / float(band.size) > 0.08:
                return True
        return False

    def _detect_window_segments(self, image: np.ndarray, dark_mask: np.ndarray) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        h, w = image.shape
        bright = cv2.inRange(image, 178, 255)
        segments: list[tuple[tuple[float, float], tuple[float, float]]] = []

        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(24, w // 55), 3))
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, max(24, h // 55)))
        min_len = max(28, int(min(w, h) * 0.035))

        for mask, is_horizontal in (
            (cv2.morphologyEx(bright, cv2.MORPH_OPEN, horizontal_kernel), True),
            (cv2.morphologyEx(bright, cv2.MORPH_OPEN, vertical_kernel), False),
        ):
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                x, y, bw, bh = cv2.boundingRect(contour)
                if is_horizontal:
                    if bw < min_len or bh < 2 or bh > max(26, h * 0.035) or bw < bh * 3.5:
                        continue
                    if not self._has_nearby_dark_band(dark_mask, x=x, y=y, w=bw, h=bh, is_horizontal=True):
                        continue
                    cy = float(y + bh / 2.0)
                    segments.append(((float(x), cy), (float(x + bw), cy)))
                else:
                    if bh < min_len or bw < 2 or bw > max(26, w * 0.035) or bh < bw * 3.5:
                        continue
                    if not self._has_nearby_dark_band(dark_mask, x=x, y=y, w=bw, h=bh, is_horizontal=False):
                        continue
                    cx = float(x + bw / 2.0)
                    segments.append(((cx, float(y)), (cx, float(y + bh))))

        return segments

    def process(self, crop_path: Path) -> VectorizedData:
        output = VectorizedData()
        image = cv2.imread(str(crop_path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            output.todos.append('TODO: Crop image could not be read; manual room/wall drawing needed.')
            return output

        h, w = image.shape

        # Prefer heavy structural lines. Adaptive thresholding catches labels,
        # fixture outlines, doors, and furniture, which makes the 3D model noisy.
        dark_walls = cv2.inRange(image, 0, 105)
        output.window_segments = self._detect_window_segments(image, dark_walls)
        structural_mask = cv2.morphologyEx(
            dark_walls,
            cv2.MORPH_OPEN,
            cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)),
            iterations=1,
        )
        structural_mask = cv2.morphologyEx(
            structural_mask,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)),
            iterations=1,
        )

        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(55, w // 28), 1))
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(55, h // 28)))
        min_horizontal = max(70, int(w * 0.07))
        min_vertical = max(70, int(h * 0.07))

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
