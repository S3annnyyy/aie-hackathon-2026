from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

import cv2
from openai import OpenAI
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.models.schema import LayoutMetadata

logger = logging.getLogger(__name__)


class LlmRoomHint(BaseModel):
    label: str
    room_type: str


class LlmLayoutExtraction(BaseModel):
    flat_type: str | None = None
    approx_floor_area_sqm: float | None = None
    rooms: list[LlmRoomHint] = Field(default_factory=list)


class LlmLayoutMetadataExtractor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def enrich(
        self,
        *,
        crop_path: Path,
        page_text: str,
        fallback: LayoutMetadata,
    ) -> tuple[LayoutMetadata, list[LlmRoomHint], list[str]]:
        if not self.client:
            logger.info('llm_metadata.skip reason=no_api_key crop=%s', crop_path)
            return fallback, [], ['TODO: LLM metadata extraction skipped because OPENAI_API_KEY is not configured.']

        image_blocks = self._build_image_blocks(crop_path)
        instruction = (
            'Extract floorplan metadata from this floorplan image and brochure text. '
            'Return strict JSON only with keys: flat_type, approx_floor_area_sqm, rooms. '
            'rooms must be an array of objects with keys: label, room_type. '
            'room_type should be one of bedroom, living, kitchen, bathroom, dining, utility, corridor, study, balcony, store, other. '
            'Use best effort from the image itself even when brochure page text is empty or missing. '
            'Do not return markdown.'
        )

        try:
            logger.info('llm_metadata.start model=gpt-5.3 crop=%s', crop_path)
            response = self.client.responses.create(
                model='gpt-5.4-mini',
                input=[
                    {
                        'role': 'system',
                        'content': [{'type': 'input_text', 'text': instruction}],
                    },
                    {
                        'role': 'user',
                        'content': [{'type': 'input_text', 'text': f'Brochure page text:\n{page_text[:8000]}'}] + image_blocks,
                    },
                ],
            )
            parsed = LlmLayoutExtraction.model_validate(self._extract_json(response.output_text.strip()))
        except Exception:
            logger.exception('llm_metadata.failed crop=%s', crop_path)
            return fallback, [], ['TODO: LLM metadata extraction failed; fallback metadata and default room labels used.']

        merged = LayoutMetadata(
            flat_type=parsed.flat_type or fallback.flat_type,
            approx_floor_area_sqm=parsed.approx_floor_area_sqm or fallback.approx_floor_area_sqm,
            finish_type=fallback.finish_type,
            notes=fallback.notes,
        )
        hints = [
            LlmRoomHint(label=room.label.strip(), room_type=room.room_type.strip().lower())
            for room in parsed.rooms
            if room.label.strip()
        ]
        logger.info(
            'llm_metadata.complete crop=%s flat_type=%s area_sqm=%s room_hints=%d',
            crop_path,
            merged.flat_type,
            merged.approx_floor_area_sqm,
            len(hints),
        )
        return merged, hints, []

    def _build_image_blocks(self, crop_path: Path) -> list[dict[str, str]]:
        blocks: list[dict[str, str]] = []
        original = base64.b64encode(crop_path.read_bytes()).decode('ascii')
        blocks.append({'type': 'input_image', 'image_url': f'data:image/png;base64,{original}'})

        image = cv2.imread(str(crop_path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            return blocks

        # Add an enhanced variant to improve small text recognition in floorplan labels.
        enlarged = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        enhanced = cv2.adaptiveThreshold(
            enlarged,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            5,
        )
        ok, buf = cv2.imencode('.png', enhanced)
        if ok:
            blocks.append({'type': 'input_image', 'image_url': f'data:image/png;base64,{base64.b64encode(buf.tobytes()).decode("ascii")}'})
        return blocks

    def _extract_json(self, text: str) -> dict:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find('{')
            end = text.rfind('}')
            if start == -1 or end == -1 or end <= start:
                raise
            return json.loads(text[start : end + 1])
