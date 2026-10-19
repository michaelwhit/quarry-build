# GoalLine web

Installable web app (PWA) for Windows (Edge or Chrome "Install app") and phones ("Add to Home
Screen"). **Practice data only**: made-up students, never real ones.

- Vite, React, TypeScript. Two runtime dependencies (react, react-dom); graphs are plain SVG.
- The sample students come from the bundled synthetic district (`packages/synthetic-data`). The
  app starts empty; made-up students, goals and data entered by the user are kept in this
  browser's local storage (key `goalline-practice-v1`, validated when read) and are never sent
  anywhere. The More tab has "Clear practice data". `STORAGE_KIND` in `src/data/workspace.ts`
  switches between local and session storage. Nothing is fetched, and the service worker caches
  the app shell only.
- Design tokens (dark, with a light variant) live in `src/tokens.css`.
- No inline scripts or styles. `scripts/csp.mjs` is the one policy; `scripts/serve.mjs` sends it
  with the other security headers and `pnpm --filter @iep/web check:csp` gates the build on it.

```sh
pnpm install
pnpm --filter @iep/web dev        # http://localhost:5173
pnpm --filter @iep/web build && node apps/web/scripts/serve.mjs 5180
```

`serve.mjs` binds to loopback only and sends the security headers; put HTTPS in front of it with a reverse proxy, or use the static build in `dist/` on any static host.
