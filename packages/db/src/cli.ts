import pg from "pg";
import { migrate } from "./index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const m of await migrate(client)) {
    console.warn(`${m.appliedNow ? "applied" : "skipped"} ${m.name}`);
  }
} finally {
  await client.end();
}
