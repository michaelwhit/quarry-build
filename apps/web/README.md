# GoalLine web

Installable web app (PWA) for Windows (Edge or Chrome "Install app") and phones ("Add to Home
Screen"). **Fake data only.**

- Vite, React, TypeScript. Two runtime dependencies (react, react-dom); graphs are plain SVG.
- Slice one reads the bundled synthetic district (`packages/synthetic-data`), nothing is fetched,
  nothing is stored in the browser, and the service worker caches the app shell only.
- Tokens (Midnight, derived light) live in `src/tokens.css`; values are provisional.
- No inline scripts or styles. `scripts/csp.mjs` is the one policy; `scripts/serve.mjs` sends it
  with the other security headers and `pnpm --filter @iep/web check:csp` gates the build on it.

```sh
pnpm install
pnpm --filter @iep/web dev        # http://localhost:5173
pnpm --filter @iep/web build && node apps/web/scripts/serve.mjs 5180
```

`serve.mjs` binds to loopback only and sends the security headers; put HTTPS in front of it with a reverse proxy, or use the static build in `dist/` on any static host.
