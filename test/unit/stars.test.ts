import { describe, expect, test } from "bun:test";
import { MAX_STARS, starsEarned, starsWorth } from "../../src/stars";

describe("stars", () => {
  test("a goal is worth a star per three moves of its fewest, 1 to 5", () => {
    expect([1, 3, 4, 6, 7, 9, 10, 12, 13, 40].map(starsWorth)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(starsWorth(100)).toBe(MAX_STARS);
  });

  test("all stars in the fewest moves, at most one lost per extra move, always at least one", () => {
    expect(starsEarned(4, 10, 10)).toBe(4);
    expect(starsEarned(4, 10, 11)).toBe(4); // 4 x 10/11 rounds to 4
    expect(starsEarned(4, 10, 13)).toBe(3);
    expect(starsEarned(2, 4, 5)).toBe(2);
    expect(starsEarned(5, 14, 20)).toBe(4);
    expect(starsEarned(3, 7, 30)).toBe(1);
    expect(starsEarned(4, 10, 8)).toBe(4); // fewer than the game knew: all stars (and a medal)
  });
});
