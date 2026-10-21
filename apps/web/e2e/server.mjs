// Test-only static server for apps/web/dist. Like a static host it serves a folder's index.html
// (so /tour/ is the tour) and answers 404 for anything missing; it sends the app's own
// Content-Security-Policy so a policy violation shows up in the browser console during the tests.
// Binds to loopback only. Usage: node e2e/server.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { CSP } from "../scripts/csp.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const headers = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/"));
    let file = join(root, path);
    if (!file.startsWith(root)) {
      res.writeHead(403, headers).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      ...headers,
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, headers).end();
  }
});

server.listen(Number(process.argv[2] ?? 4179), "127.0.0.1");
