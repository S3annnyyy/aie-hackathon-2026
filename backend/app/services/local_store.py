from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4


@dataclass
class LocalLayout:
    id: UUID
    project_id: UUID
    source_page: int
    flat_type: str | None
    floor_area_sqm: float | None
    finish_type: str | None
    notes: str | None
    schema_json: dict[str, Any]
    crop_image_url: str | None = None
    dxf_url: str | None = None
    glb_url: str | None = None


@dataclass
class LocalSchemaMemoryEntry:
    id: UUID
    source_layout_id: UUID
    flat_type: str | None
    floor_area_sqm: float | None
    room_signature: str
    before_schema_json: dict[str, Any]
    after_schema_json: dict[str, Any]
    rules_json: dict[str, Any]
    summary: str
    active: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class LocalProject:
    id: UUID
    source_pdf_name: str
    source_pdf_url: str
    source_pdf_hash: str | None
    upload_manifest_url: str | None
    status: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    layouts: list[LocalLayout] = field(default_factory=list)


class LocalStore:
    def __init__(self) -> None:
        self.projects: dict[UUID, LocalProject] = {}
        self.layout_index: dict[UUID, LocalLayout] = {}
        self.project_hash_index: dict[str, UUID] = {}
        self.schema_memory_entries: dict[UUID, LocalSchemaMemoryEntry] = {}

    def create_project(
        self,
        source_pdf_name: str,
        source_pdf_url: str,
        status: str,
        *,
        source_pdf_hash: str | None = None,
        upload_manifest_url: str | None = None,
    ) -> LocalProject:
        project = LocalProject(
            id=uuid4(),
            source_pdf_name=source_pdf_name,
            source_pdf_url=source_pdf_url,
            source_pdf_hash=source_pdf_hash,
            upload_manifest_url=upload_manifest_url,
            status=status,
        )
        self.projects[project.id] = project
        if source_pdf_hash:
            self.project_hash_index[source_pdf_hash] = project.id
        return project

    def update_project_status(self, project_id: UUID, status: str) -> None:
        project = self.projects.get(project_id)
        if project:
            project.status = status

    def update_project_source_url(self, project_id: UUID, source_pdf_url: str) -> None:
        project = self.projects.get(project_id)
        if project:
            project.source_pdf_url = source_pdf_url

    def update_project_manifest_url(self, project_id: UUID, upload_manifest_url: str) -> None:
        project = self.projects.get(project_id)
        if project:
            project.upload_manifest_url = upload_manifest_url

    def get_project_by_hash(self, source_pdf_hash: str) -> LocalProject | None:
        project_id = self.project_hash_index.get(source_pdf_hash)
        if not project_id:
            return None
        return self.projects.get(project_id)

    def get_project(self, project_id: UUID) -> LocalProject | None:
        return self.projects.get(project_id)

    def create_layout(
        self,
        *,
        project_id: UUID,
        source_page: int,
        metadata: dict[str, Any],
        schema_json: dict[str, Any],
        crop_image_url: str,
    ) -> LocalLayout:
        layout = LocalLayout(
            id=uuid4(),
            project_id=project_id,
            source_page=source_page,
            flat_type=metadata.get('flat_type'),
            floor_area_sqm=metadata.get('approx_floor_area_sqm'),
            finish_type=metadata.get('finish_type'),
            notes=metadata.get('notes'),
            schema_json=schema_json,
            crop_image_url=crop_image_url,
        )
        project = self.projects[project_id]
        project.layouts.append(layout)
        self.layout_index[layout.id] = layout
        return layout

    def list_layouts(self, project_id: UUID) -> list[LocalLayout]:
        project = self.projects.get(project_id)
        return list(project.layouts) if project else []

    def get_layout(self, layout_id: UUID) -> LocalLayout | None:
        return self.layout_index.get(layout_id)

    def update_layout_schema(self, layout_id: UUID, schema_json: dict[str, Any]) -> LocalLayout | None:
        layout = self.layout_index.get(layout_id)
        if layout:
            layout.schema_json = schema_json
            layout.flat_type = schema_json.get('flat_type')
            layout.floor_area_sqm = schema_json.get('floor_area_sqm')
            layout.finish_type = schema_json.get('finish_type')
            layout.notes = schema_json.get('notes')
        return layout

    def update_layout_artifact(self, layout_id: UUID, artifact_type: str, artifact_url: str) -> LocalLayout | None:
        layout = self.layout_index.get(layout_id)
        if not layout:
            return None
        if artifact_type == 'dxf':
            layout.dxf_url = artifact_url
        elif artifact_type == 'glb':
            layout.glb_url = artifact_url
        elif artifact_type == 'crop':
            layout.crop_image_url = artifact_url
        return layout

    def create_schema_memory_entry(
        self,
        *,
        source_layout_id: UUID,
        flat_type: str | None,
        floor_area_sqm: float | None,
        room_signature: str,
        before_schema_json: dict[str, Any],
        after_schema_json: dict[str, Any],
        rules_json: dict[str, Any],
        summary: str,
    ) -> LocalSchemaMemoryEntry:
        entry = LocalSchemaMemoryEntry(
            id=uuid4(),
            source_layout_id=source_layout_id,
            flat_type=flat_type,
            floor_area_sqm=floor_area_sqm,
            room_signature=room_signature,
            before_schema_json=before_schema_json,
            after_schema_json=after_schema_json,
            rules_json=rules_json,
            summary=summary,
        )
        self.schema_memory_entries[entry.id] = entry
        return entry

    def list_schema_memory_entries(self, *, active_only: bool = True) -> list[LocalSchemaMemoryEntry]:
        entries = list(self.schema_memory_entries.values())
        if active_only:
            entries = [entry for entry in entries if entry.active]
        return sorted(entries, key=lambda entry: entry.created_at, reverse=True)


local_store = LocalStore()
