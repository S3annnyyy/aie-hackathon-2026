from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from uuid import UUID

from app.models.schema import (
    ArtifactResponse,
    ChatRequest,
    ExtractionResponse,
    LayoutSummary,
    ProjectSummary,
    SchemaFixPromptRequest,
    SchemaFixResponse,
    SchemaPatchRequest,
    UploadResponse,
)
from app.services.weather_service import geocode as _geocode, get_environment as _get_environment

router = APIRouter(prefix='/api')


@router.post('/projects/upload', response_model=UploadResponse)
async def upload_project(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Upload a PDF file.')
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail='Uploaded PDF is empty.')
    service = request.app.state.project_service
    return await service.upload_pdf(file.filename, data)


@router.get('/projects/{project_id}', response_model=ProjectSummary)
async def get_project(request: Request, project_id: UUID) -> ProjectSummary:
    service = request.app.state.project_service
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail='Project not found.')
    return project


@router.get('/projects/{project_id}/layouts', response_model=list[LayoutSummary])
async def get_project_layouts(request: Request, project_id: UUID) -> list[LayoutSummary]:
    service = request.app.state.project_service
    return await service.list_layouts(project_id)


@router.get('/layouts/{layout_id}', response_model=LayoutSummary)
async def get_layout(request: Request, layout_id: UUID) -> LayoutSummary:
    service = request.app.state.project_service
    layout = await service.get_layout(layout_id)
    if not layout:
        raise HTTPException(status_code=404, detail='Layout not found.')
    return layout


@router.patch('/layouts/{layout_id}/schema', response_model=LayoutSummary)
async def patch_layout_schema(request: Request, layout_id: UUID, payload: SchemaPatchRequest) -> LayoutSummary:
    service = request.app.state.project_service
    layout = await service.patch_schema(layout_id, payload.layout_schema)
    if not layout:
        raise HTTPException(status_code=404, detail='Layout not found.')
    return layout


@router.post('/layouts/{layout_id}/schema/fix-from-prompt', response_model=SchemaFixResponse)
async def fix_layout_schema(request: Request, layout_id: UUID, payload: SchemaFixPromptRequest) -> SchemaFixResponse:
    service = request.app.state.project_service
    result = await service.fix_schema_from_prompt(layout_id, payload.prompt, payload.object_id)
    if not result:
        raise HTTPException(status_code=404, detail='Layout not found.')
    return result


@router.post('/layouts/{layout_id}/extract', response_model=ExtractionResponse)
async def extract_layout(request: Request, layout_id: UUID) -> ExtractionResponse:
    service = request.app.state.project_service
    result = await service.re_extract_layout(layout_id)
    if not result:
        raise HTTPException(status_code=404, detail='Layout not found.')
    return result


@router.post('/layouts/{layout_id}/export-dxf', response_model=ArtifactResponse)
async def export_dxf(request: Request, layout_id: UUID) -> ArtifactResponse:
    service = request.app.state.project_service
    result = await service.export_dxf(layout_id)
    if not result:
        raise HTTPException(status_code=404, detail='Layout not found.')
    return result


@router.post('/layouts/{layout_id}/generate-glb', response_model=ArtifactResponse)
async def generate_glb(request: Request, layout_id: UUID) -> ArtifactResponse:
    service = request.app.state.project_service
    result = await service.generate_glb(layout_id)
    if not result:
        raise HTTPException(status_code=404, detail='Layout not found.')
    return result


@router.post('/layouts/{layout_id}/chat')
async def chat_layout(request: Request, layout_id: UUID, payload: ChatRequest) -> StreamingResponse:
    service = request.app.state.project_service

    async def event_stream():
        try:
            async for event in service.chat_turn(layout_id, payload.message):
                data = {'kind': event.kind, **event.data}
                yield f'data: {json.dumps(data)}\n\n'
        except Exception as exc:  # noqa: BLE001
            yield f'data: {json.dumps({"kind": "error", "message": str(exc)})}\n\n'
        yield 'data: {"kind": "stream_end"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )


@router.post('/layouts/{layout_id}/inspire')
async def inspire_layout(
    request: Request,
    layout_id: UUID,
    file: UploadFile = File(...),
    target_room: str | None = Form(default=None),
) -> StreamingResponse:
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='Upload an image (jpeg/png).')
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail='Uploaded image is empty.')

    service = request.app.state.project_service

    async def event_stream():
        try:
            async for event in service.inspire_turn(
                layout_id, image_bytes, file.content_type, target_room
            ):
                data = {'kind': event.kind, **event.data}
                yield f'data: {json.dumps(data)}\n\n'
        except Exception as exc:  # noqa: BLE001
            yield f'data: {json.dumps({"kind": "error", "message": str(exc)})}\n\n'
        yield 'data: {"kind": "stream_end"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )


@router.get('/layouts/{layout_id}/model.glb')
async def get_layout_glb(request: Request, layout_id: UUID) -> FileResponse:
    service = request.app.state.project_service
    path = await service.get_glb(layout_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail='GLB not found.')
    return FileResponse(path, media_type='model/gltf-binary', filename=f'{layout_id}.glb')


@router.get('/geocode')
async def geocode_endpoint(q: str = Query(..., min_length=2)) -> list[dict]:
    try:
        results = await _geocode(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Geocoding failed: {exc}') from exc
    return [{'lat': r.lat, 'lon': r.lon, 'display_name': r.display_name} for r in results]


@router.get('/environment')
async def environment_endpoint(lat: float = Query(...), lon: float = Query(...)) -> dict:
    try:
        env = await _get_environment(lat, lon)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Weather fetch failed: {exc}') from exc
    return {
        'lat': env.lat,
        'lon': env.lon,
        'wind_speed': env.wind_speed,
        'wind_direction': env.wind_direction,
        'solar_azimuth': env.solar_azimuth,
        'solar_elevation': env.solar_elevation,
        'timestamp': env.timestamp,
        'timezone': env.timezone,
        'utc_offset_seconds': env.utc_offset_seconds,
        'solar_samples': [
            {
                'time': sample.time,
                'solar_azimuth': sample.solar_azimuth,
                'solar_elevation': sample.solar_elevation,
            }
            for sample in env.solar_samples
        ],
    }
