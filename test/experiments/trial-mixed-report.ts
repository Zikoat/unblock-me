// reports/trial-mixed.html: how mixed the come-back moves are on every trial, against the blind
// verdicts and the play logs; pulling world blocks into open rooms; the K trials' answer key.
// Reads data/trial-mixed.json (trial-mixed.ts), data/open-gen/pulled.jsonl (open-pull.ts) and
// data/open-gen/trials-k.json (open-pull-trials.ts).
//   bun test/experiments/trial-mixed-report.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Trial } from "../../src/trials";
import { type Key, mixed, type Range } from "./mixed-core";

type Row = { label: string; how: string; fewest: number; exact: boolean; mixedExact: boolean; solutions: number; sampled: boolean; mix: Record<Key, Range>; proofMix: Record<Key, Range>; ms: number; play: { moves: number; solve: number; time: number; think: number; back: number; undos: number } | null };
const rows: Row[] = JSON.parse(readFileSync("data/trial-mixed.json", "utf8"));
const by = new Map(rows.map((r) => [r.label, r]));

// The verdict order, best/hardest first: trial-features.html's twelve, the H and J pairs placed
// by their quotes and play logs (my reading; soft in the middle).
const ORDER = ["12A", "J1B", "16B", "M1A", "G2A", "H1A", "H1B", "G1A", "H2B", "16A", "H3A", "8A", "H3B", "8B", "M1B", "G1B", "J1A", "H2A", "12B", "G2B"];
// The blind pairs, the preferred side first; slight: the quotes call them only a little apart.
const PAIRS: { win: string; lose: string; slight: boolean }[] = [
  { win: "8A", lose: "8B", slight: true }, { win: "12A", lose: "12B", slight: false }, { win: "16B", lose: "16A", slight: false },
  { win: "M1A", lose: "M1B", slight: false }, { win: "G1A", lose: "G1B", slight: true }, { win: "G2A", lose: "G2B", slight: false },
  { win: "H2B", lose: "H2A", slight: false }, { win: "H3A", lose: "H3B", slight: true }, { win: "J1B", lose: "J1A", slight: false },
];
// H1 felt about equal (not a pair here).

/** The number picked: red's moves while another block is still out, plus trips that cross; the
 * least over every shortest solution (what the simplest way through still has). */
const MIXED = (m: Record<Key, Range>) => m.redBetween.min + m.crossing.min;

type Num = { h: string; def: string; v: (r: Row) => number; show?: (r: Row) => string };
const rng = (x: Range) => (x.min === x.max ? `${x.min}` : `${x.min}–${x.max}`);
const k = (key: Key, h: string, def: string): Num => ({ h, def, v: (r) => r.mix[key].mean, show: (r) => rng(r.mix[key]) });
const NUMS: Num[] = [
  k("extra", "Extra moves", "how many moves are come-backs: for each block, its moves less one, red included (the earlier measure)."),
  k("red", "Red moves", "how often red moves."),
  k("redBetween", "Red in between", "red's moves, before its last, made while some other block is still out and has to come back. 0: red moves once, at the end, or only when everything is back in place."),
  k("third", "Past out-and-back", "moves beyond a plain out-and-back: for each block (red too), its moves less two, if more than two. A block that is moved out, back, and out again counts 1."),
  k("open", "Out at once", "the most blocks (not red) moved and still to come back, at one time: how much to keep in mind."),
  k("waves", "Waves", "separate rounds of clearing and putting back: how often the count of blocks still to come back rises from none."),
  k("crossing", "Crossing trips", "pairs of trips that cross. A trip is a block's way from one of its moves to its next (out, then back). Two trips cross when the second starts while the first is out and the first comes back while the second is still out: put back in a different order than taken out, A out, B out, A back, B back."),
  k("nested", "Nested trips", "pairs of trips one inside the other, like brackets: A out, B out, B back, A back. The tidy kind of come-back."),
  k("outOfOrder", "Back out of order", "come-backs made while a block moved later is still out: the stack-like order (last out, first back) broken."),
  k("span", "Longest trip", "the most come-back moves (of any block, red's too) between the two ends of one trip: how long a block stays out."),
  { h: "Mixed", def: "the number picked: Red in between + Crossing trips, the least over every shortest solution (the simplest way through still has this much). 0 for one tidy wave, whatever its size.", v: (r) => MIXED(r.mix), show: (r) => `${MIXED(r.mix)}` },
  { h: "Mixed share", def: "Mixed / extra moves (0 with no extra moves): how much of the come-back work is mixed rather than tidy.", v: (r) => (r.mix.extra.mean ? MIXED(r.mix) / r.mix.extra.mean : 0), show: (r) => (r.mix.extra.mean ? (MIXED(r.mix) / r.mix.extra.mean).toFixed(2) : "0") },
  { h: "Fewest", def: "the fewest moves (for comparison).", v: (r) => r.fewest },
];

function ranks(v: number[]): number[] {
  const o = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(v.length);
  for (let i = 0; i < o.length; ) {
    let j = i;
    while (j + 1 < o.length && o[j + 1]![0] === o[i]![0]) j++;
    for (let q = i; q <= j; q++) r[o[q]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b), n = a.length, m = (n + 1) / 2;
  let x = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) ((x += (ra[i]! - m) * (rb[i]! - m)), (da += (ra[i]! - m) ** 2), (db += (rb[i]! - m) ** 2));
  return da && db ? x / Math.sqrt(da * db) : 0;
}
const logged = ORDER.filter((l) => by.get(l)!.play);
const scores = NUMS.map((n) => {
  const rho = spearman(ORDER.map((l) => n.v(by.get(l)!)), ORDER.map((_, i) => ORDER.length - i));
  let right = 0, wrong = 0, tie = 0, clear = 0, clearOf = 0;
  for (const p of PAIRS) {
    const d = n.v(by.get(p.win)!) - n.v(by.get(p.lose)!);
    if (Math.abs(d) < 1e-9) tie++; else if (d > 0) right++; else wrong++;
    if (!p.slight) ((clearOf++), d > 1e-9 && clear++);
  }
  const solve = spearman(logged.map((l) => n.v(by.get(l)!)), logged.map((l) => by.get(l)!.play!.solve));
  const per = spearman(logged.map((l) => n.v(by.get(l)!)), logged.map((l) => by.get(l)!.play!.moves / by.get(l)!.fewest));
  return { n, rho, right, wrong, tie, clear, clearOf, solve, per };
});
for (const s of scores) console.log(s.n.h.padEnd(18), s.rho.toFixed(2), `${s.right}/${s.wrong}/${s.tie}`, `clear ${s.clear}/${s.clearOf}`, s.solve.toFixed(2), s.per.toFixed(2));

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const f2 = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);

// The five solutions in the brief, letters per block, R red.
const EXAMPLES: [string, string, string][] = [
  ["J1A", "A B C D E R E C D B A F G R", "felt simple: one wave, 16 moves in 18 s"],
  ["12A", "A B C D R F R D C B D R", "the favourite"],
  ["G2A", "A R C D C R A R E C F D G R", "liked"],
  ["16B", "A B C D E F E D C G H B A B I R", "liked over 16A"],
  ["G1B", "A B C D E R G R E C A E R", "6 extra, felt slightly easier than G1A with none"],
];
const exRows = EXAMPLES.map(([l, s, note]) => ({ l, s, note, m: mixed(s.split(" ").map((c) => c.charCodeAt(0)), "R".charCodeAt(0)) }));

// Chart: per pair, the preferred side and the other on one number, two panels side by side.
function pairChart(title: string, v: (r: Row) => number, max: number) {
  const W = 330, rowH = 26, T = 30, L = 74, Rm = 16, H = T + PAIRS.length * rowH + 34;
  const X = (x: number) => L + (x / max) * (W - L - Rm);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${esc(title)} per blind pair"><text x="${L}" y="16" font-size="13" font-weight="600" fill="var(--ink)">${esc(title)}</text>`;
  for (let t = 0; t <= max; t += max > 8 ? 2 : 1) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${T - 6}" y2="${H - 30}" stroke="var(--line)"/><text class="ax" x="${X(t)}" y="${H - 16}" text-anchor="middle">${t}</text>`;
  PAIRS.forEach((p, i) => {
    const y = T + i * rowH + rowH / 2, a = v(by.get(p.win)!), b = v(by.get(p.lose)!);
    const ok = a > b + 1e-9 ? "right" : a < b - 1e-9 ? "wrong" : "tie";
    s += `<text class="ax" x="${L - 8}" y="${y + 4}" text-anchor="end">${p.win.slice(0, -1)}${p.slight ? " (slight)" : ""}</text>`;
    s += `<line x1="${X(Math.min(a, b))}" x2="${X(Math.max(a, b))}" y1="${y}" y2="${y}" stroke="var(--ink-2)" stroke-width="2"/>`;
    s += `<circle cx="${X(b)}" cy="${y}" r="6.5" fill="none" stroke="var(--s2)" stroke-width="2.5"><title>${p.lose} (other side): ${b.toFixed(1)}</title></circle>`;
    s += `<circle cx="${X(a)}" cy="${y}" r="4" fill="var(--s1)"><title>${p.win} (preferred): ${a.toFixed(1)} (${ok})</title></circle>`;
  });
  return s + `<text class="ax" x="${(L + W - Rm) / 2}" y="${H - 2}" text-anchor="middle">${esc(title.toLowerCase())}</text></svg>`;
}

// Chart: every trial, extra moves across and mixed up, coloured by how it was judged.
function scatter() {
  const W = 900, H = 340, L = 50, B = 44, T = 14, Rm = 200, maxX = 8, maxY = 7;
  const X = (x: number) => L + (x / maxX) * (W - L - Rm), Y = (y: number) => H - B - (y / maxY) * (H - B - T);
  const side = new Map<string, "won" | "lost" | "even">();
  for (const p of PAIRS) (side.set(p.win, "won"), side.set(p.lose, "lost"));
  side.set("H1A", "even"); side.set("H1B", "even");
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Mixed against extra moves, every trial">`;
  for (let x = 0; x <= maxX; x++) s += `<line x1="${X(x)}" x2="${X(x)}" y1="${T}" y2="${H - B}" stroke="var(--line)"/><text class="ax" x="${X(x)}" y="${H - B + 16}" text-anchor="middle">${x}</text>`;
  for (let y = 0; y <= maxY; y++) s += `<line x1="${L}" x2="${W - Rm}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--line)"/><text class="ax" x="${L - 8}" y="${Y(y) + 4}" text-anchor="end">${y}</text>`;
  // Points sharing a spot are set side by side, their labels stacked to the right.
  const at = new Map<string, string[]>();
  for (const r of rows.filter((r) => side.has(r.label))) {
    const key = `${r.mix.extra.mean.toFixed(1)},${MIXED(r.mix)}`;
    (at.get(key) ?? at.set(key, []).get(key)!).push(r.label);
  }
  for (const [key, labels] of at) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    labels.forEach((l, n) => {
      const c = side.get(l) === "won" ? "var(--s1)" : side.get(l) === "lost" ? "var(--s2)" : "var(--ink-2)";
      const cx = X(x) + n * 9;
      s += `<circle cx="${cx}" cy="${Y(y)}" r="4" fill="${c}"><title>${l}: ${x} extra, mixed ${y} (${side.get(l)})</title></circle>`;
    });
    const long = labels.length > 3; // a long row of dots: its labels above it
    s += `<text x="${long ? X(x) - 4 : X(x) + labels.length * 9 + 2}" y="${long ? Y(y) - 10 : Y(y) + 4}" font-size="11" fill="var(--ink)">${labels.join(" ")}</text>`;
  }
  return s + `<text class="ax" x="${(L + W - Rm) / 2}" y="${H - 6}" text-anchor="middle">extra moves (mean over shortest solutions)</text><text class="ax" transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">mixed (least over shortest solutions)</text></svg>`;
}

// Pulling world blocks in (open-pull.ts).
type Pulled = { from: string; pulls: number; adds: boolean; moved: { i: number; from: number; to: number }[]; tried: number; ms: number; fewest: number; extra: number; extraMax: number; mix: Record<Key, Range>; solutions: number };
const pulled: Pulled[] = existsSync("data/open-gen/pulled.jsonl") ? readFileSync("data/open-gen/pulled.jsonl", "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const pullLog = existsSync("data/open-gen/pulled.log") ? readFileSync("data/open-gen/pulled.log", "utf8") : "";
const sumOf = (re: RegExp) => [...pullLog.matchAll(re)].reduce((t, m) => t + Number(m[1]), 0);
const candidates = sumOf(/(\d+) candidates/g), adding = sumOf(/(\d+) adding on the upper bound/g), tooBig = sumOf(/(\d+) too big to search/g);
const fullCap = (pullLog.match(/^ {4}.*: lower cap/gm) ?? []).length;
const notExact = (pullLog.match(/not exact as it was/g) ?? []).length, noCands = (pullLog.match(/\(0 candidates/g) ?? []).length;
const pullBase = new Map(pulled.filter((p) => p.pulls === 0).map((p) => [p.from, p]));
const pullRows = pulled.filter((p) => p.pulls > 0);
const pullMs = pulled.length ? Math.max(...pulled.map((p) => p.ms)) : 0;
const lastMs = new Map<string, number>();
for (const p of pulled) lastMs.set(p.from, Math.max(lastMs.get(p.from) ?? 0, p.ms));
const pullTotal = (Number(pullLog.match(/^TOTAL (\d+)/m)?.[1] ?? [...lastMs.values()].reduce((a, b) => a + b, 0) / 1000) / 60).toFixed(0);

// The K trials (open-pull-trials.ts).
type KTrial = Trial & { side: string; extra: number; extraMax: number; mixedMin: number; mix: Record<Key, Range>; pulled: number; from: string; box: { x: number; y: number; width: number; height: number }; room: { x: number; y: number; width: number; height: number } };
const kTrials: KTrial[] = existsSync("data/open-gen/trials-k.json") ? JSON.parse(readFileSync("data/open-gen/trials-k.json", "utf8")) : [];
function pic(t: KTrial, cell = 18) {
  const { blocks, red, target, solution, box, room } = t;
  const X = (x: number) => (x - box.x + 1) * cell, Y = (y: number) => (y - box.y + 1) * cell;
  const times = new Map<string, number>();
  solution.forEach((m) => times.set(m.id, (times.get(m.id) ?? 0) + 1));
  let s = `<svg viewBox="0 0 ${(box.width + 2) * cell} ${(box.height + 2) * cell}" width="${(box.width + 2) * cell}" role="img" aria-label="board ${t.label}">`;
  for (const b of blocks) {
    if (b.wall) { s += `<rect x="${X(b.x)}" y="${Y(b.y)}" width="${cell}" height="${cell}" fill="var(--wall)"/>`; continue; }
    const n = times.get(b.id!) ?? 0, fill = b.id === red ? "var(--red)" : n > 1 ? "var(--again)" : n ? "var(--once)" : "var(--still)";
    s += `<rect x="${X(b.x) + 2}" y="${Y(b.y) + 2}" width="${b.w * cell - 4}" height="${b.h * cell - 4}" rx="4" fill="${fill}"/>`;
    if (n > 1) s += `<text x="${X(b.x) + (b.w * cell) / 2}" y="${Y(b.y) + (b.h * cell) / 2 + 4}" text-anchor="middle" font-size="11" fill="#1d1d1f">${n}</text>`;
    if (b.id?.startsWith("p")) s += `<rect x="${X(b.x) + 2}" y="${Y(b.y) + 2}" width="${b.w * cell - 4}" height="${b.h * cell - 4}" rx="4" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  }
  s += `<rect x="${X(room.x)}" y="${Y(room.y)}" width="${room.width * cell}" height="${room.height * cell}" fill="none" stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  const r = blocks.find((b) => b.id === red)!;
  return s + `<rect x="${X(target.x) + 1}" y="${Y(target.y) + 1}" width="${r.w * cell - 2}" height="${r.h * cell - 2}" rx="5" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-dasharray="5 3"/></svg>`;
}
const letters = (t: KTrial) => {
  const name = new Map<string, string>();
  return t.solution.map((m) => (m.id === t.red ? "R" : name.get(m.id) ?? (name.set(m.id, "ABCDEFGHIJKLMNOPQSTUVWXYZ"[name.size]!), name.get(m.id)!))).join(" ");
};
const kPairs = [...new Set(kTrials.map((t) => t.label.slice(0, 2)))];

const best = scores.find((s) => s.n.h === "Mixed")!, extra = scores.find((s) => s.n.h === "Extra moves")!;
const ordered = ORDER.map((l) => by.get(l)!);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mixed come-backs: the order of the extra moves</title>
<meta name="date" content="${new Date().toISOString().slice(0, 10)}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --wall: #55524b; --red: #e0453a; --again: #f2b632; --once: #8fb3d9; --still: #d8d4ca; --s1: #2a78d6; --s2: #eb6834; --good: #2f7d4f; --bad: #b0413e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --wall: #8a877f; --still: #4a4944; --s1: #3987e5; --s2: #d95926; --good: #6cc08f; --bad: #e07a76; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 56px; }
  h1 { font-size: 24px; margin: 10px 0 4px; } h2 { font-size: 19px; margin: 34px 0 8px; }
  .sub, ul, dl { max-width: 90ch; } .sub { color: var(--ink-2); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; overflow-x: auto; margin-bottom: 10px; }
  table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 8px; border-bottom: 1px solid var(--line); text-align: right; vertical-align: top; }
  td.l, th.l { text-align: left; } th { color: var(--ink-2); font-weight: 600; } small { color: var(--ink-2); }
  code { font-size: 13px; }
  dl { font-size: 14px; } dt { font-weight: 600; float: left; clear: left; margin-right: 6px; } dd { margin: 0 0 4px; }
  .good { color: var(--good); font-weight: 600; } .bad { color: var(--bad); }
  .ax { font-size: 11px; fill: var(--ink-2); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; margin-right: 16px; font-size: 13px; color: var(--ink-2); } .legend i { width: 12px; height: 12px; border-radius: 6px; display: inline-block; }
  .charts { display: flex; flex-wrap: wrap; gap: 18px; }
  .links a { display: inline-block; margin: 4px 8px 4px 0; padding: 8px 16px; border-radius: 8px; background: var(--ink); color: var(--bg); text-decoration: none; font-weight: 600; }
  details { margin-top: 18px; } summary { cursor: pointer; font-weight: 600; }
  .boards { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; } figure { margin: 0; } figcaption { font-size: 13px; color: var(--ink-2); max-width: 320px; }
</style></head><body><main>
<p><a href="./">Reports</a> · <a href="trial-features.html">Trial features</a> · <a href="open-gen.html">Open rooms</a></p>
<h1>Mixed come-backs: does the order of the extra moves matter?</h1>
<p class="sub">Extra moves (a block moved again, red included) tracked most blind verdicts but failed J1: J1A, with 6 extra moves, felt simple (16 moves in 18 s), while J1B, with none, felt a lot harder and better (30 moves in 53 s). J1A's 6 extra moves are one tidy wave: clear five blocks, move red, put them back almost mirrored. The favourite, 12A, moves red three times between its come-backs. The idea tested here: what feels hard is not how many come-backs there are, but how mixed they are. Made by test/experiments/trial-mixed.ts and trial-mixed-report.ts. <strong>Twenty boards and one player: every number here is a hint, not a finding.</strong></p>

<h2>The idea on the five solutions</h2>
<p class="sub">Each on the one solution shown (the tables further down take every shortest solution). Letters are blocks in the order they first move, R is red. Only blocks that move more than once, and red, take part: a block moved once is never "come back to".</p>
<div class="card"><table>
<thead><tr><th class="l">Trial</th><th class="l">Solution</th><th class="l">Felt</th><th>Extra</th><th>Red in between</th><th>Past out-and-back</th><th>Out at once</th><th>Crossing</th><th>Nested</th><th>Back out of order</th><th>Mixed</th></tr></thead>
<tbody>${exRows.map((e) => `<tr><td class="l">${e.l}</td><td class="l"><code>${e.s}</code></td><td class="l">${esc(e.note)}</td><td>${e.m.extra}</td><td>${e.m.redBetween}</td><td>${e.m.third}</td><td>${e.m.open}</td><td>${e.m.crossing}</td><td>${e.m.nested}</td><td>${e.m.outOfOrder}</td><td>${e.m.redBetween + e.m.crossing}</td></tr>`).join("\n")}</tbody>
</table></div>
<p class="sub">J1A and 16B are big, tidy waves: 5 blocks out at once, nearly all their trips nested. 12A, G2A and G1B move red while blocks are still out and put blocks back in a different order. So the numbers split the solutions as hoped. The trouble is G1B: as mixed as 12A, but it felt slightly easier than a board with no extra moves at all.</p>

<h2>The numbers</h2>
<p class="sub">A <b>trip</b> is a block's way from one of its moves to its next: out, then back. Each number is taken over every shortest solution (or a uniform sample of 50,000 where there are more); the tables show its range, the correlations use its mean, except Mixed, which uses its least.</p>
<dl>${NUMS.map((n) => `<dt>${esc(n.h)}</dt><dd>${esc(n.def)}</dd>`).join("")}</dl>

<h2>Every trial</h2>
<p class="sub">In the verdict order, best/hardest first. The order of trial-features.html's twelve is kept; H and J are placed by the quotes and the logs (J1B near the top, "a lot harder and better"; J1A low, "felt simple"; H1A and H1B about equal and slow to solve; H2B over H2A; H3A a little over H3B). The middle is soft; the pairs below are the firmer test. Small grey numbers: how the trial was measured (framed: exactly on its board; open: exactly by the two bounds, in any surroundings; proof: M1A and M1B, too many blocks matter to search, only the trial's own solution).</p>
<div class="card"><table>
<thead><tr><th class="l">Trial</th><th>Place</th>${NUMS.map((n) => `<th>${esc(n.h)}</th>`).join("")}<th>Shortest solutions</th><th>Played moves</th><th>Solve time, s</th></tr></thead>
<tbody>${ordered.map((r, i) => `<tr><td class="l"><strong>${r.label}</strong><br><small>${r.how}</small></td><td>${i + 1}</td>${NUMS.map((n) => `<td>${n.show ? n.show(r) : n.v(r)}</td>`).join("")}<td>${r.solutions.toLocaleString("en")}${r.sampled ? "<br><small>sampled</small>" : ""}</td><td>${r.play ? r.play.moves : "–"}</td><td>${r.play ? Math.round(r.play.solve) : "–"}</td></tr>`).join("\n")}</tbody>
</table></div>

<h2>The pairs</h2>
<p class="sub">Each row a blind pair: <span style="color:var(--s1)">●</span> the side the player preferred (harder/better), <span style="color:var(--s2)">○</span> the other side (a blue dot inside an orange ring: a tie). A number tracks the verdict where the blue dot is to the right. H1 (about equal) is left out.</p>
<div class="card charts">${pairChart("Extra moves", (r) => r.mix.extra.mean, 8)}${pairChart("Mixed", (r) => MIXED(r.mix), 7)}</div>
<p class="sub">Every trial, mixed against extra moves: <span style="color:var(--s1)">●</span> preferred in its pair, <span style="color:var(--s2)">●</span> not, grey: H1, about equal.</p>
<div class="card">${scatter()}</div>

<h2>Which numbers order the trials like the verdicts</h2>
<p class="sub">ρ: Spearman's rank correlation with the verdict order above (n = 20; positive: more of it is better/harder; |ρ| needs about 0.45 to stand out from chance at n = 20, and one player's order doesn't meet the test's assumptions anyway). Pairs: of the ${PAIRS.length} blind pairs, how many it orders as the player did, the wrong way, or tied. Clear pairs: the ${PAIRS.filter((p) => !p.slight).length} the quotes set clearly apart. Last two columns: ρ with the play logs on the ${logged.length} logged trials (seconds from the first move to the goal; played moves over fewest).</p>
<div class="card"><table>
<thead><tr><th class="l">Number</th><th>ρ with the verdicts</th><th>Pairs right / wrong / tied</th><th>Clear pairs right</th><th>ρ with solve time</th><th>ρ with played / fewest</th></tr></thead>
<tbody>${scores.map((s) => `<tr><td class="l">${esc(s.n.h)}</td><td class="${Math.abs(s.rho) >= 0.45 ? "good" : Math.abs(s.rho) < 0.2 ? "bad" : ""}">${f2(s.rho)}</td><td>${s.right} / ${s.wrong} / ${s.tie}</td><td>${s.clear}/${s.clearOf}</td><td>${f2(s.solve)}</td><td>${f2(s.per)}</td></tr>`).join("\n")}</tbody>
</table></div>

<h2>What it says</h2>
<ul>
<li><strong>Mixedness does not beat plain extra moves on these boards.</strong> The number picked, Mixed (red's moves in between plus crossing trips, least over shortest solutions), has ρ ${f2(best.rho)} and orders ${best.right} pairs right, ${best.wrong} wrong and ${best.tie} tied; extra moves has ρ ${f2(extra.rho)} and ${extra.right} right, ${extra.wrong} wrong. None of the mixedness numbers reaches ρ 0.45, and none follows solve time. Twenty boards can't tell these numbers apart.</li>
<li><strong>Where it helps</strong>: it puts J1A low (Mixed ${MIXED(by.get("J1A")!.mix)}, against 12A's ${MIXED(by.get("12A")!.mix)} and G2A's ${MIXED(by.get("G2A")!.mix)}) though J1A has as many extra moves as they do, which fits "one wave felt simple". Mixed is the pick because red moving while blocks are still out, and blocks put back in a different order, is what 12A ("lost track of which blocks I had moved") and G2A have and the tidy waves (J1A, 16B) mostly don't; it is simple to say and to count.</li>
<li><strong>Where it can't help</strong>: J1B has no come-backs at all (0 on every number here), yet it was the harder one. No count of come-backs, mixed or not, can call it harder: what made J1B hard must be something else (it has 94,000+ shortest solutions against J1A's 4, so it's not a forced line; the player made 30 moves for 14). And G1B is as mixed as 12A but was liked less than G1A, which has none (a slight verdict). H2B over H2A is a tie on Mixed (both 0) where extra moves gets it right.</li>
<li><strong>So</strong>: keep extra moves as the main number, and read Mixed as a second one that separates a tidy wave from interleaved come-backs at the same count. The K pairs below hold the count steady and vary only Mixed, which is the test this data can't give.</li>
</ul>

<h2>Pulling world blocks into a room</h2>
<p class="sub">Your idea: take a finished open room (data/open-gen/, the H and J rooms' libraries) and slide world blocks into it, as a player could have, onto empty cells of the room; the puzzle then needs them moved out first. Made by test/experiments/open-pull.ts: every legal slide of a world block that ends on a room cell some shortest solution uses (elsewhere a pulled block is in no one's way), the block then counted as the room's, kept only if open-core.ts's two bounds still agree on the fewest and extra moves and on every mixedness number (so all of them hold in any surroundings); the best pull kept, then a second on top of it.</p>
${pulled.length ? `<ul>
<li><strong>It added almost nothing.</strong> ${pullBase.size + notExact} rooms (${notExact} not exact as made within the search's limit, left out): ${candidates.toLocaleString("en")} pulls tried, each a world block slid onto a room cell some shortest solution uses, after at most one other world move to open its lane. ${noCands} rooms had no such pull at all. ${adding} pulls added a move or mixedness on the upper bound alone (the room's blocks moving, the world frozen; ${tooBig} more too big to search), but only ${pullRows.filter((p) => p.adds).length} of those were proved exactly: ${pullRows.filter((p) => p.adds).map((p) => { const b = pullBase.get(p.from)!; return `${p.from}, ${b.fewest} → ${p.fewest} moves`; }).join(" and ")}, each one move more with the extra moves and mixedness unchanged (the pulled block is moved once, out of the way, so it never comes back). The rest failed the lower bound's limit (${fullCap} of the full checks went past 1.5 million states: a block reaching into the room from the world lets the lower bound try far more ways). A second pull on top never added anything.</li>
<li><strong>Why so little</strong>: the cells a solution needs are inside the room, and the room's edge was opened only where that didn't change its goal: an edge cell next to a lane the solution needs stayed a wall (open-gen.html: "the walls left are the ones guarding the come-back lanes"). So a world block mostly reaches the ring's outer cells, which only some shortest solutions pass; a pulled block there closes those ways and another of the same length is left. And a pulled block is moved once, so it adds to the fewest, never to the come-backs. More from this would need the pull planned with the opening (a lane left open on purpose, its block pulled in onto a come-back lane), not added after it.</li>
<li>Where no pull added, the first exact one is kept anyway (${pullRows.filter((p) => !p.adds).length} rooms): the pulled block sits in the room and closes some ways, every number exact and the same.</li>
<li>Time: ${(pullMs / 1000).toFixed(0)} s for the slowest room; ${pullTotal} minutes for all of them on one core (this VM).</li>
</ul>` : `<p class="sub">Not run yet.</p>`}

<h2>New blind pairs (K)</h2>
${kTrials.length ? `<p class="sub">Each pair: two open rooms with about the same fewest and extra moves, one mixed (red moving while blocks are out, trips crossing) and one a tidy wave, so the pair tests mixedness and not the count. Both exact in any surroundings by the two bounds (fewest, extra and the mixedness numbers), played on the room and 3 cells of the world round it, framed. Play each, note which was harder and which better, then open the key.</p>
${kPairs.map((p) => `<p class="links">Pair ${p}: ${kTrials.filter((t) => t.label.startsWith(p)).map((t) => `<a href="../?trial=${t.label}">${t.label}</a>`).join("")}</p>`).join("\n")}
<details><summary>Answer key (open after playing)</summary>
<div class="card"><table><thead><tr><th class="l">Trial</th><th class="l">Side</th><th>Fewest</th><th>Extra</th><th>Red in between</th><th>Crossing</th><th>Mixed</th><th>Out at once</th><th>Pulled-in blocks</th><th class="l">A shortest solution</th></tr></thead>
<tbody>${kTrials.map((t) => `<tr><td class="l"><a href="../?trial=${t.label}">${t.label}</a></td><td class="l">${t.side}</td><td>${t.fewest}</td><td>${t.extra === t.extraMax ? t.extra : `${t.extra}–${t.extraMax}`}</td><td>${rng(t.mix.redBetween)}</td><td>${rng(t.mix.crossing)}</td><td>${t.mixedMin}</td><td>${rng(t.mix.open)}</td><td>${t.pulled}</td><td class="l"><code>${letters(t)}</code></td></tr>`).join("\n")}</tbody>
</table></div>
<p class="sub">"Tidy" means red never moves while a block is still out and no two trips cross; it can still take two waves with red moving after each (K1A: red moves three times, each time with everything back in place). K1B\'s pulled-in block is moved once, out of the way; it is why K1B needs 15 moves rather than 14.</p>
<p class="sub">The room dashed; red, its target dashed; blue blocks move once in the solution shown, yellow ones more (the number is how often), grey ones not at all; a pulled-in block is outlined.</p>
<div class="boards">${kTrials.map((t) => `<figure>${pic(t)}<figcaption>${t.label}: ${t.side}, ${t.fewest} moves, ${t.extra} extra, mixed ${t.mixedMin}${t.pulled ? `, ${t.pulled} pulled in` : ""}</figcaption></figure>`).join("\n")}</div>
</details>` : `<p class="sub">Not made yet.</p>`}
</main></body></html>
`;
writeFileSync("reports/trial-mixed.html", html);
console.log("reports/trial-mixed.html");
