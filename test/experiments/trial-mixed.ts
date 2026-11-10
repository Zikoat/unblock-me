// How mixed the come-back moves are on every trial board (reports/trial-mixed.html): mixed-core.ts's
// numbers over every shortest solution (or a uniform sample), against the blind verdicts and the
// play logs. The open-room trials (H, J; and K once made) are measured by open-core.ts's two
// bounds, so their numbers hold in any surroundings; the others on their framed board.
//   bun test/experiments/trial-mixed.ts   (writes data/trial-mixed.json for trial-mixed-report.ts)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { TRIALS, type Trial } from "../../src/trials";
import { MAKER_TRIALS } from "../../src/trials-maker";
import { GEN_TRIALS } from "../../src/trials-gen";
import { OPEN_TRIALS } from "../../src/trials-open";
import { OPEN_TRIALS_J } from "../../src/trials-open-j";
import { OPEN_TRIALS_K } from "../../src/trials-open-k";
import { analyse, cellsAt, clone, type Grid, solve } from "./extra-gen-core";
import { checkMixed, KEYS, over } from "./mixed-core";
import { gridOf, type Mv, play } from "./trial-grid";

const all: Trial[] = [...TRIALS, ...MAKER_TRIALS, ...GEN_TRIALS, ...OPEN_TRIALS, ...OPEN_TRIALS_J, ...OPEN_TRIALS_K];
// The open rooms' rectangles (trial coordinates), from the files that made them.
// (K: the room's own blocks as listed, those sticking out into the world too.)
const rooms = new Map<string, { x: number; y: number; width: number; height: number }>(), roomIds = new Map<string, string[]>();
for (const f of ["data/open-gen/trials.json", "data/open-gen/trials-j.json", "data/open-gen/trials-k.json"]) {
  if (existsSync(f)) for (const t of JSON.parse(readFileSync(f, "utf8"))) (rooms.set(t.label, t.room), t.roomIds && roomIds.set(t.label, t.roomIds));
}
const PATHS = 50_000;

function measure(t: Trial) {
  const { g, red, target, proof, ox, oy, index } = gridOf(t);
  const t0 = performance.now();
  const proofMix = over([proof.map((m) => m[0])], red);
  const room = rooms.get(t.label);
  if (room) {
    // The room's blocks (red first), every other block the world's.
    const inside = (c: number) => { const x = (c % g.W) + ox, y = Math.floor(c / g.W) + oy; return x >= room.x && y >= room.y && x < room.x + room.width && y < room.y + room.height; };
    const ids = roomIds.get(t.label);
    const R = ids ? ids.map((id) => index.get(id)!) : [red, ...g.pieces.keys()].filter((i, k) => (k === 0 || i !== red) && cellsAt(g, g.pieces[i]!, g.pos[i]!).every(inside));
    const c = checkMixed(g, R, target, { cap: 4_000_000, paths: PATHS });
    return { how: "open" as const, fewest: c.up.fewest, exact: c.exact, mixedExact: c.mixedExact, solutions: c.solutions, sampled: c.sampled, mix: c.mixed!, low: c.mixedLow, proofMix, ms: performance.now() - t0 };
  }
  // M1A and M1B: too many blocks matter for an exact search; as trial-features.ts, the blocks the
  // proof moves and those whose reach crosses a cell it sweeps, the rest frozen.
  const a = analyse(g, red, "wall");
  let x: Grid = g;
  if (a.relevant.length > 30) {
    const swept = new Set<number>();
    for (const [i, s, e] of proof as Mv[]) for (let k = Math.min(s, e); k <= Math.max(s, e) + 1; k++) swept.add(g.pieces[i]!.h ? g.pieces[i]!.lane * g.W + k : k * g.W + g.pieces[i]!.lane);
    const keep = new Set(proof.map((m) => m[0]));
    for (const i of a.relevant) {
      const [lo, hi] = a.extent[i]!, p = g.pieces[i]!;
      for (let k = lo; k <= hi + 1; k++) if (swept.has(p.h ? p.lane * g.W + k : k * g.W + p.lane)) keep.add(i);
    }
    if (keep.size > 24) {
      keep.clear();
      proof.forEach((m) => keep.add(m[0]));
      for (const i of a.relevant) if (cellsAt(g, g.pieces[i]!, g.pos[i]!).some((c) => swept.has(c))) keep.add(i);
    }
    x = clone(g);
    g.pieces.forEach((p, i) => { if (!keep.has(i)) for (const c of cellsAt(g, p, g.pos[i]!)) x.wall[c] = 1; });
  }
  const s = solve(x, red, target, { edge: "wall", cap: 3_000_000, paths: PATHS, maxDepth: t.fewest + 1 });
  if (s.status !== "ok") return { how: "proof" as const, fewest: proof.length, exact: false, mixedExact: false, solutions: 1, sampled: false, mix: proofMix, low: null, proofMix, ms: performance.now() - t0 };
  const mix = over(s.paths!.list.map((p) => p.map((m) => m[0])), red);
  return { how: x === g ? ("framed" as const) : ("cut" as const), fewest: s.fewest, exact: x === g, mixedExact: x === g && !s.paths!.sampled, solutions: s.paths!.count, sampled: s.paths!.sampled, mix, low: null, proofMix, ms: performance.now() - t0 };
}

const only = process.argv[2]?.split(",");
const rows = all.filter((t) => !only || only.includes(t.label)).map((t) => {
  const m = measure(t);
  const r = (k: (typeof KEYS)[number]) => (m.mix[k].min === m.mix[k].max ? `${m.mix[k].min}` : `${m.mix[k].min}-${m.mix[k].max}`);
  console.log(t.label.padEnd(4), m.how.padEnd(6), `${m.fewest}${m.fewest === t.fewest ? "" : "!"}`, `sols ${m.solutions}${m.sampled ? "~" : ""}`, m.mixedExact ? "exact" : "", KEYS.map((k) => `${k} ${r(k)}`).join(", "), `${Math.round(m.ms)} ms`);
  return { label: t.label, ...m, play: play(t.label) };
});
writeFileSync("data/trial-mixed.json", JSON.stringify(rows));
