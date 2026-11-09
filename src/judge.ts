// The Judge (reports/goal-spec.md): how good a legal Goal is, from the Request and the Goal
// alone, never from how the maker found it. A few named terms and one fitness:
//
//   difficulty = fewest moves + decision × decisions
//   balance    = difficulty / distance^distance × track^track blocks × (1 + extra moves / fewest moves)^extra
//   fitness    = balance × aim^|fewest moves − ramp aim| × reach^(reach beyond reachFree) × clash^clashes
//
// with every weight from the Request's wishes (contract.ts WISHES by default).
import type { Board } from "./board";
import { playerCells, requestBoard, WISHES, type Goal, type Move, type Request } from "./contract";
import { decisionStages } from "./decisions";

export type Terms = {
  /** The Goal's move count (or the Auditor's, when it found fewer). */
  moves: number;
  decisions: number;
  /** Extra moves (extraMoves): blocks that have to move again, red included. */
  extra: number;
  /** Cells red travels from start to target. */
  distance: number;
  /** Blocks lying the same way in red's lane between start and the target's far end. */
  track: number;
  /** How far the moves are from the ramp aim (0 with none). */
  aimOff: number;
  /** Cells from where the player is (the last red block on its target) to red. */
  reach: number;
  /** Earlier targets the target overlaps, plus earlier red blocks in red's lane. */
  clashes: number;
  difficulty: number;
  balance: number;
  fitness: number;
};

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** The fewest steps (Manhattan) from a cell of `a` to a cell of `b`. */
const gap = (a: Box, b: Box) => Math.max(0, a.x - (b.x + b.w - 1), b.x - (a.x + a.w - 1)) + Math.max(0, a.y - (b.y + b.h - 1), b.y - (a.y + a.h - 1));

/** Extra moves: Σ over the blocks a solution moves of (times moved − 1), the moves less the
 * blocks moved, red counting. In a shortest solution no block moves twice in a row, so each
 * is a block that has to come back, or go on, after others moved (reports/extra-moves.html:
 * the goals players took to; nearly the same over every shortest solution). */
export function extraMoves(blocks: readonly string[]): number {
  return blocks.length - new Set(blocks).size;
}

/** The balance's factor for `extra` moves of `moves`: (1 + their share)^power. */
export const extraFactor = (extra: number, moves: number, power: number) => Math.pow(1 + extra / Math.max(moves, 1), power);

/** The terms and fitness of a legal `goal` (referee.ts), on `board` if given (the Request's
 * board as it is; left as it was). From the Auditor: `fewest` replaces the Goal's move count,
 * `shorter` its moves for the extra moves (a solution longer than the fewest can move blocks
 * again that a shortest one would not), and with `proved` false (its search did not finish)
 * the extra moves count none: they are only counted on a solution it proved shortest. (In
 * play, with no Auditor, on the Goal's moves as they are.) */
export function judge(request: Request, goal: Goal, { board = requestBoard(request), fewest, shorter, proved }: { board?: Board; fewest?: number; shorter?: Move[]; proved?: boolean } = {}): Terms {
  const w = { ...WISHES, ...request.wishes };
  const red = board.block(goal.red), hz = red.w > red.h;
  const moves = fewest ?? goal.moves.length;
  const extra = proved === false ? 0 : extraMoves((shorter ?? goal.moves).map((m) => m.block));
  const decisions = decisionStages(board, goal).reduce((a, b) => a + b, 0);
  const distance = Math.abs(hz ? goal.target.x - red.x : goal.target.y - red.y);
  // Blocks on red's own track: in its lane, lying its way.
  const seen = new Set<string>();
  const from = hz ? red.x : red.y, to = hz ? goal.target.x : goal.target.y, size = hz ? red.w : red.h;
  for (let p = Math.min(from, to); p < Math.max(from, to) + size; p++) {
    const o = hz ? board.at(p, red.y) : board.at(red.x, p);
    if (o === null || o === red.id || seen.has(o)) continue;
    const b = board.block(o);
    if (hz ? b.w > b.h && b.y === red.y : b.h > b.w && b.x === red.x) seen.add(o);
  }
  const track = seen.size;
  const aimOff = request.rampAim === null ? 0 : Math.abs(moves - request.rampAim);
  const reach = gap(playerCells(request, board), red);
  let clashes = 0;
  const target = { ...goal.target, w: red.w, h: red.h };
  for (const h of request.history) {
    const b = board.home(h.red);
    if (!b) continue;
    if (overlaps(target, { ...h.target, w: b.w, h: b.h })) clashes++;
    if ((b.w > b.h) === hz && (hz ? b.y === red.y : b.x === red.x)) clashes++;
  }
  const difficulty = moves + w.decision * decisions;
  const balance = (difficulty / Math.pow(Math.max(distance, 1), w.distance)) * Math.pow(w.track, track) * extraFactor(extra, moves, w.extra!);
  const fitness = balance * Math.pow(w.aim, aimOff) * Math.pow(w.reach, Math.max(0, reach - w.reachFree)) * Math.pow(w.clash, clashes);
  return { moves, decisions, extra, distance, track, aimOff, reach, clashes, difficulty, balance, fitness };
}
