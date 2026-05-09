from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from app.core.config import Settings
from app.models.schema import LayoutSchema


class BlenderGenerator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def generate_glb(self, schema: LayoutSchema, output_path: Path) -> bytes:
        with tempfile.TemporaryDirectory(prefix='interior-blender-') as td:
            tmp = Path(td)
            input_json = tmp / 'layout.json'
            input_json.write_text(schema.model_dump_json(indent=2), encoding='utf-8')

            script_path = self.settings.blender_script_path
            cmd = [
                self.settings.blender_executable,
                '--background',
                '--python',
                str(script_path),
                '--',
                '--input',
                str(input_json),
                '--output',
                str(output_path),
            ]
            env = os.environ.copy()
            env['BLENDER_EXPORT_DEBUG_MARKERS'] = 'true' if self.settings.blender_export_debug_markers else 'false'
            subprocess.run(cmd, check=True, timeout=self.settings.blender_timeout_seconds, env=env)

        return output_path.read_bytes()
