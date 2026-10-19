# LegalMind Frontend

LegalMind 的零依赖单页前端，已接入后端认证、流式法律问答、会话历史、法律文书生成和案例检索接口。

## 本地启动

```powershell
cd frontend
npm run dev
```

浏览器访问 `http://localhost:5173`。前端默认连接 `http://localhost:8000/api`，该地址与后端默认 CORS 配置一致。

如需连接其他后端地址，可在浏览器控制台执行：

```js
localStorage.setItem("legalmind_api_base", "http://localhost:8000/api");
location.reload();
```

## 测试

```powershell
cd frontend
npm test
```

## 页面

- `智能问答`：流式回答、相关案例引用、历史会话恢复与删除。
- `文书生成`：起诉状、答辩状、合同、律师函和上诉状，支持流式起草、编辑、复制和下载。
- `案例检索`：关键词与案件类型筛选、检索结果列表、案例详情侧栏。

前端不依赖构建工具或第三方运行时包，使用 Node.js 内置 HTTP 服务即可运行。
