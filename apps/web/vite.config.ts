import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { buildOrigin, metaFor } from "./scripts/csp.mjs";

/** Adds the one API origin from the build setting to connect-src in the page's policy. */
function apiOriginPolicy(origin: string): Plugin {
  return {
    name: "goalline-api-origin-policy",
    transformIndexHtml(html) {
      if (origin === "") return html;
      return html.replace(
        /(http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
        `$1${metaFor(origin)}$2`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // Empty for the practice build; a bare https origin when a sign-in server is wired in.
  const origin = buildOrigin(mode);
  return {
    base: "./",
    plugins: [react(), apiOriginPolicy(origin)],
    resolve: {
      alias: {
        "@synthetic": fileURLToPath(new URL("../../packages/synthetic-data", import.meta.url)),
      },
    },
    server: { fs: { allow: ["../.."] } },
    build: { target: "es2023", sourcemap: false, assetsInlineLimit: 0 },
  };
});
