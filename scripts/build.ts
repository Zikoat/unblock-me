import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = join(root, "dist");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, "src", "main.ts")],
  outdir,
  target: "browser",
  naming: "app.js",
  minify: true,
});
if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"));
await Bun.write(join(outdir, "index.html"), Bun.file(join(root, "src", "index.html")));
console.log(`Built ${outdir}`);
