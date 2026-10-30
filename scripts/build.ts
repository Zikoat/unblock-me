// Builds dist/ (or --out <dir>): the app, and reports/ (Markdown) as pages. With --watch,
// rebuilds whenever something in src/ or reports/ changes; open pages notice the new build
// id in build.txt and reload themselves. COMMIT overrides the commit it records (for a
// build from an exported tree, which has no git).
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildReports } from "./reports";

const root = join(import.meta.dir, "..");
const src = join(root, "src");
const out = process.argv.indexOf("--out");
const outdir = out > 0 ? process.argv[out + 1]! : join(root, "dist");

async function build(): Promise<void> {
  const id = Date.now().toString(36);
  // The commit the code is built from, with "+" when the source has changes not yet
  // committed: play data records it, so each move can be matched to the code it ran on.
  const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: join(src, "..") }).stdout.toString().trim();
  const commit = process.env.COMMIT || (git("rev-parse", "--short", "HEAD") || "unknown") + (git("status", "--porcelain", "--", "src", "scripts") ? "+" : "");
  await mkdir(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(src, "main.ts")],
    outdir,
    target: "browser",
    naming: "app.js",
    minify: true,
    define: { __BUILD_ID__: JSON.stringify(id), __COMMIT__: JSON.stringify(commit) },
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
  await buildReports(join(root, "reports"), join(outdir, "reports"));
  // Written last, so a page only reloads once the new app is complete.
  await Bun.write(join(outdir, "build.txt"), id);
  console.log(`Built ${outdir} (${id})`);
}

await build();

if (process.argv.includes("--watch")) {
  let timer: Timer | undefined;
  const rebuild = () => {
    // Editors write in several steps; build once they are done.
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(String(e))), 150);
  };
  watch(src, { recursive: true }, rebuild);
  watch(join(root, "reports"), rebuild);
  console.log(`Watching ${src} and reports/`);
}
