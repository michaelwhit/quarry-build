import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@synthetic": fileURLToPath(new URL("../../packages/synthetic-data", import.meta.url)),
    },
  },
  test: { environment: "node" },
});
