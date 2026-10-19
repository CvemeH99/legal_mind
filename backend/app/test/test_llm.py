import asyncio

from app.llm.model_client import get_llm


async def main():
    llm = get_llm()
    result = await llm.ainvoke("你好")
    print(result.content)


if __name__ == "__main__":
    asyncio.run(main())

