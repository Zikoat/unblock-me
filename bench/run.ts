// The Bench runner: plays a maker on every case of a set twice (the same Goal both times, or
// it is not deterministic), has the Referee check the Goal, the Auditor look for a shorter
// solution and the Judge score it with the audited count, keeps any record it beats, and
// reports its scores and the Gate's verdict.
//   bun bench/run.ts --maker reference|current|current2 --set quick|full [--only <name part>] [--verbose] [--no-records]
// Results go to bench/results/<maker>-<set>.json (not kept in git); records to records.json.
import { mkdir } from "node:fs/promises";
import type { Goal, Maker, Request } from "../src/contract";
import { judge, type Terms } from "../src/judge";
import { referee, type Verdict } from "../src/referee";
import { audit, type Audit } from "./auditor";
import type { Case } from "./cases";
import { current } from "./current";
import { gate, percentile, type Scores } from "./gate";
import { referenceMaker } from "./reference";

export const MAKERS: Record<string, () => Maker> = {
  reference: () => referenceMaker(),
  /** Today's maker as the player waits for a goal (effort 0), and as goals are made ahead (2). */
  current: () => current(0),
  current2: () => current(2),
};
/** The maker the game ships, which a Contender must be no worse than. */
export const SHIPPING = "current";

export type CaseRecord = { request: string; fitness: number; maker: string; goal: Goal; terms: Terms };
export type Records = { [name: string]: CaseRecord };

export type Result = {
  name: string;
  goal: Goal | null;
  verdict: Verdict | null;
  same: boolean;
  ms: number;
  audit?: Audit;
  terms?: Terms;
  quality: number;
};

/** FNV-1a of a Request's JSON: a record belongs to the case as it was when set. */
export function requestHash(request: Request): string {
  const text = JSON.stringify(request);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** Play `maker` on one case: twice, timed (the quicker of the two, so a first run's warm-up
 * does not count), then refereed, audited and judged. */
export function runCase(name: string, maker: Maker, c: Case, auditLimit?: number): Omit<Result, "quality"> {
  const text = JSON.stringify(c.request);
  let t = performance.now();
  const goal = maker(JSON.parse(text));
  const first = performance.now() - t;
  t = performance.now();
  const again = maker(JSON.parse(text));
  const ms = Math.min(first, performance.now() - t);
  const same = JSON.stringify(goal) === JSON.stringify(again);
  if (!goal) return { name, goal, verdict: null, same, ms };
  const verdict = referee(c.request, goal);
  if (!verdict.ok) return { name, goal, verdict, same, ms };
  const a = audit(c.request, goal, auditLimit);
  return { name, goal, verdict, same, ms, audit: a, terms: judge(c.request, goal, { fewest: a.fewest, shorter: a.shorter?.moves, proved: a.exact }) };
}

/** Update `records` with a result that beats its case's record (or sets the first); true if it did. */
export function keepRecord(records: Records, c: Case, maker: string, r: Omit<Result, "quality">): boolean {
  if (!r.goal || !r.terms) return false;
  const hash = requestHash(c.request), old = records[c.name];
  if (old && old.request === hash && old.fitness >= r.terms.fitness) return false;
  records[c.name] = { request: hash, fitness: r.terms.fitness, maker, goal: r.goal, terms: r.terms };
  return true;
}

/** A maker's scores from its results. */
export function score(maker: string, set: string, results: Result[]): Scores {
  const n = results.length, share = (f: (r: Result) => boolean) => results.filter(f).length / n;
  const padded = results.filter((r) => r.audit && r.audit.padding > 0).map((r) => r.audit!.padding);
  const quality = results.map((r) => r.quality), times = results.map((r) => r.ms);
  return {
    maker, set, cases: n,
    legal: share((r) => !!r.verdict?.ok),
    deterministic: share((r) => r.same),
    quality: { median: percentile(quality, 0.5), worst5: percentile(quality, 0.05) },
    time: { median: percentile(times, 0.5), slowest5: percentile(times, 0.95) },
    padding: { share: padded.length / n, mean: padded.length ? padded.reduce((a, b) => a + b, 0) / padded.length : 0, max: Math.max(0, ...padded) },
  };
}

if (import.meta.main) {
  const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1]! : fallback;
  };
  const makerName = arg("maker", "current"), set = arg("set", "quick"), only = arg("only", "");
  const verbose = process.argv.includes("--verbose"), keep = !process.argv.includes("--no-records");
  if (!MAKERS[makerName]) throw new Error(`no maker ${makerName}: ${Object.keys(MAKERS).join(", ")}`);
  const dir = new URL(".", import.meta.url).pathname;
  const cases: Case[] = (await Bun.file(`${dir}cases-${set}.json`).json()).filter((c: Case) => c.name.includes(only));
  const recordsFile = Bun.file(`${dir}records.json`);
  const records: Records = (await recordsFile.exists()) ? await recordsFile.json() : {};
  const maker = MAKERS[makerName]!();
  const results: Result[] = [];
  let beaten = 0;
  for (const [i, c] of cases.entries()) {
    const r = runCase(c.name, maker, c);
    if (keepRecord(records, c, makerName, r)) beaten++;
    const record = records[c.name];
    const quality = r.terms && record ? r.terms.fitness / record.fitness : 0;
    results.push({ ...r, quality });
    const line = `${c.name}: ${r.goal ? `${r.goal.moves.length} moves` : "none"}${r.verdict && !r.verdict.ok ? ` ILLEGAL rule ${r.verdict.rule}: ${r.verdict.why}` : ""}${r.same ? "" : " NOT DETERMINISTIC"}${r.audit?.padding ? ` padded +${r.audit.padding}` : ""} fitness ${r.terms?.fitness.toFixed(2) ?? "-"} quality ${quality.toFixed(2)} ${Math.round(r.ms)} ms`;
    if (verbose || (r.verdict && !r.verdict.ok) || !r.same) console.log(line);
    else if (process.stderr.isTTY) process.stderr.write(`\r${i + 1}/${cases.length}`);
  }
  if (process.stderr.isTTY) process.stderr.write("\n");
  const scores = score(makerName, set, results);
  await mkdir(`${dir}results`, { recursive: true });
  const shippingFile = Bun.file(`${dir}results/${SHIPPING}-${set}.json`);
  const shipping = makerName !== SHIPPING && (await shippingFile.exists()) ? ((await shippingFile.json()).scores as Scores) : undefined;
  await Bun.write(`${dir}results/${makerName}-${set}${only ? `-${only}` : ""}.json`, JSON.stringify({ scores, results }, null, 1));
  if (keep && beaten) await Bun.write(recordsFile, JSON.stringify(Object.fromEntries(Object.entries(records).sort(([a], [b]) => (a < b ? -1 : 1))), null, 1) + "\n");
  const pc = (x: number) => `${(100 * x).toFixed(1)}%`;
  console.log(`${makerName} on ${set} (${scores.cases} cases)`);
  console.log(`  legal ${pc(scores.legal)}, deterministic ${pc(scores.deterministic)}`);
  console.log(`  quality median ${scores.quality.median.toFixed(3)}, worst 5% ${scores.quality.worst5.toFixed(3)}`);
  console.log(`  time median ${Math.round(scores.time.median)} ms, slowest 5% ${Math.round(scores.time.slowest5)} ms`);
  console.log(`  padding ${pc(scores.padding.share)} of goals, by ${scores.padding.mean.toFixed(1)} moves on average, ${scores.padding.max} at most`);
  console.log(`  records beaten or set: ${beaten}${keep ? "" : " (not kept)"}`);
  const verdict = gate(scores, shipping);
  console.log(`  gate: ${verdict.pass ? "PASS" : "FAIL"}${verdict.fails.map((f) => `\n    - ${f}`).join("")}`);
}
