from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.models.db import Base


def create_db_engine(database_url: str) -> AsyncEngine | None:
    if not database_url:
        return None
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql+asyncpg://', 1)
    elif database_url.startswith('postgresql://') and '+asyncpg' not in database_url:
        database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
    return create_async_engine(database_url, future=True, echo=False)


async def init_db(engine: AsyncEngine | None) -> None:
    if engine is None:
        return
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_db_engine(engine: AsyncEngine | None) -> None:
    if engine is not None:
        await engine.dispose()
