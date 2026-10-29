// Gestures and rules on exactly placed boards. The screen is 1200x1200 at scale 1, so the
// culling border spans lattice -8..8 both ways, with lattice point (x,y) at screen
// (600 + 60x, 600 + 60y).
import { describe, expect, test } from "bun:test";
import { toScreen, toWorld, type Point } from "../../src/camera";
import { Gestures } from "../../src/gestures";
import { newScene, restart, visibleBlocks } from "../../src/scene";
import { fixedLayout, RESET_BLOCK, slideRange, UNIT, type Placed } from "../../src/world";

const H = (x: number, y: number, id?: string): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (x: number, y: number, id?: string): Placed => ({ id, x, y, w: 1, h: 2 });

function board(...placed: Placed[]) {
  const scene = newScene(1200, 1200, { layout: fixedLayout(placed) });
  const events = { changes: 0, resets: 0 };
  const g = new Gestures(scene, { onChange: () => events.changes++, onReset: () => events.resets++ });
  const at = (id: string) => visibleBlocks(scene).find((b) => b.id === id)!;
  return { scene, g, events, at };
}
/** Screen point of lattice point (x, y); cell centres are at x + 0.5. */
const cell = (x: number, y: number): Point => ({ x: 600 + x * UNIT, y: 600 + y * UNIT });
function drag(g: Gestures, from: Point, to: Point, steps = 10): void {
  g.down(1, from);
  for (let i = 1; i <= steps; i++) g.move(1, { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  g.up(1, to);
}
const tap = (g: Gestures, p: Point) => { g.down(1, p); g.up(1, p); };

describe("sliding", () => {
  test("a horizontal block slides sideways, snaps to the nearest cell, and ignores vertical finger movement", () => {
    const { g, at, events } = board(H(0, 0, "a"));
    drag(g, cell(1, 0.5), cell(3.7, 3)); // 2.7 cells right, 2.5 down
    expect(at("a")).toMatchObject({ x: 3, y: 0, moved: true });
    expect(events.changes).toBe(1);
  });

  test("a vertical block slides up and down only", () => {
    const { g, at } = board(V(0, 0, "a"));
    drag(g, cell(0.5, 1), cell(4, -1.2)); // 2.2 cells up, 3.5 right
    expect(at("a")).toMatchObject({ x: 0, y: -2 });
  });

  test("while dragged the block moves smoothly; under half a cell it snaps back and nothing is stored", () => {
    const { scene, g, at, events } = board(H(0, 0, "a"));
    g.down(1, cell(1, 0.5));
    g.move(1, cell(1.4, 0.5));
    expect(scene.dragging).toMatchObject({ id: "a", y: 0 });
    expect(scene.dragging!.x).toBeCloseTo(0.4);
    g.up(1, cell(1.4, 0.5));
    expect(scene.dragging).toBeNull();
    expect(at("a")).toMatchObject({ x: 0, moved: false });
    expect(scene.moved.size).toBe(0);
    expect(events.changes).toBe(0);
  });

  test("a block stops at the block in its lane, even mid-drag", () => {
    // a at x 0..1, b at x 4..5 in the same row: a can reach x = 2.
    const { scene, g, at } = board(H(0, 0, "a"), H(4, 0, "b"));
    g.down(1, cell(1, 0.5));
    g.move(1, cell(4, 0.5));
    expect(scene.dragging!.x).toBe(2);
    g.move(1, cell(9, 0.5));
    expect(scene.dragging!.x).toBe(2);
    g.up(1, cell(9, 0.5));
    expect(at("a").x).toBe(2);
    expect(at("b").x).toBe(4);
  });

  test("a crossing block blocks: a vertical block in the way stops a horizontal one", () => {
    // v covers cells (3,-1) and (3,0); a in row 0 can reach x = 1.
    const { g, at } = board(H(0, 0, "a"), V(3, -1, "v"));
    drag(g, cell(1, 0.5), cell(8, 0.5));
    expect(at("a").x).toBe(1);
  });

  test("blocks outside the lane do not block", () => {
    const { g, at } = board(H(0, 0, "a"), H(4, 1, "below"), V(3, 1, "under"));
    drag(g, cell(1, 0.5), cell(6, 0.5));
    expect(at("a").x).toBe(5);
  });

  test("a block touching a neighbour cannot move towards it, but can move away", () => {
    const { g, at } = board(H(0, 0, "a"), H(2, 0, "b"));
    drag(g, cell(1, 0.5), cell(3, 0.5));
    expect(at("a")).toMatchObject({ x: 0, moved: false });
    drag(g, cell(1, 0.5), cell(-1, 0.5));
    expect(at("a").x).toBe(-2);
  });

  test("a boxed-in block does not move at all", () => {
    const { g, at, scene } = board(H(0, 0, "a"), V(-1, 0, "left"), V(2, -1, "right"));
    expect(slideRange(scene.layout, at("a"), scene)).toEqual({ lo: 0, hi: 0 });
    drag(g, cell(1, 0.5), cell(4, 0.5));
    drag(g, cell(1, 0.5), cell(-3, 0.5));
    expect(at("a")).toMatchObject({ x: 0, moved: false });
  });

  test("a moved block blocks from its new place, and frees its old one", () => {
    // Move v out of row 0; then a can slide past where v was.
    const { g, at } = board(H(0, 0, "a"), V(3, 0, "v"));
    drag(g, cell(3.5, 1), cell(3.5, 3)); // v down 2: rows 2..3
    expect(at("v").y).toBe(2);
    drag(g, cell(1, 0.5), cell(6, 0.5));
    expect(at("a").x).toBe(5);
  });

  test("a second finger during a drag drops the block on the lattice", () => {
    const { scene, g, at } = board(H(0, 0, "a"));
    g.down(1, cell(1, 0.5));
    g.move(1, cell(2.8, 0.5));
    g.down(2, cell(-2, 3));
    expect(scene.dragging).toBeNull();
    expect(at("a").x).toBe(2);
  });
});

describe("taps", () => {
  test("a tap on a block toggles its mark and moves nothing", () => {
    const { scene, g, at, events } = board(H(0, 0, "a"));
    g.down(1, cell(1, 0.5));
    g.move(1, cell(1.1, 0.55)); // within the tap slop
    g.up(1, cell(1.1, 0.55));
    expect(at("a")).toMatchObject({ x: 0, tapped: true });
    expect(scene.circle).toBeNull();
    expect(events.changes).toBe(1);
    tap(g, cell(1, 0.5));
    expect(at("a").tapped).toBe(false);
  });

  test("a tap on the background puts the circle there, and the next tap moves it", () => {
    const { scene, g } = board(H(0, 0, "a"));
    tap(g, cell(-2, 3));
    expect(scene.circle).toEqual({ x: -2 * UNIT, y: 3 * UNIT });
    tap(g, cell(1, -2));
    expect(scene.circle).toEqual({ x: UNIT, y: -2 * UNIT });
  });

  test("dragging a block is not a tap", () => {
    const { scene, g } = board(H(0, 0, "a"));
    drag(g, cell(1, 0.5), cell(2, 0.5));
    expect(scene.tapped.size).toBe(0);
    expect(scene.circle).toBeNull();
  });
});

describe("reset block", () => {
  const reset = () => ({ ...RESET_BLOCK }); // cells (-1,-1)..(0,0)

  test("a tap on it calls reset and does nothing else", () => {
    const { scene, g, events, at } = board(reset(), H(2, 0, "a"));
    tap(g, cell(0, 0));
    expect(events.resets).toBe(1);
    expect(events.changes).toBe(0);
    expect(scene.circle).toBeNull();
    expect(scene.tapped.size).toBe(0);
    expect(at("reset")).toMatchObject({ x: -1, y: -1, reset: true });
  });

  test("dragging it pans the board instead of moving it", () => {
    const { scene, g, at, events } = board(reset());
    const before = scene.camera;
    drag(g, cell(0, 0), cell(2, 1));
    expect(at("reset")).toMatchObject({ x: -1, y: -1, moved: false });
    expect(scene.camera).toEqual({ ...before, offsetX: before.offsetX + 2 * UNIT, offsetY: before.offsetY + UNIT });
    expect(scene.dragging).toBeNull();
    expect(events.resets).toBe(0);
  });

  test("it blocks other blocks", () => {
    // a in row 0 to the right of the reset block, b in column 0 below it.
    const { g, at } = board(reset(), H(3, 0, "a"), V(0, 2, "b"));
    drag(g, cell(4, 0.5), cell(-5, 0.5));
    expect(at("a").x).toBe(1);
    drag(g, cell(0.5, 3), cell(0.5, -5));
    expect(at("b").y).toBe(1);
  });

  test("restart forgets moves, marks, the circle and the camera, and uses the new layout", () => {
    const { scene, g, at } = board(reset(), H(2, 0, "a"));
    drag(g, cell(3, 0.5), cell(5, 0.5));
    tap(g, cell(5, 0.5));
    tap(g, cell(-3, 4));
    drag(g, cell(-3, 4), cell(-1, 5)); // pan
    expect(at("a")).toMatchObject({ moved: true, tapped: true });
    expect(scene.circle).not.toBeNull();
    restart(scene, fixedLayout([reset(), V(5, 5, "new")]));
    expect(scene.moved.size).toBe(0);
    expect(scene.tapped.size).toBe(0);
    expect(scene.circle).toBeNull();
    expect(scene.camera).toEqual({ scale: 1, offsetX: 600, offsetY: 600 });
    expect(visibleBlocks(scene).map((b) => b.id).sort()).toEqual(["new", "reset"]);
  });
});

describe("panning and zooming", () => {
  test("dragging the background pans and does not tap", () => {
    const { scene, g } = board(H(0, 0, "a"));
    drag(g, cell(-2, 3), cell(-1, 4));
    expect(scene.camera).toEqual({ scale: 1, offsetX: 660, offsetY: 660 });
    expect(scene.circle).toBeNull();
  });

  test("two fingers zoom and pan together; the remaining finger keeps panning", () => {
    const { scene, g } = board();
    const world = toWorld(scene.camera, { x: 200, y: 400 });
    g.down(1, { x: 175, y: 400 });
    g.down(2, { x: 225, y: 400 });
    g.move(1, { x: 150, y: 500 });
    g.move(2, { x: 250, y: 500 });
    expect(scene.camera.scale).toBeCloseTo(2);
    expect(toScreen(scene.camera, world).y).toBeCloseTo(500);
    g.up(1, { x: 150, y: 500 });
    const before = scene.camera;
    g.move(2, { x: 280, y: 520 });
    g.up(2, { x: 280, y: 520 });
    expect(scene.camera.offsetX).toBeCloseTo(before.offsetX + 30);
    expect(scene.circle).toBeNull();
  });

  test("a cancelled press is not a tap", () => {
    const { scene, g } = board();
    g.down(1, cell(-2, 3));
    g.cancel(1);
    expect(scene.circle).toBeNull();
  });
});
