from __future__ import annotations

import re

from app.models.schema import LayoutMetadata
from app.services.pdf_service import PdfPageText


class MetadataExtractor:
    FLAT_PAT = re.compile(r'(\b\d-?room[^\n,;]*)', re.IGNORECASE)
    AREA_PAT = re.compile(r'(\d{2,3}(?:\.\d+)?)\s*(?:sqm|m2|sq\.m)', re.IGNORECASE)
    FINISH_PAT = re.compile(r'(premium|standard|basic)\s+finish', re.IGNORECASE)

    def extract(self, page: PdfPageText) -> LayoutMetadata:
        text = page.text
        flat = self._find(self.FLAT_PAT, text)
        area = self._find(self.AREA_PAT, text)
        finish = self._find(self.FINISH_PAT, text)
        area_val = float(area) if area else None
        notes = None
        if 'approx' in text.lower() or 'subject to' in text.lower():
            notes = 'Contains approximation/disclaimer text from brochure page.'
        return LayoutMetadata(
            flat_type=flat,
            approx_floor_area_sqm=area_val,
            finish_type=f'{finish.title()} finish' if finish else None,
            notes=notes,
        )

    def _find(self, pattern: re.Pattern[str], text: str) -> str | None:
        match = pattern.search(text or '')
        if not match:
            return None
        return match.group(1).strip()
