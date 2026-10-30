// How many choices a goal offers a move: along its solution, the blocks in the red block's
// chain that can move. The chain is the red block, the blocks in the cells it still has to
// cross, and the blocks in those blockers' lanes. Of the ways of counting tried on real play,
// this one tracked extra moves best (reports/play-analysis.html); counting every slide
// destination of every block gave 45-77 "choices", far from how a person thinks about it.
import type { Point } from "./camera";
import { Board, isFixed } from "./board";
import type { Goal } from "./goal";
import type { Block, Layout } from "./layout";

/** How far along a blocker's lane its neighbours count as part of the chain. */
const LANE = 8;

const horizontal = (b: Block) => b.w > b.h;

/** Can this block slide at all, one cell either way? */
function canMove(board: Board, b: Block): boolean {
  if (isFixed(b)) return false;
  const ends = horizontal(b) ? [[b.x - 1, b.y], [b.x + b.w, b.y]] : [[b.x, b.y - 1], [b.x, b.y + b.h]];
  return ends.some(([x, y]) => board.at(x!, y!) === null);
}

/** The chain's blocks that can move, on the board as it is. */
function chainMovers(board: Board, id: string, target: Point): number {
  const red = board.block(id);
  const along = horizontal(red) ? red.x : red.y;
  const aim = horizontal(red) ? target.x : target.y;
  const size = horizontal(red) ? red.w : red.h;
  const chain = new Set([id]);
  const blockers = new Set<string>();
  for (let p = Math.min(along, aim); p < Math.max(along, aim) + size; p++) {
    const o = horizontal(red) ? board.at(p, red.y) : board.at(red.x, p);
    if (o && o !== id) blockers.add(o);
  }
  for (const b of blockers) {
    chain.add(b);
    const block = board.block(b);
    const at = horizontal(block) ? block.x : block.y;
    for (let p = at - LANE; p <= at + LANE; p++) {
      const o = horizontal(block) ? board.at(p, block.y) : board.at(block.x, p);
      if (o) chain.add(o);
    }
  }
  return [...chain].filter((c) => canMove(board, board.block(c))).length;
}

/** The average choices a move along the goal's solution, from the board it was made on. */
export function choices(layout: Layout, moved: ReadonlyMap<string, Point>, goal: Goal): number {
  const board = new Board(layout, moved);
  let total = 0;
  for (const m of goal.solution) {
    total += chainMovers(board, goal.id, goal.target);
    board.move(m.id, m.to);
  }
  return goal.solution.length ? total / goal.solution.length : 1;
}
