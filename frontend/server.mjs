import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "localhost";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    send(response, 400, "Bad request");
    return;
  }

  if (request.url === "/health") {
    send(response, 200, "ok");
    return;
  }

  const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(root, relativePath);

  if (!filePath.startsWith(resolve(root) + sep)) {
    send(response, 403, "Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    const finalPath = fileStat.isDirectory() ? resolve(filePath, "index.html") : filePath;
    const content = await readFile(finalPath);
    send(
      response,
      200,
      content,
      mimeTypes[extname(finalPath).toLowerCase()] || "application/octet-stream",
    );
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      try {
        const fallback = await readFile(resolve(root, "index.html"));
        send(response, 200, fallback, mimeTypes[".html"]);
      } catch {
        send(response, 404, "Not found");
      }
      return;
    }
    send(response, 500, "Internal server error");
  }
});

server.listen(port, host, () => {
  console.log(`LegalMind frontend: http://${host}:${port}`);
});
