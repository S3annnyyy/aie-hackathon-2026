from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ScaleInfo(BaseModel):
    pixels_per_meter: float | None = None
    confidence: str = 'estimated'


class SchemaMemoryInfo(BaseModel):
    applied_entry_ids: list[str] = Field(default_factory=list)
    applied_summaries: list[str] = Field(default_factory=list)


class Room(BaseModel):
    id: str
    name: str
    type: str
    polygon: list[list[float]] = Field(default_factory=list)
    clickable: bool = True
    estimated_area_sqm: float | None = None
    source_page: int | None = None
    notes: str | None = None


class Wall(BaseModel):
    id: str
    start: list[float]
    end: list[float]
    thickness_m: float = 0.12
    height_m: float = 2.8


class Opening(BaseModel):
    id: str
    wall_id: str | None = None
    center: list[float] = Field(default_factory=list)
    width_m: float = 0.9
    height_m: float = 2.1
    angle_deg: float | None = None


class Furniture(BaseModel):
    id: str
    name: str
    kind: str = 'generic'
    room_id: str | None = None
    position: list[float] = Field(default_factory=list)
    size_m: list[float] = Field(default_factory=lambda: [1.0, 1.0, 0.8])


class LayoutSchema(BaseModel):
    project_id: str
    layout_id: str
    source_page: int
    flat_type: str | None = None
    floor_area_sqm: float | None = None
    finish_type: str | None = None
    notes: str | None = None
    scale: ScaleInfo = Field(default_factory=ScaleInfo)
    rooms: list[Room] = Field(default_factory=list)
    walls: list[Wall] = Field(default_factory=list)
    doors: list[Opening] = Field(default_factory=list)
    windows: list[Opening] = Field(default_factory=list)
    furniture: list[Furniture] = Field(default_factory=list)
    todos: list[str] = Field(default_factory=list)
    schema_memory: SchemaMemoryInfo | None = None


class LayoutMetadata(BaseModel):
    flat_type: str | None = None
    approx_floor_area_sqm: float | None = None
    finish_type: str | None = None
    notes: str | None = None


class LayoutSummary(BaseModel):
    id: UUID
    project_id: UUID
    source_page: int
    flat_type: str | None = None
    floor_area_sqm: float | None = None
    finish_type: str | None = None
    notes: str | None = None
    crop_image_url: str | None = None
    dxf_url: str | None = None
    glb_url: str | None = None
    layout_schema: LayoutSchema = Field(alias='schema')

    model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True)


class ExtractedPageLayout(BaseModel):
    layout_name: str | None = None
    number_of_rooms: int | None = None
    house_area_sqm: float | None = None
    room_labels: list[str] = Field(default_factory=list)


class LayoutPageExtraction(BaseModel):
    source_page: int
    layouts: list[ExtractedPageLayout] = Field(default_factory=list)


class ProjectSummary(BaseModel):
    id: UUID
    source_pdf_name: str
    source_pdf_url: str
    status: str
    created_at: datetime | None = None
    layouts: list[LayoutSummary] = Field(default_factory=list)


class UploadResponse(BaseModel):
    project_id: UUID
    status: str
    detected_layout_page_numbers: list[int] = Field(default_factory=list)
    layout_ids: list[UUID] = Field(default_factory=list)
    layout_page_extractions: list[LayoutPageExtraction] = Field(default_factory=list)


class UploadManifest(BaseModel):
    project_id: UUID
    source_pdf_name: str
    source_pdf_hash: str
    status: str
    detected_layout_page_numbers: list[int] = Field(default_factory=list)
    layout_ids: list[UUID] = Field(default_factory=list)
    layout_page_extractions: list[LayoutPageExtraction] = Field(default_factory=list)


class SchemaPatchRequest(BaseModel):
    layout_schema: LayoutSchema = Field(alias='schema')
    learn_from_edit: bool = False

    model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True)


class SchemaFixPromptRequest(BaseModel):
    prompt: str
    object_id: str | None = None


class ChatRequest(BaseModel):
    message: str


class SchemaFixResponse(BaseModel):
    layout_id: UUID
    change_log_id: UUID | None = None
    layout_schema: LayoutSchema = Field(alias='schema')
    diff: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True)


class ArtifactResponse(BaseModel):
    layout_id: UUID
    artifact_url: str


class ExtractionResponse(BaseModel):
    layout_id: UUID
    layout_schema: LayoutSchema = Field(alias='schema')

    model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True)
