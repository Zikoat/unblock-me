// Today's maker (src/goal-search.ts makeGoalHard, as the game runs it) as a Contender: it
// takes a Request and answers a Goal. What the game passes it is derived from the Request:
// near the last target (moved out of the island, as the game does), no earlier red block,
// no earlier target, and the ramp's aim.
import type { Point } from "../src/camera";
import { contractGoal, playerCells, requestBoard, worldLayout, type Goal, type Maker, type Request } from "../src/contract";
import { makeGoalHard } from "../src/goal-search";
import { inIsland } from "../src/island";

/** The game's maker at an effort level (goal-search.ts LEVELS_OF_EFFORT): 2 makes the goals
 * made ahead, most of those played; 0 those the player waits for. */
export function current(level = 2): Maker {
  return (request) => makeCurrent(request, level);
}

/** makeGoalHard on a Request, near `near` if given (the game sometimes asks round the middle
 * of the view instead: a goal it logged as rejected says where). */
export function makeCurrent(request: Request, level: number, near?: Point): Goal | null {
  const layout = worldLayout(request.world), board = requestBoard(request);
  if (!near) {
    const p = playerCells(request, board);
    near = { x: p.x, y: p.y };
    if (request.world.ui.island) while (inIsland(near)) near = { x: near.x + 1, y: near.y };
  }
  const avoid = request.history.flatMap((h) => {
    const red = layout.byId(h.red);
    return red ? [{ x: h.target.x, y: h.target.y, width: red.w, height: red.h }] : [];
  });
  const options = { moved: board.pos, exclude: new Set(request.history.map((h) => h.red)), avoid, target: request.rampAim ?? undefined };
  const found = makeGoalHard(layout, near, options, level);
  return found && contractGoal(found);
}
