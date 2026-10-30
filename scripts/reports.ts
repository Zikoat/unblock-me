// Reports: Markdown files in reports/ become pages in dist/reports/, with a list of them.
// The Markdown is the plain kind the analyses use: headings, paragraphs, lists, tables,
// code blocks, **bold**, *italic*, `code` and [links](url).
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function inline(text: string): string {
  const code: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_, c: string) => `\u0000${code.push(c) - 1}\u0000`);
  s = escape(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${escape(code[Number(i)]!)}</code>`);
}

/** Markdown to HTML, block by block. */
export function markdown(source: string): string {
  const lines = source.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith("```"); i++) body.push(lines[i]!);
      i++;
      out.push(`<pre><code>${escape(body.join("\n"))}</code></pre>`);
    } else if (/^#{1,4} /.test(line)) {
      const level = line.indexOf(" ");
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
      i++;
    } else if (line.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i]!.trim().startsWith("|"); i++) rows.push(cells(lines[i]!));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && lines[i]!.trim() && !/^#{1,4} /.test(lines[i]!)) {
        const item = lines[i]!.match(/^\s*(?:[-*]|\d+\.) (.*)$/);
        if (item) items.push(item[1]!);
        else items[items.length - 1] += " " + lines[i]!.trim(); // a wrapped item
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i]!.trim() && !/^(#{1,4} |```|\s*([-*]|\d+\.) |\s*\|)/.test(lines[i]!)) para.push(lines[i++]!.trim());
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

const STYLE = `
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --code: #efeee9; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --code: #232321; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 56px; }
  .back { color: var(--ink-2); text-decoration: none; font-size: 14px; }
  h1 { font-size: 24px; line-height: 1.25; margin: 10px 0 16px; }
  h2 { font-size: 19px; margin: 28px 0 8px; }
  h3 { font-size: 16px; margin: 20px 0 6px; }
  p, li { max-width: 68ch; }
  code { font: 13px ui-monospace, monospace; background: var(--code); padding: 1px 4px; border-radius: 4px; }
  pre { background: var(--code); padding: 12px; border-radius: 8px; overflow-x: auto; }
  pre code { padding: 0; }
  .table-wrap { overflow-x: auto; margin: 10px 0 16px; }
  table { border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  th, td { padding: 5px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { color: var(--ink-2); font-weight: 600; }
  ul.list { list-style: none; padding: 0; display: grid; gap: 8px; }
  ul.list a { display: block; padding: 14px 16px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; color: inherit; text-decoration: none; }
  ul.list .meta { display: block; color: var(--ink-2); font-size: 13px; margin-top: 2px; }
  a { color: inherit; }`;

const page = (title: string, back: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>
<a class="back" href="${back}">← ${back === "../" ? "Back to the game" : "All reports"}</a>
${body}
</main></body>
</html>
`;

/** Write every report in `from` (Markdown) to `to` (HTML), and the list of them. */
export async function buildReports(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });
  const reports: { file: string; title: string; changed: Date }[] = [];
  for (const name of (await readdir(from).catch(() => [])).filter((f) => f.endsWith(".md"))) {
    const md = await readFile(join(from, name), "utf8");
    const title = md.match(/^# (.+)$/m)?.[1] ?? name;
    const file = name.replace(/\.md$/, ".html");
    await Bun.write(join(to, file), page(title, "./", markdown(md)));
    reports.push({ file, title, changed: (await stat(join(from, name))).mtime });
  }
  reports.sort((a, b) => b.changed.getTime() - a.changed.getTime());
  const list = reports.map((r) => `<li><a href="${escape(r.file)}">${inline(r.title)}<span class="meta">${r.changed.toISOString().slice(0, 10)}</span></a></li>`).join("");
  await Bun.write(join(to, "index.html"), page("Unblock Me reports", "../", `<h1>Reports</h1>\n<ul class="list">${list || "<li>No reports yet.</li>"}</ul>`));
}
