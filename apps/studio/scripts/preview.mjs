import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve(import.meta.dirname, "../build/client");
const port = Number(process.env.PORT ?? 3001);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const asset =
      pathname.startsWith("/assets/") ||
      pathname.startsWith("/__zerospin/") ||
      pathname.startsWith("/_vercel/");
    const file = resolve(root, "." + pathname.replace(/^\/assets\//, "/"));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const exists = await stat(file).then(
      (entry) => entry.isFile(),
      () => false,
    );
    if (!exists && asset) {
      response.writeHead(404).end();
      return;
    }
    const target = exists ? file : resolve(root, "index.html");
    response.writeHead(200, {
      "Content-Type": mime[extname(target)] ?? "application/octet-stream",
    });
    response.end(await readFile(target));
  } catch {
    response.writeHead(500).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`Ready on http://127.0.0.1:${port}`));
