export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDate(value, withTime = false) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];

  if (!withTime) {
    return parts.join(".");
  }

  return `${parts.join(".")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function formatMessageTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function truncateText(value, maxLength = 30) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function getInitials(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "L";
  }
  return Array.from(text)[0].toUpperCase();
}

export function extractErrorMessage(payload, fallback = "请求处理失败") {
  if (!payload) {
    return fallback;
  }

  if (typeof payload === "string") {
    return payload || fallback;
  }

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    return payload.detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join("；");
  }

  return payload.message || fallback;
}

export function consumeSseBuffer(buffer) {
  const events = [];
  let remaining = buffer;
  let boundary = remaining.indexOf("\n\n");

  while (boundary !== -1) {
    const block = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        events.push(line.slice(5).trimStart());
      }
    }

    boundary = remaining.indexOf("\n\n");
  }

  return { events, remaining };
}

export function formatRichText(value) {
  return escapeHtml(value)
    .replace(/^###\s+(.+)$/gm, '<strong class="message-heading">$1</strong>')
    .replace(/^##\s+(.+)$/gm, '<strong class="message-heading">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-•]\s+(.+)$/gm, '<span class="message-bullet">• $1</span>');
}

export function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

export function displayValue(value, fallback = "未提供") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}
