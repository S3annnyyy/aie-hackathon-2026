from __future__ import annotations

import logging
from typing import Iterator
from uuid import UUID

from app.core.config import Settings
from app.models.schema import LayoutSchema
from app.services.chat.agent import AgentEvent, InteriorDesignAgent
from app.services.chat.blender_mcp_client import BlenderMcpClient
from app.services.chat.factory import build_llm_backend
from app.services.chat.tools import snapshot_schema

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._backend = None
        self._mcp: BlenderMcpClient | None = None
        if settings.blender_mcp_enabled:
            self._mcp = BlenderMcpClient(
                host=settings.blender_mcp_host,
                port=settings.blender_mcp_port,
                timeout=settings.blender_mcp_timeout_seconds,
            )

    def _get_backend(self):
        if self._backend is None:
            self._backend = build_llm_backend(self._settings)
        return self._backend

    @property
    def mcp_available(self) -> bool:
        return self._mcp is not None and self._mcp.is_reachable()

    def run(self, layout_id: UUID, user_message: str, schema: LayoutSchema) -> Iterator[AgentEvent]:
        mcp = self._mcp if self.mcp_available else None
        if self._settings.blender_mcp_enabled and mcp is None:
            yield AgentEvent(
                'assistant_text',
                {'text': f'(blender-mcp at {self._settings.blender_mcp_host}:{self._settings.blender_mcp_port} is not reachable — falling back to schema-only edits.)'},
            )

        backend = self._get_backend()
        agent = InteriorDesignAgent(
            backend=backend,
            mcp_client=mcp,
            max_iterations=self._settings.chat_max_tool_iterations,
        )
        working = snapshot_schema(schema)
        yield from agent.run(user_message=user_message, schema=working)
