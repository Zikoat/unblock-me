// The goal contract (reports/goal-spec.md): what a goal maker is asked (a Request) and what
// it answers (a Goal, or null for none found). Plain JSON both ways, so a maker in another
// language can take the same Request; the Referee (referee.ts) says whether a Goal is legal
// and the Judge (judge.ts) how good it is.
import { Board } from "./board";
import type { Point } from "./camera";
import type { Goal as GameGoal } from "./goal";
import { CHUNK, fixedLayout, randomLayout, type Layout, type Placed, type Stamp, type UiShown } from "./layout";
import type { Move as GameMove } from "./rules";

/** The contract's version: bumped when a field changes meaning. */
export const CONTRACT = 1;
/** The world generator's version: the storage keys' (src/main.ts, v13), bumped whenever the
 * random layout or the island changes, since either changes which block is on a cell. */
export const WORLD_VERSION = 13;

/** Everything a maker may look at; nothing else (no clock, no global state). */
export type Request = {
  version: number;
  world: World;
  moved: Moved;
  /** Earlier goals, oldest first. The last one's red block, standing on its target, is
   * where the player is; with none, the player is at the origin cell (0, 0), where play
   * starts. */
  history: { red: string; target: Point }[];
  /** The fewest moves wanted while the first world goals ramp up (goal.ts rampTarget), or
   * null after. */
  rampAim: number | null;
  wishes: Wishes;
  /** For any choice a maker wants to make at random. */
  seed: number;
};

/** The board's definition: every cell of the endless board follows from it. */
export type World = {
  seed: number;
  /** The layout's tries per chunk (layout.ts randomLayout). */
  density: number;
  /** The share of cells that are walls (layout.ts randomLayout); none when absent. */
  walls?: number;
  /** The UI blocks shown and the island: they change the layout. */
  ui: UiShown;
  version: number;
  /** An exact board instead of the random one (one placed by a test). */
  placed?: Placed[];
  /** Rooms stamped into the random world (src/rooms.ts), oldest first; none when absent. */
  rooms?: Stamp[];
};

/** The blocks the player has moved, where they are now, indexed by the 4x4 chunk (layout.ts
 * CHUNK) of their top-left cell: `"cx,cy"` -> `[id, x, y][]`, with cx = floor(x / 4) and
 * cy = floor(y / 4). A block is at most 2 cells long, so the blocks on cell (x, y) are in
 * its own chunk or the one left of it or above it. Read-only: makers share one index. */
export type Moved = { readonly [chunk: string]: readonly (readonly [string, number, number])[] };

/** A slide of one block, from its top-left cell to another on its axis. */
export type Move = { block: string; from: Point; to: Point };

/** What a maker answers. Where red starts is where the board has it. */
export type Goal = { red: string; target: Point; moves: Move[] };

export type Maker = (request: Request) => Goal | null;

/** The Judge's weights (reports/goal-spec.md, Judge): every number in its formulas. */
export type Wishes = {
  /** Moves a decision is worth in the difficulty. */
  decision: number;
  /** The distance's power in the balance. */
  distance: number;
  /** The factor per block on red's track. */
  track: number;
  /** The factor per move off the ramp aim. */
  aim: number;
  /** The factor per cell of reach beyond `reachFree`. */
  reach: number;
  reachFree: number;
  /** The factor per clash. */
  clash: number;
  /** The power of 1 + extra moves / fewest moves (judge.ts extraMoves): their share, not their
   * count, so a longer goal is not better for having more. Absent in Requests made before it:
   * then WISHES's. */
  extra?: number;
};
export const WISHES: Wishes = { decision: 1, distance: 0.4, track: 0.5, aim: 0.5, reach: 0.8, reachFree: 4, clash: 0.5, extra: 4 };

const chunkOf = (x: number, y: number) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;

/** The chunk index of moved blocks (id -> where it is now). Ids in each chunk are sorted,
 * so the same blocks give the same JSON whatever order they were moved in. */
export function movedIndex(moved: ReadonlyMap<string, Point>): Moved {
  const index: Record<string, [string, number, number][]> = {};
  for (const [id, p] of [...moved].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) (index[chunkOf(p.x, p.y)] ??= []).push([id, p.x, p.y]);
  return index;
}

/** The moved blocks as a map, id -> where it is now. */
export function movedMap(moved: Moved): Map<string, Point> {
  const map = new Map<string, Point>();
  for (const list of Object.values(moved)) for (const [id, x, y] of list) map.set(id, { x, y });
  return map;
}

/** The world's layout (blocks where they start). */
export function worldLayout(world: World): Layout {
  return world.placed ? fixedLayout(world.placed) : randomLayout(world.seed, { tries: world.density, walls: world.walls ?? 0, ...world.ui, rooms: world.rooms ?? [] });
}

/** The board a Request is about: the world with the player's moves. */
export function requestBoard(request: Request): Board {
  return new Board(worldLayout(request.world), movedMap(request.moved));
}

/** Where the player is: the last goal's red block on its target, or the origin cell. */
export function playerCells(request: Request, board: Board): { x: number; y: number; w: number; h: number } {
  const last = request.history.at(-1);
  const red = last && board.home(last.red);
  return red ? { x: last.target.x, y: last.target.y, w: red.w, h: red.h } : { x: 0, y: 0, w: 1, h: 1 };
}

/** The game's state as a Request (src/main.ts): its seed and density, the UI shown, the
 * board placed by a test if any, the moved blocks, the goals reached (oldest first) and
 * the ramp's aim. */
export function gameRequest(game: {
  seed: number;
  tries: number;
  walls?: number;
  ui: UiShown;
  placed?: Placed[] | null;
  moved: ReadonlyMap<string, Point>;
  done: readonly { id: string; target: Point }[];
  rampAim?: number;
  rooms?: readonly Stamp[];
}): Request {
  return {
    version: CONTRACT,
    world: { seed: game.seed, density: game.tries, ...(game.walls && { walls: game.walls }), ui: { ...game.ui }, version: WORLD_VERSION, ...(game.placed && { placed: game.placed }), ...(game.rooms?.length && { rooms: [...game.rooms] }) },
    moved: movedIndex(game.moved),
    history: game.done.map((g) => ({ red: g.id, target: { x: g.target.x, y: g.target.y } })),
    rampAim: game.rampAim ?? null,
    wishes: WISHES,
    seed: 1,
  };
}

const point = (p: Point): Point => ({ x: p.x, y: p.y });
export const toMove = (m: GameMove): Move => ({ block: m.id, from: point(m.from), to: point(m.to) });
export const fromMove = (m: Move): GameMove => ({ id: m.block, from: point(m.from), to: point(m.to) });

/** A game goal (goal.ts) as the contract's. */
export function contractGoal(goal: Pick<GameGoal, "id" | "target" | "solution">): Goal {
  return { red: goal.id, target: point(goal.target), moves: goal.solution.map(toMove) };
}
