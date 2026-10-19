# LegalMind 法律智能助手

基于 FastAPI、LangGraph、PostgreSQL 与 ChromaDB 的法律问答与文书生成应用，前端为零依赖单页应用。

## 功能展示

### 用户注册与登录

支持账号注册与登录。注册时填写用户名、昵称、邮箱和密码，登录后进入独立的法律工作区，会话记录与文书结果按用户隔离。

![用户注册与登录](docs/images/register.png)

### 智能问答

输入法律问题后，回答通过 SSE 流式输出，逐字呈现分析过程与法律依据；右侧同步展示本轮引用的案件、案号、审理法院和裁判日期，历史会话可随时恢复。

![智能问答](docs/images/chat.png)

### 文书生成

支持起诉状、答辩状、合同、律师函和上诉状五类文书。填写当事人、受理法院、诉讼请求和事实理由后流式起草，生成结果可直接编辑、复制或下载。

![文书生成](docs/images/document.png)

### 案例检索

按关键词检索案例，并可按案件类型筛选。结果展示案号、审理法院、裁判日期和案情摘要，点击可查看完整案例详情。

![案例检索](docs/images/cases.png)

## 项目结构

```text
LEGAL_MIND/
├── backend/           # FastAPI + LangGraph 后端
│   ├── app/           # 业务代码（api/agents/rag/models 等）
│   └── main.py        # 后端入口
├── frontend/          # 原生 JS 前端
└── docker-compose.yml # PostgreSQL + Redis
```

## 环境要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js 18+ 与 Yarn
- Docker Desktop（用于 PostgreSQL 和 Redis）

## 启动依赖服务

在仓库根目录执行：

```powershell
docker compose up -d
```

PostgreSQL 映射到宿主机 `5433` 端口，Redis 使用 `6379` 端口。

## 启动后端

```powershell
cd backend
Copy-Item .env.example .env
uv sync
uv run main.py
```

`uv sync` 会按 `pyproject.toml` 和 `uv.lock` 创建或更新 `.venv` 并安装全部依赖；`uv run` 也会自动完成这一步，首次启动前显式执行一次更直观。

首次运行前在 `.env` 中填写 `LLM_API_KEY`，并按需修改 `SECRET_KEY`。后端默认监听 `http://localhost:8000`，接口文档位于 `http://localhost:8000/docs`。

首次使用时导入示例案件并构建向量索引：

```powershell
cd backend
uv run python -m app.scripts.seed_cases
uv run python -m app.scripts.build_index
```

`build_index` 会使用 `BAAI/bge-small-zh` 生成向量；若本地 `models/` 目录没有模型，会自动从 HuggingFace 下载。

## 启动前端

```powershell
cd frontend
yarn install
yarn dev
```

浏览器访问 `http://localhost:5173`。前端默认请求 `http://localhost:8000/api`。

## 后端依赖管理

后端依赖统一由 uv 管理，配置入口是 `backend/pyproject.toml`，锁定版本记录在 `backend/uv.lock`。

- 安装或同步依赖：在 `backend` 目录执行 `uv sync`
- 新增运行依赖：`uv add 包名`，会同时更新 `pyproject.toml` 和 `uv.lock`
- 新增开发依赖：`uv add --dev 包名`
- 在项目虚拟环境中执行命令：`uv run python xxx.py`
- CI 或离线环境按锁文件安装：`uv sync --frozen`

不要手动修改 `.venv` 里的包，也不要提交 `.venv/`。调整依赖后，把 `pyproject.toml` 和 `uv.lock` 一起提交。

## 测试

```powershell
cd frontend
yarn test
```

## 说明

- `.env`、`models/`、`data/`、`.venv/` 等本地文件不会提交，首次运行需按上述步骤重新生成。
- 生产环境请替换默认数据库口令与 `SECRET_KEY`，并使用强随机值。
