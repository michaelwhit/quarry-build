#!/usr/bin/env node
// Serves apps/web/dist with the security headers the app is designed for. Binds to loopback only;
// a reverse proxy or the static host puts HTTPS in front of it.
// Usage: node scripts/serve.mjs [port]   (default 5180)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { CSP } from "./csp.mjs";

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
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000",
  };
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/"));
  let file = join(root, path === "/" ? "index.html" : path);
  if (!file.startsWith(root)) {
    res.writeHead(403, headers).end();
    return;
  }
  try {
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = join(root, "index.html");
      body = await readFile(file);
    }
    const noStore = file.endsWith("index.html") || file.endsWith("sw.js");
    res.writeHead(200, {
      ...headers,
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": noStore ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(body);
  } catch {
    res.writeHead(404, headers).end();
  }
});

const port = Number(process.argv[2] ?? 5180);
server.listen(port, "127.0.0.1", () => console.log(`GoalLine web on http://127.0.0.1:${port}`));
