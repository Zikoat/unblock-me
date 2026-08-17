import { execFile } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { homeHtml } from "../src/web/home";
import { pageHtml } from "../src/web/page";

const outdir = join(import.meta.dir, "..", "dist");
const exec = promisify(execFile);
const sourceCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: join(import.meta.dir, "..") })).stdout.trim();
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const appOutdir = join(outdir, "app");
await mkdir(appOutdir, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "..", "src", "web", "client.ts")],
  outdir: appOutdir,
  target: "browser",
  naming: "app.js",
  define: { __SOURCE_COMMIT__: JSON.stringify(sourceCommit) },
});
if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"));
await Bun.write(join(outdir, "index.html"), homeHtml);
await Bun.write(join(appOutdir, "index.html"), pageHtml);
await cp(join(import.meta.dir, "..", "static"), outdir, { recursive: true });
console.log(`Built web app in ${outdir}`);
