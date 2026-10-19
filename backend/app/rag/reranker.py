"""重排序器 — 对检索结果进行重排序"""

from typing import List, Dict


class Reranker:
    """基于关键词匹配度的重排序器"""

    async def rerank(
        self, query: str, documents: List[Dict], top_k: int = 5
    ) -> List[Dict]:
        query_terms = set(query.lower().split())
        scored_docs = []
        for doc in documents:
            content = doc.get("content", "").lower()
            title = doc.get("title", "").lower()
            score = sum(1 for term in query_terms if term in content or term in title)
            scored_docs.append((score, doc))

        scored_docs.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in scored_docs[:top_k]]
