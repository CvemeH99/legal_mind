"""将 PostgreSQL 中的案例数据导入 ChromaDB 向量库"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from tortoise import Tortoise
from langchain_core.documents import Document

from app.config import settings


async def build_index():
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgres://", 1)

    await Tortoise.init(
        db_url=db_url,
        modules={"models": ["app.models.case"]},
        use_tz=False,
    )
    from app.models.case import Case

    cases = await Case.all()
    if not cases:
        print(" 数据库中没有案例，请先运行 seed_cases.py")
        return

    # 构建 LangChain Document 列表
    documents = []
    for case in cases:
        doc = Document(
            page_content=f"{case.title}\n{case.summary or ''}\n{case.content or ''}",
            metadata={
                "id": str(case.id),
                "title": case.title,
                "case_number": case.case_number or "",
                "court": case.court or "",
                "case_type": case.case_type or "",
                "judgment_date": case.judgment_date.isoformat()
                if case.judgment_date
                else "",
                "summary": case.summary or "",
                "laws": "；".join(case.laws)
                if isinstance(case.laws, list)
                else (case.laws or ""),
            },
        )
        documents.append(doc)

    # 写入向量库
    from app.rag.vector_store import get_vector_store

    vector_store = get_vector_store()
    vector_store.reset_collection()
    vector_store.add_documents(documents, ids=[str(case.id) for case in cases])
    print(f"向量库当前文档数: {vector_store._collection.count()}")

    print(f"已导入 {len(documents)} 条案例到向量库")
    await Tortoise.close_connections()


if __name__ == "__main__":
    print("开始构建向量索引...")
    asyncio.run(build_index())
