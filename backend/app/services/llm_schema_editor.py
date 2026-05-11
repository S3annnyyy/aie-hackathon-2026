from __future__ import annotations

import json
import math
from copy import deepcopy
from typing import Any

try:
    from openai import OpenAI
except ModuleNotFoundError:  # pragma: no cover - optional dependency for local fallback mode
    OpenAI = None  # type: ignore[assignment]

from app.core.config import Settings
from app.models.schema import LayoutSchema


class LlmSchemaEditor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def apply_fix(self, schema: LayoutSchema, prompt: str, object_id: str | None) -> tuple[LayoutSchema, dict[str, Any]]:
        original = schema.model_dump(mode='json')

        if self.settings.openai_api_key and OpenAI is not None:
            updated = self._apply_with_openai(original, prompt, object_id)
        else:
            updated = self._apply_fallback(original, prompt, object_id)

        result = LayoutSchema.model_validate(updated)
        diff = {'before': original, 'after': result.model_dump(mode='json'), 'object_id': object_id}
        return result, diff

    def _apply_with_openai(self, payload: dict[str, Any], prompt: str, object_id: str | None) -> dict[str, Any]:
        client = OpenAI(api_key=self.settings.openai_api_key)
        instruction = (
            'You are correcting an HDB interior layout JSON. Return JSON only, no markdown. '
            'Keep all required fields intact, update only what the prompt asks. '
            'If object_id is provided, prioritize editing that object id.'
        )
        response = client.responses.create(
            model=self.settings.openai_model,
            input=[
                {'role': 'system', 'content': instruction},
                {
                    'role': 'user',
                    'content': (
                        f'object_id={object_id or ""}\n'
                        f'prompt={prompt}\n'
                        f'schema={json.dumps(payload)}'
                    ),
                },
            ],
        )
        text = response.output_text.strip()
        return json.loads(text)

    def _apply_fallback(self, payload: dict[str, Any], prompt: str, object_id: str | None) -> dict[str, Any]:
        updated = deepcopy(payload)
        lower = prompt.lower()

        if 'auto improve' in lower:
            updated = self._apply_auto_improve_fallback(updated)
            updated.setdefault('todos', []).append(
                'TODO: Local geometry auto-improve fallback was used because OPENAI_API_KEY is not configured.'
            )
            return updated

        if object_id:
            for room in updated.get('rooms', []):
                if room.get('id') == object_id:
                    if 'rename' in lower and 'to' in lower:
                        suffix = prompt.split('to', 1)[-1].strip()
                        room['name'] = suffix or room.get('name', room['id'])
                    if 'bedroom' in lower:
                        room['type'] = 'bedroom'
                    if 'living' in lower:
                        room['type'] = 'living'
                    room['notes'] = f'Fallback edit applied from prompt: {prompt}'
            for wall in updated.get('walls', []):
                if wall.get('id') == object_id and 'thickness' in lower:
                    wall['thickness_m'] = 0.14

        updated.setdefault('todos', []).append(
            'TODO: Fallback rule-based schema fix was used because OPENAI_API_KEY is not configured.'
        )
        return updated

    def _apply_auto_improve_fallback(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._snap_wall_endpoints(payload.get('walls', []), snap_px=14.0)
        self._attach_openings_to_nearest_walls(payload, max_distance_px=70.0)
        self._mark_ignored_aircon_rooms(payload)
        return payload

    def _snap_wall_endpoints(self, walls: list[dict[str, Any]], snap_px: float) -> None:
        endpoints: list[tuple[dict[str, Any], str, list[float]]] = []
        for wall in walls:
            start = self._point(wall.get('start'))
            end = self._point(wall.get('end'))
            if start:
                endpoints.append((wall, 'start', start))
            if end:
                endpoints.append((wall, 'end', end))

        used: set[int] = set()
        for index, (_, _, point) in enumerate(endpoints):
            if index in used:
                continue
            group = [index]
            used.add(index)
            for other_index, (_, _, other_point) in enumerate(endpoints[index + 1 :], start=index + 1):
                if other_index not in used and self._distance(point, other_point) <= snap_px:
                    group.append(other_index)
                    used.add(other_index)
            if len(group) < 2:
                continue
            avg_x = sum(endpoints[group_index][2][0] for group_index in group) / len(group)
            avg_y = sum(endpoints[group_index][2][1] for group_index in group) / len(group)
            for group_index in group:
                wall, key, _ = endpoints[group_index]
                wall[key] = [avg_x, avg_y]

    def _attach_openings_to_nearest_walls(self, payload: dict[str, Any], max_distance_px: float) -> None:
        walls = payload.get('walls', [])
        wall_ids = {str(wall.get('id')) for wall in walls}
        for collection_name in ('windows', 'doors'):
            for opening in payload.get(collection_name, []):
                center = self._point(opening.get('center'))
                if not center:
                    continue
                nearest = self._nearest_wall(center, walls)
                if not nearest:
                    continue
                wall, projected, distance = nearest
                wall_id = str(wall.get('id'))
                current_wall_id = opening.get('wall_id')
                if current_wall_id not in wall_ids or distance <= max_distance_px:
                    opening['wall_id'] = wall_id
                    opening['center'] = projected
                if collection_name == 'doors' and opening.get('angle_deg') is None:
                    opening['angle_deg'] = self._wall_angle_deg(wall)

    def _mark_ignored_aircon_rooms(self, payload: dict[str, Any]) -> None:
        for room in payload.get('rooms', []):
            text = f"{room.get('name', '')} {room.get('type', '')}".lower()
            if 'air' in text and 'ledge' in text:
                room['clickable'] = False
                room['notes'] = 'Ignored for 3D room generation; kept as extracted reference.'

    def _nearest_wall(self, point: list[float], walls: list[dict[str, Any]]) -> tuple[dict[str, Any], list[float], float] | None:
        best: tuple[dict[str, Any], list[float], float] | None = None
        for wall in walls:
            start = self._point(wall.get('start'))
            end = self._point(wall.get('end'))
            if not start or not end:
                continue
            projected = self._project_point_to_segment(point, start, end)
            distance = self._distance(point, projected)
            if best is None or distance < best[2]:
                best = (wall, projected, distance)
        return best

    def _project_point_to_segment(self, point: list[float], start: list[float], end: list[float]) -> list[float]:
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length_sq = dx * dx + dy * dy
        if length_sq <= 0:
            return start
        t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length_sq
        t = max(0.0, min(1.0, t))
        return [start[0] + t * dx, start[1] + t * dy]

    def _wall_angle_deg(self, wall: dict[str, Any]) -> float:
        start = self._point(wall.get('start')) or [0.0, 0.0]
        end = self._point(wall.get('end')) or [1.0, 0.0]
        return (math.degrees(math.atan2(end[1] - start[1], end[0] - start[0])) + 360.0) % 360.0

    def _point(self, value: Any) -> list[float] | None:
        if not isinstance(value, list) or len(value) < 2:
            return None
        try:
            return [float(value[0]), float(value[1])]
        except (TypeError, ValueError):
            return None

    def _distance(self, left: list[float], right: list[float]) -> float:
        return math.hypot(left[0] - right[0], left[1] - right[1])
