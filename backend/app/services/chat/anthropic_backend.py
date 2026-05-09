from __future__ import annotations

from typing import Any, Iterable

from app.services.chat.llm_backend import (
    AgentTurn,
    Message,
    ToolCall,
    ToolSpec,
)


class AnthropicBackend:
    provider = 'anthropic'

    def __init__(self, api_key: str, model: str) -> None:
        from anthropic import Anthropic

        self._client = Anthropic(api_key=api_key)
        self._model = model

    def complete(self, system: str, messages: Iterable[Message], tools: Iterable[ToolSpec]) -> AgentTurn:
        anth_messages = [self._message_to_anthropic(m) for m in messages]
        anth_tools = [
            {
                'name': t.name,
                'description': t.description,
                'input_schema': t.input_schema,
            }
            for t in tools
        ]

        response = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            system=system,
            tools=anth_tools,
            messages=anth_messages,
        )

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in response.content:
            if block.type == 'text':
                text_parts.append(block.text)
            elif block.type == 'tool_use':
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, arguments=dict(block.input or {}))
                )

        stop = 'tool_use' if response.stop_reason == 'tool_use' else 'end_turn'
        return AgentTurn(text='\n'.join(text_parts), tool_calls=tool_calls, stop_reason=stop)

    @staticmethod
    def _message_to_anthropic(msg: Message) -> dict[str, Any]:
        if msg.role == 'user':
            if msg.tool_results:
                content = [
                    {
                        'type': 'tool_result',
                        'tool_use_id': r.call_id,
                        'content': r.content,
                        'is_error': r.is_error,
                    }
                    for r in msg.tool_results
                ]
                return {'role': 'user', 'content': content}
            return {'role': 'user', 'content': msg.content}

        # assistant
        blocks: list[dict[str, Any]] = []
        if msg.content:
            blocks.append({'type': 'text', 'text': msg.content})
        for call in msg.tool_calls:
            blocks.append(
                {
                    'type': 'tool_use',
                    'id': call.id,
                    'name': call.name,
                    'input': call.arguments,
                }
            )
        return {'role': 'assistant', 'content': blocks or msg.content}
