// The K blind pairs (reports/trial-mixed.html): two open rooms with about the same fewest and
// extra moves, one with mixed come-backs (red moving while blocks are out, trips crossing) and
// one a tidy wave, so the pair isolates mixedness rather than the count. From open-pull.ts's rooms
// (as made, or with world blocks pulled in), every number exact in any surroundings by both
// bounds; at least one side of a pair with pulled-in blocks where one fits. Each pair's sides
// labelled A and B by a fixed shuffle. Writes src/trials-open-k.ts and data/open-gen/trials-k.json:
//   bun test/experiments/open-pull-trials.ts [--in data/open-gen/pulled.jsonl] [--pairs 2]
import { readFileSync, writeFileSync } from "node:fs";
import type { Key, Range } from "./mixed-core";
import { placedOf } from "./open-gen-make";
import { type Board, gridOf } from "./open-pull";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const input = arg("in", "data/open-gen/pulled.jsonl"), pairs = Number(arg("pairs", "2"));
type Line = { from: string; pulls: number; adds: boolean; fewest: number; extra: number; extraMax: number; mix: Record<Key, Range>; R: number[]; target: number; size: number; margin: number; board: Board };
const lines: Line[] = readFileSync(input, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const base = new Map(lines.filter((l) => l.pulls === 0).map((l) => [l.from, l]));
const mixedMin = (l: Line) => l.mix.redBetween.min + l.mix.crossing.min;
const mixedMax = (l: Line) => l.mix.redBetween.max + l.mix.crossing.max;
const pulledOf = (l: Line) => l.R.filter((i) => !base.get(l.from)!.R.includes(i));

// Every high/low match: high at least 2 mixed on every shortest solution, low a tidy wave on
// every one (0 at most), at most 1 apart in fewest and in extra moves; scored by the gap in
// mixedness less the gaps in fewest and extra, with a bonus for a pulled-in side (more where the
// pull added a move).
const highs = lines.filter((l) => l.extra === l.extraMax && mixedMin(l) >= 2);
const lows = lines.filter((l) => l.extra === l.extraMax && l.extra >= 3 && mixedMax(l) === 0);
const matches = highs.flatMap((h) => lows.filter((o) => o.from !== h.from && Math.abs(o.fewest - h.fewest) <= 1 && Math.abs(o.extra - h.extra) <= 1).map((o) => ({
  h, o, score: mixedMin(h) - 2 * Math.abs(o.fewest - h.fewest) - 2 * Math.abs(o.extra - h.extra) + Math.max(...[h, o].map((l) => (!l.pulls ? 0 : l.adds ? 2 : 0.5))),
}))).sort((a, b) => b.score - a.score);
console.log(`${highs.length} mixed rooms, ${lows.length} tidy ones, ${matches.length} matches`);
const picked: typeof matches = [];
// The best match with a pulled-in side first, if there is one; then the best of the rest.
const free = (m: (typeof matches)[number]) => !picked.some((p) => [p.h.from, p.o.from].some((f) => f === m.h.from || f === m.o.from));
const withPull = matches.find((m) => m.h.pulls || m.o.pulls);
if (withPull) picked.push(withPull);
for (const m of matches) if (picked.length < pairs && free(m)) picked.push(m);
if (picked.length < pairs) console.log(`only ${picked.length} pairs`);

const flips = [true, false, true];
const trials = picked.flatMap((p, k) => {
  const sides = ([["mixed", p.h], ["tidy", p.o]] as const).map(([side, l]) => {
    const t = placedOf(gridOf(l.board), l.R, l.target, l.size, l.margin);
    const pulled = new Set(pulledOf(l).map((i) => `b${i}`));
    const rename = (id: string) => (pulled.has(id) ? `p${id.slice(1)}` : id);
    return {
      side, ...t, blocks: t.blocks.map((b) => ({ ...b, id: rename(b.id!) })), red: rename(t.red), solution: t.solution.map((m) => ({ ...m, id: rename(m.id) })),
      mix: l.mix, mixedMin: mixedMin(l), pulled: pulled.size, roomIds: l.R.map((i) => rename(`b${i}`)), from: `${l.from}${l.pulls ? `, ${l.pulls} pull${l.pulls > 1 ? "s" : ""}` : ""}`,
    };
  });
  if (flips[k]) sides.reverse();
  return sides.map((s, j) => ({ label: `K${k + 1}${"AB"[j]}`, ...s }));
});
for (const t of trials) console.log(`${t.label}: ${t.side}, ${t.fewest} moves, ${t.extra}-${t.extraMax} extra, mixed ${t.mixedMin}, ${t.pulled} pulled in, from ${t.from}`);

const j = (x: unknown) => JSON.stringify(x).replace(/"(\w+)":/g, "$1:");
writeFileSync("src/trials-open-k.ts", `// Blind trial pairs on how mixed the come-back moves are (reports/trial-mixed.html, made by
// test/experiments/open-pull-trials.ts): two open rooms with about the same fewest and extra
// moves, one with mixed come-backs and one a tidy wave, some with world blocks pulled in; on the
// room and 3 cells of the world round it; ?trial=K1A etc. Which is which is only in the report.
import type { Trial } from "./trials";

export const OPEN_TRIALS_K: Trial[] = [
${trials.map((t) => `  {\n    label: "${t.label}", red: "${t.red}", target: ${j(t.target)}, fewest: ${t.fewest},\n    blocks: ${j(t.blocks)},\n    solution: ${j(t.solution)},\n  },`).join("\n")}
];
`);
writeFileSync("data/open-gen/trials-k.json", JSON.stringify(trials));
console.log("src/trials-open-k.ts, data/open-gen/trials-k.json");
