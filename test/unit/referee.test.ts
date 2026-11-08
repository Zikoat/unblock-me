// The Referee (src/referee.ts) and the Judge (src/judge.ts) on hand-made goals: each hard
// rule broken in turn, real goals from both makers taken, and one goal's terms worked by hand.
import { describe, expect, test } from "bun:test";
import { Board } from "../../src/board";
import type { Point } from "../../src/camera";
import { gameRequest, movedIndex, movedMap, type Goal, type Move, type Request } from "../../src/contract";
import { judge } from "../../src/judge";
import { fixedLayout, type Placed } from "../../src/layout";
import { referee } from "../../src/referee";
import { current } from "../../bench/current";
import { referenceMaker } from "../../bench/reference";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });
const mv = (block: string, from: [number, number], to: [number, number]): Move => ({ block, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] } });

// r has to get from x 0 to 4, v is in the way: down by one (the wall below stops it there), or
// up by two once u has gone left. h and k are earlier red blocks, off to the side.
//
//   y -1  . . . u u . . .
//   y  0  # r r v . . . #
//   y  1  . . . v . . . .
//   y  2  h h . . . . . .   (h at x -4)
//   y  3  . . . # . . . .
const placed = [W(-1, 0), H("r", 0, 0), V("v", 3, 0), H("u", 3, -1), W(3, 3), W(7, 0), H("h", -4, 2), H("k", 10, 0)];
const request = (rampAim?: number, done: { id: string; target: Point }[] = []): Request => gameRequest({ seed: 0, tries: 0, ui: {}, placed, moved: new Map(), done, rampAim });
const goal = (moves: Move[], target: Point = { x: 4, y: 0 }, red = "r"): Goal => ({ red, target, moves });
const SHORT = [mv("v", [3, 0], [3, 1]), mv("r", [0, 0], [4, 0])];

describe("referee", () => {
  test("a goal that keeps every rule", () => {
    expect(referee(request(), goal(SHORT))).toEqual({ ok: true });
    // The long way round is tidy too: no move can be dropped.
    expect(referee(request(), goal([mv("u", [3, -1], [1, -1]), mv("v", [3, 0], [3, -2]), mv("r", [0, 0], [4, 0])]))).toEqual({ ok: true });
  });

  const broken: [string, Goal, number][] = [
    ["red is not a block", goal(SHORT, { x: 4, y: 0 }, "nope"), 1],
    ["red is a wall", goal([], { x: 7, y: 1 }, "w7,0"), 1],
    ["a move's block isn't at from", goal([mv("v", [3, 1], [3, 2]), mv("r", [0, 0], [4, 0])]), 2],
    ["off its axis", goal([mv("r", [0, 0], [0, 1])]), 2],
    ["going nowhere", goal([mv("v", [3, 0], [3, 0]), mv("r", [0, 0], [4, 0])]), 2],
    ["through a block", goal([mv("r", [0, 0], [4, 0])]), 2],
    ["through a wall", goal([mv("v", [3, 0], [3, 1]), mv("r", [0, 0], [6, 0])], { x: 6, y: 0 }), 2],
    ["moving a wall", goal([mv("w3,3", [3, 3], [3, 4]), ...SHORT]), 2],
    ["not ending on the target", goal([mv("v", [3, 0], [3, 1]), mv("r", [0, 0], [2, 0])]), 3],
    ["the target is where red starts", goal([], { x: 0, y: 0 }), 3],
    ["two moves in a row of one block", goal([mv("v", [3, 0], [3, 1]), mv("r", [0, 0], [2, 0]), mv("r", [2, 0], [4, 0])]), 4],
    ["a move that can be dropped", goal([mv("v", [3, 0], [3, 1]), mv("u", [3, -1], [1, -1]), mv("r", [0, 0], [4, 0])]), 4],
    ["over 100 moves", goal(Array.from({ length: 101 }, (_, i) => (i % 2 ? mv("u", [1, -1], [3, -1]) : mv("u", [3, -1], [1, -1])))), 5],
  ];
  for (const [what, g, rule] of broken) {
    test(`rule ${rule}: ${what}`, () => {
      const verdict = referee(request(), g);
      expect(verdict.ok ? 0 : verdict.rule).toBe(rule);
    });
  }

  test("the board is left as it was", () => {
    const board = new Board(fixedLayout(placed));
    referee(request(), goal(SHORT), board);
    referee(request(), goal([mv("v", [3, 0], [3, 1]), mv("r", [0, 0], [2, 0])]), board);
    expect(board.pos.size).toBe(0);
    expect(board.at(3, 0)).toBe("v");
  });

  test("real goals from both makers are taken, and the same Request gives the same Goal", () => {
    const real = gameRequest({ seed: 5, tries: 4, ui: {}, moved: new Map(), done: [], rampAim: 6 });
    for (const make of [current(0), referenceMaker({ states: 3_000, candidates: 4 })]) {
      const g = make(real)!;
      expect(g).not.toBeNull();
      expect(referee(real, g)).toEqual({ ok: true });
      expect(JSON.stringify(make(JSON.parse(JSON.stringify(real))))).toBe(JSON.stringify(g));
    }
  });
});

describe("contract", () => {
  test("moved blocks round-trip through the chunk index, which is plain JSON", () => {
    const moved = new Map([["b", { x: 9, y: -3 }], ["a", { x: 1, y: 2 }], ["c", { x: 2, y: 0 }]]);
    const index = movedIndex(moved);
    expect(index).toEqual({ "0,0": [["a", 1, 2], ["c", 2, 0]], "2,-1": [["b", 9, -3]] });
    expect(movedMap(JSON.parse(JSON.stringify(index)))).toEqual(moved);
    expect(JSON.parse(JSON.stringify(request(5)))).toEqual(request(5));
  });
});

describe("judge", () => {
  test("one goal's terms worked by hand", () => {
    // Earlier: k to (5, 0) (its target overlaps this one's, and k lies in r's row: two
    // clashes), then h to (-4, 2), where the player is now.
    const terms = judge(request(5, [{ id: "k", target: { x: 5, y: 0 } }, { id: "h", target: { x: -4, y: 2 } }]), goal(SHORT));
    // Decisions, one stage (red moves once, onto the target): v blocks red's way; up it sweeps
    // into u (which can then go left or right, both free: a decision), down by one is free:
    // v is a decision too. Two.
    // Reach: from h's cells (x -4..-3, y 2) to r's (x 0..1, y 0): 3 across and 2 down, 5.
    // Track: nothing lying r's way in its row between x 0 and 5 (v crosses it). Distance 4.
    expect(terms).toMatchObject({ moves: 2, decisions: 2, distance: 4, track: 0, aimOff: 3, reach: 5, clashes: 2, difficulty: 6 });
    // balance = 6 / 4^0.6 = 2.61165; fitness = balance × ½^3 (3 off the aim) × 0.8^1 (reach
    // 1 beyond 4) × ½^2 (clashes) = 0.0652913.
    expect(terms.balance).toBeCloseTo(2.61165, 4);
    expect(terms.fitness).toBeCloseTo(0.0652913, 6);
    // With no history, the player is at the origin cell: reach 0 to r's (0, 0); no ramp aim.
    expect(judge(request(), goal(SHORT))).toMatchObject({ reach: 0, clashes: 0, aimOff: 0 });
    // The Auditor's count replaces the Goal's.
    expect(judge(request(5), goal(SHORT), { fewest: 5 })).toMatchObject({ moves: 5, aimOff: 0, difficulty: 9 });
  });

  test("blocks on red's track count, those crossing it don't", () => {
    // r at x 0; a lies in its row at x 3 (on the track), b at x 9 (past the target), v crosses.
    const board = new Board(fixedLayout([H("r", 0, 0), H("a", 3, 0), V("v", 5, 0), H("b", 9, 0)]));
    const req = gameRequest({ seed: 0, tries: 0, ui: {}, placed: [], moved: new Map(), done: [], rampAim: undefined });
    expect(judge(req, goal([], { x: 6, y: 0 }), { board }).track).toBe(1);
  });
});
