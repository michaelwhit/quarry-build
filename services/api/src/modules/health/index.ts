import type { FastifyPluginAsync } from "fastify";

export const healthModule: FastifyPluginAsync<{ version: string }> = async (app, opts) => {
  app.get("/healthz", async () => ({ status: "ok" as const, version: opts.version }));
};
