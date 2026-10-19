// Writes fixtures/demo-district.json. With --check, fails if the committed file differs from a
// fresh run (the generator is deterministic, so a diff means someone edited one without the other).
import { readFile, writeFile } from "node:fs/promises";
import { generateDistrict } from "./generate.ts";

const out = new URL("../fixtures/demo-district.json", import.meta.url);
const json = `${JSON.stringify(generateDistrict(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(out, "utf8").catch(() => "");
  if (current !== json) {
    console.error(
      "fixtures/demo-district.json is stale: run pnpm synthetic:generate and commit it",
    );
    process.exit(1);
  }
  console.log("fixtures/demo-district.json is up to date");
} else {
  await writeFile(out, json);
  console.log(`wrote ${out.pathname}`);
}
