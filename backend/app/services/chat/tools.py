from __future__ import annotations

import copy
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Callable

from app.models.schema import Furniture, LayoutSchema, Room
from app.services.chat.blender_mcp_client import BlenderMcpClient, BlenderMcpError
from app.services.chat.llm_backend import ToolSpec

logger = logging.getLogger(__name__)


@dataclass
class ToolContext:
    schema: LayoutSchema
    mcp: BlenderMcpClient | None
    schema_dirty: bool = False


ToolHandler = Callable[[ToolContext, dict[str, Any]], str]


@dataclass
class Tool:
    spec: ToolSpec
    handler: ToolHandler


def _find_room(schema: LayoutSchema, room_ref: str) -> Room | None:
    ref = (room_ref or '').strip().lower()
    if not ref:
        return None
    for room in schema.rooms:
        if room.id.lower() == ref or (room.name or '').lower() == ref:
            return room
    # substring fallback
    for room in schema.rooms:
        if ref in (room.name or '').lower():
            return room
    return None


def _infer_furniture_kind(name: str, explicit_kind: str | None = None) -> str:
    kind = (explicit_kind or '').strip().lower()
    if kind:
        return kind
    label = (name or '').strip().lower()
    if 'sofa' in label or 'couch' in label:
        return 'sofa'
    if 'bed' in label:
        return 'bed'
    if 'coffee' in label and 'table' in label:
        return 'coffee_table'
    if 'dining' in label and 'table' in label:
        return 'dining_table'
    if 'nightstand' in label or 'bedside' in label:
        return 'nightstand'
    if 'wardrobe' in label or 'closet' in label:
        return 'wardrobe'
    if 'desk' in label:
        return 'desk'
    if 'chair' in label:
        return 'chair'
    if 'stool' in label:
        return 'stool'
    if 'cabinet' in label or 'console' in label or 'tv' in label:
        return 'console'
    return 'generic'


def _list_rooms(ctx: ToolContext, _args: dict[str, Any]) -> str:
    if not ctx.schema.rooms:
        return 'No rooms in this layout yet.'
    lines = []
    for room in ctx.schema.rooms:
        area = f'{room.estimated_area_sqm:.1f} sqm' if room.estimated_area_sqm else 'unknown area'
        lines.append(f'- {room.id} "{room.name}" type={room.type} ({area})')
    return '\n'.join(lines)


def _describe_layout(ctx: ToolContext, _args: dict[str, Any]) -> str:
    s = ctx.schema
    return (
        f'flat_type={s.flat_type} area={s.floor_area_sqm} rooms={len(s.rooms)} '
        f'walls={len(s.walls)} furniture={len(s.furniture)} finish={s.finish_type}'
    )


def _add_furniture(ctx: ToolContext, args: dict[str, Any]) -> str:
    room = _find_room(ctx.schema, args.get('room', ''))
    if not room:
        return f'Room {args.get("room")!r} not found. Call list_rooms first.'

    name = args.get('name') or args.get('type') or 'item'
    kind = _infer_furniture_kind(name, args.get('kind'))
    size = args.get('size_m') or [1.0, 1.0, 0.8]
    if len(size) != 3:
        return 'size_m must be [width, depth, height] in meters.'

    # Place at room centroid if no explicit position.
    pos = args.get('position')
    if pos is None and room.polygon:
        cx = sum(p[0] for p in room.polygon) / len(room.polygon)
        cy = sum(p[1] for p in room.polygon) / len(room.polygon)
        pos = [cx, cy]
    elif pos is None:
        pos = [0.0, 0.0]

    item = Furniture(
        id=f'fur_{uuid.uuid4().hex[:8]}',
        name=name,
        kind=kind,
        room_id=room.id,
        position=list(pos),
        size_m=[float(v) for v in size],
    )
    ctx.schema.furniture.append(item)
    ctx.schema_dirty = True
    return f'Added {name} (id={item.id}) to {room.name}.'


def _move_furniture(ctx: ToolContext, args: dict[str, Any]) -> str:
    furniture_id = args.get('furniture_id')
    target = _find_room(ctx.schema, args.get('to_room', ''))
    if not target:
        return f'Target room {args.get("to_room")!r} not found.'
    for f in ctx.schema.furniture:
        if f.id == furniture_id:
            f.room_id = target.id
            if target.polygon:
                cx = sum(p[0] for p in target.polygon) / len(target.polygon)
                cy = sum(p[1] for p in target.polygon) / len(target.polygon)
                f.position = [cx, cy]
            ctx.schema_dirty = True
            return f'Moved {f.name} to {target.name}.'
    return f'Furniture id {furniture_id!r} not found.'


def _remove_furniture(ctx: ToolContext, args: dict[str, Any]) -> str:
    fid = args.get('furniture_id')
    before = len(ctx.schema.furniture)
    ctx.schema.furniture = [f for f in ctx.schema.furniture if f.id != fid]
    if len(ctx.schema.furniture) < before:
        ctx.schema_dirty = True
        return f'Removed furniture {fid}.'
    return f'Furniture id {fid!r} not found.'


def _rename_room(ctx: ToolContext, args: dict[str, Any]) -> str:
    room = _find_room(ctx.schema, args.get('room', ''))
    if not room:
        return f'Room {args.get("room")!r} not found.'
    new_name = args.get('new_name')
    new_type = args.get('new_type')
    changes = []
    if new_name:
        room.name = new_name
        changes.append(f'name={new_name}')
    if new_type:
        room.type = new_type
        changes.append(f'type={new_type}')
    if not changes:
        return 'Provide new_name and/or new_type.'
    ctx.schema_dirty = True
    return f'Updated {room.id}: {", ".join(changes)}.'


def _set_finish(ctx: ToolContext, args: dict[str, Any]) -> str:
    finish = args.get('finish_type')
    if not finish:
        return 'finish_type is required (e.g. scandinavian, japandi, industrial, tropical).'
    ctx.schema.finish_type = finish
    ctx.schema_dirty = True
    return f'Set overall finish to {finish}.'


def _annotate_room(ctx: ToolContext, args: dict[str, Any]) -> str:
    room = _find_room(ctx.schema, args.get('room', ''))
    if not room:
        return f'Room {args.get("room")!r} not found.'
    note = args.get('note', '').strip()
    if not note:
        return 'note is required.'
    room.notes = note
    ctx.schema_dirty = True
    return f'Annotated {room.name}: {note[:80]}'


def _mcp_polyhaven_search(ctx: ToolContext, args: dict[str, Any]) -> str:
    if not ctx.mcp:
        return 'Blender-MCP not available. Enable BLENDER_MCP_ENABLED and start Blender with the addon.'
    try:
        result = ctx.mcp.search_polyhaven(
            asset_type=args.get('asset_type', 'models'),
            categories=args.get('categories', ''),
        )
    except BlenderMcpError as exc:
        return f'Poly Haven search failed: {exc}'
    return str(result)[:2000]


def _mcp_polyhaven_import(ctx: ToolContext, args: dict[str, Any]) -> str:
    if not ctx.mcp:
        return 'Blender-MCP not available.'
    try:
        result = ctx.mcp.download_polyhaven(
            asset_id=args['asset_id'],
            asset_type=args.get('asset_type', 'models'),
            resolution=args.get('resolution', '1k'),
        )
    except BlenderMcpError as exc:
        return f'Poly Haven download failed: {exc}'
    return f'Imported {args["asset_id"]} into Blender scene. {str(result)[:300]}'


def _mcp_rodin_generate(ctx: ToolContext, args: dict[str, Any]) -> str:
    if not ctx.mcp:
        return 'Blender-MCP not available.'
    prompt = args.get('text_prompt', '').strip()
    if not prompt:
        return 'text_prompt is required.'
    try:
        result = ctx.mcp.rodin_generate(prompt)
    except BlenderMcpError as exc:
        return f'Rodin generate failed: {exc}'
    return (
        f'Rodin job started. Use mcp_rodin_poll with subscription_key to check. '
        f'{str(result)[:400]}'
    )


def build_tools(mcp_enabled: bool) -> list[Tool]:
    tools: list[Tool] = [
        Tool(
            ToolSpec(
                name='list_rooms',
                description='List rooms with id, name, type, and area. Call this first before edits.',
                input_schema={'type': 'object', 'properties': {}, 'additionalProperties': False},
            ),
            _list_rooms,
        ),
        Tool(
            ToolSpec(
                name='describe_layout',
                description='Summarize the current layout (flat type, area, counts).',
                input_schema={'type': 'object', 'properties': {}, 'additionalProperties': False},
            ),
            _describe_layout,
        ),
        Tool(
            ToolSpec(
                name='add_furniture',
                description='Add a furniture item to a room. Placed at room centroid unless position is provided.',
                input_schema={
                    'type': 'object',
                    'properties': {
                        'room': {'type': 'string', 'description': 'Room id or name.'},
                        'name': {'type': 'string'},
                        'kind': {'type': 'string', 'description': 'Furniture kind such as sofa, bed, chair, desk, table.'},
                        'size_m': {
                            'type': 'array',
                            'items': {'type': 'number'},
                            'minItems': 3,
                            'maxItems': 3,
                            'description': '[width, depth, height] meters',
                        },
                        'position': {
                            'type': 'array',
                            'items': {'type': 'number'},
                            'minItems': 2,
                            'maxItems': 2,
                        },
                    },
                    'required': ['room', 'name', 'size_m'],
                },
            ),
            _add_furniture,
        ),
        Tool(
            ToolSpec(
                name='move_furniture',
                description='Move a furniture item to another room by id.',
                input_schema={
                    'type': 'object',
                    'properties': {
                        'furniture_id': {'type': 'string'},
                        'to_room': {'type': 'string'},
                    },
                    'required': ['furniture_id', 'to_room'],
                },
            ),
            _move_furniture,
        ),
        Tool(
            ToolSpec(
                name='remove_furniture',
                description='Remove a furniture item by id.',
                input_schema={
                    'type': 'object',
                    'properties': {'furniture_id': {'type': 'string'}},
                    'required': ['furniture_id'],
                },
            ),
            _remove_furniture,
        ),
        Tool(
            ToolSpec(
                name='rename_room',
                description='Rename a room and/or change its type (bedroom, living, kitchen, bathroom, study, balcony, utility, store).',
                input_schema={
                    'type': 'object',
                    'properties': {
                        'room': {'type': 'string'},
                        'new_name': {'type': 'string'},
                        'new_type': {'type': 'string'},
                    },
                    'required': ['room'],
                },
            ),
            _rename_room,
        ),
        Tool(
            ToolSpec(
                name='set_finish',
                description='Set the overall finish/style: scandinavian, japandi, industrial, tropical, minimalist, luxe, etc.',
                input_schema={
                    'type': 'object',
                    'properties': {'finish_type': {'type': 'string'}},
                    'required': ['finish_type'],
                },
            ),
            _set_finish,
        ),
        Tool(
            ToolSpec(
                name='annotate_room',
                description='Attach a design note to a room (style intent, material ideas, lighting, etc).',
                input_schema={
                    'type': 'object',
                    'properties': {
                        'room': {'type': 'string'},
                        'note': {'type': 'string'},
                    },
                    'required': ['room', 'note'],
                },
            ),
            _annotate_room,
        ),
    ]

    if mcp_enabled:
        tools.extend(
            [
                Tool(
                    ToolSpec(
                        name='mcp_polyhaven_search',
                        description='[Blender-MCP] Search Poly Haven for realistic assets (models, textures, hdris).',
                        input_schema={
                            'type': 'object',
                            'properties': {
                                'asset_type': {'type': 'string', 'enum': ['models', 'textures', 'hdris']},
                                'categories': {'type': 'string'},
                            },
                        },
                    ),
                    _mcp_polyhaven_search,
                ),
                Tool(
                    ToolSpec(
                        name='mcp_polyhaven_import',
                        description='[Blender-MCP] Download and import a Poly Haven asset into the open Blender scene.',
                        input_schema={
                            'type': 'object',
                            'properties': {
                                'asset_id': {'type': 'string'},
                                'asset_type': {'type': 'string'},
                                'resolution': {'type': 'string'},
                            },
                            'required': ['asset_id'],
                        },
                    ),
                    _mcp_polyhaven_import,
                ),
                Tool(
                    ToolSpec(
                        name='mcp_rodin_generate',
                        description='[Blender-MCP] Generate a 3D asset via Hyper3D Rodin from a text prompt.',
                        input_schema={
                            'type': 'object',
                            'properties': {'text_prompt': {'type': 'string'}},
                            'required': ['text_prompt'],
                        },
                    ),
                    _mcp_rodin_generate,
                ),
            ]
        )

    return tools


def snapshot_schema(schema: LayoutSchema) -> LayoutSchema:
    return LayoutSchema.model_validate(copy.deepcopy(schema.model_dump(mode='json')))
