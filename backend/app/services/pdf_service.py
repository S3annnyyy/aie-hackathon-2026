from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fitz
import pdfplumber


@dataclass
class PdfPageText:
    page_number: int
    text: str


class PdfService:
    def read_page_text(self, pdf_path: Path) -> list[PdfPageText]:
        results: list[PdfPageText] = []
        with pdfplumber.open(str(pdf_path)) as pdf:
            for idx, page in enumerate(pdf.pages):
                text = page.extract_text() or ''
                results.append(PdfPageText(page_number=idx + 1, text=text))
        return results

    def render_page_png(self, pdf_path: Path, page_number: int, out_path: Path, dpi: int) -> Path:
        doc = fitz.open(str(pdf_path))
        try:
            page = doc[page_number - 1]
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            pix.save(str(out_path))
            return out_path
        finally:
            doc.close()
