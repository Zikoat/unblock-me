import { describe, expect, test } from "bun:test";
import { pinch, toScreen, toWorld, zoomAt, MAX_SCALE } from "../../src/camera";
import { Gestures } from "../../src/gestures";
import { initialScene, type Scene } from "../../src/scene";

// Screen is 400x800 with world (0,0) in the middle; square 0 sits at world (-260,-180).
const setup = () => {
  const scene = initialScene(400, 800);
  return { scene, g: new Gestures(scene) };
};
const square0Center = (scene: Scene) => {
  const s = scene.squares.find((q) => q.id === 0)!;
  return toScreen(scene.camera, { x: s.x + s.size / 2, y: s.y + s.size / 2 });
};
const empty = { x: 350, y: 750 }; // world (150, 350): no square there

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

  test("scale is clamped", () => {
    expect(zoomAt({ scale: 1, offsetX: 0, offsetY: 0 }, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE);
  });
});

describe("gestures", () => {
  test("a tap puts the circle there, and the next tap moves it", () => {
    const { scene, g } = setup();
    g.down(1, empty);
    g.move(1, { x: empty.x + 4, y: empty.y });
    g.up(1, { x: empty.x + 4, y: empty.y });
    expect(scene.circle).toEqual({ x: 150, y: 350 });
    g.down(2, { x: 100, y: 400 });
    g.up(2, { x: 100, y: 400 });
    expect(scene.circle).toEqual({ x: -100, y: 0 });
  });

  test("a tap on a square also moves the circle and leaves the square", () => {
    const { scene, g } = setup();
    const at = square0Center(scene);
    g.down(1, at);
    g.up(1, at);
    expect(scene.circle).toEqual(toWorld(scene.camera, at));
    expect(scene.squares.find((s) => s.id === 0)).toMatchObject({ x: -260, y: -180 });
  });

  test("dragging the background pans and does not tap", () => {
    const { scene, g } = setup();
    g.down(1, empty);
    g.move(1, { x: 380, y: 770 });
    g.move(1, { x: 410, y: 790 });
    g.up(1, { x: 410, y: 790 });
    expect(scene.camera).toMatchObject({ offsetX: 260, offsetY: 440 });
    expect(scene.circle).toBeNull();
  });

  test("dragging a square moves it, marks it while dragging and brings it to the front", () => {
    const { scene, g } = setup();
    const at = square0Center(scene);
    g.down(1, at);
    g.move(1, { x: at.x + 50, y: at.y + 20 });
    expect(scene.draggingId).toBe(0);
    expect(scene.squares.at(-1)!.id).toBe(0);
    g.move(1, { x: at.x + 100, y: at.y + 40 });
    g.up(1, { x: at.x + 100, y: at.y + 40 });
    expect(scene.draggingId).toBeNull();
    expect(scene.squares.find((s) => s.id === 0)).toMatchObject({ x: -160, y: -140 });
    expect(scene.camera).toMatchObject({ offsetX: 200, offsetY: 400 });
    expect(scene.circle).toBeNull();
  });

  test("two fingers zoom and pan together, with no tap", () => {
    const { scene, g } = setup();
    g.down(1, { x: 150, y: 400 });
    g.down(2, { x: 250, y: 400 });
    g.move(1, { x: 100, y: 500 });
    g.move(2, { x: 300, y: 500 });
    expect(scene.camera.scale).toBe(2);
    // World (0,0) was under the midpoint (200,400); it follows the midpoint to (200,500).
    expect(toScreen(scene.camera, { x: 0, y: 0 })).toEqual({ x: 200, y: 500 });
    g.up(1, { x: 100, y: 500 });
    g.up(2, { x: 300, y: 500 });
    expect(scene.circle).toBeNull();
  });

  test("after a pinch the remaining finger pans", () => {
    const { scene, g } = setup();
    g.down(1, { x: 150, y: 400 });
    g.down(2, { x: 250, y: 400 });
    g.up(1, { x: 150, y: 400 });
    g.move(2, { x: 280, y: 420 });
    g.up(2, { x: 280, y: 420 });
    expect(scene.camera).toMatchObject({ scale: 1, offsetX: 230, offsetY: 420 });
    expect(scene.circle).toBeNull();
  });

  test("a second finger during a square drag drops the square and pinches", () => {
    const { scene, g } = setup();
    const at = square0Center(scene);
    g.down(1, at);
    g.move(1, { x: at.x + 40, y: at.y });
    g.down(2, { x: 300, y: 600 });
    expect(scene.draggingId).toBeNull();
    const dropped = { ...scene.squares.find((s) => s.id === 0)! };
    g.move(1, { x: at.x + 90, y: at.y });
    expect(scene.squares.find((s) => s.id === 0)).toEqual(dropped);
  });

  test("a cancelled press is not a tap", () => {
    const { scene, g } = setup();
    g.down(1, empty);
    g.cancel(1);
    expect(scene.circle).toBeNull();
  });
});
