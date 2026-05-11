from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ProjectRecord(Base):
    __tablename__ = 'projects'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_pdf_name: Mapped[str] = mapped_column(String(512), nullable=False)
    source_pdf_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_pdf_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    upload_manifest_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default='uploaded')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    layouts: Mapped[list['LayoutRecord']] = relationship(back_populates='project', cascade='all, delete-orphan')


class LayoutRecord(Base):
    __tablename__ = 'layouts'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='CASCADE'))
    source_page: Mapped[int] = mapped_column(nullable=False)
    flat_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    floor_area_sqm: Mapped[float | None] = mapped_column(nullable=True)
    finish_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    crop_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    dxf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    glb_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped[ProjectRecord] = relationship(back_populates='layouts')
    changes: Mapped[list['LayoutChangeLog']] = relationship(back_populates='layout', cascade='all, delete-orphan')
    schema_memory_entries: Mapped[list['SchemaMemoryEntryRecord']] = relationship(back_populates='source_layout', cascade='all, delete-orphan')


class LayoutChangeLog(Base):
    __tablename__ = 'layout_change_logs'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    layout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('layouts.id', ondelete='CASCADE'))
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    object_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    diff_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    layout: Mapped[LayoutRecord] = relationship(back_populates='changes')


class SchemaMemoryEntryRecord(Base):
    __tablename__ = 'schema_memory_entries'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_layout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('layouts.id', ondelete='CASCADE'))
    flat_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    floor_area_sqm: Mapped[float | None] = mapped_column(nullable=True)
    room_signature: Mapped[str] = mapped_column(Text, nullable=False)
    before_schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    after_schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    rules_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    source_layout: Mapped[LayoutRecord] = relationship(back_populates='schema_memory_entries')
