"""FastAPI 应用主入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.rag.vector_store import init_vector_store
from app.db.database import init_db, close_db
from app.config import settings
import os
from contextlib import asynccontextmanager
import sys
import asyncio
from app.llm.checkpoint import init_checkpointer, close_checkpointer

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        import uvicorn.loops.asyncio as _uvicorn_aio

        _uvicorn_aio.asyncio_loop_factory = lambda use_subprocess=False: (
            asyncio.SelectorEventLoop
        )
    except ImportError:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时连数据库 + 初始化 checkpointer + 向量库，关闭时逐一释放"""
    await init_db()
    await init_checkpointer()
    await init_vector_store()
    yield
    await close_db()
    await close_checkpointer()


app = FastAPI(
    title="LegalMind API",
    description="智能法律咨询系统 API",
    version="1.0.0",
    lifespan=lifespan,
)

# 跨域配置，允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.api import auth, chat, document, cases

app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(chat.router, prefix="/api/chat", tags=["聊天"])
app.include_router(document.router, prefix="/api/documents", tags=["文书"])
app.include_router(cases.router, prefix="/api/cases", tags=["案例"])

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
