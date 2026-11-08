// The Bench's parts (bench/): the Auditor catches padding, records only improve, and the Gate
// passes or names each threshold missed.
import { describe, expect, test } from "bun:test";
import { gameRequest, type Goal, type Move } from "../../src/contract";
import { referee } from "../../src/referee";
import type { Placed } from "../../src/layout";
import { audit } from "../../bench/auditor";
import { gate, percentile, type Scores } from "../../bench/gate";
import { keepRecord, type Records } from "../../bench/run";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });
const mv = (block: string, from: [number, number], to: [number, number]): Move => ({ block, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] } });

describe("auditor", () => {
  // r has to get past v: v down by one will do (2 moves), but the padded goal sends u left so
  // that v can go up instead (3 moves). Tidy all the same: drop u's move and v can't go up.
  const placed = [W(-1, 0), H("r", 0, 0), V("v", 3, 0), H("u", 3, -1), W(3, 3), W(7, 0)];
  const request = gameRequest({ seed: 0, tries: 0, ui: {}, placed, moved: new Map(), done: [], rampAim: 4 });
  const padded: Goal = { red: "r", target: { x: 4, y: 0 }, moves: [mv("u", [3, -1], [1, -1]), mv("v", [3, 0], [3, -2]), mv("r", [0, 0], [4, 0])] };

  test("a padded goal that passes the tidy rule: the audited fewest is lower", () => {
    expect(referee(request, padded)).toEqual({ ok: true });
    const a = audit(request, padded);
    expect(a).toMatchObject({ fewest: 2, exact: true, padding: 1 });
    expect(referee(request, a.shorter!)).toEqual({ ok: true });
  });

  test("a shortest goal is not padded", () => {
    const a = audit(request, { red: "r", target: { x: 4, y: 0 }, moves: [mv("v", [3, 0], [3, 1]), mv("r", [0, 0], [4, 0])] });
    expect(a).toEqual({ fewest: 2, exact: true, padding: 0 });
  });

  test("a shorter way just past the game's window is found", () => {
    // r has to get past v. Up, v needs u moved left (right is walled), and u needs t moved
    // left: 4 moves. Down, v needs z (rows 2 and 3) moved down by one, into row 4: 3 moves,
    // but row 4 is past the game's window (2 rows round red's run), which saw only the 4.
    const placed = [W(-1, 0), H("r", 0, 0), V("v", 3, 0), H("u", 3, -1), W(5, -1), H("t", 0, -1), V("z", 3, 2), W(7, 0)];
    const request = gameRequest({ seed: 0, tries: 0, ui: {}, placed, moved: new Map(), done: [] });
    const long: Goal = { red: "r", target: { x: 4, y: 0 }, moves: [mv("t", [0, -1], [-2, -1]), mv("u", [3, -1], [1, -1]), mv("v", [3, 0], [3, -2]), mv("r", [0, 0], [4, 0])] };
    expect(referee(request, long)).toEqual({ ok: true });
    const a = audit(request, long);
    expect(a).toMatchObject({ fewest: 3, exact: true, padding: 1 });
    expect(a.shorter!.moves.map((m) => m.block)).toEqual(["z", "v", "r"]);
  });

  test("records: set, kept when not beaten, replaced when beaten or the case changed", () => {
    const records: Records = {};
    const c = { name: "c", request };
    const result = (fitness: number) => ({ name: "c", goal: padded, verdict: { ok: true as const }, same: true, ms: 1, terms: { fitness } as never });
    expect(keepRecord(records, c, "a", result(2))).toBe(true);
    expect(keepRecord(records, c, "b", result(2))).toBe(false);
    expect(keepRecord(records, c, "b", result(1))).toBe(false);
    expect(records.c!.maker).toBe("a");
    expect(keepRecord(records, c, "b", result(3))).toBe(true);
    expect(records.c).toMatchObject({ maker: "b", fitness: 3 });
    expect(keepRecord(records, { name: "c", request: { ...request, seed: 2 } }, "a", result(1))).toBe(true);
  });
});

describe("gate", () => {
  const good: Scores = { maker: "new", set: "quick", cases: 30, legal: 1, deterministic: 1, quality: { median: 0.97, worst5: 0.85 }, time: { median: 80, slowest5: 250 }, padding: { share: 0, mean: 0, max: 0 } };
  const shipping: Scores = { ...good, maker: "current", quality: { median: 0.96, worst5: 0.82 } };

  test("passes when every threshold is met", () => {
    expect(gate(good)).toEqual({ pass: true, fails: [] });
    expect(gate(good, shipping)).toEqual({ pass: true, fails: [] });
  });

  const failing: [string, Partial<Scores>][] = [
    ["legal", { legal: 29 / 30 }],
    ["deterministic", { deterministic: 29 / 30 }],
    ["quality median", { quality: { median: 0.94, worst5: 0.85 } }],
    ["quality worst 5%", { quality: { median: 0.97, worst5: 0.79 } }],
    ["time slowest 5%", { time: { median: 80, slowest5: 301 } }],
  ];
  for (const [what, change] of failing) {
    test(`fails on ${what}`, () => {
      const verdict = gate({ ...good, ...change });
      expect(verdict.pass).toBe(false);
      expect(verdict.fails.length).toBe(1);
      expect(verdict.fails[0]!.startsWith(what)).toBe(true);
    });
  }

  test("fails when worse than the shipping Contender", () => {
    const verdict = gate(good, { ...shipping, quality: { median: 0.99, worst5: 0.9 } });
    expect(verdict.pass).toBe(false);
    expect(verdict.fails.length).toBe(2);
    expect(verdict.fails.every((f) => f.includes("shipping current"))).toBe(true);
  });

  test("percentiles by nearest rank", () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 0.5)).toBe(10);
    expect(percentile(values, 0.05)).toBe(1);
    expect(percentile(values, 0.95)).toBe(19);
  });
});
