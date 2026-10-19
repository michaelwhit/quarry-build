import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const app = await buildApp(config);
await app.listen({ port: config.port, host: config.host });
