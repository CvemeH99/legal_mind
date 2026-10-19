"""数据库连接管理 - Tortoise ORM"""

from tortoise import Tortoise
from app.config import settings


async def init_db():
    db_url = settings.DATABASE_URL
    # Tortoise 使用 postgres:// 格式，而 .env 里写的是 postgresql://
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgres://")

    await Tortoise.init(
        db_url=db_url,
        modules={
            "models": [
                "app.models.user",
                "app.models.case",
                "app.models.chat",
                "app.models.document",
            ]
        },
        use_tz=False,  # Windows 下不设置时区避免报错
        # tortoise-orm 1.x 下 lifespan 运行在独立 task 中，
        # 需要开启全局 fallback，否则请求 handler 里拿不到连接上下文
        _enable_global_fallback=True,
    )
    await Tortoise.generate_schemas(safe=True)


async def close_db():
    await Tortoise.close_connections()
