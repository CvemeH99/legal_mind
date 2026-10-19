"""向量存储管理"""

from typing import List, Dict, Optional
from langchain_chroma import Chroma
from langchain_core.documents import Document

from app.rag.embeddings import get_embeddings
from app.config import settings

_vector_store = None


async def init_vector_store():
    """异步初始化向量存储"""
    global _vector_store
    embeddings = get_embeddings()
    _vector_store = Chroma(
        persist_directory=settings.VECTOR_STORE_PATH,
        embedding_function=embeddings,
        collection_name="legal_cases",
    )
    return _vector_store


def get_vector_store():
    """获取向量存储实例"""
    global _vector_store
    if _vector_store is None:
        embeddings = get_embeddings()
        _vector_store = Chroma(
            persist_directory=settings.VECTOR_STORE_PATH,
            embedding_function=embeddings,
            collection_name="legal_cases",
        )
    return _vector_store


class VectorStoreManager:
    """向量存储管理器"""

    def __init__(self):
        self.store = get_vector_store()

    async def add_documents(self, documents: List[Document]):
        self.store.add_documents(documents)

    async def similarity_search(
        self, query: str, k: int = 5, filter: Optional[Dict] = None
    ) -> List[Document]:
        return self.store.similarity_search(query, k=k, filter=filter)

    async def similarity_search_with_score(
        self, query: str, k: int = 5, filter: Optional[Dict] = None
    ) -> List[tuple]:
        return self.store.similarity_search_with_score(query, k=k, filter=filter)


"""向量存储管理模块
​
本模块封装了基于 Chroma 的向量数据库操作，用于支持 RAG（检索增强生成）系统中的文档向量存储与相似性检索。
"""

from typing import List, Dict, Optional
from langchain_chroma import Chroma
from langchain_core.documents import Document

# 导入嵌入模型获取函数和应用配置
from app.rag.embeddings import get_embeddings
from app.config import settings

# 全局变量：用于缓存已初始化的向量存储实例，避免重复创建
_vector_store = None


async def init_vector_store():
    """异步初始化向量存储实例
    ​
       该函数用于在应用启动时异步加载或创建 Chroma 向量数据库。
       使用配置中指定的持久化路径、嵌入模型和集合名称进行初始化。
    ​
       Returns:
         Chroma: 初始化后的向量存储实例
    """
    global _vector_store
    embeddings = (
        get_embeddings()
    )  # 获取嵌入模型（如 SentenceTransformer 或 OpenAI Embeddings）
    _vector_store = Chroma(
        persist_directory=settings.VECTOR_STORE_PATH,  # 向量数据库持久化目录
        embedding_function=embeddings,  # 嵌入函数
        collection_name="legal_cases",  # 集合名称（用于区分不同数据集）
    )
    return _vector_store


def get_vector_store():
    """获取向量存储实例（同步方式）
    ​
       如果全局变量 _vector_store 尚未初始化，则在此处同步创建。
       适用于非异步上下文（如后台任务或测试）。
    ​
       Returns:
         Chroma: 已初始化的向量存储实例
    """
    global _vector_store
    if _vector_store is None:
        embeddings = get_embeddings()
        _vector_store = Chroma(
            persist_directory=settings.VECTOR_STORE_PATH,
            embedding_function=embeddings,
            collection_name="legal_cases",
        )
    return _vector_store


class VectorStoreManager:
    """向量存储管理器类
    ​
       提供对向量数据库的高层封装，支持添加文档和相似性检索等操作。
       所有方法均为异步设计，便于在 FastAPI 等异步框架中使用。
    """

    def __init__(self):
        """初始化管理器，加载向量存储实例"""
        self.store = get_vector_store()

    async def add_documents(self, documents: List[Document]):
        """将一批文档添加到向量数据库中
        ​
             注意：虽然方法标记为 async，但底层 Chroma 的 add_documents 是同步的。
             如需真正异步，应使用线程池包装（例如 asyncio.to_thread）。
        ​
             Args:
               documents (List[Document]): 要添加的 LangChain Document 对象列表
        """
        # 实际调用是同步的，此处可考虑用 asyncio.to_thread 包装以避免阻塞事件循环
        self.store.add_documents(documents)

    async def similarity_search(
        self, query: str, k: int = 5, filter: Optional[Dict] = None
    ) -> List[Document]:
        """根据查询文本执行相似性搜索，返回最相关的文档
        ​
             Args:
               query (str): 用户查询文本
               k (int): 返回结果数量，默认为 5
               filter (Optional[Dict]): 可选的元数据过滤条件，例如 {"case_type": "criminal"}
        ​
             Returns:
               List[Document]: 与查询最相似的 k 个文档
        """
        return self.store.similarity_search(query, k=k, filter=filter)

    async def similarity_search_with_score(
        self, query: str, k: int = 5, filter: Optional[Dict] = None
    ) -> List[tuple]:
        """执行相似性搜索，并返回每个结果的相似度分数
        ​
             返回结果为 (Document, score) 的元组列表，分数越低表示越相似（基于距离）。
        ​
             Args:
               query (str): 用户查询文本
               k (int): 返回结果数量，默认为 5
               filter (Optional[Dict]): 可选的元数据过滤条件
        ​
             Returns:
               List[tuple]: 每个元素为 (Document, score) 的列表
        """
        return self.store.similarity_search_with_score(query, k=k, filter=filter)
