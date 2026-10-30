// Builds dist/. With --watch, rebuilds whenever something in src/ changes; open pages
// notice the new build id in dist/build.txt and reload themselves.
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const src = join(root, "src");
const outdir = join(root, "dist");

async function build(): Promise<void> {
  const id = Date.now().toString(36);
  await mkdir(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(src, "main.ts")],
    outdir,
    target: "browser",
    naming: "app.js",
    minify: true,
    define: { __BUILD_ID__: JSON.stringify(id) },
  });
  const worker = await Bun.build({
    entrypoints: [join(src, "goal-worker.ts")],
    outdir,
    target: "browser",
    naming: "goal-worker.js",
    minify: true,
  });
  for (const r of [result, worker]) if (!r.success) throw new Error(r.logs.map((log) => log.message).join("\n"));
  await Bun.write(join(outdir, "index.html"), Bun.file(join(src, "index.html")));
  // Written last, so a page only reloads once the new app is complete.
  await Bun.write(join(outdir, "build.txt"), id);
  console.log(`Built ${outdir} (${id})`);
}

await build();

if (process.argv.includes("--watch")) {
  let timer: Timer | undefined;
  watch(src, { recursive: true }, () => {
    // Editors write in several steps; build once they are done.
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(String(e))), 150);
  });
  console.log(`Watching ${src}`);
}
