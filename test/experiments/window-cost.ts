// What a wider search costs: the difficulty measure (src/difficulty.ts) on every Bench case's
// record goal, in windows of several margins and lane levels, at a large board budget: the
// sliders it takes in, the fewest it finds, whether it finished, the boards and the time.
//   scripts/capped.sh 3000 3600 bun test/experiments/window-cost.ts <out.json> [limit 200k] [margin:levels,...] [every]
//   bun test/experiments/window-cost.ts report <out.json>
import { requestBoard, fromMove } from "../../src/contract";
import { measure, type MeasureOptions } from "../../src/difficulty";
import type { Case } from "../../bench/cases";
import type { Records } from "../../bench/run";

type Row = { name: string; own: number; runs: { cfg: string; moves: number | null; best: number | null; atLeast: number; searched: number; sliders: number; ms: number }[] };

export function configs(spec: string): (MeasureOptions & { cfg: string })[] {
  return spec.split(",").map((s) => {
    const [m, l] = s.split(":");
    return { cfg: s, margin: Number(m), levels: l === "inf" ? Infinity : Number(l), reach: null };
  });
}

async function run(out: string, limit: number, spec: string, every: number) {
  const dir = new URL("../../bench/", import.meta.url).pathname;
  const cases: Case[] = await Bun.file(`${dir}cases-full.json`).json();
  const records: Records = await Bun.file(`${dir}records.json`).json();
  const rows: Row[] = [];
  for (const [i, c] of cases.entries()) {
    if (i % every) continue;
    const rec = records[c.name];
    if (!rec) continue;
    const board = requestBoard(c.request);
    const goal = { id: rec.goal.red, target: rec.goal.target, solution: rec.goal.moves.map(fromMove) };
    const row: Row = { name: c.name, own: goal.solution.length, runs: [] };
    for (const o of configs(spec)) {
      let sliders = 0;
      const t = performance.now();
      const d = measure(board, goal, { ...o, limit, trace: { window: (w) => (sliders = w.sliders.length) } });
      row.runs.push({ cfg: o.cfg, moves: d.moves, best: d.solution?.length ?? null, atLeast: d.atLeast, searched: d.searched, sliders, ms: performance.now() - t });
    }
    rows.push(row);
    process.stderr.write(`\r${i + 1}/${cases.length}`);
    await Bun.write(out, JSON.stringify(rows));
  }
  process.stderr.write("\n");
}

export const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : NaN;
};

async function report(file: string) {
  const rows: Row[] = await Bun.file(file).json();
  const cfgs = rows[0]!.runs.map((r) => r.cfg);
  // The fewest known per case: the shortest any run found (or the record's own).
  const fewest = rows.map((r) => Math.min(r.own, ...r.runs.map((x) => x.best ?? Infinity)));
  console.log(`${rows.length} cases`);
  console.log("cfg      sliders med/p95  exact  finds fewest  shorter than own  ms med/p95  boards med");
  for (const [k, cfg] of cfgs.entries()) {
    const runs = rows.map((r) => r.runs[k]!);
    const exact = runs.filter((r) => r.moves !== null).length;
    const hit = runs.filter((r, i) => Math.min(r.best ?? Infinity, rows[i]!.own) === fewest[i]).length;
    const shorter = runs.filter((r, i) => (r.best ?? Infinity) < rows[i]!.own).length;
    console.log(`${cfg.padEnd(8)} ${String(pct(runs.map((r) => r.sliders), 0.5)).padStart(4)}/${String(pct(runs.map((r) => r.sliders), 0.95)).padEnd(10)} ${String(exact).padStart(5)}  ${String(hit).padStart(11)}  ${String(shorter).padStart(16)}  ${Math.round(pct(runs.map((r) => r.ms), 0.5))}/${Math.round(pct(runs.map((r) => r.ms), 0.95))}  ${pct(runs.map((r) => r.searched), 0.5)}`);
  }
}

if (import.meta.main) {
  const [a, b, c, d, e] = process.argv.slice(2);
  if (a === "report") await report(b!);
  else await run(a!, Number(b ?? 200_000), c ?? "2:1,5:1,8:1,12:1,5:2,8:2", Number(d ?? 1));
}
