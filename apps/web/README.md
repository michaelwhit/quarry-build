# Demo App web (Track 7)

Installable web app (PWA) for Windows (Edge or Chrome "Install app") and phones ("Add to Home
Screen"). **Fake data only** until the district privacy agreement and managed browsers (T7-6).

- Vite, React, TypeScript. Two runtime dependencies (react, react-dom); graphs are plain SVG.
- Slice one reads the bundled synthetic district (`packages/synthetic-data`), nothing is fetched,
  nothing is stored in the browser, and the service worker caches the app shell only.
- Tokens (Midnight, derived light) live in `src/tokens.css`; values are provisional until Track 3
  hands over the Demo App tokens.
- No inline scripts or styles. `scripts/csp.mjs` is the one policy; `scripts/serve.mjs` sends it
  with the other security headers and `pnpm --filter @iep/web check:csp` gates the build on it.

```sh
pnpm install
pnpm --filter @iep/web dev        # http://localhost:5173
pnpm --filter @iep/web build && node apps/web/scripts/serve.mjs 5180
```

Private link on the Mac mini: see `sprints/device-queue.md` (tailnet only, never Funnel).
