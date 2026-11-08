// Decisions (src/decisions.ts): the drawn spec's examples, boards worked by hand, and the
// seed-11 worked example (reports/goal-spec-visual.html).
import { describe, expect, test } from "bun:test";
import { Board } from "../../src/board";
import type { Point } from "../../src/camera";
import { boardCells, decisionStages, decisionTree } from "../../src/decisions";
import { gameRequest, type Goal } from "../../src/contract";
import { fixedLayout, randomLayout, type Placed } from "../../src/layout";
import { referee } from "../../src/referee";
import { judge } from "../../src/judge";

/** A board from text, as the drawn spec's asciiBoard: R r red, g target, b horizontal, d
 * vertical, # wall, . empty; walls all round it (outside is the edge). */
export function asciiBoard(rows: string[]): { placed: Placed[]; target: Point } {
  const W = Math.max(...rows.map((r) => r.length)), H = rows.length, used = new Set<string>(), placed: Placed[] = [];
  let target: Point | null = null;
  const wall = (x: number, y: number) => placed.push({ id: `#${x},${y}`, x, y, w: 1, h: 1, wall: true });
  for (let x = -1; x <= W; x++) wall(x, -1), wall(x, H);
  for (let y = 0; y < H; y++) wall(-1, y), wall(W, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = rows[y]![x] ?? "#";
    if (used.has(`${x},${y}`)) continue;
    if (c === "R" || c === "b") {
      placed.push({ id: c === "R" ? "red" : `b${x},${y}`, x, y, w: 2, h: 1 });
      used.add(`${x + 1},${y}`);
    } else if (c === "d") {
      placed.push({ id: `d${x},${y}`, x, y, w: 1, h: 2 });
      used.add(`${x},${y + 1}`);
    } else if (c === "#") wall(x, y);
    else if (c === "g" && !target) target = { x, y };
  }
  return { placed, target: target! };
}
const count = (rows: string[]) => {
  const { placed, target } = asciiBoard(rows);
  return decisionTree(boardCells(new Board(fixedLayout(placed))), "red", target).decisions;
};
/** The decisions if every plausible way were tried (as the Judge counted them before it
 * stopped at the first way that works). */
const full = (rows: string[]) => {
  const { placed, target } = asciiBoard(rows);
  return decisionTree(boardCells(new Board(fixedLayout(placed))), "red", target, { every: true }).decisions;
};

describe("decisions", () => {
  test("the drawn spec's three examples: 0, 1, 1", () => {
    expect(count(["Rr..gg"])).toBe(0);
    // d@2,1 can only go up (down runs off the board); b@2,0 left or right.
    expect(count([".dbbd...", ".dd.d...", "Rrd..gg.", "..bb...."])).toBe(1);
    // After red's first step: d@4,1 only up; b@3,0 left or right.
    expect(count([".ddbb...", ".dd.d...", "..Rrd.gg", "..bb...."])).toBe(1);
  });

  test("boards worked by hand", () => {
    // A blocker that can only go one way: d@3,0 up runs off the board, down (by one) is free.
    // None.
    expect(count(["...d...", "Rr.d.gg", ".......", "......."])).toBe(0);
    // d@3,1 can go up by one (free) or down by two (into b@3,3): a decision. Up is tried first
    // (nothing to clear) and works, so b@3,3 is never met. One. (Exploring every way, b@3,3,
    // free left and right, would be a second.)
    expect(count([".......", "...d...", "Rr.d.gg", "...bb..", "......."])).toBe(1);
    // Two blockers, each only up (down runs off the board), and up both need b@2,0 moved,
    // which can go either way: one decision, counted once though two branches meet it.
    expect(count(["..bb...", "..dd...", "Rrdd.gg", "......."])).toBe(1);
    // A block on red's track: left runs into red (a cycle, out), right is free: none.
    expect(count(["Rr.bb..gg...."])).toBe(0);
  });

  test("a person stops at the first way that works", () => {
    // d@3,1 blocks red: up by one needs b@2,0 cleared, down by two needs b@3,3: a decision.
    // As many blocks to clear each way, so the shorter slide first: up. b@2,0 can go left or
    // right, both free (a decision; left, the shorter, works), so up works and down is never
    // tried. d and b@2,0: two. Exploring every way also meets b@3,3 (left or right, both
    // free): three.
    const both = ["..bb....", "...d....", "Rr.d..gg", "...bb...", "........"];
    expect(count(both)).toBe(2);
    expect(full(both)).toBe(3);
    // The same, but down is free: the freer way first, though longer. d alone: one (b@2,0 is
    // never met; exploring every way, two).
    const free = ["..bb....", "...d....", "Rr.d..gg", "........", "........"];
    expect(count(free)).toBe(1);
    expect(full(free)).toBe(2);
    // A dead end: up needs b@2,0 cleared, which is walled in both ways (stuck, and no
    // decision), so up fails and down is tried: b@3,3 left or right, both free. d and b@3,3:
    // two, the same as exploring every way, since every way was tried.
    const dead = [".#bb#...", "...d....", "Rr.d..gg", "...bb...", "........"];
    expect(count(dead)).toBe(2);
    expect(full(dead)).toBe(2);
    // Which ways were tried: in the first board, d's down was not; in the dead end, both were.
    const { placed, target } = asciiBoard(dead);
    const [d] = decisionTree(boardCells(new Board(fixedLayout(placed))), "red", target).roots;
    expect(d!.ways.map((w) => [w.tried, w.ok])).toEqual([[true, false], [true, true]]);
    expect(d!.ways[0]!.needs.map((n) => [n.id, n.decision, n.ok])).toEqual([["b2,0", false, false]]);
  });

  test("the seed-11 worked example: 7 moves, 6 decisions in its cropped region, and on the real board", async () => {
    const html = await Bun.file(new URL("../../reports/goal-spec-visual.html", import.meta.url).pathname).text();
    const EX = JSON.parse(html.match(/^const EX = (.*);$/m)![1]!);
    const R = EX.region;
    const blocks: Placed[] = EX.blocks.map(([id, x, y, w, h]: [string, number, number, number, number]) => ({ id, x, y, w, h }));
    // The region with walls all round: outside it is wall, as the drawn spec has it.
    const walls: Placed[] = [];
    for (let x = R.x - 1; x <= R.x + R.w; x++) for (const y of [R.y - 1, R.y + R.h]) walls.push({ id: `#${x},${y}`, x, y, w: 1, h: 1, wall: true });
    for (let y = R.y; y < R.y + R.h; y++) for (const x of [R.x - 1, R.x + R.w]) walls.push({ id: `#${x},${y}`, x, y, w: 1, h: 1, wall: true });
    const goal: Goal = { red: EX.red, target: { x: EX.target[0], y: EX.target[1] }, moves: EX.moves.map(([block, f, t]: [string, number[], number[]]) => ({ block, from: { x: f[0], y: f[1] }, to: { x: t[0], y: t[1] } })) };
    const placed = [...blocks, ...walls];
    const crop = new Board(fixedLayout(placed));
    const request = gameRequest({ seed: EX.seed, tries: EX.tries, ui: {}, placed, moved: new Map(), done: [], rampAim: EX.aim });
    expect(referee(request, goal, crop)).toEqual({ ok: true });
    expect(goal.moves.length).toBe(7);
    // Red moves once, at the end: one stage, the start board. Six decisions: the three blockers
    // (each up or down), b@20,3 and b@22,3 (each left or right; a person tries right, the
    // shorter, and it works) and b@20,7. Trying every way would also meet b@22,7, behind
    // d@22,4's down, never tried since its up works: 7.
    expect(decisionStages(crop, goal)).toEqual([6]);
    expect(judge(request, goal, { board: crop }).decisions).toBe(6);
    expect(decisionTree(boardCells(crop), goal.red, goal.target, { every: true }).decisions).toBe(7);
    // The real board (unbounded, the same blocks in the region): the ways a person tries
    // stay inside the region, so the same six.
    const layout = randomLayout(EX.seed, { tries: EX.tries });
    const real = layout.blocksIn({ x: R.x, y: R.y, width: R.w, height: R.h }).filter((b) => b.x >= R.x && b.y >= R.y && b.x + b.w <= R.x + R.w && b.y + b.h <= R.y + R.h);
    expect(real.map((b) => [b.id, b.x, b.y, b.w, b.h]).sort()).toEqual(blocks.map((b) => [b.id!, b.x, b.y, b.w, b.h]).sort());
    const board = new Board(layout);
    expect(referee(gameRequest({ seed: EX.seed, tries: EX.tries, ui: {}, moved: new Map(), done: [], rampAim: EX.aim }), goal, board)).toEqual({ ok: true });
    expect(decisionStages(board, goal)).toEqual([6]);
  });

  test("a stage before each of red's moves short of the target", () => {
    // Red steps once (to x 2), then on to the target: two stages. Before the first, d@4,1 can
    // only go up and b@4,0 either way (one); after it, the same (one).
    const { placed, target } = asciiBoard([".dddbb..", ".dd.d...", "Rr..d.gg", "..bb...."]);
    const board = new Board(fixedLayout(placed));
    const goal: Goal = { red: "red", target, moves: [
      { block: "red", from: { x: 0, y: 2 }, to: { x: 2, y: 2 } },
      { block: "b4,0", from: { x: 4, y: 0 }, to: { x: 6, y: 0 } },
      { block: "d4,1", from: { x: 4, y: 1 }, to: { x: 4, y: 0 } },
      { block: "red", from: { x: 2, y: 2 }, to: target },
    ] };
    expect(decisionStages(board, goal)).toEqual([1, 1]);
  });
});
