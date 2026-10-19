"""LangGraph 对话记忆持久化（checkpointer）

使用 AsyncPostgresSaver 将对话状态按 thread_id 持久化到 PostgreSQL，
实现跨轮次、跨进程重启的对话记忆。复用 settings.DATABASE_URL（标准 postgresql:// 格式）。"""

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool

from app.config import settings


_pool: AsyncConnectionPool | None = None
_checkpointer: AsyncPostgresSaver | None = None


async def init_checkpointer() -> AsyncPostgresSaver:
    """初始化 checkpointer：创建连接池 + 幂等建表。在 lifespan startup 调用。"""
    global _pool, _checkpointer
    if _checkpointer is not None:
        return _checkpointer
    # open=False：必须在事件循环内显式 await pool.open()
    _pool = AsyncConnectionPool(conninfo=settings.DATABASE_URL, max_size=20, open=False)
    await _pool.open()
    _checkpointer = AsyncPostgresSaver(conn=_pool)
    # setup() 的迁移里含 `CREATE INDEX CONCURRENTLY`，不能运行在事务块内，
    # 而连接池返回的连接默认 autocommit=False，会触发 ActiveSqlTransaction 报错。
    # 因此改用一条 autocommit=True 的独立连接做幂等建表，运行时仍交给连接池。
    async with await AsyncConnection.connect(
        settings.DATABASE_URL, autocommit=True, prepare_threshold=0
    ) as conn:
        await AsyncPostgresSaver(conn=conn).setup()
    return _checkpointer


def get_checkpointer() -> AsyncPostgresSaver:
    """获取 checkpointer 单例，供 LangGraph 编译图时使用。
    必须在 init_checkpointer() 之后调用。"""
    if _checkpointer is None:
        raise RuntimeError(
            "Checkpointer 尚未初始化，请在应用启动时调用 init_checkpointer()"
        )
    return _checkpointer


async def close_checkpointer() -> None:
    """关闭连接池。在 lifespan shutdown 调用。"""
    global _pool, _checkpointer
    if _pool is not None:
        await _pool.close()
    _pool = None
    _checkpointer = None
