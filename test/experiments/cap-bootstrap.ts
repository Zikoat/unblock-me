// The cap per density from cap-tune's per-goal rows: for each (tries, level), the rate at
// each cap at which the reference found a shorter solution than the number shown, the
// smallest cap under 5%, and that cap's spread over bootstrap resamples of the boards.
//   bun test/experiments/cap-bootstrap.ts <rows.jsonl> [target=0.05] [resamples=1000]
import { readFileSync } from "node:fs";

type Row = { tries: number; level: number; seed: number; cap: number; shown: number; exact: boolean; ms: number; refMoves: number | null; refAtLeast: number };
const [file, targetArg, resamplesArg] = process.argv.slice(2);
const target = Number(targetArg ?? 0.05), resamples = Number(resamplesArg ?? 1000);
const rows: Row[] = readFileSync(file!, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const groups = new Map<string, Row[]>();
for (const r of rows) (groups.get(`${r.tries}/${r.level}`) ?? groups.set(`${r.tries}/${r.level}`, []).get(`${r.tries}/${r.level}`)!).push(r);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The reference found a shorter solution than the one shown (unresolved counts as not). */
const shorter = (r: Row) => r.refMoves !== null && r.refMoves < r.shown;
const unresolved = (r: Row) => r.refMoves === null && r.refAtLeast < r.shown;

for (const [key, rs] of [...groups].sort()) {
  const caps = [...new Set(rs.map((r) => r.cap))].sort((a, b) => a - b);
  const seeds = [...new Set(rs.map((r) => r.seed))];
  const bySeed = new Map(seeds.map((s) => [s, new Map(rs.filter((r) => r.seed === s).map((r) => [r.cap, r]))]));
  // The smallest cap whose rate is under target over a set of seeds (Infinity when none).
  const smallest = (set: number[]): number => {
    for (const cap of caps) {
      let n = 0, bad = 0;
      for (const s of set) {
        const r = bySeed.get(s)!.get(cap);
        if (!r) continue;
        n++;
        if (shorter(r)) bad++;
      }
      if (n && bad / n < target) return cap;
    }
    return Infinity;
  };
  console.log(`tries/level ${key}: ${seeds.length} boards`);
  for (const cap of caps) {
    const at = rs.filter((r) => r.cap === cap);
    const bad = at.filter(shorter).length, unk = at.filter(unresolved).length, exact = at.filter((r) => r.exact).length;
    const ms = at.reduce((a, r) => a + r.ms, 0) / at.length, worst = Math.max(...at.map((r) => r.ms));
    console.log(`  cap ${String(cap).padStart(8)}: shorter ${((100 * bad) / at.length).toFixed(1)}% (${bad}/${at.length}), unresolved ${unk}, exact ${exact}, ${ms.toFixed(0)}ms/goal (worst ${worst.toFixed(0)})`);
  }
  const next = rng(1);
  const picks: number[] = [];
  for (let b = 0; b < resamples; b++) picks.push(smallest(seeds.map(() => seeds[Math.floor(next() * seeds.length)]!)));
  picks.sort((a, b) => a - b);
  const q = (p: number) => picks[Math.min(picks.length - 1, Math.floor(p * picks.length))];
  console.log(`  smallest cap under ${target * 100}%: ${smallest(seeds)}; bootstrap p10 ${q(0.1)} p25 ${q(0.25)} median ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)}`);
}
