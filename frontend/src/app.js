import {
  consumeSseBuffer,
  displayValue,
  escapeHtml,
  extractErrorMessage,
  formatDate,
  formatMessageTime,
  formatRichText,
  getInitials,
  normalizeList,
  truncateText,
} from "./utils.js";

const API_BASE = (
  window.LEGALMIND_API_BASE ||
  localStorage.getItem("legalmind_api_base") ||
  "http://localhost:8000/api"
).replace(/\/+$/, "");

const TOKEN_KEY = "legalmind_access_token";
const USER_KEY = "legalmind_user";

const VIEW_META = {
  chat: { kicker: "LEGAL CONSULTATION", title: "智能问答" },
  documents: { kicker: "DOCUMENT STUDIO", title: "文书生成" },
  cases: { kicker: "PRECEDENT LIBRARY", title: "案例检索" },
};

const DOCUMENT_FIELDS = {
  起诉状: [
    { name: "plaintiff", label: "原告", placeholder: "姓名或公司全称", required: true },
    { name: "defendant", label: "被告", placeholder: "姓名或公司全称", required: true },
    { name: "court", label: "受理法院", placeholder: "有管辖权的人民法院", span: "full" },
    { name: "claims", label: "诉讼请求", placeholder: "列出主要诉讼请求", type: "textarea", span: "full" },
    { name: "facts", label: "事实与理由要点", placeholder: "简明说明纠纷经过和核心争议", type: "textarea", span: "full" },
  ],
  答辩状: [
    { name: "respondent", label: "答辩人", placeholder: "姓名或公司全称", required: true },
    { name: "opponent", label: "被答辩人", placeholder: "姓名或公司全称", required: true },
    { name: "court", label: "受理法院", placeholder: "审理本案的人民法院", span: "full" },
    { name: "opinions", label: "答辩意见", placeholder: "概括主要答辩意见", type: "textarea", span: "full" },
    { name: "facts", label: "事实依据", placeholder: "说明案件事实与证据情况", type: "textarea", span: "full" },
  ],
  合同: [
    { name: "parties", label: "合同主体", placeholder: "甲方、乙方名称", required: true },
    { name: "subject", label: "合同标的", placeholder: "交易的标的或服务内容", required: true },
    { name: "amount", label: "价款及支付", placeholder: "金额与支付安排", span: "full" },
    { name: "term", label: "履行期限", placeholder: "起止时间与关键节点", span: "full" },
    { name: "core_terms", label: "核心条款", placeholder: "违约责任、争议解决等关键约定", type: "textarea", span: "full" },
  ],
  律师函: [
    { name: "recipient", label: "收函对象", placeholder: "个人或单位名称", required: true },
    { name: "sender", label: "委托人", placeholder: "委托方姓名或名称", required: true },
    { name: "matter", label: "事由", placeholder: "催告、侵权制止等", span: "full" },
    { name: "deadline", label: "要求期限", placeholder: "希望对方履行的期限" },
    { name: "requests", label: "主要诉求", placeholder: "希望对方采取的具体行动", type: "textarea", span: "full" },
  ],
  上诉状: [
    { name: "appellant", label: "上诉人", placeholder: "姓名或公司全称", required: true },
    { name: "appellee", label: "被上诉人", placeholder: "姓名或公司全称", required: true },
    { name: "original_court", label: "原审法院", placeholder: "一审法院名称", span: "full" },
    { name: "appeal_request", label: "上诉请求", placeholder: "希望二审法院如何裁判", type: "textarea", span: "full" },
    { name: "reasons", label: "上诉理由", placeholder: "说明原审事实认定或法律适用问题", type: "textarea", span: "full" },
  ],
};

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: readStoredUser(),
  view: "chat",
  sessions: [],
  sessionId: "",
  messages: [],
  sources: [],
  streaming: false,
  streamController: null,
  documentType: "起诉状",
  documentContent: "",
  documentReferences: [],
  caseResults: [],
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function makeId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toast(message, type = "success") {
  const region = $("#toast-region");
  const element = document.createElement("div");
  element.className = `toast${type === "error" ? " toast--error" : ""}`;
  element.innerHTML = `
    <svg><use href="#${type === "error" ? "i-info" : "i-shield"}"></use></svg>
    <p>${escapeHtml(message)}</p>
  `;
  region.append(element);
  window.setTimeout(() => {
    element.style.opacity = "0";
    element.style.transform = "translateY(-6px)";
    window.setTimeout(() => element.remove(), 180);
  }, 3200);
}

function setConnection(connected) {
  const pill = $("#connection-pill");
  if (!pill) {
    return;
  }
  pill.classList.toggle("is-offline", !connected);
  const label = $("span:last-child", pill);
  if (label) {
    label.textContent = connected ? "服务已连接" : "服务暂不可用";
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text || null;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    setConnection(false);
    throw new Error(`无法连接后端服务：${error.message}`);
  }

  setConnection(true);
  const payload = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && state.token && !path.startsWith("/auth/")) {
      clearAuthentication();
      showAuth();
    }
    const error = new Error(extractErrorMessage(payload, `请求失败（${response.status}）`));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function streamRequest(path, body, onEvent) {
  const controller = new AbortController();
  state.streamController = controller;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }
    setConnection(false);
    throw new Error(`无法连接后端服务：${error.message}`);
  }

  setConnection(true);
  if (!response.ok) {
    const payload = await parseResponse(response);
    if (response.status === 401) {
      clearAuthentication();
      showAuth();
    }
    throw new Error(extractErrorMessage(payload, `请求失败（${response.status}）`));
  }
  if (!response.body) {
    throw new Error("浏览器未收到流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parsed = consumeSseBuffer(buffer);
      buffer = parsed.remaining;

      for (const rawEvent of parsed.events) {
        if (rawEvent === "[DONE]") {
          return;
        }
        try {
          onEvent(JSON.parse(rawEvent));
        } catch {
          onEvent({ content: rawEvent });
        }
      }
    }

    if (buffer.trim()) {
      const parsed = consumeSseBuffer(`${buffer}\n\n`);
      for (const rawEvent of parsed.events) {
        if (rawEvent !== "[DONE]") {
          try {
            onEvent(JSON.parse(rawEvent));
          } catch {
            onEvent({ content: rawEvent });
          }
        }
      }
    }
  } finally {
    state.streamController = null;
  }
}

function saveAuthentication(payload) {
  state.token = payload.access_token;
  state.user = {
    username: payload.username,
    nickname: payload.nickname || payload.username,
  };
  localStorage.setItem(TOKEN_KEY, state.token);
  localStorage.setItem(USER_KEY, JSON.stringify(state.user));
}

function clearAuthentication() {
  state.token = "";
  state.user = null;
  state.sessions = [];
  state.sessionId = "";
  state.messages = [];
  state.sources = [];
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function showAuth() {
  $("#auth-screen").hidden = false;
  $("#app-shell").hidden = true;
  setAuthMode("login");
}

async function showApp() {
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  const nickname = state.user?.nickname || state.user?.username || "LegalMind 用户";
  $("#user-name").textContent = nickname;
  $("#user-avatar").textContent = getInitials(nickname);
  setView("chat");
  startNewChat(false);
  await loadSessions();
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  $$(".auth-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === mode);
  });
  $("#login-form").hidden = !isLogin;
  $("#register-form").hidden = isLogin;
  $("#auth-title").textContent = isLogin ? "登录工作台" : "创建您的账户";
  $("#auth-subtitle").textContent = isLogin
    ? "继续处理您的法律事务与咨询记录。"
    : "建立专属工作区，咨询记录与文书成果独立保存。";
}

async function submitAuthForm(form, path) {
  const button = $('button[type="submit"]', form);
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>正在验证...</span>";

  try {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const result = await api(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    saveAuthentication(result);
    form.reset();
    toast(`欢迎回来，${result.nickname || result.username}`);
    await showApp();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function setView(view) {
  if (!VIEW_META[view]) {
    return;
  }
  state.view = view;
  $$(".view").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.view === view);
  });
  $$(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewLink === view);
  });
  $("#page-kicker").textContent = VIEW_META[view].kicker;
  $("#page-title").textContent = VIEW_META[view].title;
  closeSidebar();
}

function openSidebar() {
  $("#app-shell").classList.add("is-sidebar-open");
}

function closeSidebar() {
  $("#app-shell").classList.remove("is-sidebar-open");
}

function startNewChat(focus = true) {
  if (state.streaming) {
    state.streamController?.abort();
    state.streaming = false;
  }
  state.sessionId = makeId();
  state.messages = [];
  state.sources = [];
  renderChatMessages();
  renderSources();
  setChatStatus("等待提问", false);
  if (focus) {
    setView("chat");
    $("#chat-input").focus();
  }
}

async function loadSessions() {
  const container = $("#session-list");
  if (!state.token || !container) {
    return;
  }

  container.innerHTML = `
    <div class="session-skeleton"></div>
    <div class="session-skeleton"></div>
  `;

  try {
    const payload = await api("/chat/sessions");
    state.sessions = payload.sessions || [];
    renderSessionList();
  } catch (error) {
    container.innerHTML = `<div class="sidebar__empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderSessionList() {
  const container = $("#session-list");
  if (!state.sessions.length) {
    container.innerHTML = `<div class="sidebar__empty">还没有历史会话，开始你的第一次法律咨询。</div>`;
    return;
  }

  container.innerHTML = state.sessions
    .map(
      (session) => `
        <button
          class="session-item${session.session_id === state.sessionId ? " is-active" : ""}"
          data-session-id="${escapeHtml(session.session_id)}"
          type="button"
        >
          <svg><use href="#i-message"></use></svg>
          <span class="session-item__text">
            <strong>${escapeHtml(truncateText(session.title, 24) || "新对话")}</strong>
            <small>${escapeHtml(formatDate(session.created_at, true))}</small>
          </span>
          <span class="session-item__delete" data-delete-session="${escapeHtml(
            session.session_id,
          )}" title="删除会话">
            <svg><use href="#i-trash"></use></svg>
          </span>
        </button>
      `,
    )
    .join("");
}

async function openSession(sessionId) {
  if (!sessionId || sessionId === state.sessionId) {
    setView("chat");
    return;
  }

  if (state.streaming) {
    state.streamController?.abort();
    state.streaming = false;
  }

  setView("chat");
  setChatStatus("正在读取", true);
  try {
    const payload = await api(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`);
    state.sessionId = sessionId;
    state.messages = (payload.messages || []).map((message) => ({
      id: makeId(),
      role: message.role,
      content: message.content,
      createdAt: new Date(),
    }));
    state.sources = [];
    renderChatMessages();
    renderSources();
    renderSessionList();
    setChatStatus("已恢复会话", true);
    scrollChatToBottom(false);
  } catch (error) {
    setChatStatus("读取失败", false);
    toast(error.message, "error");
  }
}

async function deleteSession(sessionId) {
  if (!sessionId || !window.confirm("确认删除这条会话及其全部消息？")) {
    return;
  }

  try {
    await api(`/chat/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    toast("会话已删除");
    if (state.sessionId === sessionId) {
      startNewChat(false);
    }
    await loadSessions();
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderChatMessages() {
  const welcome = $("#chat-welcome");
  const list = $("#message-list");
  const hasMessages = state.messages.length > 0;
  welcome.hidden = hasMessages;

  if (!hasMessages) {
    list.innerHTML = "";
    updateConversationStats();
    return;
  }

  list.innerHTML = state.messages
    .map((message) => {
      const isUser = message.role === "user";
      const content = message.content
        ? formatRichText(message.content)
        : `<span class="thinking"><span></span><span></span><span></span></span>`;
      return `
        <article
          class="message message--${isUser ? "user" : "assistant"}"
          data-message-id="${escapeHtml(message.id)}"
        >
          <span class="message__avatar">
            <svg><use href="#${isUser ? "i-user" : "i-scale"}"></use></svg>
          </span>
          <div class="message__body">
            <div class="message__meta">
              <strong>${isUser ? "您" : "LegalMind 法律顾问"}</strong>
              <time>${escapeHtml(formatMessageTime(message.createdAt))}</time>
            </div>
            <div class="message__content">${content}</div>
            ${
              isUser || !message.content
                ? ""
                : `<div class="message__actions">
                    <button class="icon-button" type="button" data-copy-message="${escapeHtml(
                      message.id,
                    )}" title="复制回答">
                      <svg><use href="#i-copy"></use></svg>
                    </button>
                  </div>`
            }
          </div>
        </article>
      `;
    })
    .join("");
  updateConversationStats();
}

function updateConversationStats() {
  const turns = state.messages.filter((message) => message.role === "user").length;
  $("#turn-count").textContent = String(turns);
  $("#source-count").textContent = String(state.sources.length);
}

function renderSources() {
  const container = $("#source-list");
  if (!state.sources.length) {
    container.innerHTML =
      '<p class="context-empty">生成回答后，这里将展示检索到的相关案例。</p>';
  } else {
    container.innerHTML = state.sources
      .map(
        (source) => `
          <div class="source-card">
            <strong>${escapeHtml(displayValue(source.title, "相关案例"))}</strong>
            <span>${escapeHtml(
              [source.case_number, source.court, source.date || source.judgment_date]
                .filter(Boolean)
                .join(" · ") || "参考材料",
            )}</span>
          </div>
        `,
      )
      .join("");
  }
  updateConversationStats();
}

function setChatStatus(text, active) {
  const element = $("#chat-status");
  element.textContent = text;
  element.classList.toggle("is-active", active);
}

function scrollChatToBottom(smooth = true) {
  const container = $("#chat-scroll");
  window.requestAnimationFrame(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  });
}

function resizeChatInput() {
  const input = $("#chat-input");
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

async function sendChatMessage() {
  const input = $("#chat-input");
  const content = input.value.trim();
  if (!content || state.streaming) {
    return;
  }

  if (!state.sessionId) {
    state.sessionId = makeId();
  }

  const userMessage = {
    id: makeId(),
    role: "user",
    content,
    createdAt: new Date(),
  };
  const assistantMessage = {
    id: makeId(),
    role: "assistant",
    content: "",
    createdAt: new Date(),
  };

  state.messages.push(userMessage, assistantMessage);
  state.streaming = true;
  state.sources = [];
  input.value = "";
  resizeChatInput();
  $("#chat-send").disabled = true;
  renderChatMessages();
  renderSources();
  setChatStatus("正在分析", true);
  scrollChatToBottom();

  try {
    await streamRequest(
      "/chat/stream",
      { message: content, session_id: state.sessionId },
      (event) => {
        if (typeof event.content === "string") {
          assistantMessage.content += event.content;
          const node = document.querySelector(
            `[data-message-id="${CSS.escape(assistantMessage.id)}"] .message__content`,
          );
          if (node) {
            node.textContent = assistantMessage.content || "";
            if (!assistantMessage.content) {
              node.innerHTML =
                '<span class="thinking"><span></span><span></span><span></span></span>';
            }
            scrollChatToBottom();
          }
        }
        if (Array.isArray(event.sources)) {
          state.sources = event.sources;
          renderSources();
        }
      },
    );
    setChatStatus("回答完成", true);
  } catch (error) {
    if (error.name !== "AbortError") {
      assistantMessage.content +=
        (assistantMessage.content ? "\n\n" : "") + `处理失败：${error.message}`;
      toast(error.message, "error");
      setChatStatus("处理失败", false);
    }
  } finally {
    state.streaming = false;
    state.streamController = null;
    $("#chat-send").disabled = false;
    renderChatMessages();
    renderSources();
    scrollChatToBottom(false);
    await loadSessions();
  }
}

function renderDocumentFields(documentType = state.documentType) {
  const fields = DOCUMENT_FIELDS[documentType] || DOCUMENT_FIELDS.起诉状;
  $("#document-fields").innerHTML = fields
    .map((field) => {
      const control =
        field.type === "textarea"
          ? `<textarea name="${escapeHtml(field.name)}" ${
              field.required ? "required" : ""
            } placeholder="${escapeHtml(field.placeholder)}" rows="3"></textarea>`
          : `<input name="${escapeHtml(field.name)}" ${
              field.required ? "required" : ""
            } placeholder="${escapeHtml(field.placeholder)}" />`;
      return `
        <label class="field"${field.span ? ` data-span="${field.span}"` : ""}>
          <span>${escapeHtml(field.label)}</span>
          <span class="field__control${
            field.type === "textarea" ? " field__control--textarea" : ""
          }">${control}</span>
        </label>
      `;
    })
    .join("");
}

function setDocumentType(documentType) {
  state.documentType = documentType;
  $$(".document-type").forEach((label) => {
    const input = $('input[name="document_type"]', label);
    label.classList.toggle("is-active", input?.value === documentType);
  });
  $("#document-output-title").textContent = documentType;
  renderDocumentFields(documentType);
}

function collectDocumentParams() {
  const fields = DOCUMENT_FIELDS[state.documentType] || [];
  return fields.reduce((params, field) => {
    const control = $(`[name="${field.name}"]`, $("#document-form"));
    const value = control?.value.trim();
    if (value) {
      params[field.label] = value;
    }
    return params;
  }, {});
}

async function generateDocument() {
  const query = $("#document-query").value.trim();
  if (!query) {
    toast("请补充说明文书需求", "error");
    return;
  }

  const button = $("#document-generate");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<svg><use href="#i-refresh"></use></svg><span>正在起草...</span>';
  state.documentContent = "";
  state.documentReferences = [];
  $("#document-empty").hidden = true;
  $("#document-result").hidden = false;
  $("#document-result").value = "";

  try {
    await streamRequest(
      "/documents/generate/stream",
      {
        document_type: state.documentType,
        query,
        params: collectDocumentParams(),
        use_references: $("#use-references").checked,
      },
      (event) => {
        if (typeof event.content === "string") {
          state.documentContent += event.content;
          $("#document-result").value = state.documentContent;
          $("#document-result").scrollTop = $("#document-result").scrollHeight;
        }
        if (Array.isArray(event.references)) {
          state.documentReferences = event.references;
        }
      },
    );
    toast(`${state.documentType}已生成，可直接编辑`);
  } catch (error) {
    $("#document-result").value =
      (state.documentContent ? `${state.documentContent}\n\n` : "") + `生成失败：${error.message}`;
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function copyText(text, successMessage = "已复制到剪贴板") {
  if (!text) {
    toast("暂无可复制内容", "error");
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast(successMessage);
  } catch {
    toast("复制失败，请手动选择文本", "error");
  }
}

function downloadDocument() {
  const content = $("#document-result").value.trim() || state.documentContent;
  if (!content) {
    toast("暂无可下载内容", "error");
    return;
  }
  const blob = new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.documentType}-${formatDate(new Date()).replaceAll(".", "")}.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function searchCases() {
  const query = $("#case-query").value.trim();
  if (!query) {
    toast("请输入案例检索关键词", "error");
    return;
  }

  const resultContainer = $("#case-results");
  const submitButton = $('#case-search-form button[type="submit"]');
  submitButton.disabled = true;
  $("#case-result-meta").innerHTML =
    '<span class="status-dot"></span><span>正在检索相关判例...</span>';
  resultContainer.innerHTML =
    '<div class="case-loading"><span></span><span></span><span></span></div>';

  try {
    const params = new URLSearchParams({ q: query, limit: "20" });
    const caseType = $("#case-type").value;
    if (caseType) {
      params.set("case_type", caseType);
    }
    const payload = await api(`/cases/search?${params.toString()}`);
    state.caseResults = payload.cases || [];
    renderCaseResults(query);
  } catch (error) {
    resultContainer.innerHTML = `
      <div class="cases-empty">
        <span class="cases-empty__mark"><svg><use href="#i-info"></use></svg></span>
        <h3>检索未完成</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
    $("#case-result-meta").innerHTML =
      '<span class="status-dot status-dot--muted"></span><span>检索失败</span>';
    toast(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

function renderCaseResults(query) {
  const container = $("#case-results");
  $("#case-result-meta").innerHTML = `
    <span class="status-dot"></span>
    <span>“${escapeHtml(query)}” 共找到 ${state.caseResults.length} 条相关案例</span>
  `;

  if (!state.caseResults.length) {
    container.innerHTML = `
      <div class="cases-empty">
        <span class="cases-empty__mark"><svg><use href="#i-book"></use></svg></span>
        <h3>暂未找到匹配案例</h3>
        <p>尝试缩短关键词，或移除案件类型筛选后再次检索。</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.caseResults
    .map(
      (item, index) => `
        <article class="case-card">
          <div class="case-card__main">
            <div class="case-card__tags">
              <span class="case-card__tag">${escapeHtml(item.case_type || "司法案例")}</span>
              <span class="case-card__number">${escapeHtml(
                displayValue(item.case_number, "案号未收录"),
              )}</span>
            </div>
            <h3>${escapeHtml(displayValue(item.title, "未命名案例"))}</h3>
            <p>${escapeHtml(displayValue(item.summary || item.content, "暂无案情摘要"))}</p>
          </div>
          <div class="case-card__meta">
            <span class="case-meta-row">
              <svg><use href="#i-map"></use></svg>
              <span>${escapeHtml(displayValue(item.court, "法院未收录"))}</span>
            </span>
            <span class="case-meta-row">
              <svg><use href="#i-calendar"></use></svg>
              <span>${escapeHtml(displayValue(item.judgment_date, "日期未收录"))}</span>
            </span>
          </div>
          <button class="case-card__open" type="button" data-case-index="${index}" title="查看案例详情">
            <svg><use href="#i-chevron"></use></svg>
          </button>
        </article>
      `,
    )
    .join("");
}

async function openCaseDrawer(index) {
  const item = state.caseResults[index];
  if (!item) {
    return;
  }

  const drawer = $("#case-drawer");
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  $("#case-detail").innerHTML =
    '<div class="case-detail__loading"><span></span><span></span><span></span></div>';

  try {
    const detail = item.id
      ? await api(`/cases/${encodeURIComponent(item.id)}`)
      : item;
    renderCaseDetail({ ...item, ...detail });
  } catch {
    renderCaseDetail(item);
  }
}

function renderCaseDetail(item) {
  const laws = normalizeList(item.laws);
  $("#case-detail").innerHTML = `
    <article class="case-detail">
      <div class="case-detail__eyebrow">
        <span>${escapeHtml(item.case_type || "司法案例")}</span>
        <code>${escapeHtml(displayValue(item.case_number, "案号未收录"))}</code>
      </div>
      <h3>${escapeHtml(displayValue(item.title, "未命名案例"))}</h3>
      <div class="case-detail__meta">
        <div>
          <small>审理法院</small>
          <strong>${escapeHtml(displayValue(item.court))}</strong>
        </div>
        <div>
          <small>裁判日期</small>
          <strong>${escapeHtml(displayValue(item.judgment_date))}</strong>
        </div>
        <div>
          <small>案件类型</small>
          <strong>${escapeHtml(displayValue(item.case_type, "未分类"))}</strong>
        </div>
      </div>
      <section class="case-detail__section">
        <h4><svg><use href="#i-quote"></use></svg>裁判要旨</h4>
        <p>${escapeHtml(displayValue(item.summary, "暂无裁判要旨"))}</p>
      </section>
      <section class="case-detail__section">
        <h4><svg><use href="#i-book"></use></svg>相关法条</h4>
        <div class="case-detail__laws">
          ${
            laws.length
              ? laws.map((law) => `<span>${escapeHtml(law)}</span>`).join("")
              : "<span>暂无引用法条</span>"
          }
        </div>
      </section>
      <section class="case-detail__section">
        <h4><svg><use href="#i-file"></use></svg>案件内容</h4>
        <pre>${escapeHtml(displayValue(item.content || item.summary, "暂无案件全文"))}</pre>
      </section>
    </article>
  `;
}

function closeCaseDrawer() {
  const drawer = $("#case-drawer");
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
}

function setTodayLabel() {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  $("#today-label").textContent = formatter.format(new Date());
}

function bindEvents() {
  $$(".auth-tab").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authTab));
  });

  $("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthForm(event.currentTarget, "/auth/login");
  });

  $("#register-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthForm(event.currentTarget, "/auth/register");
  });

  $$("[data-view-link]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      setView(element.dataset.viewLink);
    });
  });

  $("#sidebar-open").addEventListener("click", openSidebar);
  $("#sidebar-close").addEventListener("click", closeSidebar);
  $("#sidebar-backdrop").addEventListener("click", closeSidebar);

  $("#new-chat").addEventListener("click", () => startNewChat());
  $("#refresh-sessions").addEventListener("click", loadSessions);

  $("#logout-button").addEventListener("click", () => {
    clearAuthentication();
    showAuth();
    toast("已安全退出");
  });

  $("#session-list").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-session]");
    if (deleteButton) {
      event.stopPropagation();
      deleteSession(deleteButton.dataset.deleteSession);
      return;
    }
    const sessionButton = event.target.closest("[data-session-id]");
    if (sessionButton) {
      openSession(sessionButton.dataset.sessionId);
    }
  });

  $$("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#chat-input").value = button.dataset.prompt;
      resizeChatInput();
      sendChatMessage();
    });
  });

  $("#chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendChatMessage();
  });

  $("#chat-input").addEventListener("input", resizeChatInput);
  $("#chat-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendChatMessage();
    }
  });

  $("#message-list").addEventListener("click", (event) => {
    const copyButton = event.target.closest("[data-copy-message]");
    if (!copyButton) {
      return;
    }
    const message = state.messages.find((item) => item.id === copyButton.dataset.copyMessage);
    copyText(message?.content || "", "回答已复制");
  });

  $("#document-type-grid").addEventListener("change", (event) => {
    if (event.target.name === "document_type") {
      setDocumentType(event.target.value);
    }
  });

  $("#document-form").addEventListener("submit", (event) => {
    event.preventDefault();
    generateDocument();
  });

  $("#copy-document").addEventListener("click", () => {
    copyText($("#document-result").value || state.documentContent, "文书已复制");
  });

  $("#download-document").addEventListener("click", downloadDocument);

  $("#case-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    searchCases();
  });

  $$("[data-case-query]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#case-query").value = button.dataset.caseQuery;
      searchCases();
    });
  });

  $("#case-results").addEventListener("click", (event) => {
    const button = event.target.closest("[data-case-index]");
    if (button) {
      openCaseDrawer(Number(button.dataset.caseIndex));
    }
  });

  $$("[data-close-drawer]").forEach((element) => {
    element.addEventListener("click", closeCaseDrawer);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCaseDrawer();
      closeSidebar();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && state.token) {
      event.preventDefault();
      setView("chat");
      $("#chat-input").focus();
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "n" &&
      state.token
    ) {
      event.preventDefault();
      startNewChat();
    }
  });

  window.addEventListener("online", () => setConnection(true));
  window.addEventListener("offline", () => setConnection(false));
}

async function initialize() {
  bindEvents();
  setTodayLabel();
  setAuthMode("login");
  setDocumentType(state.documentType);
  setConnection(navigator.onLine);

  if (state.token) {
    await showApp();
  } else {
    showAuth();
  }
}

initialize();
