// The Referee (reports/goal-spec.md): is a Goal legal for its Request? Yes, or the hard rule
// it breaks and why. Cheap: one replay, and one more per move for the tidy rule. Rule 6
// (the same Request gives the same Goal) needs the maker asked twice, so the Bench checks
// it, not this.
import { isFixed, type Board } from "./board";
import { requestBoard, type Goal, type Move, type Request } from "./contract";

/** At most this many moves (rule 5). */
export const MAX_MOVES = 100;

export type Verdict = { ok: true } | { ok: false; rule: 1 | 2 | 3 | 4 | 5; why: string };

const at = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const fail = (rule: 1 | 2 | 3 | 4 | 5, why: string): Verdict => ({ ok: false, rule, why });

/** Judge `goal` against `request`, on `board` if given (the Request's board as it is; left
 * as it was). */
export function referee(request: Request, goal: Goal, board: Board = requestBoard(request)): Verdict {
  // 1. Red is real: a block that slides.
  const red = board.home(goal.red);
  if (!red || isFixed(red)) return fail(1, `no sliding block ${JSON.stringify(goal.red)}`);
  // 5. Bounded (checked early: the tidy rule replays once per move).
  if (goal.moves.length > MAX_MOVES) return fail(5, `${goal.moves.length} moves, over ${MAX_MOVES}`);
  // 2. Every move a slide, and 3. it ends on the target, not where red started.
  const start = board.block(goal.red);
  const mark = board.mark();
  try {
    for (const [i, m] of goal.moves.entries()) {
      const why = slideFault(board, m);
      if (why) return fail(2, `move ${i + 1} (${m.block} ${at(m.from)} -> ${at(m.to)}): ${why}`);
      board.move(m.block, m.to);
    }
    const end = board.block(goal.red);
    if (end.x !== goal.target.x || end.y !== goal.target.y) return fail(3, `red ends on ${at(end)}, not the target ${at(goal.target)}`);
  } finally {
    board.undo(mark);
  }
  if (start.x === goal.target.x && start.y === goal.target.y) return fail(3, `the target ${at(goal.target)} is where red starts`);
  // 4. Tidy: no block twice in a row, and no move that can be dropped.
  for (let i = 1; i < goal.moves.length; i++) {
    if (goal.moves[i]!.block === goal.moves[i - 1]!.block) return fail(4, `moves ${i} and ${i + 1} both slide ${goal.moves[i]!.block} (one slide)`);
  }
  for (let i = 0; i < goal.moves.length; i++) {
    if (solves(board, goal, goal.moves.filter((_, k) => k !== i))) return fail(4, `it still solves without move ${i + 1}`);
  }
  return { ok: true };
}

/** Why a move is not a slide on the board as it is now, or null if it is one: its block is at
 * `from`, `to` is on the block's own axis and not `from`, and every cell it sweeps through
 * is empty. */
export function slideFault(board: Board, m: Move): string | null {
  if (typeof m?.block !== "string" || !Number.isInteger(m.from?.x) || !Number.isInteger(m.from?.y) || !Number.isInteger(m.to?.x) || !Number.isInteger(m.to?.y)) return "not a move";
  const home = board.home(m.block);
  if (!home) return "no such block";
  if (isFixed(home)) return "the block never slides";
  const b = board.block(m.block);
  if (b.x !== m.from.x || b.y !== m.from.y) return `the block is at ${at(b)}`;
  const horizontal = b.w > b.h;
  if (horizontal ? m.to.y !== b.y : m.to.x !== b.x) return "off the block's axis";
  if (m.to.x === b.x && m.to.y === b.y) return "it goes nowhere";
  const from = horizontal ? b.x : b.y, to = horizontal ? m.to.x : m.to.y, size = horizontal ? b.w : b.h;
  for (let p = Math.min(from, to); p < Math.max(from, to) + size; p++) {
    const cell = horizontal ? { x: p, y: b.y } : { x: b.x, y: p };
    const o = board.at(cell.x, cell.y);
    if (o !== null && o !== b.id) return `${o} is in the way at ${at(cell)}`;
  }
  return null;
}

/** Do these moves replay and leave red on the target? (The board is left as it was.) */
function solves(board: Board, goal: Goal, moves: Move[]): boolean {
  const mark = board.mark();
  try {
    for (const m of moves) {
      if (slideFault(board, m)) return false;
      board.move(m.block, m.to);
    }
    const end = board.block(goal.red);
    return end.x === goal.target.x && end.y === goal.target.y;
  } finally {
    board.undo(mark);
  }
}
