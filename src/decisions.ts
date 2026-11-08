// Decisions (reports/goal-spec.md, Decisions): the forks a person meets working a goal out.
// Back from the target: whatever is between red and its target has to be cleared; each such
// block can go either way along its axis, by the least that frees the cells; a way is out if
// it runs into the edge or a wall, or into a block already in this chain (a cycle), and
// otherwise the blocks it sweeps into have to be cleared in turn. A block with two plausible
// ways is a decision. Ported from the drawn spec's decisionTree (reports/goal-spec-visual.html).
import { isFixed, type Board } from "./board";
import type { Point } from "./camera";
import type { Goal } from "./contract";

/** What `Cells.at` gives for the edge of the board or a block that never moves. */
export const EDGE = "#";

/** A board as the decisions see it: who is on a cell (an id, null for empty, or EDGE), and
 * where a block is now. */
export type Cells = { at(x: number, y: number): string | null; block(id: string): { x: number; y: number; w: number; h: number } };

/** Explored at most this many blocks deep, and this many blocks in all (per stage). */
export const MAX_DEPTH = 6, MAX_NODES = 300;
/** A way that has to slide further than this to free the cells is out. */
const MAX_SLIDE = 12;

export type Way = { dir: -1 | 1; slide: number; out: string | null; needs: Clearing[]; ok: boolean };
/** A block to clear: the ways it could go, and whether it is a decision (two plausible). */
export type Clearing = { id: string; ways: Way[]; decision: boolean; ok: boolean };

const key = (c: Point) => `${c.x},${c.y}`;

/** The clearing tree for red's way to `target` on `cells`: each block in the way, each way it
 * could go, and the blocks those ways need moved in turn; and how many blocks are decisions,
 * each counted once however many branches meet it. */
export function decisionTree(cells: Cells, red: string, target: Point): { roots: Clearing[]; decisions: number } {
  const shape = (id: string) => {
    const b = cells.block(id);
    return { ...b, hz: b.w > b.h };
  };
  const r = shape(red), path: Point[] = [];
  const lo = r.hz ? Math.min(r.x, target.x) : Math.min(r.y, target.y);
  const hi = r.hz ? Math.max(r.x, target.x) + r.w : Math.max(r.y, target.y) + r.h;
  for (let q = lo; q < hi; q++) {
    const c = r.hz ? { x: q, y: r.y } : { x: r.x, y: q };
    if (cells.at(c.x, c.y) !== red) path.push(c);
  }
  let nodes = 0;
  const forks = new Set<string>();
  const blockersIn = (list: Point[], self: string) => [...new Set(list.map((c) => cells.at(c.x, c.y)).filter((o): o is string => !!o && o !== EDGE && o !== self))];

  function clear(id: string, region: Set<string>, chain: Set<string>, depth: number): Clearing {
    const b = shape(id), node: Clearing = { id, ways: [], decision: false, ok: false };
    nodes++;
    for (const dir of [-1, 1] as const) {
      // Slide one cell at a time until the block's cells are clear of the region.
      const sweep: Point[] = [];
      let out: string | null = null, s = 0;
      for (;;) {
        s++;
        const lead = b.hz ? { x: dir > 0 ? b.x + b.w - 1 + s : b.x - s, y: b.y } : { x: b.x, y: dir > 0 ? b.y + b.h - 1 + s : b.y - s };
        if (cells.at(lead.x, lead.y) === EDGE) {
          out = "edge or wall";
          break;
        }
        sweep.push(lead);
        let inRegion = false;
        for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) if (region.has(key(b.hz ? { x: b.x + dir * s + i, y: b.y + j } : { x: b.x + i, y: b.y + dir * s + j }))) inRegion = true;
        if (!inRegion) break;
        if (s > MAX_SLIDE) {
          out = "too far";
          break;
        }
      }
      const way: Way = { dir, slide: s, out, needs: [], ok: false };
      if (!out) {
        const blockers = blockersIn(sweep, id), cycle = blockers.find((o) => chain.has(o));
        if (cycle) way.out = `cycle (${cycle})`;
        else if (depth >= MAX_DEPTH || nodes >= MAX_NODES) way.out = "too deep";
        else way.needs = blockers.map((o) => clear(o, new Set(sweep.map(key)), new Set([...chain, id]), depth + 1));
      }
      way.ok = !way.out && way.needs.every((n) => n.ok);
      node.ways.push(way);
    }
    node.decision = node.ways.filter((w) => !w.out).length === 2;
    if (node.decision) forks.add(id);
    node.ok = node.ways.some((w) => w.ok);
    return node;
  }

  const roots = blockersIn(path, red).map((o) => clear(o, new Set(path.map(key)), new Set([red]), 1));
  return { roots, decisions: forks.size };
}

/** A Board as Cells: blocks that never move are walls; the board itself has no edge. */
export function boardCells(board: Board): Cells {
  return {
    at(x, y) {
      const o = board.at(x, y);
      return o !== null && isFixed(board.home(o)!) ? EDGE : o;
    },
    block: (id) => board.block(id),
  };
}

/** A goal's decisions, stage by stage: replaying its moves, a stage before each of red's
 * moves (at the start, and after each red move that leaves it short of the target). The
 * board is left as it was. */
export function decisionStages(board: Board, goal: Goal): number[] {
  const cells = boardCells(board), stages = [decisionTree(cells, goal.red, goal.target).decisions];
  const mark = board.mark();
  for (const m of goal.moves) {
    board.move(m.block, m.to);
    if (m.block === goal.red && (m.to.x !== goal.target.x || m.to.y !== goal.target.y)) stages.push(decisionTree(cells, goal.red, goal.target).decisions);
  }
  board.undo(mark);
  return stages;
}
