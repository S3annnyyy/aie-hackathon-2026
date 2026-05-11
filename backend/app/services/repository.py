from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.models.db import LayoutChangeLog, LayoutRecord, ProjectRecord, SchemaMemoryEntryRecord
from app.models.schema import LayoutSchema


class Repository:
    def __init__(self, engine: AsyncEngine | None) -> None:
        self.engine = engine
        self.session_factory = async_sessionmaker(engine, expire_on_commit=False) if engine else None

    @property
    def enabled(self) -> bool:
        return self.session_factory is not None

    async def create_project(
        self,
        source_pdf_name: str,
        source_pdf_url: str,
        status: str,
        *,
        source_pdf_hash: str | None = None,
        upload_manifest_url: str | None = None,
    ) -> ProjectRecord:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            project = ProjectRecord(
                source_pdf_name=source_pdf_name,
                source_pdf_url=source_pdf_url,
                source_pdf_hash=source_pdf_hash,
                upload_manifest_url=upload_manifest_url,
                status=status,
            )
            session.add(project)
            await session.commit()
            await session.refresh(project)
            return project

    async def create_project_with_hash(
        self,
        source_pdf_name: str,
        source_pdf_url: str,
        status: str,
        *,
        source_pdf_hash: str,
        upload_manifest_url: str | None = None,
    ) -> ProjectRecord:
        return await self.create_project(
            source_pdf_name,
            source_pdf_url,
            status,
            source_pdf_hash=source_pdf_hash,
            upload_manifest_url=upload_manifest_url,
        )

    async def update_project_status(self, project_id: UUID, status: str) -> None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            project = await session.get(ProjectRecord, project_id)
            if project:
                project.status = status
                session.add(project)
                await session.commit()

    async def update_project_source_url(self, project_id: UUID, source_pdf_url: str) -> None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            project = await session.get(ProjectRecord, project_id)
            if project:
                project.source_pdf_url = source_pdf_url
                session.add(project)
                await session.commit()

    async def update_project_manifest_url(self, project_id: UUID, upload_manifest_url: str) -> None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            project = await session.get(ProjectRecord, project_id)
            if project:
                project.upload_manifest_url = upload_manifest_url
                session.add(project)
                await session.commit()

    async def get_project(self, project_id: UUID) -> ProjectRecord | None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            stmt = select(ProjectRecord).where(ProjectRecord.id == project_id).options(selectinload(ProjectRecord.layouts))
            return await session.scalar(stmt)

    async def get_project_by_hash(self, source_pdf_hash: str) -> ProjectRecord | None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            stmt = (
                select(ProjectRecord)
                .where(ProjectRecord.source_pdf_hash == source_pdf_hash)
                .options(selectinload(ProjectRecord.layouts))
            )
            return await session.scalar(stmt)

    async def create_layout(
        self,
        *,
        project_id: UUID,
        source_page: int,
        metadata: dict[str, Any],
        schema: LayoutSchema,
        crop_image_url: str,
    ) -> LayoutRecord:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            layout = LayoutRecord(
                project_id=project_id,
                source_page=source_page,
                flat_type=metadata.get('flat_type'),
                floor_area_sqm=metadata.get('approx_floor_area_sqm'),
                finish_type=metadata.get('finish_type'),
                notes=metadata.get('notes'),
                schema_json=schema.model_dump(mode='json'),
                crop_image_url=crop_image_url,
            )
            session.add(layout)
            await session.commit()
            await session.refresh(layout)
            return layout

    async def list_layouts(self, project_id: UUID) -> list[LayoutRecord]:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            stmt = (
                select(LayoutRecord)
                .where(LayoutRecord.project_id == project_id)
                .order_by(LayoutRecord.source_page, LayoutRecord.created_at, LayoutRecord.id)
            )
            rows = (await session.scalars(stmt)).all()
            return list(rows)

    async def get_layout(self, layout_id: UUID) -> LayoutRecord | None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            return await session.get(LayoutRecord, layout_id)

    async def update_layout_schema(self, layout_id: UUID, schema: LayoutSchema) -> LayoutRecord | None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            layout = await session.get(LayoutRecord, layout_id)
            if not layout:
                return None
            layout.schema_json = schema.model_dump(mode='json')
            layout.flat_type = schema.flat_type
            layout.floor_area_sqm = schema.floor_area_sqm
            layout.finish_type = schema.finish_type
            layout.notes = schema.notes
            session.add(layout)
            await session.commit()
            await session.refresh(layout)
            return layout

    async def update_layout_artifact(self, layout_id: UUID, artifact_type: str, artifact_url: str) -> LayoutRecord | None:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            layout = await session.get(LayoutRecord, layout_id)
            if not layout:
                return None
            if artifact_type == 'dxf':
                layout.dxf_url = artifact_url
            elif artifact_type == 'glb':
                layout.glb_url = artifact_url
            elif artifact_type == 'crop':
                layout.crop_image_url = artifact_url
            session.add(layout)
            await session.commit()
            await session.refresh(layout)
            return layout

    async def append_change_log(
        self,
        layout_id: UUID,
        prompt: str,
        object_id: str | None,
        diff: dict[str, Any],
    ) -> LayoutChangeLog:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            row = LayoutChangeLog(layout_id=layout_id, prompt=prompt, object_id=object_id, diff_json=diff)
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row

    async def create_schema_memory_entry(
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
    ) -> SchemaMemoryEntryRecord:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            row = SchemaMemoryEntryRecord(
                source_layout_id=source_layout_id,
                flat_type=flat_type,
                floor_area_sqm=floor_area_sqm,
                room_signature=room_signature,
                before_schema_json=before_schema_json,
                after_schema_json=after_schema_json,
                rules_json=rules_json,
                summary=summary,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row

    async def list_schema_memory_entries(self, *, active_only: bool = True) -> list[SchemaMemoryEntryRecord]:
        assert self.session_factory is not None
        async with self.session_factory() as session:
            stmt = select(SchemaMemoryEntryRecord).order_by(SchemaMemoryEntryRecord.created_at.desc())
            if active_only:
                stmt = stmt.where(SchemaMemoryEntryRecord.active.is_(True))
            rows = (await session.scalars(stmt)).all()
            return list(rows)
