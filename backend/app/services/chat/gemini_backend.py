from __future__ import annotations

import json
import uuid
from typing import Any, Iterable

from app.services.chat.llm_backend import (
    AgentTurn,
    Message,
    ToolCall,
    ToolSpec,
)


class GeminiBackend:
    provider = 'gemini'

    def __init__(self, api_key: str, model: str) -> None:
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

    def complete(self, system: str, messages: Iterable[Message], tools: Iterable[ToolSpec]) -> AgentTurn:
        from google.genai import types as gtypes

        contents: list[Any] = []
        for msg in messages:
            contents.extend(self._message_to_gemini(msg, gtypes))

        gemini_tools = [
            gtypes.Tool(
                function_declarations=[
                    {
                        'name': t.name,
                        'description': t.description,
                        'parameters': _to_gemini_schema(t.input_schema),
                    }
                    for t in tools
                ]
            )
        ]

        config = gtypes.GenerateContentConfig(
            tools=gemini_tools,
            system_instruction=system,
        )

        response = self._client.models.generate_content(
            model=self._model,
            contents=contents,
            config=config,
        )

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        has_tool_use = False

        candidate = response.candidates[0] if response.candidates else None
        if candidate and candidate.content:
            for part in candidate.content.parts or []:
                fn = getattr(part, 'function_call', None)
                if fn:
                    has_tool_use = True
                    args = dict(fn.args or {})
                    call_id = getattr(fn, 'id', None) or f'call_{uuid.uuid4().hex[:8]}'
                    tool_calls.append(ToolCall(id=call_id, name=fn.name, arguments=args))
                elif getattr(part, 'text', None):
                    text_parts.append(part.text)

        stop = 'tool_use' if has_tool_use else 'end_turn'
        return AgentTurn(
            text='\n'.join(t for t in text_parts if t),
            tool_calls=tool_calls,
            stop_reason=stop,
        )

    @staticmethod
    def _message_to_gemini(msg: Message, gtypes) -> list[Any]:
        if msg.role == 'user':
            if msg.tool_results:
                parts = [
                    gtypes.Part.from_function_response(
                        name=r.call_id.split('::', 1)[0] if '::' in r.call_id else 'tool',
                        response={'result': r.content, 'is_error': r.is_error},
                    )
                    for r in msg.tool_results
                ]
                return [gtypes.Content(role='user', parts=parts)]
            return [gtypes.Content(role='user', parts=[gtypes.Part(text=msg.content)])]

        # assistant
        parts: list[Any] = []
        if msg.content:
            parts.append(gtypes.Part(text=msg.content))
        for call in msg.tool_calls:
            parts.append(
                gtypes.Part(
                    function_call=gtypes.FunctionCall(
                        name=call.name,
                        args=call.arguments,
                    )
                )
            )
        return [gtypes.Content(role='model', parts=parts or [gtypes.Part(text='')])]


def _to_gemini_schema(json_schema: dict[str, Any]) -> dict[str, Any]:
    """Gemini accepts a subset of JSON Schema. Strip keys it rejects."""
    if not isinstance(json_schema, dict):
        return {'type': 'OBJECT'}

    out: dict[str, Any] = {}
    schema_type = json_schema.get('type')
    if schema_type:
        out['type'] = schema_type.upper() if isinstance(schema_type, str) else schema_type

    for key in ('description', 'enum', 'required'):
        if key in json_schema:
            out[key] = json_schema[key]

    if 'properties' in json_schema:
        out['properties'] = {
            name: _to_gemini_schema(sub) for name, sub in json_schema['properties'].items()
        }

    if 'items' in json_schema:
        out['items'] = _to_gemini_schema(json_schema['items'])

    return out
