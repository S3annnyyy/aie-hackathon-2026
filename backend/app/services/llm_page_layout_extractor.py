from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

import cv2
from openai import BadRequestError, OpenAI
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.models.schema import ExtractedPageLayout

logger = logging.getLogger(__name__)


class LayoutCollection(BaseModel):
    layouts: list[ExtractedPageLayout] = Field(default_factory=list)


class LlmPageLayoutExtractor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def extract(self, *, rendered_page: Path, page_text: str) -> tuple[list[ExtractedPageLayout], list[str]]:
        if not self.client:
            logger.info('page_layout_llm.skip reason=no_api_key page=%s', rendered_page)
            return [], ['TODO: Page-level layout extraction skipped because OPENAI_API_KEY is not configured.']

        prompt = (
            'Analyze this full brochure page image and extract all floorplan variants shown. '
            'Return strict JSON only with key "layouts". Each layout object must include: '
            '"layout_name", "number_of_rooms", "house_area_sqm", "room_labels". '
            'Use image content primarily; page text can be noisy or missing. '
            'Do not return markdown or explanations.'
        )
        candidates = [self.settings.openai_page_layout_model, self.settings.openai_model, 'gpt-4.1-mini']
        tried: list[str] = []
        for model in list(dict.fromkeys(candidates)):
            tried.append(model)
            try:
                logger.info('page_layout_llm.start model=%s page=%s', model, rendered_page)
                response = self.client.responses.create(
                    model=model,
                    input=[
                        {'role': 'system', 'content': [{'type': 'input_text', 'text': prompt}]},
                        {
                            'role': 'user',
                            'content': [{'type': 'input_text', 'text': f'Brochure page text:\n{page_text[:8000]}'}]
                            + self._image_blocks(rendered_page),
                        },
                    ],
                )
                parsed = LayoutCollection.model_validate(self._extract_json(response.output_text.strip()))
                logger.info('page_layout_llm.complete page=%s model=%s layouts=%d', rendered_page, model, len(parsed.layouts))
                return parsed.layouts, []
            except BadRequestError as exc:
                if getattr(exc, 'code', None) == 'model_not_found':
                    logger.warning('page_layout_llm.model_unavailable model=%s page=%s', model, rendered_page)
                    continue
                logger.exception('page_layout_llm.bad_request model=%s page=%s', model, rendered_page)
                return [], [f'TODO: Page-level layout extraction failed with model {model}; fallback metadata used.']
            except Exception:
                logger.exception('page_layout_llm.failed model=%s page=%s', model, rendered_page)
                return [], [f'TODO: Page-level layout extraction failed with model {model}; fallback metadata used.']

        logger.error('page_layout_llm.no_model_available page=%s tried=%s', rendered_page, tried)
        return [], [f'TODO: Page-level layout extraction skipped because no configured model is available ({", ".join(tried)}).']

    def _image_blocks(self, rendered_page: Path) -> list[dict[str, str]]:
        blocks: list[dict[str, str]] = []
        original = base64.b64encode(rendered_page.read_bytes()).decode('ascii')
        blocks.append({'type': 'input_image', 'image_url': f'data:image/png;base64,{original}'})

        gray = cv2.imread(str(rendered_page), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            return blocks
        upscaled = cv2.resize(gray, None, fx=1.7, fy=1.7, interpolation=cv2.INTER_CUBIC)
        enhanced = cv2.adaptiveThreshold(
            upscaled,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            41,
            7,
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
