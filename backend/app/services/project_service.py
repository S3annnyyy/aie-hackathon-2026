from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from app.core.config import Settings
from app.models.schema import (
    ArtifactResponse,
    ExtractedPageLayout,
    ExtractionResponse,
    LayoutMetadata,
    LayoutPageExtraction,
    LayoutSchema,
    LayoutSummary,
    Opening,
    ProjectSummary,
    SchemaFixResponse,
    SchemaMemoryInfo,
    UploadManifest,
    UploadResponse,
    Wall,
)
from app.services.blender_generator import BlenderGenerator
from app.services.chat.agent import AgentEvent
from app.services.chat.service import ChatService
from app.services.chat.vision import VisionAnalyzer
from app.services.dxf_exporter import DxfExporter
from app.services.floorplan_cropper import FloorplanCropper
from app.services.image_vectorizer import ImageVectorizer
from app.services.layout_page_detector import LayoutPageDetector
from app.services.llm_layout_metadata_extractor import LlmLayoutMetadataExtractor, LlmRoomHint
from app.services.llm_page_layout_extractor import LlmPageLayoutExtractor
from app.services.llm_schema_editor import LlmSchemaEditor
from app.services.local_store import local_store
from app.services.metadata_extractor import MetadataExtractor
from app.services.pdf_service import PdfService
from app.services.repository import Repository
from app.services.schema_generator import SchemaGenerator
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)


class ProjectService:
    def __init__(self, settings: Settings, repository: Repository) -> None:
        self.settings = settings
        self.repository = repository
        self.storage = StorageService(settings)
        self.pdf_service = PdfService()
        self.page_detector = LayoutPageDetector()
        self.cropper = FloorplanCropper()
        self.metadata_extractor = MetadataExtractor()
        self.llm_metadata_extractor = LlmLayoutMetadataExtractor(settings)
        self.page_layout_extractor = LlmPageLayoutExtractor(settings)
        self.vectorizer = ImageVectorizer()
        self.schema_generator = SchemaGenerator()
        self.dxf_exporter = DxfExporter()
        self.blender_generator = BlenderGenerator(settings)
        self.llm_editor = LlmSchemaEditor(settings)
        self.chat_service = ChatService(settings)
        self.vision_analyzer = VisionAnalyzer(settings)

    @staticmethod
    def _hardcoded_windows_for_four_room(schema: LayoutSchema) -> list[Opening]:
        wall_ids = {wall.id for wall in schema.walls}
        presets = [
            Opening(id='window_1', wall_id='wall_window_living', center=[327.5, 220.0], width_m=3.51, height_m=1.2),
            Opening(id='window_2', wall_id='wall_window_bedroom_left', center=[722.0, 49.25], width_m=2.28, height_m=1.2),
            Opening(id='window_3', wall_id='wall_window_bedroom_middle', center=[1158.5, 49.25], width_m=1.67, height_m=1.2),
            Opening(id='window_4', wall_id='wall_window_main_bedroom', center=[1493.5, 49.25], width_m=3.75, height_m=1.2),
        ]
        return [opening for opening in presets if opening.wall_id in wall_ids]

    @staticmethod
    def _hardcoded_window_walls_for_four_room(schema: LayoutSchema) -> list[Wall]:
        existing_ids = {wall.id for wall in schema.walls}
        presets = [
            ('wall_window_living', [152.0, 220.0], [503.0, 220.0]),
            ('wall_window_bedroom_left', [608.0, 49.25], [836.0, 49.25]),
            ('wall_window_bedroom_middle', [1075.0, 49.25], [1242.0, 49.25]),
            ('wall_window_main_bedroom', [1306.0, 49.25], [1681.0, 49.25]),
        ]
        return [
            Wall(id=wall_id, start=start, end=end)
            for wall_id, start, end in presets
            if wall_id not in existing_ids
        ]

    def _normalize_windows_for_viewer(self, schema: LayoutSchema) -> LayoutSchema:
        flat_type = str(schema.flat_type or '').lower()
        if '4-room' not in flat_type:
            return schema
        walls = schema.walls + self._hardcoded_window_walls_for_four_room(schema)
        normalized = schema.model_copy(update={'walls': walls})
        windows = self._hardcoded_windows_for_four_room(normalized)
        return normalized.model_copy(update={'windows': windows}) if windows else schema

    async def upload_pdf(self, source_name: str, content: bytes) -> UploadResponse:
        logger.info('upload.start source_name=%s bytes=%d', source_name, len(content))
        source_pdf_hash = hashlib.sha256(content).hexdigest()

        existing = await self._get_project_by_hash(source_pdf_hash)
        if existing:
            cached = await self._cached_upload_response(existing, source_pdf_hash)
            if cached:
                logger.info('upload.hash_hit project_id=%s status=%s', cached.project_id, cached.status)
                return cached

        if self.repository.enabled:
            project = await self.repository.create_project_with_hash(
                source_name,
                'pending://source.pdf',
                'processing',
                source_pdf_hash=source_pdf_hash,
            )
            project_id = project.id
        else:
            project = local_store.create_project(
                source_name,
                'pending://source.pdf',
                'processing',
                source_pdf_hash=source_pdf_hash,
            )
            project_id = project.id
        logger.info('upload.project_created project_id=%s repository_enabled=%s hash=%s', project_id, self.repository.enabled, source_pdf_hash)

        pdf_path, pdf_url = self.storage.save_source_pdf(project_id, content)
        logger.info('upload.source_saved project_id=%s pdf_path=%s', project_id, pdf_path)
        if self.repository.enabled:
            await self.repository.update_project_source_url(project_id, pdf_url)
        else:
            local_store.update_project_source_url(project_id, pdf_url)

        page_texts = self.pdf_service.read_page_text(pdf_path)
        layout_pages = self.page_detector.detect_layout_pages(page_texts)
        logger.info(
            'upload.layout_pages_detected project_id=%s total_pages=%d matched_pages=%d pages=%s',
            project_id,
            len(page_texts),
            len(layout_pages),
            layout_pages,
        )

        layout_ids: list[UUID] = []
        layout_page_extractions: list[LayoutPageExtraction] = []
        project_dir = self.storage.project_dir(project_id)
        rendered_dir = project_dir / 'rendered'
        rendered_dir.mkdir(parents=True, exist_ok=True)

        for page_num in layout_pages:
            page_txt = next((p for p in page_texts if p.page_number == page_num), None)
            if not page_txt:
                logger.warning('upload.page_text_missing project_id=%s source_page=%d', project_id, page_num)
                continue
            logger.info('upload.page_start project_id=%s source_page=%d', project_id, page_num)
            base_metadata = self.metadata_extractor.extract(page_txt)
            rendered = self.pdf_service.render_page_png(
                pdf_path,
                page_num,
                rendered_dir / f'page-{page_num}.png',
                dpi=self.settings.page_render_dpi,
            )
            logger.info('upload.page_rendered project_id=%s source_page=%d rendered=%s', project_id, page_num, rendered)
            page_layouts, page_layout_todos = self.page_layout_extractor.extract(rendered_page=rendered, page_text=page_txt.text)
            layout_page_extractions.append(LayoutPageExtraction(source_page=page_num, layouts=page_layouts))
            logger.info(
                'upload.page_layout_metadata project_id=%s source_page=%d layouts=%d todos=%d',
                project_id,
                page_num,
                len(page_layouts),
                len(page_layout_todos),
            )
            crops = self.cropper.detect_and_crop(rendered, project_dir / 'crops_raw', f'page-{page_num}')
            logger.info('upload.crops_detected project_id=%s source_page=%d crop_count=%d', project_id, page_num, len(crops))

            for crop_idx, crop_path in enumerate(crops, start=1):
                layout_slug = f'layout-p{page_num}-{crop_idx}'
                logger.info(
                    'upload.crop_start project_id=%s source_page=%d crop_idx=%d crop_path=%s',
                    project_id,
                    page_num,
                    crop_idx,
                    crop_path,
                )
                _, crop_url = self.storage.save_layout_crop(project_id, layout_slug, crop_path)
                layout_info = page_layouts[crop_idx - 1] if crop_idx - 1 < len(page_layouts) else None
                if layout_info:
                    metadata = LayoutMetadata(
                        flat_type=layout_info.layout_name or base_metadata.flat_type,
                        approx_floor_area_sqm=layout_info.house_area_sqm or base_metadata.approx_floor_area_sqm,
                        finish_type=base_metadata.finish_type,
                        notes=base_metadata.notes,
                    )
                    room_hints = self._room_hints_from_page_layout(layout_info)
                    metadata_todos: list[str] = []
                else:
                    metadata = base_metadata
                    room_hints = []
                    metadata_todos = ['TODO: No matched page-level layout metadata for this crop.']
                metadata_todos.extend(page_layout_todos)
                logger.info(
                    'upload.crop_metadata project_id=%s source_page=%d crop_idx=%d flat_type=%s area_sqm=%s room_hints=%d fallback_todos=%d',
                    project_id,
                    page_num,
                    crop_idx,
                    metadata.flat_type,
                    metadata.approx_floor_area_sqm,
                    len(room_hints),
                    len(metadata_todos),
                )

                clean_crop_path = self.cropper.sanitize_crop_for_geometry(crop_path, project_dir / 'crops_clean')
                vectorized = self.vectorizer.process(crop_path)
                logger.info(
                    'upload.crop_vectorized project_id=%s source_page=%d crop_idx=%d crop=%s clean_crop=%s rooms=%d walls=%d windows=%d todos=%d',
                    project_id,
                    page_num,
                    crop_idx,
                    crop_path,
                    clean_crop_path,
                    len(vectorized.room_polygons),
                    len(vectorized.wall_segments),
                    len(vectorized.window_segments),
                    len(vectorized.todos),
                )
                temp_schema = self.schema_generator.build(
                    project_id=str(project_id),
                    layout_id='pending',
                    source_page=page_num,
                    metadata=metadata,
                    vectorized=vectorized,
                    room_hints=room_hints,
                )
                temp_schema = temp_schema.model_copy(update={'todos': temp_schema.todos + metadata_todos})

                if self.repository.enabled:
                    rec = await self.repository.create_layout(
                        project_id=project_id,
                        source_page=page_num,
                        metadata=metadata.model_dump(mode='json'),
                        schema=temp_schema,
                        crop_image_url=crop_url,
                    )
                    schema = temp_schema.model_copy(update={'layout_id': str(rec.id)})
                    await self.repository.update_layout_schema(rec.id, schema)
                    layout_id = rec.id
                else:
                    local = local_store.create_layout(
                        project_id=project_id,
                        source_page=page_num,
                        metadata=metadata.model_dump(mode='json'),
                        schema_json=temp_schema.model_dump(mode='json'),
                        crop_image_url=crop_url,
                    )
                    schema = LayoutSchema.model_validate(local.schema_json).model_copy(update={'layout_id': str(local.id)})
                    local_store.update_layout_schema(local.id, schema.model_dump(mode='json'))
                    layout_id = local.id

                schema = await self._apply_schema_memory(schema, exclude_layout_id=layout_id)
                await self.patch_schema(layout_id, schema)
                self.storage.save_schema_snapshot(project_id, layout_slug, schema.model_dump_json(indent=2))
                layout_ids.append(layout_id)
                logger.info(
                    'upload.crop_complete project_id=%s source_page=%d crop_idx=%d layout_id=%s crop_url=%s',
                    project_id,
                    page_num,
                    crop_idx,
                    layout_id,
                    crop_url,
                )

        response = UploadResponse(
            project_id=project_id,
            status='processed',
            detected_layout_page_numbers=layout_pages,
            layout_ids=layout_ids,
            layout_page_extractions=layout_page_extractions,
        )

        await self._save_upload_manifest(project_id, source_name, source_pdf_hash, response)
        if self.repository.enabled:
            await self.repository.update_project_status(project_id, 'processed')
        else:
            local_store.update_project_status(project_id, 'processed')
        logger.info('upload.complete project_id=%s layout_count=%d', project_id, len(layout_ids))

        return response

    async def get_project(self, project_id: UUID) -> ProjectSummary | None:
        if self.repository.enabled:
            project = await self.repository.get_project(project_id)
            if not project:
                return None
            layouts = await self.repository.list_layouts(project_id)
            return ProjectSummary(
                id=project.id,
                source_pdf_name=project.source_pdf_name,
                source_pdf_url=project.source_pdf_url,
                status=project.status,
                created_at=project.created_at,
                layouts=[self._layout_to_summary(l) for l in layouts],
            )

        local = local_store.get_project(project_id)
        if not local:
            return None
        return ProjectSummary(
            id=local.id,
            source_pdf_name=local.source_pdf_name,
            source_pdf_url=local.source_pdf_url,
            status=local.status,
            created_at=local.created_at,
            layouts=[self._local_layout_to_summary(l) for l in local.layouts],
        )

    async def list_layouts(self, project_id: UUID) -> list[LayoutSummary]:
        if self.repository.enabled:
            rows = await self.repository.list_layouts(project_id)
            return [self._layout_to_summary(row) for row in rows]
        return [self._local_layout_to_summary(row) for row in local_store.list_layouts(project_id)]

    async def get_layout(self, layout_id: UUID) -> LayoutSummary | None:
        if self.repository.enabled:
            row = await self.repository.get_layout(layout_id)
            return self._layout_to_summary(row) if row else None
        row = local_store.get_layout(layout_id)
        return self._local_layout_to_summary(row) if row else None

    async def _get_project_by_hash(self, source_pdf_hash: str):
        if self.repository.enabled:
            return await self.repository.get_project_by_hash(source_pdf_hash)
        return local_store.get_project_by_hash(source_pdf_hash)

    async def _cached_upload_response(self, project: object, source_pdf_hash: str) -> UploadResponse | None:
        manifest = await self._load_upload_manifest(project)
        if manifest:
            return UploadResponse.model_validate(manifest.model_dump(mode='json'))

        if getattr(project, 'status', '') != 'processed':
            return UploadResponse(
                project_id=project.id,
                status=getattr(project, 'status', 'processing'),
                detected_layout_page_numbers=[],
                layout_ids=[],
                layout_page_extractions=[],
            )

        response = self._build_upload_response_from_project(project)
        await self._save_upload_manifest(project.id, project.source_pdf_name, source_pdf_hash, response)
        return response

    async def _load_upload_manifest(self, project: object) -> UploadManifest | None:
        manifest_url = getattr(project, 'upload_manifest_url', None)
        if not manifest_url:
            return None
        manifest_path = self.storage.resolve_local_url(manifest_url)
        if not manifest_path.exists():
            return None
        try:
            return UploadManifest.model_validate_json(manifest_path.read_text(encoding='utf-8'))
        except Exception:
            logger.exception('upload.manifest_read_failed project_id=%s path=%s', getattr(project, 'id', None), manifest_path)
            return None

    def _build_upload_response_from_project(self, project: object) -> UploadResponse:
        layouts = list(getattr(project, 'layouts', []) or [])
        layouts = sorted(
            layouts,
            key=lambda row: (
                getattr(row, 'source_page', 0),
                str(getattr(row, 'created_at', '') or ''),
                str(getattr(row, 'id', '')),
            ),
        )
        detected_pages = sorted({int(getattr(layout, 'source_page', 0)) for layout in layouts if getattr(layout, 'source_page', None) is not None})
        layout_ids = [layout.id for layout in layouts]
        page_extractions = [LayoutPageExtraction(source_page=page, layouts=[]) for page in detected_pages]
        return UploadResponse(
            project_id=project.id,
            status=getattr(project, 'status', 'processed'),
            detected_layout_page_numbers=detected_pages,
            layout_ids=layout_ids,
            layout_page_extractions=page_extractions,
        )

    async def _save_upload_manifest(
        self,
        project_id: UUID,
        source_pdf_name: str,
        source_pdf_hash: str,
        response: UploadResponse,
    ) -> None:
        manifest = UploadManifest(
            project_id=project_id,
            source_pdf_name=source_pdf_name,
            source_pdf_hash=source_pdf_hash,
            status=response.status,
            detected_layout_page_numbers=response.detected_layout_page_numbers,
            layout_ids=response.layout_ids,
            layout_page_extractions=response.layout_page_extractions,
        )
        _, manifest_url = self.storage.save_upload_manifest(project_id, manifest.model_dump_json(indent=2))
        if self.repository.enabled:
            await self.repository.update_project_manifest_url(project_id, manifest_url)
        else:
            local_store.update_project_manifest_url(project_id, manifest_url)

    async def patch_schema(self, layout_id: UUID, schema: LayoutSchema, learn_from_edit: bool = False) -> LayoutSummary | None:
        previous_schema = await self._stored_schema(layout_id) if learn_from_edit else None
        if self.repository.enabled:
            row = await self.repository.update_layout_schema(layout_id, schema)
            if not row:
                return None
            if previous_schema and self._has_structural_schema_change(previous_schema, schema):
                await self._save_schema_memory_entry(layout_id, previous_schema, schema)
            return self._layout_to_summary(row)
        row = local_store.update_layout_schema(layout_id, schema.model_dump(mode='json'))
        if not row:
            return None
        if previous_schema and self._has_structural_schema_change(previous_schema, schema):
            await self._save_schema_memory_entry(layout_id, previous_schema, schema)
        return self._local_layout_to_summary(row)

    async def _stored_schema(self, layout_id: UUID) -> LayoutSchema | None:
        if self.repository.enabled:
            row = await self.repository.get_layout(layout_id)
            return LayoutSchema.model_validate(row.schema_json) if row else None
        row = local_store.get_layout(layout_id)
        return LayoutSchema.model_validate(row.schema_json) if row else None

    @staticmethod
    def _structural_schema_payload(schema: LayoutSchema) -> dict[str, Any]:
        payload = schema.model_dump(mode='json')
        return {
            'rooms': payload.get('rooms', []),
            'walls': payload.get('walls', []),
            'windows': payload.get('windows', []),
            'doors': payload.get('doors', []),
        }

    def _has_structural_schema_change(self, before: LayoutSchema, after: LayoutSchema) -> bool:
        return self._structural_schema_payload(before) != self._structural_schema_payload(after)

    async def _save_schema_memory_entry(self, layout_id: UUID, before: LayoutSchema, after: LayoutSchema) -> None:
        rules = self._schema_memory_rules(before, after)
        summary = self._schema_memory_summary(after, rules)
        if not summary:
            return
        before_payload = before.model_dump(mode='json')
        after_payload = after.model_dump(mode='json')
        kwargs = {
            'source_layout_id': layout_id,
            'flat_type': after.flat_type,
            'floor_area_sqm': after.floor_area_sqm,
            'room_signature': self._room_signature(after),
            'before_schema_json': before_payload,
            'after_schema_json': after_payload,
            'rules_json': rules,
            'summary': summary,
        }
        if self.repository.enabled:
            await self.repository.create_schema_memory_entry(**kwargs)
        else:
            local_store.create_schema_memory_entry(**kwargs)
        logger.info('schema_memory.saved layout_id=%s summary=%s', layout_id, summary)

    def _schema_memory_rules(self, before: LayoutSchema, after: LayoutSchema) -> dict[str, Any]:
        before_payload = self._structural_schema_payload(before)
        after_payload = self._structural_schema_payload(after)
        rules: dict[str, Any] = {
            'changed_counts': {},
            'changed_room_labels': [],
        }
        for key in ('rooms', 'walls', 'windows', 'doors'):
            before_count = len(before_payload[key])
            after_count = len(after_payload[key])
            if before_count != after_count:
                rules['changed_counts'][key] = {'before': before_count, 'after': after_count}
        before_rooms = {room.id: room for room in before.rooms}
        for room in after.rooms:
            before_room = before_rooms.get(room.id)
            if before_room and (before_room.name != room.name or before_room.type != room.type):
                rules['changed_room_labels'].append({'id': room.id, 'before': before_room.name, 'after': room.name, 'type': room.type})
        if before_payload != after_payload and not rules['changed_counts'] and not rules['changed_room_labels']:
            rules['geometry_adjusted'] = True
        return rules

    def _schema_memory_summary(self, schema: LayoutSchema, rules: dict[str, Any]) -> str:
        parts: list[str] = []
        room_text = ' '.join(f'{room.name} {room.type}' for room in schema.rooms).lower()
        counts = rules.get('changed_counts', {})
        if 'service' in room_text and 'yard' in room_text and counts.get('walls'):
            parts.append('service yard partition')
        if ('bath' in room_text or 'wc' in room_text or 'bathroom' in room_text) and (counts.get('windows') or counts.get('walls')):
            parts.append('WC windowed wall alignment')
        for key, value in counts.items():
            before_count = value.get('before')
            after_count = value.get('after')
            if after_count > before_count:
                parts.append(f'added {key}')
            elif after_count < before_count:
                parts.append(f'removed {key}')
            else:
                parts.append(f'adjusted {key}')
        labels = rules.get('changed_room_labels') or []
        if labels:
            parts.append('corrected room labels')
        if rules.get('geometry_adjusted'):
            parts.append('adjusted room/wall/window geometry')
        return 'Saved schema correction: ' + ', '.join(parts[:4]) if parts else ''

    @staticmethod
    def _room_signature(schema: LayoutSchema) -> str:
        labels = sorted(
            (room.name or room.type or room.id).strip().lower()
            for room in schema.rooms
            if (room.name or room.type or room.id).strip()
        )
        return '|'.join(labels)

    async def _schema_memory_matches(self, schema: LayoutSchema, exclude_layout_id: UUID | None = None) -> list[object]:
        entries = await self.repository.list_schema_memory_entries() if self.repository.enabled else local_store.list_schema_memory_entries()
        scored: list[tuple[float, object]] = []
        target_rooms = set(self._room_signature(schema).split('|')) - {''}
        target_flat = (schema.flat_type or '').strip().lower()
        target_area = schema.floor_area_sqm
        for entry in entries:
            if exclude_layout_id and getattr(entry, 'source_layout_id', None) == exclude_layout_id:
                continue
            score = 0.0
            entry_flat = (getattr(entry, 'flat_type', None) or '').strip().lower()
            if target_flat and entry_flat and target_flat == entry_flat:
                score += 0.45
            entry_area = getattr(entry, 'floor_area_sqm', None)
            if target_area and entry_area:
                delta = abs(float(target_area) - float(entry_area))
                score += max(0.0, 0.25 - min(delta / 80.0, 0.25))
            entry_rooms = set(str(getattr(entry, 'room_signature', '')).split('|')) - {''}
            if target_rooms and entry_rooms:
                score += 0.30 * (len(target_rooms & entry_rooms) / len(target_rooms | entry_rooms))
            if score >= 0.12:
                scored.append((score, entry))
        return [entry for _, entry in sorted(scored, key=lambda item: item[0], reverse=True)[:3]]

    async def _apply_schema_memory(self, schema: LayoutSchema, exclude_layout_id: UUID | None = None) -> LayoutSchema:
        entries = await self._schema_memory_matches(schema, exclude_layout_id=exclude_layout_id)
        if not entries:
            return schema

        memory_payload = [
            {
                'id': str(getattr(entry, 'id')),
                'summary': getattr(entry, 'summary', ''),
                'rules': getattr(entry, 'rules_json', {}),
                'before_schema': getattr(entry, 'before_schema_json', {}),
                'after_schema': getattr(entry, 'after_schema_json', {}),
            }
            for entry in entries
        ]
        prompt = (
            'Auto improve this newly extracted HDB 2D semantic schema using saved schema memory. '
            'Apply only corrections that clearly match the current layout. Preserve required fields and return full schema JSON. '
            f'schema_memory_examples={memory_payload}'
        )
        try:
            improved, _ = self.llm_editor.apply_fix(schema, prompt, None)
        except Exception:  # noqa: BLE001
            logger.exception('schema_memory.apply_failed layout_id=%s', schema.layout_id)
            improved = schema
        summaries = [str(getattr(entry, 'summary', 'Saved schema correction')).strip() for entry in entries]
        info = SchemaMemoryInfo(
            applied_entry_ids=[str(getattr(entry, 'id')) for entry in entries],
            applied_summaries=[summary for summary in summaries if summary],
        )
        improved = improved.model_copy(update={'schema_memory': info})
        logger.info('schema_memory.applied layout_id=%s entries=%d', schema.layout_id, len(entries))
        return improved

    async def fix_schema_from_prompt(self, layout_id: UUID, prompt: str, object_id: str | None) -> SchemaFixResponse | None:
        layout = await self.get_layout(layout_id)
        if not layout:
            return None
        source_schema = layout.layout_schema
        if 'auto improve' in prompt.lower():
            source_schema = await self._apply_schema_memory(source_schema, exclude_layout_id=layout_id)
        updated_schema, diff = self.llm_editor.apply_fix(source_schema, prompt, object_id)
        if source_schema.schema_memory and not updated_schema.schema_memory:
            updated_schema = updated_schema.model_copy(update={'schema_memory': source_schema.schema_memory})
        await self.patch_schema(layout_id, updated_schema)

        change_id = None
        if self.repository.enabled:
            change = await self.repository.append_change_log(layout_id, prompt, object_id, diff)
            change_id = change.id

        return SchemaFixResponse(layout_id=layout_id, change_log_id=change_id, layout_schema=updated_schema, diff=diff)

    async def re_extract_layout(self, layout_id: UUID) -> ExtractionResponse | None:
        logger.info('reextract.start layout_id=%s', layout_id)
        layout = await self.get_layout(layout_id)
        if not layout or not layout.crop_image_url:
            logger.warning('reextract.missing_layout_or_crop layout_id=%s', layout_id)
            return None
        crop_path = self.storage.resolve_local_url(layout.crop_image_url)
        source_pdf_path = self.storage.project_upload_dir(layout.project_id) / 'source.pdf'
        page_text = ''
        if source_pdf_path.exists():
            page_entries = self.pdf_service.read_page_text(source_pdf_path)
            match = next((entry for entry in page_entries if entry.page_number == layout.source_page), None)
            if match:
                page_text = match.text

        base_metadata = LayoutMetadata(
            flat_type=layout.flat_type,
            approx_floor_area_sqm=layout.floor_area_sqm,
            finish_type=layout.finish_type,
            notes=layout.notes,
        )
        metadata, room_hints, metadata_todos = self.llm_metadata_extractor.enrich(
            crop_path=crop_path,
            page_text=page_text,
            fallback=base_metadata,
        )
        logger.info(
            'reextract.metadata layout_id=%s flat_type=%s area_sqm=%s room_hints=%d fallback_todos=%d',
            layout_id,
            metadata.flat_type,
            metadata.approx_floor_area_sqm,
            len(room_hints),
            len(metadata_todos),
        )
        clean_crop_path = self.cropper.sanitize_crop_for_geometry(crop_path, self.storage.project_dir(layout.project_id) / 'crops_clean')
        vectorized = self.vectorizer.process(crop_path)
        logger.info(
            'reextract.vectorized layout_id=%s crop=%s clean_crop=%s rooms=%d walls=%d windows=%d todos=%d',
            layout_id,
            crop_path,
            clean_crop_path,
            len(vectorized.room_polygons),
            len(vectorized.wall_segments),
            len(vectorized.window_segments),
            len(vectorized.todos),
        )
        regenerated = self.schema_generator.build(
            project_id=layout.layout_schema.project_id,
            layout_id=layout.layout_schema.layout_id,
            source_page=layout.source_page,
            metadata=metadata,
            vectorized=vectorized,
            room_hints=room_hints,
        )
        regenerated = regenerated.model_copy(update={'todos': regenerated.todos + metadata_todos})
        schema = layout.layout_schema.model_copy(
            update={
                'flat_type': regenerated.flat_type,
                'floor_area_sqm': regenerated.floor_area_sqm,
                'rooms': regenerated.rooms,
                'walls': regenerated.walls,
                'furniture': regenerated.furniture,
                'windows': regenerated.windows,
                'todos': regenerated.todos,
            }
        )
        schema = await self._apply_schema_memory(schema, exclude_layout_id=layout_id)
        await self.patch_schema(layout_id, schema)
        logger.info('reextract.complete layout_id=%s rooms=%d walls=%d', layout_id, len(schema.rooms), len(schema.walls))
        return ExtractionResponse(layout_id=layout_id, layout_schema=schema)

    def _room_hints_from_page_layout(self, layout: ExtractedPageLayout) -> list[LlmRoomHint]:
        hints: list[LlmRoomHint] = []
        for label in layout.room_labels:
            lower = label.lower()
            room_type = 'other'
            if 'bed' in lower:
                room_type = 'bedroom'
            elif 'living' in lower or 'dining' in lower:
                room_type = 'living'
            elif 'kitchen' in lower:
                room_type = 'kitchen'
            elif 'bath' in lower or 'wc' in lower or 'toilet' in lower:
                room_type = 'bathroom'
            elif 'study' in lower:
                room_type = 'study'
            elif 'balcony' in lower or 'ledge' in lower:
                room_type = 'balcony'
            elif 'utility' in lower:
                room_type = 'utility'
            elif 'shelter' in lower or 'store' in lower:
                room_type = 'store'
            hints.append(LlmRoomHint(label=label, room_type=room_type))
        return hints

    async def export_dxf(self, layout_id: UUID) -> ArtifactResponse | None:
        logger.info('dxf.start layout_id=%s', layout_id)
        layout = await self.get_layout(layout_id)
        if not layout:
            logger.warning('dxf.layout_not_found layout_id=%s', layout_id)
            return None
        data = self.dxf_exporter.export(layout.layout_schema)
        _, url = self.storage.save_dxf(layout.project_id, str(layout_id), data)

        if self.repository.enabled:
            await self.repository.update_layout_artifact(layout_id, 'dxf', url)
        else:
            local_store.update_layout_artifact(layout_id, 'dxf', url)
        logger.info('dxf.complete layout_id=%s url=%s bytes=%d', layout_id, url, len(data))
        return ArtifactResponse(layout_id=layout_id, artifact_url=url)

    async def generate_glb(self, layout_id: UUID) -> ArtifactResponse | None:
        logger.info('glb.start layout_id=%s', layout_id)
        layout = await self.get_layout(layout_id)
        if not layout:
            logger.warning('glb.layout_not_found layout_id=%s', layout_id)
            return None

        schema = layout.layout_schema
        if self._schema_needs_simplification(schema) and layout.crop_image_url:
            crop_path = self.storage.resolve_local_url(layout.crop_image_url)
            if crop_path.exists():
                logger.info(
                    'glb.simplify_before_export layout_id=%s rooms=%d walls=%d crop=%s',
                    layout_id,
                    len(schema.rooms),
                    len(schema.walls),
                    crop_path,
                )
                vectorized = self.vectorizer.process(crop_path)
                metadata = LayoutMetadata(
                    flat_type=schema.flat_type,
                    approx_floor_area_sqm=schema.floor_area_sqm,
                    finish_type=schema.finish_type,
                    notes=schema.notes,
                )
                regenerated = self.schema_generator.build(
                    project_id=schema.project_id,
                    layout_id=schema.layout_id,
                    source_page=schema.source_page,
                    metadata=metadata,
                    vectorized=vectorized,
                    room_hints=self._room_hints_from_schema(schema),
                )
                schema = schema.model_copy(
                    update={
                        'rooms': regenerated.rooms,
                        'walls': regenerated.walls,
                        'furniture': schema.furniture or regenerated.furniture,
                        'windows': regenerated.windows,
                        'todos': list(dict.fromkeys(schema.todos + regenerated.todos)),
                    }
                )
                schema = await self._apply_schema_memory(schema, exclude_layout_id=layout_id)
                await self.patch_schema(layout_id, schema)

        output_path = self.storage.project_dir(layout.project_id) / 'glb' / f'{layout_id}.glb'
        output_path.parent.mkdir(parents=True, exist_ok=True)

        glb = self.blender_generator.generate_glb(schema, output_path)
        _, url = self.storage.save_glb(layout.project_id, str(layout_id), glb)

        if self.repository.enabled:
            await self.repository.update_layout_artifact(layout_id, 'glb', url)
        else:
            local_store.update_layout_artifact(layout_id, 'glb', url)
        logger.info('glb.complete layout_id=%s url=%s bytes=%d', layout_id, url, len(glb))
        return ArtifactResponse(layout_id=layout_id, artifact_url=url)

    @staticmethod
    def _schema_needs_simplification(schema: LayoutSchema) -> bool:
        return len(schema.walls) > 60 or len(schema.rooms) > 12

    @staticmethod
    def _room_hints_from_schema(schema: LayoutSchema) -> list[LlmRoomHint]:
        hints: list[LlmRoomHint] = []
        for room in schema.rooms:
            name = room.name.strip()
            if not name or name.lower().startswith('room '):
                continue
            hints.append(LlmRoomHint(label=name, room_type=room.type))
            if len(hints) >= 12:
                break
        return hints

    async def chat_turn(self, layout_id: UUID, user_message: str):
        """Yield AgentEvents for a chat turn, regenerating GLB if schema mutates."""
        import asyncio

        layout = await self.get_layout(layout_id)
        if not layout:
            yield AgentEvent('error', {'message': 'Layout not found.'})
            return

        final_schema: LayoutSchema | None = None
        schema_dirty = False

        loop = asyncio.get_running_loop()
        sync_iter = self.chat_service.run(layout_id, user_message, layout.layout_schema)
        sentinel = object()

        while True:
            event = await loop.run_in_executor(None, lambda: next(sync_iter, sentinel))
            if event is sentinel:
                break
            yield event
            if event.kind == 'done':
                schema_dirty = bool(event.data.get('schema_dirty'))
                raw = event.data.get('schema')
                if raw:
                    final_schema = LayoutSchema.model_validate(raw)

        if not final_schema or not schema_dirty:
            return

        await self.patch_schema(layout_id, final_schema)

        try:
            artifact = await self.generate_glb(layout_id)
        except Exception as exc:  # noqa: BLE001
            logger.exception('chat.glb_regen_failed layout_id=%s', layout_id)
            yield AgentEvent('error', {'message': f'GLB regeneration failed: {exc}'})
            return

        if artifact:
            yield AgentEvent(
                'glb_ready',
                {
                    'layout_id': str(layout_id),
                    'artifact_url': artifact.artifact_url,
                    'model_url': f'/api/layouts/{layout_id}/model.glb',
                },
            )

    async def inspire_turn(
        self,
        layout_id: UUID,
        image_bytes: bytes,
        mime_type: str,
        target_room: str | None,
    ):
        """Analyze a photo, then run a chat turn that applies the extracted style."""
        import asyncio

        layout = await self.get_layout(layout_id)
        if not layout:
            yield AgentEvent('error', {'message': 'Layout not found.'})
            return

        loop = asyncio.get_running_loop()
        try:
            inspiration = await loop.run_in_executor(
                None, self.vision_analyzer.analyze, image_bytes, mime_type
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception('inspire.vision_failed layout_id=%s', layout_id)
            yield AgentEvent('error', {'message': f'Vision analysis failed: {exc}'})
            return

        yield AgentEvent(
            'inspiration_ready',
            {
                'style': inspiration.style,
                'room_type': inspiration.room_type,
                'mood': inspiration.mood,
                'palette_hex': inspiration.palette_hex,
                'materials': inspiration.materials,
                'lighting': inspiration.lighting,
                'objects': inspiration.objects,
            },
        )

        prompt = inspiration.to_prompt(target_room)
        async for event in self.chat_turn(layout_id, prompt):
            yield event

    async def get_glb(self, layout_id: UUID) -> Path | None:
        logger.info('glb.get layout_id=%s', layout_id)
        layout = await self.get_layout(layout_id)
        if not layout or not layout.glb_url:
            logger.warning('glb.missing layout_id=%s', layout_id)
            return None
        return self.storage.resolve_local_url(layout.glb_url)

    def _layout_to_summary(self, row: object) -> LayoutSummary:
        layout_schema = self._normalize_windows_for_viewer(LayoutSchema.model_validate(row.schema_json))
        return LayoutSummary(
            id=row.id,
            project_id=row.project_id,
            source_page=row.source_page,
            flat_type=row.flat_type,
            floor_area_sqm=row.floor_area_sqm,
            finish_type=row.finish_type,
            notes=row.notes,
            crop_image_url=row.crop_image_url,
            dxf_url=row.dxf_url,
            glb_url=row.glb_url,
            layout_schema=layout_schema,
        )

    def _local_layout_to_summary(self, row: object) -> LayoutSummary:
        layout_schema = self._normalize_windows_for_viewer(LayoutSchema.model_validate(row.schema_json))
        return LayoutSummary(
            id=row.id,
            project_id=row.project_id,
            source_page=row.source_page,
            flat_type=row.flat_type,
            floor_area_sqm=row.floor_area_sqm,
            finish_type=row.finish_type,
            notes=row.notes,
            crop_image_url=row.crop_image_url,
            dxf_url=row.dxf_url,
            glb_url=row.glb_url,
            layout_schema=layout_schema,
        )
