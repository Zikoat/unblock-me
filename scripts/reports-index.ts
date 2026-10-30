// dist/reports/index.html: every report in the folder, newest first.
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const reportsDir = join(import.meta.dir, "..", "dist", "reports");

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function writeReportsIndex(): Promise<void> {
  await mkdir(reportsDir, { recursive: true });
  const reports = [];
  for (const file of await readdir(reportsDir)) {
    if (!file.endsWith(".html") || file === "index.html") continue;
    const html = await readFile(join(reportsDir, file), "utf8");
    reports.push({
      file,
      title: html.match(/<title>(.*?)<\/title>/)?.[1] ?? file,
      description: html.match(/<meta name="description" content="(.*?)">/)?.[1] ?? "",
      made: (await stat(join(reportsDir, file))).mtime,
    });
  }
  reports.sort((a, b) => b.made.getTime() - a.made.getTime());
  const rows = reports.map((r) => `
    <li><a href="${escape(r.file)}"><span class="title">${r.title}</span>
      <span class="meta">${r.made.toISOString().slice(0, 16).replace("T", " ")} UTC${r.description ? ` · ${r.description}` : ""}</span></a></li>`).join("");
  await Bun.write(join(reportsDir, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unblock Me reports</title>
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 8px 0 20px; }
  .back { color: var(--ink-2); text-decoration: none; font-size: 14px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li a { display: block; padding: 14px 16px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; color: inherit; text-decoration: none; }
  li a:hover { border-color: var(--ink-2); }
  .title { display: block; font-weight: 600; }
  .meta { display: block; color: var(--ink-2); font-size: 14px; margin-top: 2px; }
  .empty { color: var(--ink-2); }
</style>
</head>
<body>
<main>
  <a class="back" href="../">← Back to the game</a>
  <h1>Reports</h1>
  ${reports.length ? `<ul>${rows}\n  </ul>` : `<p class="empty">No reports yet. Make one with <code>bun run report</code>.</p>`}
</main>
</body>
</html>
`);
}

if (import.meta.main) await writeReportsIndex();
