// The Auditor (reports/goal-spec.md): the Judge takes a Goal's move count on trust, so on
// the Bench each Goal is searched for a shorter solution with a large budget (the difficulty
// measure's A*, src/difficulty.ts, over windows round red's run and the Goal's moves, and
// over the blocks that matter, reaching as far as the game's furthest). Never in play.
import { measure, type Reach } from "../src/difficulty";
import { contractGoal, fromMove, requestBoard, type Goal, type Request } from "../src/contract";
import { referee } from "../src/referee";

/** Boards the A* may search. */
export const AUDIT_LIMIT = 200_000;
/** The searches, the shortest solution of any counting: boxes of cells round red's run, and
 * the blocks that matter at least as far as the game's furthest reach (src/goal-search.ts,
 * LEVELS_OF_EFFORT), or the game's own count goes unchecked. Several, since the board budget
 * stops a wide search shallower (at 8 alone, one Record's shorter way that 5 found was
 * missed). (When the game searched 2, 5 found shorter ways out just past it for 5% of the
 * Records, mostly near goals: a 7-move one done in 3.) */
export const AUDIT_REACH: Reach = { depth: 16, most: 200 };
export const AUDITS = [{ margin: 5, reach: null }, { margin: 8, reach: AUDIT_REACH }];

export type Audit = {
  /** The fewest moves known: the Goal's, or the shorter solution found. */
  fewest: number;
  /** Whether the search that found `fewest` finished: then it is the fewest within its window. */
  exact: boolean;
  /** The Goal's moves beyond the fewest (0 when none shorter was found). */
  padding: number;
  /** The shorter solution, when one was found (checked by the Referee). */
  shorter?: Goal;
};

/** Audit a legal `goal`. */
export function audit(request: Request, goal: Goal, limit = AUDIT_LIMIT): Audit {
  const board = requestBoard(request);
  const runs = AUDITS.map((a) => measure(board, { id: goal.red, target: goal.target, solution: goal.moves.map(fromMove) }, { limit, ...a }));
  const d = runs.reduce((a, b) => ((b.solution?.length ?? Infinity) < (a.solution?.length ?? Infinity) ? b : a));
  const own = goal.moves.length;
  if (d.solution && d.solution.length < own) {
    const shorter = contractGoal({ id: goal.red, target: goal.target, solution: d.solution });
    // It has to replay onto the target (an untidy one still shows fewer moves will do); any
    // other fault is the measure's bug, not padding.
    const verdict = referee(request, shorter, board);
    if (verdict.ok || verdict.rule === 4) return { fewest: shorter.moves.length, exact: d.moves !== null, padding: own - shorter.moves.length, shorter };
    throw new Error(`auditor: the measure's solution is not legal (rule ${verdict.rule}: ${verdict.why})`);
  }
  return { fewest: own, exact: d.moves !== null, padding: 0 };
}
