import { describe, expect, test } from "bun:test";
import { DEFAULT_EASE, EASES, easeNamed, slideDuration } from "../../src/eases";

describe("eases", () => {
  test("every ease starts at 0 and ends at 1", () => {
    for (const e of EASES) {
      expect(e.f(0)).toBeCloseTo(0, 5);
      expect(e.f(1)).toBeCloseTo(1, 5);
    }
  });

  test("the ease-outs are already most of the way at the half", () => {
    for (const name of ["Ease out quad", "Ease out cubic", "Ease out quart", "Ease out expo"]) {
      expect(easeNamed(name).f(0.5)).toBeGreaterThan(0.7);
    }
  });

  test("an unknown name falls back to the default", () => {
    expect(easeNamed("nope").name).toBe(DEFAULT_EASE);
  });

  test("longer slides take longer, up to a cap", () => {
    expect(slideDuration(1)).toBe(170);
    expect(slideDuration(4)).toBeGreaterThan(slideDuration(1));
    expect(slideDuration(100)).toBe(420);
  });
});

describe("speed slider", () => {
  test("its ends are 0.25x and 4x, the middle is normal speed, and it maps back", async () => {
    const { speedAt, positionOf } = await import("../../src/eases");
    expect(speedAt(0)).toBeCloseTo(0.25);
    expect(speedAt(1)).toBeCloseTo(4);
    expect(speedAt(0.5)).toBeCloseTo(1);
    expect(positionOf(2)).toBeCloseTo(0.75);
  });
});
