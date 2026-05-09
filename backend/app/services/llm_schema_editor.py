from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from openai import OpenAI

from app.core.config import Settings
from app.models.schema import LayoutSchema


class LlmSchemaEditor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def apply_fix(self, schema: LayoutSchema, prompt: str, object_id: str | None) -> tuple[LayoutSchema, dict[str, Any]]:
        original = schema.model_dump(mode='json')

        if self.settings.openai_api_key:
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
