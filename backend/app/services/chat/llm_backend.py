from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Literal, Protocol

ToolRole = Literal['user', 'assistant', 'tool']


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolResult:
    call_id: str
    content: str
    is_error: bool = False


@dataclass
class Message:
    role: ToolRole
    content: str = ''
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)


@dataclass
class AgentTurn:
    text: str
    tool_calls: list[ToolCall]
    stop_reason: Literal['end_turn', 'tool_use']


class LlmBackend(Protocol):
    provider: str

    def complete(
        self,
        system: str,
        messages: Iterable[Message],
        tools: Iterable[ToolSpec],
    ) -> AgentTurn: ...
