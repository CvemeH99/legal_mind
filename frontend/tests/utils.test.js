import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeSseBuffer,
  displayValue,
  escapeHtml,
  extractErrorMessage,
  formatDate,
  formatRichText,
  getInitials,
  normalizeList,
  truncateText,
} from "../src/utils.js";

test("escapeHtml prevents markup injection", () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
  );
});

test("formatDate renders a stable date", () => {
  assert.equal(formatDate("2026-09-25T12:00:00"), "2026.09.25");
});

test("truncateText keeps short text and trims long text", () => {
  assert.equal(truncateText("合法咨询", 10), "合法咨询");
  assert.equal(truncateText("这是一个很长的法律问题", 8), "这是一个很长的…");
});

test("getInitials supports Chinese and empty values", () => {
  assert.equal(getInitials("张三"), "张");
  assert.equal(getInitials(""), "L");
});

test("extractErrorMessage handles common API error shapes", () => {
  assert.equal(extractErrorMessage({ detail: "未登录" }), "未登录");
  assert.equal(
    extractErrorMessage({ detail: [{ msg: "字段必填" }, { msg: "格式错误" }] }),
    "字段必填；格式错误",
  );
  assert.equal(extractErrorMessage(null, "失败"), "失败");
});

test("consumeSseBuffer splits complete events and preserves remainder", () => {
  const result = consumeSseBuffer(
    'data: {"content":"你好"}\n\ndata: {"sources":[]}\n\ndata: {"content":"未完成',
  );
  assert.deepEqual(result.events, ['{"content":"你好"}', '{"sources":[]}']);
  assert.equal(result.remaining, 'data: {"content":"未完成');
});

test("formatRichText escapes markup before applying display formatting", () => {
  const output = formatRichText("<b>重点</b>\n**法律依据**");
  assert.equal(
    output,
    "&lt;b&gt;重点&lt;/b&gt;\n<strong>法律依据</strong>",
  );
});

test("normalizeList and displayValue normalize optional backend fields", () => {
  assert.deepEqual(normalizeList(["民法典", null, "劳动合同法"]), [
    "民法典",
    "劳动合同法",
  ]);
  assert.deepEqual(normalizeList("民法典"), ["民法典"]);
  assert.equal(displayValue(null), "未提供");
});
