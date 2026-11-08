// A Bench run's goals audited and judged again (bench/auditor.ts as it is now) and scored
// against today's records, without making them again: so runs made before a change to the
// Auditor or the records compare with runs made after (their times are kept as measured).
//   bun test/experiments/reaudit.ts <results.json> [set full]
import { judge } from "../../src/judge";
import { audit } from "../../bench/auditor";
import type { Case } from "../../bench/cases";
import { score, type Records, type Result } from "../../bench/run";

const [file, set = "full"] = process.argv.slice(2);
const dir = new URL("../../bench/", import.meta.url).pathname;
const cases: Case[] = await Bun.file(`${dir}cases-${set}.json`).json();
const records: Records = await Bun.file(`${dir}records.json`).json();
const { scores: old, results }: { scores: { maker: string }; results: Result[] } = await Bun.file(file!).json();
for (const r of results) {
  const c = cases.find((c) => c.name === r.name)!;
  if (!r.goal || !r.verdict?.ok) continue;
  r.audit = audit(c.request, r.goal);
  r.terms = judge(c.request, r.goal, { fewest: r.audit.fewest });
  const record = records[r.name];
  r.quality = record ? r.terms.fitness / record.fitness : 0;
}
const s = score(old.maker, set, results);
const pc = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(`${s.maker}: quality median ${s.quality.median.toFixed(3)}, worst 5% ${s.quality.worst5.toFixed(3)}; time median ${Math.round(s.time.median)} ms, slowest 5% ${Math.round(s.time.slowest5)} ms; padding ${pc(s.padding.share)} of goals, by ${s.padding.mean.toFixed(1)} on average, ${s.padding.max} at most`);
