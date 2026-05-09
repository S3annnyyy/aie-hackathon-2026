from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv('.env.local')
load_dotenv()


class Settings(BaseSettings):
    app_name: str = Field(default='interior-generation', alias='APP_NAME')
    app_env: str = Field(default='dev', alias='APP_ENV')
    log_level: str = Field(default='INFO', alias='LOG_LEVEL')

    storage_root: Path = Field(default=Path('storage'), alias='STORAGE_ROOT')
    upload_subdir: str = Field(default='uploads', alias='UPLOAD_SUBDIR')
    projects_subdir: str = Field(default='projects', alias='PROJECTS_SUBDIR')

    supabase_db_url: str = Field(default='', alias='SUPABASE_DB_URL')
    supabase_storage_base_url: str = Field(default='', alias='SUPABASE_STORAGE_BASE_URL')
    supabase_storage_bucket: str = Field(default='interior-assets', alias='SUPABASE_STORAGE_BUCKET')
    supabase_service_role_key: str = Field(default='', alias='SUPABASE_SERVICE_ROLE_KEY')

    openai_api_key: str = Field(default='', alias='OPENAI_API_KEY')
    openai_model: str = Field(default='gpt-4.1-mini', alias='OPENAI_MODEL')
    openai_page_layout_model: str = Field(default='gpt-5.4-mini', alias='OPENAI_PAGE_LAYOUT_MODEL')

    anthropic_api_key: str = Field(default='', alias='ANTHROPIC_API_KEY')
    anthropic_model: str = Field(default='claude-opus-4-7', alias='ANTHROPIC_MODEL')

    gemini_api_key: str = Field(default='', alias='GEMINI_API_KEY')
    gemini_model: str = Field(default='gemini-2.5-flash', alias='GEMINI_MODEL')

    chat_llm_provider: str = Field(default='openai', alias='CHAT_LLM_PROVIDER')
    chat_openai_model: str = Field(default='', alias='CHAT_OPENAI_MODEL')
    chat_max_tool_iterations: int = Field(default=8, alias='CHAT_MAX_TOOL_ITERATIONS')

    blender_executable: str = Field(default='blender', alias='BLENDER_EXECUTABLE')
    blender_script_path: Path = Field(default=Path('scripts/blender_generate_model.py'), alias='BLENDER_SCRIPT_PATH')
    blender_timeout_seconds: int = Field(default=180, alias='BLENDER_TIMEOUT_SECONDS')
    blender_export_debug_markers: bool = Field(default=False, alias='BLENDER_EXPORT_DEBUG_MARKERS')

    blender_mcp_enabled: bool = Field(default=False, alias='BLENDER_MCP_ENABLED')
    blender_mcp_host: str = Field(default='127.0.0.1', alias='BLENDER_MCP_HOST')
    blender_mcp_port: int = Field(default=9876, alias='BLENDER_MCP_PORT')
    blender_mcp_timeout_seconds: float = Field(default=30.0, alias='BLENDER_MCP_TIMEOUT_SECONDS')

    page_render_dpi: int = Field(default=400, alias='PAGE_RENDER_DPI')

    model_config = SettingsConfigDict(
        env_file=('.env.local', '.env'),
        env_file_encoding='utf-8',
        extra='ignore',
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    return settings
