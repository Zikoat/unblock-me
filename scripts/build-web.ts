import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pageHtml } from "../src/web/page";

const outdir = join(import.meta.dir, "..", "dist");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const result = await Bun.build({ entrypoints: [join(import.meta.dir, "..", "src", "web", "client.ts")], outdir, target: "browser" });
if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"));
await Bun.write(join(outdir, "index.html"), pageHtml);
console.log(`Built web app in ${outdir}`);
