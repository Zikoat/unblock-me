import { describe, expect, test } from "bun:test";
import { pinch, toScreen, toWorld, zoomAt, type Point } from "../../src/camera";
import { Gestures } from "../../src/gestures";
import { borderOnScreen, latticeRect, limits, newScene, visibleBlocks, type Scene } from "../../src/scene";
import { blockAt, blocksIn, CHUNK, generated, slideRange, UNIT, type Block } from "../../src/world";

const setup = () => {
  const scene = newScene(400, 800);
  let changes = 0;
  const g = new Gestures(scene, () => changes++);
  return { scene, g, changes: () => changes };
};
const center = (scene: Scene, b: Block) =>
  toScreen(scene.camera, { x: (b.x + b.w / 2) * UNIT, y: (b.y + b.h / 2) * UNIT });
const horizontal = (b: Block) => b.w > b.h;
/** A screen point inside the border with no block under it. */
function emptyPoint(scene: Scene): Point {
  const blocks = visibleBlocks(scene);
  for (let y = 200; y < 600; y += 10) {
    for (let x = 100; x < 300; x += 10) {
      const w = toWorld(scene.camera, { x, y });
      if (!blockAt(blocks, { x: w.x / UNIT, y: w.y / UNIT })) return { x, y };
    }
  }
  throw new Error("no empty point");
}
/** Is any lattice cell of `block` at position `pos` (along its axis) taken by another block? */
function collides(block: Block, pos: number, moved: Map<string, Point>): boolean {
  const at = horizontal(block) ? { ...block, x: pos } : { ...block, y: pos };
  return blocksIn({ x: at.x, y: at.y, width: at.w, height: at.h }, moved).some((o) => o.id !== block.id);
}
/** Drag with one finger in small steps. */
function drag(g: Gestures, from: Point, to: Point, steps = 10): void {
  g.down(1, from);
  for (let i = 1; i <= steps; i++) g.move(1, { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  g.up(1, to);
}

describe("camera", () => {
  test("zoomAt keeps the point under the cursor", () => {
    const camera = { scale: 1, offsetX: 50, offsetY: 20 };
    const at = { x: 120, y: 300 };
    const zoomed = zoomAt(camera, at, 2.5);
    expect(toScreen(zoomed, toWorld(camera, at))).toEqual(at);
  });

  test("pinch zooms by finger distance and pans with the midpoint", () => {
    const next = pinch({ scale: 1, offsetX: 0, offsetY: 0 }, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 300, y: 400 }, { x: 500, y: 400 }]);
    expect(next.scale).toBe(2);
    expect(toScreen(next, { x: 150, y: 100 })).toEqual({ x: 400, y: 400 });
  });
});

describe("zoom limits", () => {
  test("max zoom fits two cells in the width, min zoom puts 670 world units in a third", () => {
    const scene = newScene(400, 800);
    expect(2 * UNIT * limits(scene).max).toBeCloseTo(400);
    expect(670 * limits(scene).min).toBeCloseTo(400 / 3);
  });

  test("wheel stops at the limits", () => {
    const { scene, g } = setup();
    for (let i = 0; i < 50; i++) g.wheel({ x: 200, y: 400 }, -500);
    expect(scene.camera.scale).toBeCloseTo(limits(scene).max);
    for (let i = 0; i < 50; i++) g.wheel({ x: 200, y: 400 }, 500);
    expect(scene.camera.scale).toBeCloseTo(limits(scene).min);
  });
});

describe("generated world", () => {
  test("blocks are 2x1 or 1x2 on whole lattice cells, inside their chunk, the same every time", () => {
    let blocks = 0;
    let wide = 0;
    for (let cx = -20; cx < 20; cx++) {
      for (let cy = -20; cy < 20; cy++) {
        const b = generated(cx, cy);
        expect(b).toEqual(generated(cx, cy));
        if (!b) continue;
        blocks++;
        if (horizontal(b)) wide++;
        expect([[2, 1], [1, 2]]).toContainEqual([b.w, b.h]);
        expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true);
        expect(b.x).toBeGreaterThanOrEqual(cx * CHUNK);
        expect(b.x + b.w).toBeLessThanOrEqual((cx + 1) * CHUNK);
        expect(b.y).toBeGreaterThanOrEqual(cy * CHUNK);
        expect(b.y + b.h).toBeLessThanOrEqual((cy + 1) * CHUNK);
      }
    }
    expect(blocks / 1600).toBeGreaterThan(0.6);
    expect(wide / blocks).toBeGreaterThan(0.4);
    expect(wide / blocks).toBeLessThan(0.6);
  });

  test("blocksIn returns exactly the blocks touching the area", () => {
    const area = { x: -11.3, y: 4.2, width: 30.1, height: 17.4 };
    const expected = [];
    for (let cx = -10; cx < 10; cx++) {
      for (let cy = -10; cy < 10; cy++) {
        const b = generated(cx, cy);
        if (b && b.x < area.x + area.width && b.x + b.w > area.x && b.y < area.y + area.height && b.y + b.h > area.y) expected.push(b.id);
      }
    }
    expect(blocksIn(area, new Map()).map((b) => b.id).sort()).toEqual(expected.sort());
  });

  test("a moved block shows at its new place even when its home chunk is out of view", () => {
    const home = generated(0, 0) ?? generated(1, 0) ?? generated(2, 0)!;
    const moved = new Map([[home.id, { x: 500, y: 500 }]]);
    expect(blocksIn({ x: home.x, y: home.y, width: 1, height: 1 }, moved)).toEqual([]);
    expect(blocksIn({ x: 500, y: 500, width: 1, height: 1 }, moved)).toContainEqual({ ...home, x: 500, y: 500, moved: true });
  });

  test("slideRange stops right at the nearest blocks in the lane", () => {
    const moved = new Map<string, Point>();
    let checked = 0;
    for (let cx = -15; cx < 15; cx++) {
      for (let cy = -15; cy < 15; cy++) {
        const b = generated(cx, cy);
        if (!b) continue;
        const pos = horizontal(b) ? b.x : b.y;
        const { lo, hi } = slideRange(b, moved);
        // Every position in between is free, and one step further is taken.
        for (let p = lo; p <= hi; p++) expect(collides(b, p, moved)).toBe(false);
        expect(collides(b, lo - 1, moved)).toBe(true);
        expect(collides(b, hi + 1, moved)).toBe(true);
        expect(lo).toBeLessThanOrEqual(pos);
        expect(hi).toBeGreaterThanOrEqual(pos);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
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
        onScreenTotal += blocksIn(latticeRect(scene, { x: 0, y: 0, width: 400, height: 800 }), scene.moved).length;
      }
    }
    expect(onScreenTotal).toBeGreaterThan(visibleTotal);
    expect(visibleTotal).toBeGreaterThan(60);
  });

  test("panning away and back shows the same blocks", () => {
    const { scene, g } = setup();
    const before = visibleBlocks(scene);
    const pan = (dx: number, dy: number) => {
      const from = emptyPoint(scene);
      g.down(1, from);
      g.move(1, { x: from.x + dx, y: from.y + dy });
      g.up(1, { x: from.x + dx, y: from.y + dy });
    };
    for (let i = 0; i < 10; i++) pan(-150, -300);
    expect(visibleBlocks(scene).map((b) => b.id)).not.toEqual(before.map((b) => b.id));
    for (let i = 0; i < 10; i++) pan(150, 300);
    expect(visibleBlocks(scene)).toEqual(before);
    expect(scene.moved.size).toBe(0);
  });
});

describe("gestures", () => {
  test("a tap on the background puts the circle there", () => {
    const { scene, g } = setup();
    const at = emptyPoint(scene);
    g.down(1, at);
    g.move(1, { x: at.x + 4, y: at.y });
    g.up(1, { x: at.x + 4, y: at.y });
    expect(scene.circle).toEqual(toWorld(scene.camera, at));
  });

  test("a tap on a block toggles its mark and leaves the circle and the block alone", () => {
    const { scene, g, changes } = setup();
    const block = visibleBlocks(scene)[0]!;
    const at = center(scene, block);
    g.down(1, at);
    g.up(1, { x: at.x + 4, y: at.y + 3 });
    expect(scene.circle).toBeNull();
    expect(scene.moved.size).toBe(0);
    expect(visibleBlocks(scene).find((b) => b.id === block.id)).toMatchObject({ tapped: true, x: block.x, y: block.y });
    expect(changes()).toBe(1);
    g.down(1, at);
    g.up(1, at);
    expect(visibleBlocks(scene).find((b) => b.id === block.id)).toMatchObject({ tapped: false });
  });

  test("dragging the background pans and does not tap", () => {
    const { scene, g } = setup();
    const at = emptyPoint(scene);
    const before = scene.camera;
    drag(g, at, { x: at.x + 60, y: at.y + 40 });
    expect(scene.camera).toEqual({ ...before, offsetX: before.offsetX + 60, offsetY: before.offsetY + 40 });
    expect(scene.circle).toBeNull();
  });

  test("a block follows the finger only along its long axis while dragged, and snaps to the lattice on drop", () => {
    const { scene, g, changes } = setup();
    // A block with room to move one cell forward.
    const block = visibleBlocks(scene).find((b) => slideRange(b, scene.moved).hi >= (horizontal(b) ? b.x : b.y) + 1)!;
    const at = center(scene, block);
    const cell = UNIT * scene.camera.scale;
    // Along the axis by 0.4 of a cell, and sideways a lot.
    const along = horizontal(block) ? { x: 0.4 * cell, y: 80 } : { x: 80, y: 0.4 * cell };
    g.down(1, at);
    g.move(1, { x: at.x + along.x, y: at.y + along.y });
    expect(scene.dragging!.id).toBe(block.id);
    expect(horizontal(block) ? scene.dragging!.y : scene.dragging!.x).toBe(horizontal(block) ? block.y : block.x);
    expect(horizontal(block) ? scene.dragging!.x : scene.dragging!.y).toBeCloseTo((horizontal(block) ? block.x : block.y) + 0.4);
    expect(visibleBlocks(scene).at(-1)!.id).toBe(block.id);
    // Released at 0.4: it snaps back home and nothing is stored.
    g.up(1, { x: at.x + along.x, y: at.y + along.y });
    expect(scene.dragging).toBeNull();
    expect(scene.moved.size).toBe(0);
    expect(changes()).toBe(0);
    // Released at 0.6: it snaps one cell on and is stored.
    const further = horizontal(block) ? { x: at.x + 0.6 * cell, y: at.y } : { x: at.x, y: at.y + 0.6 * cell };
    drag(g, at, further);
    expect(scene.moved.get(block.id)).toEqual(horizontal(block) ? { x: block.x + 1, y: block.y } : { x: block.x, y: block.y + 1 });
    expect(changes()).toBe(1);
    expect(scene.tapped.size).toBe(0);
  });

  test("a block cannot be dragged into or over another block", () => {
    const { scene, g } = setup();
    // A block with a neighbour a few cells ahead in its lane.
    const block = visibleBlocks(scene).find((b) => {
      const pos = horizontal(b) ? b.x : b.y;
      const { hi } = slideRange(b, scene.moved);
      return hi - pos >= 0 && hi - pos <= 4;
    })!;
    const pos = horizontal(block) ? block.x : block.y;
    const { hi } = slideRange(block, scene.moved);
    const at = center(scene, block);
    const far = 10 * UNIT * scene.camera.scale; // well past the neighbour
    drag(g, at, horizontal(block) ? { x: at.x + far, y: at.y } : { x: at.x, y: at.y + far });
    const now = scene.moved.get(block.id) ?? block;
    expect(horizontal(block) ? now.x : now.y).toBe(hi);
    expect(collides(block, hi, scene.moved)).toBe(false);
    expect(hi - pos).toBeLessThanOrEqual(4);
  });

  test("two fingers zoom and pan together, with no tap", () => {
    const { scene, g } = setup();
    const world = toWorld(scene.camera, { x: 200, y: 400 });
    const scale = scene.camera.scale;
    g.down(1, { x: 175, y: 400 });
    g.down(2, { x: 225, y: 400 });
    g.move(1, { x: 150, y: 500 });
    g.move(2, { x: 250, y: 500 });
    expect(scene.camera.scale).toBeCloseTo(scale * 2);
    const now = toScreen(scene.camera, world);
    expect(now.x).toBeCloseTo(200);
    expect(now.y).toBeCloseTo(500);
    g.up(1, { x: 150, y: 500 });
    g.up(2, { x: 250, y: 500 });
    expect(scene.circle).toBeNull();
  });

  test("after a pinch the remaining finger pans", () => {
    const { scene, g } = setup();
    const before = scene.camera;
    g.down(1, { x: 150, y: 400 });
    g.down(2, { x: 250, y: 400 });
    g.up(1, { x: 150, y: 400 });
    g.move(2, { x: 280, y: 420 });
    g.up(2, { x: 280, y: 420 });
    expect(scene.camera).toEqual({ ...before, offsetX: before.offsetX + 30, offsetY: before.offsetY + 20 });
  });

  test("a second finger during a block drag drops the block on the lattice and pinches", () => {
    const { scene, g } = setup();
    const block = visibleBlocks(scene)[0]!;
    const at = center(scene, block);
    g.down(1, at);
    g.move(1, horizontal(block) ? { x: at.x + 40, y: at.y } : { x: at.x, y: at.y + 40 });
    g.down(2, { x: 300, y: 600 });
    expect(scene.dragging).toBeNull();
    const now = scene.moved.get(block.id) ?? block;
    expect(Number.isInteger(now.x) && Number.isInteger(now.y)).toBe(true);
  });

  test("a cancelled press is not a tap", () => {
    const { scene, g } = setup();
    g.down(1, emptyPoint(scene));
    g.cancel(1);
    expect(scene.circle).toBeNull();
  });
});
