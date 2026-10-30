// The random layout, culling and the camera, on randomly placed boards.
import { describe, expect, test } from "bun:test";
import { pinch, toScreen, toWorld, zoomAt } from "../../src/camera";
import { Gestures } from "../../src/gestures";
import { borderOnScreen, latticeRect, limits, newScene, visibleBlocks } from "../../src/scene";
import { CHUNK, randomLayout, UNIT, type Block, type Layout } from "../../src/layout";
import { blocksIn, slideRange } from "../../src/rules";

const none = { moved: new Map() };
const AREA = { x: -40, y: -40, width: 80, height: 80 };
const cells = (b: Block) => {
  const out = [];
  for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) out.push(`${x},${y}`);
  return out;
};
const ids = (layout: Layout) => layout.blocksIn(AREA).map((b) => `${b.id}@${b.x},${b.y},${b.w}x${b.h}`).sort();

describe("random layout", () => {
  test("the same seed gives the same blocks, every time and in any order of asking", () => {
    const a = randomLayout(42);
    const b = randomLayout(42);
    b.blocksIn({ x: 30, y: 30, width: 5, height: 5 }); // ask about another area first
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).toEqual(ids(randomLayout(42)));
  });

  test("different seeds give different blocks", () => {
    const seen = new Set([1, 2, 3, 4, 5, 0xffffffff].map((s) => ids(randomLayout(s)).join()));
    expect(seen.size).toBe(6);
  });

  test("blocks are 2x1 or 1x2 on whole cells, inside their chunk, never overlapping", () => {
    for (const seed of [1, 7, 123456]) {
      const taken = new Set<string>();
      for (const b of randomLayout(seed).blocksIn(AREA)) {
        if (b.ui) continue;
        expect([[2, 1], [1, 2]]).toContainEqual([b.w, b.h]);
        expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true);
        const [cx, cy] = b.id.split(",").map(Number) as [number, number];
        expect(b.x).toBeGreaterThanOrEqual(cx * CHUNK);
        expect(b.x + b.w).toBeLessThanOrEqual((cx + 1) * CHUNK);
        expect(b.y).toBeGreaterThanOrEqual(cy * CHUNK);
        expect(b.y + b.h).toBeLessThanOrEqual((cy + 1) * CHUNK);
        for (const c of cells(b)) {
          expect(taken.has(c)).toBe(false);
          taken.add(c);
        }
      }
    }
  });

  test("it is dense: about half the cells are covered and many blocks are stuck or nearly", () => {
    const layout = randomLayout(9);
    const blocks = layout.blocksIn(AREA).filter((b) => !b.ui);
    const coverage = blocks.reduce((n, b) => n + b.w * b.h, 0) / (80 * 80);
    expect(coverage).toBeGreaterThan(0.4);
    expect(coverage).toBeLessThan(0.65);
    const wide = blocks.filter((b) => b.w > b.h).length / blocks.length;
    expect(wide).toBeGreaterThan(0.4);
    expect(wide).toBeLessThan(0.6);
    const room = blocks.slice(0, 400).map((b) => { const r = slideRange(layout, b, none); return r.hi - r.lo; });
    expect(room.filter((r) => r === 0).length / room.length).toBeGreaterThan(0.05);
    expect(room.filter((r) => r <= 3).length / room.length).toBeGreaterThan(0.5);
  });

  test("the UI blocks sit in the middle for every seed, and no block overlaps them", () => {
    for (const seed of [1, 2, 3, 99, 2 ** 31]) {
      const layout = randomLayout(seed);
      const near = layout.blocksIn({ x: -5, y: -5, width: 10, height: 10 });
      expect(near.filter((b) => b.ui).map((b) => [b.ui, b.x, b.y, b.w, b.h])).toEqual([
        ["home", -1, 0, 1, 1], ["reset", 0, 0, 1, 1], ["fullscreen", 1, 0, 1, 1], ["reports", 2, 0, 1, 1],
        ["density", -1, 2, 1, 1], ["border", 0, 2, 1, 1],
      ]);
      // Nothing is generated in the rectangle around both rows and the gap between them.
      for (const b of near) if (!b.ui) for (const c of cells(b)) {
        const [x, y] = c.split(",").map(Number) as [number, number];
        expect(x >= -1 && x <= 2 && y >= 0 && y <= 2).toBe(false);
      }
    }
  });

  test("byId finds every block where blocksIn put it", () => {
    const layout = randomLayout(5);
    for (const b of layout.blocksIn({ x: -10, y: -10, width: 20, height: 20 })) expect(layout.byId(b.id)).toEqual(b);
  });

  test("blocksIn returns exactly the blocks touching an area", () => {
    const layout = randomLayout(11);
    const all = layout.blocksIn({ x: -30, y: -30, width: 60, height: 60 });
    const area = { x: -11.3, y: 4.2, width: 13.1, height: 7.4 };
    const expected = all.filter((b) => b.x < area.x + area.width && b.x + b.w > area.x && b.y < area.y + area.height && b.y + b.h > area.y);
    expect(layout.blocksIn(area).map((b) => b.id).sort()).toEqual(expected.map((b) => b.id).sort());
  });

  test("a moved block shows at its new place even when its home is far out of view", () => {
    const layout = randomLayout(3);
    const home = layout.blocksIn({ x: 4, y: 4, width: 4, height: 4 }).find((b) => !b.ui)!;
    const changes = { moved: new Map([[home.id, { x: 500, y: 500 }]]) };
    expect(blocksIn(layout, { x: home.x, y: home.y, width: home.w, height: home.h }, changes).map((b) => b.id)).not.toContain(home.id);
    expect(blocksIn(layout, { x: 500, y: 500, width: 1, height: 1 }, changes)).toContainEqual({ ...home, x: 500, y: 500, moved: true });
  });

  test("slideRange matches a cell-by-cell check on random boards", () => {
    const layout = randomLayout(77);
    const occupied = (b: Block, pos: number) => {
      const at = b.w > b.h ? { ...b, x: pos } : { ...b, y: pos };
      return blocksIn(layout, { x: at.x, y: at.y, width: at.w, height: at.h }, none).some((o) => o.id !== b.id);
    };
    for (const b of layout.blocksIn({ x: -12, y: -12, width: 24, height: 24 })) {
      if (b.ui) continue;
      const { lo, hi } = slideRange(layout, b, none);
      for (let p = lo; p <= hi; p++) expect(occupied(b, p)).toBe(false);
      expect(occupied(b, lo - 1)).toBe(true);
      expect(occupied(b, hi + 1)).toBe(true);
    }
  });
});

describe("culling", () => {
  test("only blocks touching the border are visible, at every place and zoom", () => {
    const scene = newScene(400, 800);
    let visibleTotal = 0;
    let onScreenTotal = 0;
    for (const scale of [limits(scene).min, 1, limits(scene).max]) {
      for (let i = 0; i < 20; i++) {
        scene.camera = { scale, offsetX: i * 977, offsetY: i * -1301 };
        const border = latticeRect(scene, borderOnScreen(scene));
        const visible = visibleBlocks(scene);
        for (const b of visible) {
          expect(b.x < border.x + border.width && b.x + b.w > border.x && b.y < border.y + border.height && b.y + b.h > border.y).toBe(true);
        }
        visibleTotal += visible.length;
        onScreenTotal += blocksIn(scene.layout, latticeRect(scene, { x: 0, y: 0, width: 400, height: 800 }), scene).length;
      }
    }
    expect(onScreenTotal).toBeGreaterThan(visibleTotal);
    expect(visibleTotal).toBeGreaterThan(200);
  });

  test("panning away and back shows the same blocks", () => {
    const scene = newScene(400, 800, { layout: randomLayout(4) });
    const before = visibleBlocks(scene);
    scene.camera = { ...scene.camera, offsetX: 5000, offsetY: -3000 };
    expect(visibleBlocks(scene).map((b) => b.id)).not.toEqual(before.map((b) => b.id));
    scene.camera = { ...scene.camera, offsetX: 170, offsetY: 370 };
    expect(visibleBlocks(scene)).toEqual(before);
  });
});

describe("camera", () => {
  test("zoomAt keeps the point under the cursor", () => {
    const camera = { scale: 1, offsetX: 50, offsetY: 20 };
    const at = { x: 120, y: 300 };
    expect(toScreen(zoomAt(camera, at, 2.5), toWorld(camera, at))).toEqual(at);
  });

  test("pinch zooms by finger distance and pans with the midpoint", () => {
    const next = pinch({ scale: 1, offsetX: 0, offsetY: 0 }, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 300, y: 400 }, { x: 500, y: 400 }]);
    expect(next.scale).toBe(2);
    expect(toScreen(next, { x: 150, y: 100 })).toEqual({ x: 400, y: 400 });
  });

  test("max zoom fits two cells in the width, min zoom puts 670 world units in a third; the wheel stops there", () => {
    const scene = newScene(400, 800);
    const g = new Gestures(scene);
    expect(2 * UNIT * limits(scene).max).toBeCloseTo(400);
    expect(670 * limits(scene).min).toBeCloseTo(400 / 3);
    for (let i = 0; i < 50; i++) g.wheel({ x: 200, y: 400 }, -500);
    expect(scene.camera.scale).toBeCloseTo(limits(scene).max);
    for (let i = 0; i < 50; i++) g.wheel({ x: 200, y: 400 }, 500);
    expect(scene.camera.scale).toBeCloseTo(limits(scene).min);
  });
});
