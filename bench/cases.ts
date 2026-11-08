// The Bench's cases: fixed Requests, made deterministically and kept as JSON (cases-full.json,
// and cases-quick.json a subset of it), so every maker is judged on the same ones:
//
// - fresh: a new board at each density, no goals before, the ramp's aims 4 to 10 and none;
// - played: one to three goals played first (their solutions);
// - session: long sessions, today's maker's goals played one after another (each solution's
//   moves made), snapshots along the way, with the ramp as the game has it;
// - island: the world's first goals past the island (UI island on), the island's goals
//   played as their proofs leave it.
//
// Regenerate with `bun bench/cases.ts` (a few minutes: the sessions play today's maker).
import type { Point } from "../src/camera";
import { gameRequest, type Maker, type Request } from "../src/contract";
import { rampTarget } from "../src/goal";
import { GATE, GATE_GONE, islandGoals } from "../src/island";
import { ISLAND_LEVELS } from "../src/island-levels";
import { current } from "./current";

export type Case = { name: string; request: Request };

const AIMS = [4, 5, 6, 7, 8, 9, 10, null] as const;
const DENSITIES = [4, 7, 12, 20, 28];

type Game = { seed: number; tries: number; island?: boolean; moved: Map<string, Point>; done: { id: string; target: Point }[] };
const request = (g: Game, rampAim: number | null) => gameRequest({ seed: g.seed, tries: g.tries, ui: { island: !!g.island }, moved: g.moved, done: g.done, rampAim: rampAim ?? undefined });

/** Play `maker`'s goals one after another (making each solution's moves), calling `snap` after
 * each with how many have been played. Stops early if the maker finds none. */
function play(g: Game, goals: number, aim: (k: number) => number | null, maker: Maker, snap: (k: number) => void): void {
  for (let k = 0; k < goals; k++) {
    const goal = maker(request(g, aim(k)));
    if (!goal) return;
    for (const m of goal.moves) g.moved.set(m.block, m.to);
    g.done.push({ id: goal.red, target: goal.target });
    snap(k + 1);
  }
}

/** The world's first goal's board: the island's goals played by their proofs, its gate open. */
function pastIsland(seed: number): Game {
  const g: Game = { seed, tries: 12, island: true, moved: new Map(), done: [] };
  for (const goal of ISLAND_LEVELS.flatMap((_, k) => islandGoals(k))) {
    for (const m of goal.solution) g.moved.set(m.id, m.to);
    g.done.push({ id: goal.id, target: goal.target });
  }
  if (GATE) g.moved.set(GATE.id, GATE_GONE);
  return g;
}

/** Every case, with whether it is in the quick set. */
export function makeCases(): (Case & { quick: boolean })[] {
  const out: (Case & { quick: boolean })[] = [];
  const maker = current(0);
  let n = 0;
  const aimOf = () => AIMS[n++ % AIMS.length]!;
  const fresh = (seed: number, tries: number) => ({ seed, tries, moved: new Map(), done: [] });
  // Fresh boards: 20 per density, and a few at the slider's ends.
  for (const tries of DENSITIES) for (let i = 0; i < 20; i++) out.push({ name: `fresh-d${tries}-${i}`, request: request(fresh(1000 * tries + i, tries), aimOf()), quick: i < 2 });
  for (const tries of [1, 30]) for (let i = 0; i < 4; i++) out.push({ name: `fresh-d${tries}-${i}`, request: request(fresh(1000 * tries + i, tries), aimOf()), quick: i < 1 });
  // A few goals played first.
  for (const tries of DENSITIES) for (let i = 0; i < 8; i++) {
    const g = fresh(5000 + 100 * tries + i, tries);
    play(g, 1 + (i % 3), () => null, maker, () => {});
    out.push({ name: `played-d${tries}-${i}`, request: request(g, aimOf()), quick: i < 1 });
  }
  // Long sessions: two per density, 60 goals each, a snapshot every 10.
  for (const tries of DENSITIES) for (let i = 0; i < 2; i++) {
    const g = fresh(9000 + 100 * tries + i, tries);
    play(g, 60, (k) => rampTarget(k) ?? null, maker, (k) => {
      if (k % 10 === 0 && k < 60) out.push({ name: `session-d${tries}-${i}-${k}`, request: request(g, rampTarget(k) ?? null), quick: i === 0 && (tries === 12 || tries === 20) && k % 20 === 0 });
    });
  }
  // The island's edge: the world's first goal, and the next few.
  for (let i = 0; i < 10; i++) {
    const g = pastIsland(7000 + i);
    out.push({ name: `island-${i}-0`, request: request(g, rampTarget(0)!), quick: i < 2 });
    play(g, 5, (k) => rampTarget(k) ?? null, maker, (k) => {
      if (k === 2 || k === 5) out.push({ name: `island-${i}-${k}`, request: request(g, rampTarget(k) ?? null), quick: i < 2 });
    });
  }
  return out;
}

if (import.meta.main) {
  const all = makeCases();
  const strip = (list: typeof all) => list.map(({ name, request }) => ({ name, request }));
  await Bun.write(new URL("./cases-full.json", import.meta.url).pathname, JSON.stringify(strip(all)) + "\n");
  await Bun.write(new URL("./cases-quick.json", import.meta.url).pathname, JSON.stringify(strip(all.filter((c) => c.quick))) + "\n");
  console.log(`${all.length} cases, ${all.filter((c) => c.quick).length} quick`);
}
