// Blind trial pairs for reports/open-gen.html: a room with many real extra moves and an open
// edge (from open-gen.ts's runs, the most open ones) against a room with none at the same fewest
// and the same size, made the same way (a fresh walled room with no extra moves, opened up by
// makeOpenUp), each pair's sides labelled A and B by a fixed shuffle. The trial board is the room
// with 3 cells of the world round it, framed by walls; its goal is exact on it (and anywhere else)
// by open-core.ts's two bounds, checked once more here.
// Writes src/trials-open.ts (?trial=H1A etc.) and data/open-gen/trials.json for the report:
//   bun test/experiments/open-gen-trials.ts [--pairs 3] [--budget 300000]
// The J pairs (6+ extra, from open-high.ts's rooms opened by open-gen.ts --lib):
//   bun test/experiments/open-gen-trials.ts --in data/open-gen/high6.jsonl --min-extra 6 --prefix J --pairs 2 --low-tries 10 --ts src/trials-open-j.ts --const OPEN_TRIALS_J --json data/open-gen/trials-j.json
import { readFileSync, writeFileSync } from "node:fs";
import type { Placed } from "../../src/layout";
import { cellsAt, type Grid } from "./extra-gen-core";
import { checkOpen } from "./open-core";
import { freshRoom, makeOpenUp, type Made } from "./open-gen-make";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const lowTries = Number(arg("low-tries", "3"));
const pairs = Number(arg("pairs", "3")), budget = Number(arg("budget", "300000")), minExtra = Number(arg("min-extra", "3"));
const input = arg("in", "data/open-gen/high.jsonl"), prefix = arg("prefix", "H"), tsOut = arg("ts", "src/trials-open.ts"), name = arg("const", "OPEN_TRIALS"), jsonOut = arg("json", "data/open-gen/trials.json");

type Line = Omit<Made, "g"> & { seed: number; lib: { size: string; fewest: number }; board: { W: number; H: number; walls: number[]; pieces: Grid["pieces"]; pos: number[] } };
const gridOf = (b: Line["board"]): Grid => {
  const g: Grid = { W: b.W, H: b.H, wall: new Uint8Array(b.W * b.H), pieces: b.pieces, pos: b.pos };
  for (const c of b.walls) g.wall[c] = 1;
  return g;
};
const share = (z: { blocks: number; movable: number }) => (z.blocks ? z.movable / z.blocks : 0);
const openScore = (m: { open: Made["open"] }) => share(m.open.boundary) + share(m.open.ring) - 0.04 * (m.open.boundary.walls + m.open.ring.walls);

const highs = readFileSync(input, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Line)
  .filter((l) => l.extra >= minExtra).sort((a, b) => openScore(b) - openScore(a));
const picked: Line[] = [];
for (const h of highs) if (picked.length < pairs && !picked.some((p) => p.lib.size === h.lib.size && p.fewest === h.fewest)) picked.push(h);

function lowFor(h: Line, k: number): Made {
  let best: Made | null = null;
  for (let t = 0; t < lowTries && (!best || openScore(best) < openScore(h) - 0.2); t++) {
    const lib = freshRoom(h.size - 2, "low", h.fewest, 300 + 10 * k + t, 120_000);
    if (!lib) continue;
    const m = makeOpenUp(lib, 500 + 10 * k + t, budget, undefined, { side: "low" });
    console.log(`low for ${h.fewest} moves, try ${t}: ${m.fewest} moves, ${m.extra}-${m.extraMax} extra, open ${openScore(m).toFixed(2)}`);
    if (m.fewest === h.fewest && m.extraMax === 0 && (!best || openScore(m) > openScore(best))) best = m;
  }
  if (!best) throw new Error(`no low room at ${h.fewest}`);
  return best;
}

/** The board as the game places it: the window framed by walls, centred near the origin; the
 * goal checked once more, its proof the upper bound's solution. */
function placedOf(g: Grid, R: number[], target: number, size: number, margin: number) {
  const c = checkOpen(g, R, target, 4_000_000);
  if (!c.exact) throw new Error("not exact");
  const ox = -Math.floor(g.W / 2), oy = -Math.floor(g.H / 2);
  const blocks: Placed[] = [];
  for (let y = -1; y <= g.H; y++) for (let x = -1; x <= g.W; x++) {
    const inside = x >= 0 && y >= 0 && x < g.W && y < g.H;
    if (!inside || g.wall[y * g.W + x]) blocks.push({ id: `wall ${x + ox},${y + oy}`, x: x + ox, y: y + oy, w: 1, h: 1, wall: true });
  }
  const point = (i: number, at: number) => {
    const [cell] = cellsAt(g, g.pieces[i]!, at);
    return { x: (cell! % g.W) + ox, y: Math.floor(cell! / g.W) + oy };
  };
  g.pieces.forEach((p, i) => blocks.push({ id: `b${i}`, ...point(i, g.pos[i]!), w: p.h ? 2 : 1, h: p.h ? 1 : 2 }));
  const solution = c.up.solution.map(([i, a, b]) => ({ id: `b${i}`, from: point(i, a), to: point(i, b) }));
  const red = R[0]!;
  return {
    blocks, red: `b${red}`, target: point(red, target), fewest: c.up.fewest, extra: c.up.extraMin, extraMax: c.up.extraMax, solution,
    states: { up: c.up.states, low: c.low!.states }, room: { x: margin + ox, y: margin + oy, width: size, height: size }, box: { x: ox, y: oy, width: g.W, height: g.H },
  };
}

const made = picked.map((h, k) => {
  console.log(`pair ${k + 1}: high ${h.lib.size} room, ${h.fewest} moves, ${h.extra} extra, open ${openScore(h).toFixed(2)}`);
  const lo = lowFor(h, k);
  return {
    hi: { ...placedOf(gridOf(h.board), h.R, h.target, h.size, h.margin), open: h.open, ms: h.ms },
    lo: { ...placedOf(lo.g, lo.R, lo.target, lo.size, lo.margin), open: lo.open, ms: lo.ms },
  };
});
const flips = [false, true, true];
const trials = made.flatMap((p, k) => {
  const sides = flips[k] ? [["low", p.lo], ["high", p.hi]] as const : [["high", p.hi], ["low", p.lo]] as const;
  return sides.map(([side, m], j) => ({ label: `${prefix}${k + 1}${"AB"[j]}`, side, ...m }));
});
for (const t of trials) console.log(`${t.label}: ${t.side}, ${t.fewest} moves, ${t.extra}-${t.extraMax} extra, edge ${t.open.boundary.movable}/${t.open.boundary.blocks}, ring ${t.open.ring.movable}/${t.open.ring.blocks}`);

const j = (x: unknown) => JSON.stringify(x).replace(/"(\w+)":/g, "$1:");
const ts = `// Blind trial pairs of rooms with real extra moves and an open edge (reports/open-gen.html, made
// by test/experiments/open-gen-trials.ts): a room with many extra moves against one with none at
// the same fewest, both opened up, on the room and 3 cells of the world round it; ?trial=${prefix}1A etc.
// Which is which is only in the report.
import type { Trial } from "./trials";

export const ${name}: Trial[] = [
${trials.map((t) => `  {\n    label: "${t.label}", red: "${t.red}", target: ${j(t.target)}, fewest: ${t.fewest},\n    blocks: ${j(t.blocks)},\n    solution: ${j(t.solution)},\n  },`).join("\n")}
];
`;
writeFileSync(tsOut, ts);
writeFileSync(jsonOut, JSON.stringify(trials));
console.log(`${tsOut}, ${jsonOut}`);
