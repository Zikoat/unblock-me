// Stars: what a goal is worth comes from the fewest moves it takes (the same at every
// density, docs/play-analysis.md), and what the player earns from the moves they used.

export const MAX_STARS = 5;

/** What a goal is worth: a star per three moves of its fewest, from 1 (up to 3 moves) to
 * MAX_STARS (13 and up). Never more than its fewest moves, so one extra move costs at most
 * one star. */
export function starsWorth(fewest: number): number {
  return Math.min(MAX_STARS, Math.max(1, 1 + Math.round((fewest - 2) / 3)));
}

/** The stars earned: worth x fewest / used, so all of them in the fewest moves and fewer the
 * more moves it took, and always at least one. With worth never above fewest, one extra
 * move costs at most one star. */
export function starsEarned(worth: number, fewest: number, used: number): number {
  return Math.max(1, Math.round(worth * Math.min(1, fewest / Math.max(used, 1))));
}
