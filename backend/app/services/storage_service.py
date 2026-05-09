from __future__ import annotations

import shutil
from pathlib import Path
from uuid import UUID

from app.core.config import Settings


class StorageService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = settings.storage_root

    def project_upload_dir(self, project_id: UUID) -> Path:
        path = self.root / self.settings.upload_subdir / str(project_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def project_dir(self, project_id: UUID) -> Path:
        path = self.root / self.settings.projects_subdir / str(project_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_source_pdf(self, project_id: UUID, data: bytes) -> tuple[Path, str]:
        path = self.project_upload_dir(project_id) / 'source.pdf'
        path.write_bytes(data)
        return path, self.to_url(path)

    def save_layout_crop(self, project_id: UUID, layout_slug: str, image_path: Path) -> tuple[Path, str]:
        crops_dir = self.project_dir(project_id) / 'crops'
        crops_dir.mkdir(parents=True, exist_ok=True)
        target = crops_dir / f'{layout_slug}.png'
        shutil.copy2(image_path, target)
        return target, self.to_url(target)

    def save_schema_snapshot(self, project_id: UUID, layout_slug: str, payload: str) -> tuple[Path, str]:
        schema_dir = self.project_dir(project_id) / 'schemas'
        schema_dir.mkdir(parents=True, exist_ok=True)
        target = schema_dir / f'{layout_slug}.json'
        target.write_text(payload, encoding='utf-8')
        return target, self.to_url(target)

    def save_upload_manifest(self, project_id: UUID, payload: str) -> tuple[Path, str]:
        manifest_dir = self.project_dir(project_id) / 'manifests'
        manifest_dir.mkdir(parents=True, exist_ok=True)
        target = manifest_dir / 'upload.json'
        target.write_text(payload, encoding='utf-8')
        return target, self.to_url(target)

    def save_dxf(self, project_id: UUID, layout_slug: str, data: bytes) -> tuple[Path, str]:
        dxf_dir = self.project_dir(project_id) / 'dxf'
        dxf_dir.mkdir(parents=True, exist_ok=True)
        target = dxf_dir / f'{layout_slug}.dxf'
        target.write_bytes(data)
        return target, self.to_url(target)

    def save_glb(self, project_id: UUID, layout_slug: str, data: bytes) -> tuple[Path, str]:
        glb_dir = self.project_dir(project_id) / 'glb'
        glb_dir.mkdir(parents=True, exist_ok=True)
        target = glb_dir / f'{layout_slug}.glb'
        target.write_bytes(data)
        return target, self.to_url(target)

    def resolve_local_url(self, url: str) -> Path:
        if url.startswith('local://'):
            rel = url.replace('local://', '', 1)
            return self.root / rel
        return Path(url)

    def to_url(self, path: Path) -> str:
        rel = path.relative_to(self.root)
        return f'local://{rel.as_posix()}'
