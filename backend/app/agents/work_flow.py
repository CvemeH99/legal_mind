"""LangGraph 工作流编排 — 定义 Agent 之间的协作流程

对话记忆通过 AsyncPostgresSaver（PostgreSQL checkpointer）持久化，
按 thread_id（= session_id）跨轮次、跨进程重启恢复。"""

import json
from typing import TypedDict, Annotated

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

from app.agents.intent_agent import IntentAgent
from app.agents.qa_agent import QAAgent
from app.agents.document_agent import DocumentAgent
from app.agents.retrieval_agent import RetrievalAgent
from app.llm.checkpoint import get_checkpointer


class AgentState(TypedDict):
    """Agent 状态定义"""

    messages: Annotated[list[BaseMessage], add_messages]  # 对话历史，自动累积
    query: str  # 当前用户问题
    intent: str  # 识别的意图
    retrieved_cases: list  # 检索到的案例（每轮覆盖，不进入 messages）
    document_type: str  # 文书类型
    document_params: dict  # 文书参数
    response: str  # 最终响应
    sources: list  # 来源引用


class LegalMindWorkflow:
    """法律咨询 Agent 工作流"""

    def __init__(self):
        self.intent_agent = IntentAgent()
        self.qa_agent = QAAgent()
        self.document_agent = DocumentAgent()
        self.retrieval_agent = RetrievalAgent()
        # 延迟编译：checkpointer 在 lifespan 启动后才初始化，模块导入时尚不可用
        self._graph = None

    def _build_graph(self):
        """构建并编译工作流图（使用持久化 checkpointer）。"""
        workflow = StateGraph(AgentState)

        # 添加节点
        workflow.add_node("intent_recognition", self._intent_node)
        workflow.add_node("case_retrieval", self._retrieval_node)
        workflow.add_node("qa_generation", self._qa_node)
        workflow.add_node("document_generation", self._document_node)
        workflow.add_node("final_output", self._output_node)

        # 设置入口
        workflow.set_entry_point("intent_recognition")

        # 意图识别后按意图类型路由
        workflow.add_conditional_edges(
            "intent_recognition",
            self._route_by_intent,
            {
                "qa": "case_retrieval",
                "document": "document_generation",
                "search": "case_retrieval",
            },
        )

        # 检索后根据意图决定下一步
        workflow.add_conditional_edges(
            "case_retrieval",
            self._route_after_retrieval,
            {
                "qa": "qa_generation",
                "search": "final_output",
            },
        )

        workflow.add_edge("qa_generation", "final_output")
        workflow.add_edge("document_generation", "final_output")
        workflow.add_edge("final_output", END)

        return workflow.compile(checkpointer=get_checkpointer())

    def get_graph(self):
        """懒加载编译图。首次调用时编译并缓存（此时 checkpointer 已在 lifespan 中就绪）。"""
        if self._graph is None:
            self._graph = self._build_graph()
        return self._graph

    async def _intent_node(self, state: AgentState) -> dict:
        intent = await self.intent_agent.recognize(state["query"])
        return {"intent": intent}

    async def _retrieval_node(self, state: AgentState) -> dict:
        cases = await self.retrieval_agent.retrieve(query=state["query"], top_k=5)
        return {"retrieved_cases": cases}

    async def _qa_node(self, state: AgentState) -> dict:
        """问答节点：从 checkpoint 恢复的 state['messages'] 读取历史（已含当前 HumanMessage），
        节点内部用 llm.astream 生成回答，使 graph.astream(stream_mode='messages') 能转发 token。"""
        cases = state["retrieved_cases"]
        messages = state["messages"]
        full_text = ""
        async for chunk in self.qa_agent.astream_answer(cases, messages):
            full_text += chunk.content or ""
        return {
            "messages": [AIMessage(content=full_text)],
            "response": full_text,
            "sources": self.qa_agent._extract_sources(cases),
        }

    async def _document_node(self, state: AgentState) -> dict:
        response = await self.document_agent.generate(
            document_type=state.get("document_type", "起诉状"),
            params=state.get("document_params", {}),
            query=state["query"],
        ) 
        content = response["content"]
        return {
            "messages": [AIMessage(content=content)],
            "response": content,
            "sources": response.get("references", []),
        }

    async def _output_node(self, state: AgentState) -> dict:
        """输出节点。注意只返回需更新的字段——不能 return 整个 state，
        否则 messages 会被 add_messages 二次追加导致历史重复。search 意图把检索结果格式化为响应。"""
        if state.get("intent") == "search" and not state.get("response"):
            cases = state.get("retrieved_cases", [])
            text = json.dumps(cases, ensure_ascii=False, indent=2)
            return {
                "messages": [AIMessage(content=text)],
                "response": text,
                "sources": self.qa_agent._extract_sources(cases),
            }
        return {}

    def _route_by_intent(self, state: AgentState) -> str:
        intent = state["intent"]
        if intent == "document":
            return "document"
        elif intent == "search":
            return "search"
        return "qa"

    def _route_after_retrieval(self, state: AgentState) -> str:
        if state["intent"] == "search":
            return "search"
        return "qa"

    async def run(self, query: str, thread_id: str) -> dict:
        """执行工作流（非流式）。thread_id 即 session_id，相同 thread_id 会从 checkpoint 恢复历史。"""
        config = {"configurable": {"thread_id": thread_id}}
        initial_state = {
            "query": query,
            "messages": [HumanMessage(content=query)],
            "retrieved_cases": [],
            "sources": [],
        }
        return await self.get_graph().ainvoke(initial_state, config=config)

    async def astream(self, query: str, thread_id: str):
        """执行工作流（流式）。按 stream_mode='messages' 产出 (AIMessageChunk, metadata) 元组。
        意图识别/检索不调用流式 LLM，仅 qa_generation 节点产出 token；消费者按 metadata['langgraph_node'] 过滤。"""
        config = {"configurable": {"thread_id": thread_id}}
        initial_state = {
            "query": query,
            "messages": [HumanMessage(content=query)],
            "retrieved_cases": [],
            "sources": [],
        }
        async for chunk, metadata in self.get_graph().astream(
            initial_state, config=config, stream_mode="messages" 
        ):
            yield chunk, metadata


# 全局工作流实例（图在首次 run/astream 时才编译，供 API 层直接调用）
workflow = LegalMindWorkflow()
