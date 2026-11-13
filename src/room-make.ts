// Making a room on the device (src/room-worker.ts runs it in the background, whenever the game
// is idle): room number k is always the same room on every device (seeded by k, budgets in
// states, never in time). A random 6x6 room, its best goal near an aim with as many extra moves
// as it has, walled in (exact: sealed), then thinned to what its bounds need (src/room-core.ts).
import { bestGoal, randomRoom, rng } from "./extra-gen-core";
import { thin, walledRoom } from "./room-core";
import type { Room } from "./room";

/** The aims room k cycles through (fewest moves; the library has fewer middling rooms). */
const AIMS = [7, 9, 11, 13, 8, 10, 12, 6];

/** Room k, or null if its tries came to nothing (then k + 1 is next anyway). From try `from`
 * on (a maker stopped part way goes on where it was: the tries before only draw their random
 * rooms, which is all of the seed a failed try uses), each failed try told to `failed`. */
export function makeRoom(k: number, tries = 30, from = 1, failed?: (t: number) => void): { room: Room | null; tries: number } {
  const next = rng(1_000_003 * (k + 1) + 17), aim = AIMS[k % AIMS.length]!;
  for (let t = 1; t <= tries; t++) {
    const C = 6, g = randomRoom(C, C, 10 + Math.floor(next() * 5), 0, next);
    if (t < from) continue;
    const b = bestGoal(g, aim - 1, aim + 2, "high", 120_000);
    if (!b || b.fewest < aim - 1) {
      failed?.(t);
      continue;
    }
    const r = walledRoom(C, g.pieces, g.pos, [], b.red, b.target, `d${k}`);
    if (!r) {
      failed?.(t);
      continue;
    }
    const { room } = thin(r, next, 8_000_000, 400_000);
    room.from = `device ${k}`;
    return { room, tries: t };
  }
  return { room: null, tries };
}

