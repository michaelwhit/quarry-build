// Builds the page a second time, into dist-signin, with a sign-in server address so the real
// sign-in screens exist. Nothing listens at that address: the specs answer for it in the browser.
import { build } from "vite";

process.env.VITE_GOALLINE_API_ORIGIN = "http://127.0.0.1:4181";
await build({ logLevel: "warn", build: { outDir: "dist-signin", emptyOutDir: true } });
