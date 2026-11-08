// Replays a goal the game logged as rejected (a play log's "rejected" event, as JSON): asks
// today's maker again with its Request, near and effort, and has the Referee check the answer.
// The e2e test keeps the one it forces in test/screenshots/rejected.json.
//   bun test/experiments/replay-rejected.ts [event.json]
import { makeCurrent } from "../../bench/current";
import type { Goal, Request } from "../../src/contract";
import type { Point } from "../../src/camera";
import { referee } from "../../src/referee";

const path = process.argv[2] ?? new URL("../screenshots/rejected.json", import.meta.url).pathname;
const event: { rule: number; why: string; goal: Goal; request: Request; near: Point; level: number } = await Bun.file(path).json();
const again = makeCurrent(event.request, event.level, event.near);
console.log(`logged: rule ${event.rule}, ${event.why} (${event.goal.moves.length} moves)`);
console.log(`again: ${again ? `${again.red} to ${again.target.x},${again.target.y} in ${again.moves.length} moves` : "none"}`);
console.log(`the Referee: ${again ? JSON.stringify(referee(event.request, again)) : "-"}`);
if (again) console.log(`the logged goal is the answer with its last move dropped: ${JSON.stringify({ ...again, moves: again.moves.slice(0, -1) }) === JSON.stringify(event.goal)}`);
