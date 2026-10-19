import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@synthetic": fileURLToPath(new URL("../../packages/synthetic-data", import.meta.url)),
    },
  },
  server: { fs: { allow: ["../.."] } },
  build: { target: "es2023", sourcemap: false, assetsInlineLimit: 0 },
});
