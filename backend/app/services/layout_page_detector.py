from __future__ import annotations

import re

from app.services.pdf_service import PdfPageText

_LAYOUT_PATTERN = re.compile(r'\blayout\s+ideas\b', re.IGNORECASE)


class LayoutPageDetector:
    def detect_layout_pages(self, pages: list[PdfPageText]) -> list[int]:
        detected: list[int] = []
        for page in pages:
            if _LAYOUT_PATTERN.search(page.text):
                detected.append(page.page_number)
        return detected
