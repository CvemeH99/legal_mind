"""案例检索 Agent — 封装检索 + 重排序的完整流程"""

from typing import List, Dict
from app.rag.retriever import HybridRetriever
from app.rag.reranker import Reranker
from app.config import settings


class RetrievalAgent:
    """案例检索 Agent"""

    def __init__(self):
        self.retriever = HybridRetriever()
        self.reranker = Reranker() if settings.RERANK_ENABLED else None

    async def retrieve(
        self, query: str, top_k: int = 5, filters: Dict = None
    ) -> List[Dict]:
        # 初始检索（多路召回）
        candidates = await self.retriever.retrieve(
            query=query, top_k=top_k * 3, filters=filters
        )

        # 重排序
        if self.reranker and candidates:
            return await self.reranker.rerank(
                query=query, documents=candidates, top_k=top_k
            )

        return candidates[:top_k]

    async def search_by_keywords(
        self, keywords: List[str], top_k: int = 10
    ) -> List[Dict]:
        query = " ".join(keywords)
        return await self.retrieve(query, top_k)

    async def search_by_article(self, article: str, top_k: int = 10) -> List[Dict]:
        filters = {"laws": {"$contains": article}}
        return await self.retrieve(article, top_k, filters)
