// The levels page (/levels/, the debug UI's list block): every custom level, newest first, made
// from src/trials*.ts by itself (each file's Trial lists and its LEVELS line, src/trials.ts),
// and the testbed. A playlist (trials chained by `next`) is one entry linking its first board;
// a blind pair (labels ending A and B) one entry linking both sides, in no telling order.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Levels, Trial } from "../src/trials";

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type Entry = { date: string; title: string; about: string; links: { label: string; href: string }[] };

/** Every level, newest first. */
export async function levelEntries(src = join(import.meta.dir, "..", "src")): Promise<Entry[]> {
  const files = (await readdir(src)).filter((f) => /^trials.*\.ts$/.test(f)).sort();
  const entries: Entry[] = [];
  for (const f of files) {
    const mod = await import(`${join(src, f)}?build=${Date.now()}`);
    const info: Levels | undefined = mod.LEVELS;
    const trials: Trial[] = Object.values(mod).filter((v): v is Trial[] => Array.isArray(v) && v.length > 0 && typeof v[0]?.label === "string").flat();
    if (!trials.length) continue;
    const date = info?.date ?? "", about = info?.about ?? f;
    const link = (t: Trial) => ({ label: t.label, href: `../?trial=${encodeURIComponent(t.label)}` });
    const chained = new Set(trials.flatMap((t) => (t.next ? [t.label, t.next] : [])));
    const heads = trials.filter((t) => chained.has(t.label) && !trials.some((o) => o.next === t.label));
    for (const h of heads) {
      const chain = [h];
      for (let t = h; t.next; ) {
        const n = trials.find((o) => o.label === t.next);
        if (!n || chain.includes(n)) break;
        chain.push((t = n));
      }
      entries.push({ date, title: `${h.label} to ${chain.at(-1)!.label} (playlist, ${chain.length} levels)`, about, links: [link(h)] });
    }
    const rest = trials.filter((t) => !chained.has(t.label));
    const pairs = new Map<string, Trial[]>();
    for (const t of rest) {
      const m = t.label.match(/^(.*)[AB]$/);
      const key = m ? m[1]! : t.label;
      (pairs.get(key) ?? pairs.set(key, []).get(key)!).push(t);
    }
    for (const [key, ts] of pairs) {
      ts.sort((a, b) => (a.label < b.label ? -1 : 1));
      const title = ts.length > 1 ? `${ts.map((t) => t.label).join(" and ")} (blind pair)` : key;
      entries.push({ date, title, about, links: ts.map(link) });
    }
  }
  entries.push({ date: "2026-11-01", title: "Testbed", about: "A small fixed board with four simple goals in turn, for trying the finish's animations.", links: [{ label: "testbed", href: "../?testbed" }] });
  // Newest first; within a day, as the files list them.
  return entries.map((e, i) => [e, i] as const).sort((a, b) => (a[0].date === b[0].date ? a[1] - b[1] : a[0].date < b[0].date ? 1 : -1)).map((a) => a[0]);
}

export async function levelsPage(src?: string): Promise<string> {
  const rows = (await levelEntries(src)).map((e) => `<li><span class="date">${escape(e.date)}</span> <strong>${escape(e.title)}</strong>: ${e.links.map((l) => `<a href="${escape(l.href)}">${escape(l.label)}</a>`).join(" ")}<br><span class="about">${escape(e.about)}</span></li>`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unblock Me: levels</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1d1d1f;background:#f3f2ee}li{margin:.8rem 0}.date{color:#777;font-variant-numeric:tabular-nums}.about{color:#555}a{margin-right:.4rem}</style>
</head><body>
<h1>Levels</h1>
<p>Custom levels: single boards, blind pairs and playlists, newest first. Each is logged on its own. <a href="../">Back to the game</a></p>
<ul>
${rows.join("\n")}
</ul>
</body></html>
`;
}
