import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string | null;
const cwd = process.cwd();
const artifacts = join(cwd, "artifacts");

const [typecheck, tests] = await Promise.all([runBun(["run", "typecheck"]), runBun(["test"])]);
const playback = JSON.parse(await runNode(["scripts/web-playwright.mjs", "--record", "--human", "--json"])) as { desktopVideoPath?: string; mobileVideoPath?: string; generatedSeed: string; videoDir?: string };
if (!playback.desktopVideoPath || !playback.mobileVideoPath) throw new Error("Playwright did not create both verification videos.");

await mkdir(artifacts, { recursive: true });
const desktopMp4 = join(artifacts, "web-desktop.mp4");
const mobileMp4 = join(artifacts, "web-mobile.mp4");
try {
  await Promise.all([encode(playback.desktopVideoPath, desktopMp4), encode(playback.mobileVideoPath, mobileMp4)]);
  const [desktop, mobile] = await Promise.all([readFile(desktopMp4), readFile(mobileMp4)]);
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = reportHtml({ commit, desktop: desktop.toString("base64"), mobile: mobile.toString("base64"), generatedSeed: playback.generatedSeed, tests, typecheck });
  const report = join(artifacts, "web-mvp-verification.html");
  await writeFile(report, html);
  console.log(`Report: ${report}\nDesktop and mobile Playwright videos are embedded.`);
} finally {
  if (playback.videoDir) await rm(playback.videoDir, { recursive: true, force: true });
}

async function encode(input: string, output: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg-static is unavailable.");
  await exec(ffmpegPath, ["-y", "-i", input, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
}

async function runBun(args: string[]): Promise<string> {
  const result = await exec("bun", args, { cwd });
  return `${result.stdout}${result.stderr}`;
}

async function runNode(args: string[]): Promise<string> {
  const result = await exec("node", args, { cwd });
  return result.stdout.trim();
}

function reportHtml(data: { commit: string; desktop: string; mobile: string; generatedSeed: string; tests: string; typecheck: string }): string {
  const escaped = (value: string) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
  const summary = (value: string) => value.match(/(\d+) pass/)?.[0] ?? "completed";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unblock Me web MVP verification</title><style>body{margin:0;background:#f5f7fb;color:#142033;font:16px/1.45 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:14px}section{margin:14px 0;padding:14px;background:white;border-radius:10px}video,pre{max-width:100%;width:100%}pre{overflow:auto;white-space:pre-wrap;background:#11151c;color:#e9eef7;padding:10px}.pass{color:green;font-weight:700}@media(max-width:412px){main{padding:9px}section{padding:10px}}</style></head><body><main><h1>Unblock Me web MVP verification</h1><p>Commit <code>${escaped(data.commit)}</code>. This standalone report embeds both recordings and opens without a server.</p><section><h2>Scope</h2><p>Finite browser puzzle with one-cell pointer dragging, seeded solvable generated levels, and GitHub Pages deployment. Keyboard controls and Infinite World generation remain deferred.</p></section><section><h2>Verification results</h2><p class="pass">Typecheck passed; automated tests ${summary(data.tests)}; Playwright completed both flows.</p><ul><li>Desktop: real Playwright mouse drags move A, B, then Red Block into the Checkpoint.</li><li>Phone emulation: Playwright CDP touch drags complete the same puzzle; a Playwright touch tap creates ${escaped(data.generatedSeed)}.</li><li>Generated-level engine: deterministic seeded scramble with a retained proof solution.</li></ul></section><section><h2>Desktop mouse drag</h2><video controls src="data:video/mp4;base64,${data.desktop}"></video></section><section><h2>Mobile touch drag and generated-level tap</h2><video controls src="data:video/mp4;base64,${data.mobile}"></video></section><section><h2>Evidence excerpts</h2><h3>Typecheck</h3><pre>${escaped(data.typecheck)}</pre><h3>Tests</h3><pre>${escaped(data.tests)}</pre></section><section><h2>Deployment</h2><p>The public <code>Zikoat/unblock-me</code> repository builds <code>dist/</code> and deploys it through GitHub Actions on pushes to its default branch.</p></section></main></body></html>`;
}
