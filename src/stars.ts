// Stars: five per goal, one lost at each line on its score track (reports/score-track.html).
// 5 stars is the game's own best; a star goes every third of it (at least 2 moves) after
// that; the last star is never lost. Finishing under the game's best wins a medal too,
// unless a move was undone on the way.

export const MAX_STARS = 5;

/** The track for a goal whose best known solution takes `fewest` moves: the move counts
 * after which each of the four stars that can be lost is gone, and where the track ends
 * (the last star, never lost). */
export function scoreTrack(fewest: number): { step: number; lines: number[]; end: number } {
  const step = Math.max(2, Math.round(fewest / 3));
  return { step, lines: [0, 1, 2, 3].map((i) => fewest + i * step), end: fewest + 4 * step };
}

/** The stars earned in `used` moves: 5, less one for each line passed, at least 1. */
export function starsEarned(fewest: number, used: number): number {
  return MAX_STARS - scoreTrack(fewest).lines.filter((at) => used > at).length;
}

/** A medal: fewer moves than the game's best, without an undo. */
export function medalWon(fewest: number, used: number, undone = false): boolean {
  return !undone && used < fewest;
}
