import { describe, expect, test } from "bun:test";
import { pinch, toScreen, toWorld, worldRect, zoomAt, type Point } from "../../src/camera";
import { Gestures } from "../../src/gestures";
import { borderOnScreen, limits, newScene, visibleSquares, type Scene } from "../../src/scene";
import { CELL, generated, SQUARE_SIZE, squareAt, squaresIn } from "../../src/world";

const setup = () => {
  const scene = newScene(400, 800);
  let changes = 0;
  const g = new Gestures(scene, () => changes++);
  return { scene, g, changes: () => changes };
};
const center = (scene: Scene, s: { x: number; y: number }) =>
  toScreen(scene.camera, { x: s.x + SQUARE_SIZE / 2, y: s.y + SQUARE_SIZE / 2 });
/** A screen point inside the border with no square under it. */
function emptyPoint(scene: Scene): Point {
  const squares = visibleSquares(scene);
  for (let y = 200; y < 600; y += 10) {
    for (let x = 100; x < 300; x += 10) {
      if (!squareAt(squares, toWorld(scene.camera, { x, y }))) return { x, y };
    }
  }
  throw new Error("no empty point");
}

describe("camera", () => {
  test("zoomAt keeps the point under the cursor", () => {
    const camera = { scale: 1, offsetX: 50, offsetY: 20 };
    const at = { x: 120, y: 300 };
    const zoomed = zoomAt(camera, at, 2.5);
    expect(toScreen(zoomed, toWorld(camera, at))).toEqual(at);
    expect(zoomed.scale).toBe(2.5);
  });

  test("pinch zooms by finger distance and pans with the midpoint", () => {
    const camera = { scale: 1, offsetX: 0, offsetY: 0 };
    const next = pinch(camera, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 300, y: 400 }, { x: 500, y: 400 }]);
    expect(next.scale).toBe(2);
    expect(toScreen(next, { x: 150, y: 100 })).toEqual({ x: 400, y: 400 });
  });
});

describe("zoom limits", () => {
  test("max zoom fits two squares in the width, min zoom puts 670 world units in a third", () => {
    const scene = newScene(400, 800);
    const { min, max } = limits(scene);
    expect(2 * SQUARE_SIZE * max).toBeCloseTo(400);
    expect(670 * min).toBeCloseTo(400 / 3);
  });

  test("wheel and pinch stop at the limits", () => {
    const { scene, g } = setup();
    for (let i = 0; i < 50; i++) g.wheel({ x: 200, y: 400 }, -500);
    expect(scene.camera.scale).toBeCloseTo(limits(scene).max);
    for (let i = 0; i < 50; i++) g.wheel({ x: 200, y: 400 }, 500);
    expect(scene.camera.scale).toBeCloseTo(limits(scene).min);
    g.down(1, { x: 199, y: 400 });
    g.down(2, { x: 201, y: 400 });
    g.move(1, { x: 0, y: 400 });
    g.move(2, { x: 400, y: 400 });
    expect(scene.camera.scale).toBeCloseTo(limits(scene).max);
  });
});

describe("generated world", () => {
  test("a cell always generates the same square, inside the cell", () => {
    let squares = 0;
    for (let cx = -20; cx < 20; cx++) {
      for (let cy = -20; cy < 20; cy++) {
        const s = generated(cx, cy);
        expect(s).toEqual(generated(cx, cy));
        if (!s) continue;
        squares++;
        expect(s.x).toBeGreaterThanOrEqual(cx * CELL);
        expect(s.x + s.size).toBeLessThanOrEqual((cx + 1) * CELL);
        expect(s.y).toBeGreaterThanOrEqual(cy * CELL);
        expect(s.y + s.size).toBeLessThanOrEqual((cy + 1) * CELL);
      }
    }
    expect(squares / 1600).toBeGreaterThan(0.45);
    expect(squares / 1600).toBeLessThan(0.65);
  });

  test("squaresIn returns exactly the squares touching the area", () => {
    const area = { x: -333, y: 127, width: 901, height: 517 };
    const found = squaresIn(area, new Map());
    const expected = [];
    for (let cx = -10; cx < 10; cx++) {
      for (let cy = -10; cy < 10; cy++) {
        const s = generated(cx, cy);
        if (s && s.x < area.x + area.width && s.x + s.size > area.x && s.y < area.y + area.height && s.y + s.size > area.y) expected.push(s.id);
      }
    }
    expect(found.map((s) => s.id).sort()).toEqual(expected.sort());
  });

  test("a moved square shows at its new place even when its home cell is out of view", () => {
    const home = generated(0, 0) ?? generated(1, 0) ?? generated(2, 0)!;
    const moved = new Map([[home.id, { x: 5000, y: 5000 }]]);
    expect(squaresIn({ x: home.x, y: home.y, width: 10, height: 10 }, moved)).toEqual([]);
    expect(squaresIn({ x: 5050, y: 5050, width: 10, height: 10 }, moved)).toEqual([
      { id: home.id, x: 5000, y: 5000, size: SQUARE_SIZE, moved: true, tapped: false },
    ]);
  });
});

describe("culling", () => {
  test("only squares touching the border are visible, at every place and zoom", () => {
    const scene = newScene(400, 800);
    let visibleTotal = 0;
    let onScreenTotal = 0;
    for (const scale of [limits(scene).min, 1, limits(scene).max]) {
      for (let i = 0; i < 20; i++) {
        scene.camera = { scale, offsetX: i * 977, offsetY: i * -1301 };
        const border = worldRect(scene.camera, borderOnScreen(scene));
        const visible = visibleSquares(scene);
        for (const s of visible) {
          expect(s.x < border.x + border.width && s.x + s.size > border.x && s.y < border.y + border.height && s.y + s.size > border.y).toBe(true);
        }
        visibleTotal += visible.length;
        onScreenTotal += squaresIn(worldRect(scene.camera, { x: 0, y: 0, width: 400, height: 800 }), scene.moved).length;
      }
    }
    // Squares on screen but wholly outside the border exist and are left out.
    expect(onScreenTotal).toBeGreaterThan(visibleTotal);
    expect(visibleTotal).toBeGreaterThan(60);
  });

  test("panning away and back shows the same squares", () => {
    const { scene, g } = setup();
    const before = visibleSquares(scene);
    // Each pan starts on empty background, so it never picks up a square.
    const drag = (dx: number, dy: number) => {
      const from = emptyPoint(scene);
      g.down(1, from);
      g.move(1, { x: from.x + dx, y: from.y + dy });
      g.up(1, { x: from.x + dx, y: from.y + dy });
    };
    for (let i = 0; i < 10; i++) drag(-150, -300);
    expect(visibleSquares(scene).map((s) => s.id)).not.toEqual(before.map((s) => s.id));
    for (let i = 0; i < 10; i++) drag(150, 300);
    expect(visibleSquares(scene)).toEqual(before);
    expect(scene.moved.size).toBe(0);
  });
});

describe("gestures", () => {
  test("a tap puts the circle there, and the next tap moves it", () => {
    const { scene, g } = setup();
    const at = emptyPoint(scene);
    g.down(1, at);
    g.move(1, { x: at.x + 4, y: at.y });
    g.up(1, { x: at.x + 4, y: at.y });
    expect(scene.circle).toEqual(toWorld(scene.camera, at));
    g.down(2, { x: 100, y: 400 });
    g.up(2, { x: 100, y: 400 });
    expect(scene.circle).toEqual(toWorld(scene.camera, { x: 100, y: 400 }));
  });

  test("a tap on a square marks it, and a second tap unmarks it; the circle stays", () => {
    const { scene, g, changes } = setup();
    const square = visibleSquares(scene)[0]!;
    const at = center(scene, square);
    g.down(1, at);
    g.move(1, { x: at.x + 4, y: at.y + 3 });
    g.up(1, { x: at.x + 4, y: at.y + 3 });
    expect(scene.circle).toBeNull();
    expect(scene.moved.size).toBe(0);
    expect(visibleSquares(scene).find((s) => s.id === square.id)).toMatchObject({ tapped: true, x: square.x, y: square.y });
    expect(changes()).toBe(1);
    g.down(1, at);
    g.up(1, at);
    expect(visibleSquares(scene).find((s) => s.id === square.id)).toMatchObject({ tapped: false });
  });

  test("dragging a square is not a tap", () => {
    const { scene, g } = setup();
    const square = visibleSquares(scene)[0]!;
    const at = center(scene, square);
    g.down(1, at);
    g.move(1, { x: at.x + 30, y: at.y });
    g.up(1, { x: at.x + 30, y: at.y });
    expect(scene.tapped.size).toBe(0);
  });

  test("dragging the background pans and does not tap", () => {
    const { scene, g } = setup();
    const at = emptyPoint(scene);
    const before = scene.camera;
    g.down(1, at);
    g.move(1, { x: at.x + 30, y: at.y + 20 });
    g.move(1, { x: at.x + 60, y: at.y + 40 });
    g.up(1, { x: at.x + 60, y: at.y + 40 });
    expect(scene.camera).toEqual({ ...before, offsetX: before.offsetX + 60, offsetY: before.offsetY + 40 });
    expect(scene.circle).toBeNull();
  });

  test("dragging a square stores its new place, marks it while dragging and draws it on top", () => {
    const { scene, g, changes } = setup();
    const square = visibleSquares(scene)[0]!;
    const at = center(scene, square);
    g.down(1, at);
    g.move(1, { x: at.x + 50, y: at.y + 20 });
    expect(scene.draggingId).toBe(square.id);
    expect(visibleSquares(scene).at(-1)!.id).toBe(square.id);
    g.move(1, { x: at.x + 100, y: at.y + 40 });
    g.up(1, { x: at.x + 100, y: at.y + 40 });
    expect(scene.draggingId).toBeNull();
    expect(changes()).toBe(1);
    const moved = scene.moved.get(square.id)!;
    expect(moved.x).toBeCloseTo(square.x + 100 / scene.camera.scale);
    expect(moved.y).toBeCloseTo(square.y + 40 / scene.camera.scale);
    expect(visibleSquares(scene).find((s) => s.id === square.id)).toMatchObject({ moved: true });
    expect(scene.circle).toBeNull();
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
    // The world point under the fingers' midpoint follows the midpoint.
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
    expect(scene.circle).toBeNull();
  });

  test("a second finger during a square drag changes the square and pinches", () => {
    const { scene, g, changes } = setup();
    const square = visibleSquares(scene)[0]!;
    const at = center(scene, square);
    g.down(1, at);
    g.move(1, { x: at.x + 40, y: at.y });
    g.down(2, { x: 300, y: 600 });
    expect(scene.draggingId).toBeNull();
    expect(changes()).toBe(1);
    const dropped = { ...scene.moved.get(square.id)! };
    g.move(1, { x: at.x + 90, y: at.y });
    expect(scene.moved.get(square.id)).toEqual(dropped);
  });

  test("a cancelled press is not a tap", () => {
    const { scene, g } = setup();
    g.down(1, emptyPoint(scene));
    g.cancel(1);
    expect(scene.circle).toBeNull();
  });
});
