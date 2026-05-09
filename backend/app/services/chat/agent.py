from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterator

from app.models.schema import LayoutSchema
from app.services.chat.blender_mcp_client import BlenderMcpClient
from app.services.chat.llm_backend import (
    LlmBackend,
    Message,
    ToolCall,
    ToolResult,
)
from app.services.chat.tools import Tool, ToolContext, build_tools

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are StackView, an AI interior designer working on a real 3D model of a home.

You edit a JSON LayoutSchema that drives a Blender-rendered GLB the user is looking at live.
After you call any schema-mutating tool, the backend regenerates the GLB and the user sees
the change immediately.

Guidelines:
- Start by calling list_rooms (or describe_layout) to ground yourself in the actual rooms.
- Be decisive. One short sentence explaining your design intent, then the tool calls that execute it.
- Make edits feel like an interior designer: pick a mood, set the finish, place real furniture
  (sofa, bed, dining table, pendant light) sized in meters.
- Don't invent room ids. Always reference rooms by id or exact name you got from list_rooms.
- If blender-mcp tools are available (mcp_*), use them to pull realistic Poly Haven models or
  generate custom props via Rodin for hero objects.
- Keep moving: the user wants to see the room evolve, not read a treatise.
- When you've executed the user's request, end your turn with a brief summary ("Done: added a
  cream bouclé sofa and a walnut coffee table in the living room.").
"""


@dataclass
class AgentEvent:
    kind: str  # 'assistant_text' | 'tool_call' | 'tool_result' | 'done' | 'error'
    data: dict[str, Any]


class InteriorDesignAgent:
    def __init__(
        self,
        backend: LlmBackend,
        mcp_client: BlenderMcpClient | None,
        max_iterations: int,
    ) -> None:
        self._backend = backend
        self._mcp = mcp_client
        self._max_iterations = max_iterations

    def run(
        self,
        user_message: str,
        schema: LayoutSchema,
        history: list[Message] | None = None,
    ) -> Iterator[AgentEvent]:
        tools = build_tools(mcp_enabled=self._mcp is not None)
        tool_by_name: dict[str, Tool] = {t.spec.name: t for t in tools}
        specs = [t.spec for t in tools]

        ctx = ToolContext(schema=schema, mcp=self._mcp)
        messages: list[Message] = list(history or [])
        messages.append(Message(role='user', content=user_message))

        for iteration in range(self._max_iterations):
            try:
                turn = self._backend.complete(SYSTEM_PROMPT, messages, specs)
            except Exception as exc:  # noqa: BLE001
                logger.exception('agent.llm_failed iteration=%d', iteration)
                yield AgentEvent('error', {'message': f'LLM call failed: {exc}'})
                return

            if turn.text:
                yield AgentEvent('assistant_text', {'text': turn.text})

            messages.append(
                Message(role='assistant', content=turn.text, tool_calls=turn.tool_calls)
            )

            if turn.stop_reason == 'end_turn' or not turn.tool_calls:
                yield AgentEvent(
                    'done',
                    {'schema_dirty': ctx.schema_dirty, 'schema': ctx.schema.model_dump(mode='json')},
                )
                return

            tool_results: list[ToolResult] = []
            for call in turn.tool_calls:
                yield AgentEvent(
                    'tool_call',
                    {'id': call.id, 'name': call.name, 'arguments': call.arguments},
                )
                tool = tool_by_name.get(call.name)
                if not tool:
                    result = f'Unknown tool: {call.name}'
                    is_error = True
                else:
                    try:
                        result = tool.handler(ctx, call.arguments)
                        is_error = False
                    except Exception as exc:  # noqa: BLE001
                        logger.exception('agent.tool_failed name=%s', call.name)
                        result = f'Tool error: {exc}'
                        is_error = True
                yield AgentEvent(
                    'tool_result',
                    {'id': call.id, 'name': call.name, 'result': result, 'is_error': is_error},
                )
                tool_results.append(ToolResult(call_id=call.id, content=result, is_error=is_error))

            messages.append(Message(role='user', tool_results=tool_results))

        yield AgentEvent(
            'error',
            {'message': f'Hit max iterations ({self._max_iterations}) without end_turn.'},
        )
