// The Auditor (reports/goal-spec.md): the Judge takes a Goal's move count on trust, so on
// the Bench each Goal is searched for a shorter solution with a large budget (the difficulty
// measure's A*, src/difficulty.ts, over a window round red's run and the Goal's moves, wider
// than the game's). Never in play.
import { measure } from "../src/difficulty";
import { contractGoal, fromMove, requestBoard, type Goal, type Request } from "../src/contract";
import { referee } from "../src/referee";

/** Boards the A* may search. */
export const AUDIT_LIMIT = 200_000;
/** Cells round red's run the window takes in. The game's 2 missed shorter ways out just
 * past it (5% of the Records, mostly near goals: a 7-move one done in 3); 5 found all that
 * 8 did. */
export const AUDIT_MARGIN = 5;

export type Audit = {
  /** The fewest moves known: the Goal's, or the shorter solution found. */
  fewest: number;
  /** Whether the search finished: then `fewest` is the fewest within its window. */
  exact: boolean;
  /** The Goal's moves beyond the fewest (0 when none shorter was found). */
  padding: number;
  /** The shorter solution, when one was found (checked by the Referee). */
  shorter?: Goal;
};

/** Audit a legal `goal`. */
export function audit(request: Request, goal: Goal, limit = AUDIT_LIMIT): Audit {
  const board = requestBoard(request);
  const d = measure(board, { id: goal.red, target: goal.target, solution: goal.moves.map(fromMove) }, { limit, margin: AUDIT_MARGIN });
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
