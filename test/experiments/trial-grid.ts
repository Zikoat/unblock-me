// Shared by the trial reports (trial-features.ts, trial-mixed.ts): a trial's board as a Grid
// inside its frame of walls, and its play log.
import { readdirSync, readFileSync } from "node:fs";
import type { Trial } from "../../src/trials";
import type { Grid } from "./extra-gen-core";

/** The trial's board inside its frame of walls as a Grid; ids to piece indices. */
export function gridOf(t: Trial) {
  const xs = t.blocks.flatMap((b) => [b.x, b.x + b.w]), ys = t.blocks.flatMap((b) => [b.y, b.y + b.h]);
  const ox = Math.min(...xs) + 1, oy = Math.min(...ys) + 1;
  const W = Math.max(...xs) - ox - 1, H = Math.max(...ys) - oy - 1;
  const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [], pos: [] };
  const index = new Map<string, number>();
  for (const b of t.blocks) {
    const x = b.x - ox, y = b.y - oy;
    if (b.wall) {
      if (x >= 0 && y >= 0 && x < W && y < H) g.wall[y * W + x] = 1;
      continue;
    }
    if (b.w * b.h !== 2) throw new Error(`${t.label}: block ${b.id} is not 2x1`);
    const h = b.w > b.h;
    index.set(b.id!, g.pieces.length);
    g.pieces.push({ h, lane: h ? y : x });
    g.pos.push(h ? x : y);
  }
  const red = index.get(t.red)!, rp = g.pieces[red]!;
  const target = rp.h ? t.target.x - ox : t.target.y - oy;
  const proof = t.solution.map((m) => {
    const i = index.get(m.id)!, p = g.pieces[i]!;
    return [i, p.h ? m.from.x - ox : m.from.y - oy, p.h ? m.to.x - ox : m.to.y - oy] as Mv;
  });
  return { g, red, target, proof, index, ox, oy };
}

/** A move: piece index, from, to (lane positions). */
export type Mv = [number, number, number];

/** The play log: the session where the goal was reached. */
export function play(label: string) {
  const files = readdirSync("play-data").filter((f) => f.startsWith(`trial-${label}-`));
  for (const f of files) {
    const log = JSON.parse(readFileSync(`play-data/${f}`, "utf8")).log as { t: number; e: string; id?: string; from?: { x: number; y: number }; to?: { x: number; y: number } }[];
    const reached = log.find((e) => e.e === "reached");
    if (!reached) continue;
    const moves = log.filter((e) => e.e === "move"), undos = log.filter((e) => e.e === "undo").length;
    const goal = log.find((e) => e.e === "goal")!;
    // A take-back: a block moved straight back to where its last move started.
    let back = 0;
    const last = new Map<string, { x: number; y: number }>();
    for (const m of moves) {
      const f = last.get(m.id!);
      if (f && f.x === m.to!.x && f.y === m.to!.y) back++;
      last.set(m.id!, m.from!);
    }
    const blocks = new Set(moves.map((m) => m.id)).size;
    return { moves: moves.length - undos, undos, back, blocks, extra: moves.length - blocks, think: (moves[0]!.t - goal.t) / 1000, time: (reached.t - goal.t) / 1000, solve: (reached.t - moves[0]!.t) / 1000 };
  }
  return null;
}
