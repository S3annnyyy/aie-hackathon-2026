from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings

logger = logging.getLogger(__name__)


VISION_SYSTEM = (
    'You are an interior design analyst. Given one photo, identify the style and '
    'furnishings with enough specificity to rebuild a *similar* room in 3D. '
    'Return STRICT JSON only — no markdown fences, no commentary. Use this schema:\n'
    '{\n'
    '  "style": string,                     // one short label, e.g. "scandinavian", "japandi"\n'
    '  "room_type": string,                 // e.g. "living", "bedroom", "kitchen"\n'
    '  "mood": string,                      // 1 sentence\n'
    '  "palette_hex": [string],             // 3-6 hex colors\n'
    '  "materials": [string],               // e.g. ["white oak", "linen", "brushed brass"]\n'
    '  "lighting": {"temp_k": int, "intensity": string, "direction": string},\n'
    '  "objects": [\n'
    '    {\n'
    '      "name": string,                  // e.g. "cream bouclé sofa"\n'
    '      "type": string,                  // e.g. "sofa","bed","coffee_table","rug","pendant_light"\n'
    '      "size_m": [number, number, number],  // width, depth, height in meters (approx)\n'
    '      "placement_hint": string,        // "center" | "left_wall" | "right_wall" | "back_wall" | "near_window"\n'
    '      "notes": string                  // material, color, distinctive detail\n'
    '    }\n'
    '  ]\n'
    '}\n'
    'Omit objects you cannot see. Size estimates are approximate; prefer realistic meters.'
)


@dataclass
class PhotoInspiration:
    style: str = ''
    room_type: str = ''
    mood: str = ''
    palette_hex: list[str] = field(default_factory=list)
    materials: list[str] = field(default_factory=list)
    lighting: dict[str, Any] = field(default_factory=dict)
    objects: list[dict[str, Any]] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    def to_prompt(self, target_room: str | None) -> str:
        """Compose a chat message that asks the agent to apply this inspiration."""
        room_clause = f'the {target_room!r} room' if target_room else 'the best-matching room'
        lines = [
            f'Use this reference to restyle {room_clause}.',
            f'Style: {self.style} — {self.mood}',
            f'Palette: {", ".join(self.palette_hex[:6])}',
            f'Materials: {", ".join(self.materials[:6])}',
        ]
        if self.lighting:
            lines.append(
                f'Lighting: {self.lighting.get("temp_k", "")}K, '
                f'{self.lighting.get("intensity", "")}, {self.lighting.get("direction", "")}'
            )
        lines.append('Place these objects using add_furniture (sizes in meters are approximate):')
        for obj in self.objects[:12]:
            size = obj.get('size_m') or []
            size_str = 'x'.join(f'{float(v):.2f}' for v in size[:3]) if size else 'auto'
            lines.append(
                f'- {obj.get("name", obj.get("type", "item"))} '
                f'({obj.get("type", "item")}, ~{size_str}m, {obj.get("placement_hint", "")}) — '
                f'{obj.get("notes", "")}'
            )
        lines.append(
            'Call list_rooms first, then set_finish + annotate_room + add_furniture calls. '
            'End with a one-sentence summary of what you did.'
        )
        return '\n'.join(lines)


def _parse_inspiration(text: str) -> PhotoInspiration:
    stripped = text.strip()
    if stripped.startswith('```'):
        # strip code fences like ```json ... ```
        stripped = stripped.strip('`')
        if stripped.lower().startswith('json'):
            stripped = stripped[4:].strip()
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        logger.warning('vision.parse_failed raw=%r', text[:500])
        return PhotoInspiration(style='unknown', mood=text[:240], raw={'raw_text': text})

    return PhotoInspiration(
        style=str(data.get('style', '')),
        room_type=str(data.get('room_type', '')),
        mood=str(data.get('mood', '')),
        palette_hex=list(data.get('palette_hex', []) or []),
        materials=list(data.get('materials', []) or []),
        lighting=dict(data.get('lighting', {}) or {}),
        objects=list(data.get('objects', []) or []),
        raw=data,
    )


class VisionAnalyzer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def analyze(self, image_bytes: bytes, mime_type: str) -> PhotoInspiration:
        provider = (self._settings.chat_llm_provider or 'openai').lower()
        if provider == 'gemini' and self._settings.gemini_api_key:
            return self._analyze_gemini(image_bytes, mime_type)
        if provider == 'anthropic' and self._settings.anthropic_api_key:
            return self._analyze_anthropic(image_bytes, mime_type)
        if provider == 'openai' and self._settings.openai_api_key:
            return self._analyze_openai(image_bytes, mime_type)
        # fallbacks in preference order
        if self._settings.gemini_api_key:
            return self._analyze_gemini(image_bytes, mime_type)
        if self._settings.openai_api_key:
            return self._analyze_openai(image_bytes, mime_type)
        if self._settings.anthropic_api_key:
            return self._analyze_anthropic(image_bytes, mime_type)
        raise RuntimeError('No vision-capable LLM credentials configured.')

    def _analyze_gemini(self, image_bytes: bytes, mime_type: str) -> PhotoInspiration:
        from google import genai
        from google.genai import types as gtypes

        client = genai.Client(api_key=self._settings.gemini_api_key)
        response = client.models.generate_content(
            model=self._settings.gemini_model,
            contents=[
                gtypes.Content(
                    role='user',
                    parts=[
                        gtypes.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                        gtypes.Part(text='Analyze this interior photo.'),
                    ],
                )
            ],
            config=gtypes.GenerateContentConfig(
                system_instruction=VISION_SYSTEM,
                response_mime_type='application/json',
            ),
        )
        text = ''
        if response.candidates:
            for part in response.candidates[0].content.parts or []:
                if getattr(part, 'text', None):
                    text += part.text
        return _parse_inspiration(text)

    def _analyze_openai(self, image_bytes: bytes, mime_type: str) -> PhotoInspiration:
        from openai import OpenAI

        client = OpenAI(api_key=self._settings.openai_api_key)
        b64 = base64.b64encode(image_bytes).decode('ascii')
        data_url = f'data:{mime_type};base64,{b64}'
        model = self._settings.chat_openai_model or self._settings.openai_model

        response = client.chat.completions.create(
            model=model,
            messages=[
                {'role': 'system', 'content': VISION_SYSTEM},
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': 'Analyze this interior photo.'},
                        {'type': 'image_url', 'image_url': {'url': data_url}},
                    ],
                },
            ],
        )
        return _parse_inspiration(response.choices[0].message.content or '')

    def _analyze_anthropic(self, image_bytes: bytes, mime_type: str) -> PhotoInspiration:
        from anthropic import Anthropic

        client = Anthropic(api_key=self._settings.anthropic_api_key)
        b64 = base64.b64encode(image_bytes).decode('ascii')

        response = client.messages.create(
            model=self._settings.anthropic_model,
            max_tokens=1500,
            system=VISION_SYSTEM,
            messages=[
                {
                    'role': 'user',
                    'content': [
                        {
                            'type': 'image',
                            'source': {
                                'type': 'base64',
                                'media_type': mime_type,
                                'data': b64,
                            },
                        },
                        {'type': 'text', 'text': 'Analyze this interior photo.'},
                    ],
                }
            ],
        )
        text = ''.join(block.text for block in response.content if block.type == 'text')
        return _parse_inspiration(text)
