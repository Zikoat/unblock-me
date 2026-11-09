// The Records judged again, after a change to the Judge (src/judge.ts): each record's Goal
// scored as the Judge now counts, with its audited fewest; a Goal that moves a block more than
// once is audited again (bench/auditor.ts), for its shorter solution and whether its fewest is
// proved (the extra moves count only then). The Goals stay; a record another Goal would now
// beat waits for a Bench run to find it.
//   bun bench/rejudge.ts
import { judge } from "../src/judge";
import { audit } from "./auditor";
import type { Case } from "./cases";
import type { Records } from "./run";

const dir = new URL(".", import.meta.url).pathname;
const cases = new Map(((await Bun.file(`${dir}cases-full.json`).json()) as Case[]).map((c) => [c.name, c]));
const file = Bun.file(`${dir}records.json`);
const records: Records = await file.json();
let changed = 0;
for (const [name, r] of Object.entries(records)) {
  const c = cases.get(name);
  if (!c) continue;
  const again = new Set(r.goal.moves.map((m) => m.block)).size < r.goal.moves.length ? audit(c.request, r.goal) : undefined;
  const terms = judge(c.request, r.goal, { fewest: r.terms.moves, shorter: again?.shorter?.moves, proved: again?.exact });
  if (terms.fitness !== r.fitness) changed++;
  records[name] = { ...r, fitness: terms.fitness, terms };
}
await Bun.write(file, JSON.stringify(records, null, 1) + "\n");
console.log(`${Object.keys(records).length} records judged again, ${changed} changed`);
