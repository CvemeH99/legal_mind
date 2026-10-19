"""LLM 模型客户端 — 根据 LLM_PROVIDER 配置自动选择供应商"""

from langchain_openai import ChatOpenAI
from app.config import settings

_llm = None


def get_llm():
    global _llm
    if _llm is None:
        _llm = _init_llm()
    return _llm


def _init_llm():
    common = {
        "temperature": settings.LLM_TEMPERATURE,
        "max_tokens": settings.LLM_MAX_TOKENS,
    }
    if settings.LLM_PROVIDER == "openai":
        return ChatOpenAI(
            model=settings.LLM_MODEL, openai_api_key=settings.LLM_API_KEY, **common
        )
    elif settings.LLM_PROVIDER == "deepseek":
        return ChatOpenAI(
            model=settings.LLM_MODEL,
            openai_api_key=settings.LLM_API_KEY,
            openai_api_base="https://api.deepseek.com/v1",
            **common,
        )
    else:
        raise ValueError(f"Unsupported provider: {settings.LLM_PROVIDER}")


class LLMClient:
    """LLM 客户端封装"""

    def __init__(self):
        self.llm = get_llm()

    async def generate(self, prompt: str) -> str:
        response = await self.llm.ainvoke(prompt)
        return response.content

    async def stream(self, prompt: str):
        async for chunk in self.llm.astream(prompt):
            yield chunk.content
