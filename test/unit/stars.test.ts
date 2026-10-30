import { describe, expect, test } from "bun:test";
import { medalWon, scoreTrack, starsEarned } from "../../src/stars";

describe("stars", () => {
  test("a star is lost every third of the fewest moves (at least 2) past the game's best", () => {
    expect(scoreTrack(15)).toEqual({ step: 5, lines: [15, 20, 25, 30], end: 35 });
    expect(scoreTrack(4)).toEqual({ step: 2, lines: [4, 6, 8, 10], end: 12 });
  });

  test("5 stars up to the game's best, one fewer past each line, never fewer than 1", () => {
    expect([10, 15, 16, 20, 21, 26, 31, 99].map((used) => starsEarned(15, used))).toEqual([5, 5, 4, 4, 3, 2, 1, 1]);
  });

  test("a medal for beating the game's best, but not after an undo", () => {
    expect(medalWon(15, 14)).toBe(true);
    expect(medalWon(15, 15)).toBe(false);
    expect(medalWon(15, 12, true)).toBe(false);
  });
});
