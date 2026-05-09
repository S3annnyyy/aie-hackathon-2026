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


class OpenAIBackend:
    provider = 'openai'

    def __init__(self, api_key: str, model: str) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key)
        self._model = model

    def complete(self, system: str, messages: Iterable[Message], tools: Iterable[ToolSpec]) -> AgentTurn:
        openai_messages: list[dict[str, Any]] = [{'role': 'system', 'content': system}]
        for msg in messages:
            openai_messages.extend(self._message_to_openai(msg))

        openai_tools = [
            {
                'type': 'function',
                'function': {
                    'name': t.name,
                    'description': t.description,
                    'parameters': t.input_schema,
                },
            }
            for t in tools
        ]

        response = self._client.chat.completions.create(
            model=self._model,
            messages=openai_messages,
            tools=openai_tools or None,
        )

        choice = response.choices[0]
        msg = choice.message
        text = msg.content or ''
        tool_calls: list[ToolCall] = []
        for tc in msg.tool_calls or []:
            args = {}
            try:
                args = json.loads(tc.function.arguments or '{}')
            except json.JSONDecodeError:
                args = {'_raw': tc.function.arguments}
            tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args))

        stop = 'tool_use' if choice.finish_reason == 'tool_calls' else 'end_turn'
        return AgentTurn(text=text, tool_calls=tool_calls, stop_reason=stop)

    @staticmethod
    def _message_to_openai(msg: Message) -> list[dict[str, Any]]:
        if msg.role == 'user':
            if msg.tool_results:
                return [
                    {
                        'role': 'tool',
                        'tool_call_id': r.call_id,
                        'content': r.content,
                    }
                    for r in msg.tool_results
                ]
            return [{'role': 'user', 'content': msg.content}]

        payload: dict[str, Any] = {'role': 'assistant', 'content': msg.content or None}
        if msg.tool_calls:
            payload['tool_calls'] = [
                {
                    'id': call.id or f'call_{uuid.uuid4().hex[:8]}',
                    'type': 'function',
                    'function': {
                        'name': call.name,
                        'arguments': json.dumps(call.arguments),
                    },
                }
                for call in msg.tool_calls
            ]
        return [payload]
