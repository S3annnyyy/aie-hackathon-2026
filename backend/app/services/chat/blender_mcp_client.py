from __future__ import annotations

import json
import logging
import socket
from typing import Any

logger = logging.getLogger(__name__)


class BlenderMcpError(RuntimeError):
    pass


class BlenderMcpClient:
    """Thin client for the blender-mcp addon TCP server.

    Protocol: a single JSON request per connection, server replies with JSON,
    then closes. See ahujasid/blender-mcp addon.py.
    """

    def __init__(self, host: str, port: int, timeout: float) -> None:
        self._host = host
        self._port = port
        self._timeout = timeout

    @property
    def endpoint(self) -> str:
        return f'{self._host}:{self._port}'

    def is_reachable(self) -> bool:
        try:
            with socket.create_connection((self._host, self._port), timeout=1.0):
                return True
        except OSError:
            return False

    def send(self, command_type: str, params: dict[str, Any] | None = None) -> Any:
        payload = {'type': command_type, 'params': params or {}}
        data = json.dumps(payload).encode('utf-8')

        try:
            with socket.create_connection((self._host, self._port), timeout=self._timeout) as sock:
                sock.settimeout(self._timeout)
                sock.sendall(data)
                chunks: list[bytes] = []
                while True:
                    try:
                        chunk = sock.recv(65536)
                    except socket.timeout as exc:
                        raise BlenderMcpError(f'blender-mcp read timeout after {self._timeout}s') from exc
                    if not chunk:
                        break
                    chunks.append(chunk)
                    try:
                        json.loads(b''.join(chunks).decode('utf-8'))
                        break
                    except json.JSONDecodeError:
                        continue
        except OSError as exc:
            raise BlenderMcpError(f'blender-mcp connect failed: {exc}') from exc

        raw = b''.join(chunks).decode('utf-8')
        try:
            response = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BlenderMcpError(f'blender-mcp returned non-JSON: {raw[:200]!r}') from exc

        if response.get('status') != 'success':
            msg = response.get('message') or response.get('result') or 'unknown error'
            raise BlenderMcpError(f'blender-mcp error for {command_type}: {msg}')
        return response.get('result', {})

    def execute_code(self, code: str) -> Any:
        return self.send('execute_code', {'code': code})

    def get_scene_info(self) -> Any:
        return self.send('get_scene_info')

    def search_polyhaven(self, asset_type: str = 'models', categories: str = '') -> Any:
        params: dict[str, Any] = {'asset_type': asset_type}
        if categories:
            params['categories'] = categories
        return self.send('search_polyhaven_assets', params)

    def download_polyhaven(self, asset_id: str, asset_type: str, resolution: str = '1k', file_format: str = '') -> Any:
        params = {'asset_id': asset_id, 'asset_type': asset_type, 'resolution': resolution}
        if file_format:
            params['file_format'] = file_format
        return self.send('download_polyhaven_asset', params)

    def rodin_generate(self, text_prompt: str) -> Any:
        return self.send('create_rodin_job', {'text_prompt': text_prompt, 'images': []})

    def rodin_poll(self, subscription_key: str) -> Any:
        return self.send('poll_rodin_job_status', {'subscription_key': subscription_key})

    def rodin_import(self, task_uuid: str, name: str) -> Any:
        return self.send('import_generated_asset', {'task_uuid': task_uuid, 'name': name})
