from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.core.config import get_settings
from app.core.database import create_db_engine, dispose_db_engine, init_db
from app.core.logging import configure_logging
from app.services.project_service import ProjectService
from app.services.repository import Repository


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_db_engine(settings.supabase_db_url)
    await init_db(engine)

    app.state.settings = settings
    app.state.db_engine = engine
    app.state.repository = Repository(engine)
    app.state.project_service = ProjectService(settings, app.state.repository)

    yield

    await dispose_db_engine(engine)


app = FastAPI(title='interior-generation', version='0.1.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(api_router)

settings = get_settings()
app.mount('/storage', StaticFiles(directory=str(settings.storage_root)), name='storage')


@app.get('/health')
async def health() -> dict[str, object]:
    return {'ok': True, 'service': 'interior-generation'}
