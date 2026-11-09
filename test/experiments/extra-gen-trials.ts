// Blind trial pairs for reports/extra-gen.html: a goal with many real extra moves from each
// generator against a matched goal with none (the same fewest, made the same way), every board
// opened up into the world round it (its walls swapped for blocks or removed, a jagged edge,
// distractors), each pair's sides labelled A and B by a fixed shuffle. The trial board is the
// window framed by walls, and every goal's fewest and extra moves are verified on it exactly.
// Writes src/trials-gen.ts (?trial=G1A etc.) and data/extra-gen/trials.json for the report:
//   bun test/experiments/extra-gen-trials.ts [--tries 6]
import { writeFileSync } from "node:fs";
import type { Placed } from "../../src/layout";
import { cellsAt, type Grid, solve } from "./extra-gen-core";
import { makeB, makeRoom, type Made, openUp } from "./extra-gen-make";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const tries = Number(arg("tries", "6"));
const WANT = { lo: 12, hi: 14, extra: 4 };

function roomMade(seed: number, side: "high" | "low", aim?: number): Made | null {
  const r = makeRoom(seed, performance.now() + 20_000, side === "high" ? WANT : { lo: aim!, hi: aim!, extra: 0 }, side, aim);
  if (!r.g || !r.goal) return null;
  return { ok: true, ms: 0, g: r.g, red: r.goal.red, target: r.goal.target, fewest: r.goal.fewest, extra: r.goal.extra, extraMax: r.goal.extraMax, states: r.goal.states, tries: r.tries, evals: r.tries };
}
const opened = (m: Made, seed: number): Made => ({ ...m, ...openUp(m, seed, performance.now() + 60_000, "wall") }) as Made;

/** The best high goal over a few seeds, then a low one at its fewest. */
function pair(kind: "A" | "B") {
  let hi: Made | null = null, hiSeed = 0;
  for (let k = 1; k <= tries; k++) {
    const m = kind === "A" ? roomMade(500 + k, "high") : makeB(700 + k, 8000, WANT);
    if (!m?.ok) continue;
    console.log(`${kind} high, seed ${k}: ${m.fewest} moves, ${m.extra} extra`);
    if (!hi || m.extra > hi.extra) ((hi = m), (hiSeed = k));
  }
  if (!hi) throw new Error(`no ${kind} high`);
  let lo: Made | null = null, loSeed = 0;
  for (let k = 1; k <= 20 && !lo; k++) {
    const m = kind === "A" ? roomMade(900 + k, "low", hi.fewest) : makeB(1100 + k, 8000, { lo: hi.fewest, hi: hi.fewest, extra: 0 }, "low", hi.fewest);
    if (m?.ok && m.fewest === hi.fewest && m.extraMax === 0) ((lo = m), (loSeed = k));
  }
  if (!lo) throw new Error(`no ${kind} low at ${hi.fewest}`);
  return { hi: opened(hi, 40 + hiSeed), lo: opened(lo, 60 + loSeed) };
}

/** The board as the game places it: the window framed by walls, centred near the origin. */
function placedOf(m: Made) {
  const g = m.g!, ox = -Math.floor(g.W / 2), oy = -Math.floor(g.H / 2);
  const blocks: Placed[] = [];
  for (let y = -1; y <= g.H; y++) for (let x = -1; x <= g.W; x++) {
    const inside = x >= 0 && y >= 0 && x < g.W && y < g.H;
    if (!inside || g.wall[y * g.W + x]) blocks.push({ id: `wall ${x + ox},${y + oy}`, x: x + ox, y: y + oy, w: 1, h: 1, wall: true });
  }
  const point = (i: number, at: number) => {
    const [c] = cellsAt(g, g.pieces[i]!, at);
    return { x: (c % g.W) + ox, y: Math.floor(c / g.W) + oy };
  };
  g.pieces.forEach((p, i) => blocks.push({ id: `b${i}`, ...point(i, g.pos[i]!), w: p.h ? 2 : 1, h: p.h ? 1 : 2 }));
  // Verified once more on the framed board: the fewest, and the extra moves over every shortest solution.
  const s = solve(g, m.red, m.target, { edge: "wall", cap: 2_000_000 });
  if (s.status !== "ok" || s.fewest !== m.fewest || s.extraMin !== m.extra) throw new Error(`verify: ${s.status} ${s.fewest} ${s.extraMin} vs ${m.fewest} ${m.extra}`);
  const solution = s.solution.map(([i, a, b]) => ({ id: `b${i}`, from: point(i, a), to: point(i, b) }));
  return { blocks, red: `b${m.red}`, target: point(m.red, m.target), fewest: s.fewest, extra: s.extraMin, extraMax: s.extraMax, states: s.states, relevant: s.relevant, solution, box: { x: ox, y: oy, width: g.W, height: g.H }, open: m.open };
}

const pairs = (["A", "B"] as const).map((kind) => ({ kind, ...pair(kind) }));
const flips = [true, false];
const trials = pairs.flatMap((p, k) => {
  const sides = flips[k] ? [["low", p.lo], ["high", p.hi]] as const : [["high", p.hi], ["low", p.lo]] as const;
  return sides.map(([side, m], j) => ({ label: `G${k + 1}${"AB"[j]}`, kind: p.kind, side, ...placedOf(m) }));
});
for (const t of trials) console.log(`${t.label}: ${t.kind} ${t.side}, ${t.fewest} moves, ${t.extra}-${t.extraMax} extra, ${t.states} states, opened ${t.open?.opened}/${t.open?.ring}, ${t.open?.distractors} distractors`);

const j = (x: unknown) => JSON.stringify(x).replace(/"(\w+)":/g, "$1:");
const ts = `// Blind trial pairs of generated goals with real extra moves (reports/extra-gen.html, made by
// test/experiments/extra-gen-trials.ts): a room generator's goal (G1) and a constructive one's (G2),
// each against a goal with none at the same fewest, opened up into the world round it;
// ?trial=G1A etc. Which is which is only in the report.
import type { Trial } from "./trials";

export const GEN_TRIALS: Trial[] = [
${trials.map((t) => `  {\n    label: "${t.label}", red: "${t.red}", target: ${j(t.target)}, fewest: ${t.fewest},\n    blocks: ${j(t.blocks)},\n    solution: ${j(t.solution)},\n  },`).join("\n")}
];
`;
writeFileSync("src/trials-gen.ts", ts);
writeFileSync("data/extra-gen/trials.json", JSON.stringify(trials));
console.log("src/trials-gen.ts, data/extra-gen/trials.json");
