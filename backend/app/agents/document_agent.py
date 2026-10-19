"""法律文书生成 Agent — 生成起诉状、答辩状、合同等法律文书"""

from typing import Dict, List
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.llm.model_client import get_llm
from app.llm.prompts import DOCUMENT_TEMPLATES


class DocumentAgent:
    """法律文书生成 Agent"""

    DOCUMENT_TYPES = {
        "起诉状": "civil_complaint",
        "答辩状": "defense_statement",
        "合同": "contract",
        "律师函": "lawyer_letter",
        "上诉状": "appeal_statement",
    }

    def __init__(self):
        self.llm = get_llm()

    def _build_chain(self, document_type, params, query, references=None):
        """构造 prompt | llm 链。generate 与 astream_generate 共用，
        prompt（system 文案 + _build_user_prompt）只在此一处维护。"""
        template = self.get_template(document_type)
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "你是一位专业的法律文书撰写专家，请根据用户需求和法律规范生成专业的法律文书。",
                ),
                (
                    "human",
                    self._build_user_prompt(
                        document_type, params, query, references, template
                    ),
                ),
            ]
        )
        return prompt | self.llm

    async def generate(
        self,
        document_type: str,
        params: Dict,
        query: str,
        references: List[Dict] = None,
    ) -> Dict:
        """生成法律文书（非流式）"""
        chain = (
            self._build_chain(document_type, params, query, references)
            | StrOutputParser()
        )
        content = await chain.ainvoke({})
        return {
            "content": content,
            "document_type": document_type,
            "references": references or [],
        }

    async def astream_generate(
        self,
        document_type: str,
        params: Dict,
        query: str,
        references: List[Dict] = None,
    ):
        """流式生成法律文书，逐个产出 AIMessageChunk（token 在 chunk.content）。
        供 documents API 的流式接口调用，prompt 构造与 generate 完全一致。"""
        chain = self._build_chain(document_type, params, query, references)
        async for chunk in chain.astream({}):
            yield chunk

    def get_template(self, document_type: str) -> str:
        """根据中文文书类型获取对应模板骨架（无匹配返回空串）"""
        template_key = self.DOCUMENT_TYPES.get(document_type, "civil_complaint")
        return DOCUMENT_TEMPLATES.get(template_key, "")

    def _build_user_prompt(
        self,
        document_type: str,
        params: Dict,
        query: str,
        references: List[Dict],
        template: str = "",
    ) -> str:
        parts = [
            f"请生成一份{document_type}。",
            f"\n用户需求：{query}",
            f"\n文书参数：",
        ]
        for key, value in params.items():
            parts.append(f"- {key}：{value}")
        if references:
            parts.append(f"\n参考案例：\n{self._format_references(references)}")
        if template:
            # 有模板骨架：严格照此结构填空，保证格式齐整
            parts.append(
                f"\n请严格按照以下格式模板生成，将参数与需求填入对应位置，保持结构完整：\n{template.strip()}"
            )
        else:
            parts.append(f"\n请严格按照{document_type}的标准格式和法律规范生成文书。")
        return "\n".join(parts)

    def _format_references(self, references: List[Dict]) -> str:
        if not references:
            return "暂无参考案例。"
        formatted = []
        for ref in references[:2]:
            formatted.append(
                f"- {ref.get('title', '未知')} ({ref.get('case_number', '未知')})"
            )
        return "\n".join(formatted)
