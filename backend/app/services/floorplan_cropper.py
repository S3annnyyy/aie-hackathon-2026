from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import shutil


class FloorplanCropper:
    @staticmethod
    def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
        ax, ay, aw, ah = a
        bx, by, bw, bh = b
        ax1, ay1 = ax + aw, ay + ah
        bx1, by1 = bx + bw, by + bh
        ix0, iy0 = max(ax, bx), max(ay, by)
        ix1, iy1 = min(ax1, bx1), min(ay1, by1)
        iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
        inter = iw * ih
        if inter <= 0:
            return 0.0
        union = (aw * ah) + (bw * bh) - inter
        return inter / float(union) if union else 0.0

    @staticmethod
    def _line_density(gray: np.ndarray) -> float:
        edges = cv2.Canny(gray, 60, 150)
        return float(np.count_nonzero(edges)) / float(edges.size if edges.size else 1)

    def detect_and_crop(self, rendered_page: Path, out_dir: Path, stem: str) -> list[Path]:
        image = cv2.imread(str(rendered_page))
        if image is None:
            return []

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        _, th = cv2.threshold(blur, 210, 255, cv2.THRESH_BINARY_INV)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        morph = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)

        contours, _ = cv2.findContours(morph, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes: list[tuple[int, int, int, int]] = []

        h, w = gray.shape
        min_area = (w * h) * 0.03
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            area = bw * bh
            aspect = bw / float(bh if bh else 1)
            if area >= min_area and 0.4 <= aspect <= 3.0:
                boxes.append((x, y, bw, bh))

        # Keep all reasonable floorplan-like regions, not just the largest few.
        boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
        deduped: list[tuple[int, int, int, int]] = []
        for candidate in boxes:
            if any(self._iou(candidate, existing) > 0.6 for existing in deduped):
                continue
            deduped.append(candidate)

        filtered: list[tuple[int, int, int, int]] = []
        for (x, y, bw, bh) in deduped:
            candidate_gray = gray[y : y + bh, x : x + bw]
            if candidate_gray.size == 0:
                continue
            # Discard text-only blocks; floorplans should have richer edge structure.
            if self._line_density(candidate_gray) < 0.015:
                continue
            filtered.append((x, y, bw, bh))

        # Stable reading order for deterministic IDs and UI ordering.
        boxes = sorted(filtered, key=lambda b: (b[1], b[0]))
        out_dir.mkdir(parents=True, exist_ok=True)

        crops: list[Path] = []
        if not boxes:
            fallback = out_dir / f'{stem}-crop-1.png'
            cv2.imwrite(str(fallback), image)
            return [fallback]

        for idx, (x, y, bw, bh) in enumerate(boxes, start=1):
            pad = 16
            x0, y0 = max(0, x - pad), max(0, y - pad)
            x1, y1 = min(w, x + bw + pad), min(h, y + bh + pad)
            crop = image[y0:y1, x0:x1]
            out = out_dir / f'{stem}-crop-{idx}.png'
            cv2.imwrite(str(out), crop)
            crops.append(out)
        return crops

    def sanitize_crop_for_geometry(self, crop_path: Path, out_dir: Path) -> Path:
        image = cv2.imread(str(crop_path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            out_dir.mkdir(parents=True, exist_ok=True)
            fallback = out_dir / f'{crop_path.stem}-clean.png'
            shutil.copy2(crop_path, fallback)
            return fallback

        _, inv = cv2.threshold(image, 200, 255, cv2.THRESH_BINARY_INV)
        h, w = inv.shape
        hk = max(12, w // 80)
        vk = max(12, h // 80)
        horizontal = cv2.morphologyEx(inv, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (hk, 1)))
        vertical = cv2.morphologyEx(inv, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, vk)))
        lines = cv2.bitwise_or(horizontal, vertical)
        lines = cv2.dilate(lines, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)

        if np.count_nonzero(lines) < 500:
            clean = image
        else:
            clean = 255 - lines

        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f'{crop_path.stem}-clean.png'
        cv2.imwrite(str(out), clean)
        return out
