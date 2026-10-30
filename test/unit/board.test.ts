// Gestures and rules on exactly placed boards. The screen is 1200x1200 at scale 1, so the
// culling border spans lattice -8..8 both ways, with lattice point (x,y) at screen
// (600 + 60x, 600 + 60y).
import { describe, expect, test } from "bun:test";
import { toScreen, toWorld, type Point } from "../../src/camera";
import { Gestures } from "../../src/gestures";
import { borderOnScreen, goalSolved, latticeRect, newScene, relayout, restart, undo, visibleBlocks } from "../../src/scene";
import { fixedLayout, UI_BLOCKS, UNIT, type Placed, type Ui } from "../../src/layout";
import { slideRange } from "../../src/rules";

const H = (x: number, y: number, id?: string): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (x: number, y: number, id?: string): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number, id?: string): Placed => ({ id, x, y, w: 1, h: 1, wall: true });

function board(...placed: Placed[]) {
  const scene = newScene(1200, 1200, { layout: fixedLayout(placed) });
  scene.camera = { scale: 1, offsetX: 600, offsetY: 600 };
  const events = { changes: 0, ui: [] as Ui[], adjust: [] as [number, boolean][], adjusted: [] as Ui[] };
  const g = new Gestures(scene, {
    onChange: () => events.changes++,
    onUi: (ui) => events.ui.push(ui),
    onAdjust: (ui, dx, done) => {
      events.adjust.push([dx, done]);
      events.adjusted.push(ui);
    },
  });
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

  test("dragging a block stuck at both ends pans the board instead, and marks it while held", () => {
    const { scene, g, at } = board(H(0, 0, "a"), V(-1, 0, "left"), V(2, -1, "right"));
    const before = scene.camera;
    g.down(1, cell(1, 0.5));
    g.move(1, cell(2, 1.5));
    expect(scene.stuckId).toBe("a");
    expect(scene.dragging).toBeNull();
    g.move(1, cell(3, 2.5));
    g.up(1, cell(3, 2.5));
    expect(scene.camera).toEqual({ ...before, offsetX: before.offsetX + 2 * UNIT, offsetY: before.offsetY + 2 * UNIT });
    expect(scene.stuckId).toBeNull();
    expect(at("a")).toMatchObject({ x: 0, moved: false });
    expect(scene.history).toEqual([]);
  });

  test("a block with room only one way is still dragged, not panned", () => {
    const { scene, g, at } = board(H(0, 0, "a"), V(-1, 0, "left"));
    drag(g, cell(1, 0.5), cell(3, 0.5));
    expect(at("a").x).toBe(2);
    expect(scene.stuckId).toBeNull();
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

  test("a block dragged back to its start forgets its move: not green, nothing stored", () => {
    const { scene, g, at, events } = board(H(0, 0, "a"));
    drag(g, cell(1, 0.5), cell(3, 0.5));
    expect(at("a")).toMatchObject({ x: 2, moved: true });
    drag(g, cell(3, 0.5), cell(2, 0.5));
    expect(at("a")).toMatchObject({ x: 1, moved: true });
    drag(g, cell(2, 0.5), cell(1, 0.5));
    expect(at("a")).toMatchObject({ x: 0, moved: false });
    expect(scene.moved.has("a")).toBe(false);
    expect(events.changes).toBe(3);
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

describe("walls", () => {

  test("a wall blocks sliding blocks", () => {
    const { g, at } = board(H(0, 0, "a"), W(4, 0), V(0, 2, "v"), W(0, -1));
    drag(g, cell(1, 0.5), cell(9, 0.5));
    expect(at("a").x).toBe(2);
    // a has moved out of column 0, so v slides up to the wall.
    drag(g, cell(0.5, 3), cell(0.5, -6));
    expect(at("v").y).toBe(0);
  });

  test("dragging a wall pans and tapping it does nothing", () => {
    const { scene, g, at, events } = board(W(0, 0, "w"));
    const before = scene.camera;
    drag(g, cell(0.5, 0.5), cell(2.5, 0.5));
    expect(scene.camera.offsetX).toBe(before.offsetX + 2 * UNIT);
    scene.camera = before;
    tap(g, cell(0.5, 0.5));
    expect(at("w")).toMatchObject({ x: 0, moved: false });
    expect(scene.circle).toBeNull();
    expect(events).toMatchObject({ changes: 0, ui: [] });
  });
});

describe("density slider", () => {
  const density = (): Placed => ({ id: "density", x: -1, y: 2, w: 1, h: 1, ui: "density" });

  test("dragging sideways on it reports how far the finger went instead of panning, then done", () => {
    const { scene, g, events } = board(density());
    const before = scene.camera;
    const at = cell(-0.5, 2.5);
    g.down(1, at);
    g.move(1, { x: at.x + 13, y: at.y });
    g.move(1, { x: at.x + 37, y: at.y + 20 });
    g.move(1, { x: at.x - 36, y: at.y });
    g.up(1, { x: at.x - 36, y: at.y });
    expect(events.adjust).toEqual([[13, false], [37, false], [-36, false], [-36, true]]);
    expect(scene.camera).toEqual(before);
    expect(events.ui).toEqual([]);
  });

  test("a tap on it is just a tap on a UI block", () => {
    const { g, events } = board(density());
    tap(g, cell(-0.5, 2.5));
    expect(events.ui).toEqual(["density"]);
    expect(events.adjust).toEqual([]);
  });
});

describe("quick push: tapping a block", () => {
  // Row 0 between walls at x -1 and 8: room for a 2-wide block at x 0..6.
  const row = (...blocks: Placed[]) => board(W(-1, 0), W(8, 0), ...blocks);

  test("a block against something on one end goes all the way to the other end", () => {
    const { g, at, events } = row(H(0, 0, "a"));
    tap(g, cell(1, 0.5));
    expect(at("a").x).toBe(6);
    tap(g, cell(7, 0.5));
    expect(at("a").x).toBe(0);
    expect(events.changes).toBe(2);
  });

  test("a free block always goes up (vertical) or right (horizontal), even with more room the other way", () => {
    const { g, at } = row(H(5, 0, "a")); // 5 left, 1 right
    tap(g, cell(6, 0.5));
    expect(at("a").x).toBe(6);
    const again = row(H(1, 0, "b")); // 1 left, 5 right
    tap(again.g, cell(2, 0.5));
    expect(again.at("b").x).toBe(6);
    const column = board(W(0, -4), W(0, 5), V(0, 2, "v")); // 5 above, 1 below
    tap(column.g, cell(0.5, 3));
    expect(column.at("v").y).toBe(-3);
  });

  test("the red block goes towards its target first, and stops on it", () => {
    const { scene, g, at } = row(H(4, 0, "r"));
    scene.goal = { id: "r", target: { x: 1, y: 0 }, solution: [] };
    tap(g, cell(5, 0.5));
    expect(at("r").x).toBe(1); // left, though right is free, and not on to the wall at 0
    tap(g, cell(2, 0.5)); // on its target: the usual way, right
    expect(at("r").x).toBe(6);
    scene.goal = { id: "r", target: { x: 2, y: 3 }, solution: [] }; // not in its lane
    tap(g, cell(7, 0.5));
    expect(at("r").x).toBe(0);
  });

  test("a block that cannot move either way is not moved, and is reported to shake", () => {
    const stuck: string[] = [];
    const scene = newScene(1200, 1200, { layout: fixedLayout([W(-1, 0), H(0, 0, "a"), W(2, 0)]) });
    scene.camera = { scale: 1, offsetX: 600, offsetY: 600 };
    const g = new Gestures(scene, { onStuck: (id) => stuck.push(id) });
    tap(g, cell(1, 0.5));
    expect(stuck).toEqual(["a"]);
    expect(scene.history).toEqual([]);
  });

  test("against the end it would go to, it goes all the way the other way", () => {
    const { g, at } = row(H(1, 0, "a"));
    tap(g, cell(2, 0.5));
    expect(at("a").x).toBe(6);
    // ...and from there, against the wall, it goes the other way.
    tap(g, cell(7, 0.5));
    expect(at("a").x).toBe(0);
    const column = board(W(0, -4), W(0, 5), V(0, -3, "v")); // against the top wall
    tap(column.g, cell(0.5, -2));
    expect(column.at("v").y).toBe(3);
  });

  test("an open end with nothing in reach counts as far, and the push there stops after 8 cells", () => {
    const { scene, g } = board(W(-1, 0), H(0, 0, "a"));
    tap(g, cell(1, 0.5));
    expect(scene.moved.get("a")).toEqual({ x: 8, y: 0 }); // just past the test screen's border
  });

  test("a block that cannot move stays, and nothing is recorded", () => {
    const { scene, g, at, events } = board(W(-1, 0), H(0, 0, "a"), W(2, 0));
    tap(g, cell(1, 0.5));
    expect(at("a")).toMatchObject({ x: 0, moved: false });
    expect(scene.history).toEqual([]);
    expect(events.changes).toBe(0);
  });

  test("a tap on a block does not move the circle; dragging is not a tap", () => {
    const { scene, g, at } = row(H(0, 0, "a"));
    drag(g, cell(1, 0.5), cell(2, 0.5));
    expect(at("a").x).toBe(1);
    expect(scene.circle).toBeNull();
  });
});

describe("undo", () => {
  test("it takes back moves one at a time, drags and taps alike, back to the start", () => {
    const { scene, g, at } = board(W(-1, 0), H(0, 0, "a"), W(8, 0), V(3, 2, "v"));
    drag(g, cell(1, 0.5), cell(3, 0.5)); // a: 0 -> 2
    tap(g, cell(3.5, 3)); // v: open both ways -> up 8 (the default)
    tap(g, cell(3, 0.5)); // a: free both ways -> right (the default) to 6
    expect(scene.history.map((m) => m.id)).toEqual(["a", "v", "a"]);
    expect(undo(scene)).toMatchObject({ id: "a", to: { x: 6, y: 0 } });
    expect(at("a").x).toBe(2);
    undo(scene);
    expect(at("v")).toMatchObject({ y: 2, moved: false });
    undo(scene);
    expect(at("a")).toMatchObject({ x: 0, moved: false });
    expect(scene.moved.size).toBe(0);
    expect(undo(scene)).toBeNull();
  });

  test("a new layout starts a new history", () => {
    const { scene, g } = board(H(0, 0, "a"));
    drag(g, cell(1, 0.5), cell(2, 0.5));
    relayout(scene, fixedLayout([H(0, 0, "a")]));
    expect(scene.history).toEqual([]);
  });
});

describe("taps on the background", () => {
  test("a tap on the background puts the circle there, and the next tap moves it", () => {
    const { scene, g } = board(H(0, 0, "a"));
    tap(g, cell(-2, 3));
    expect(scene.circle).toEqual({ x: -2 * UNIT, y: 3 * UNIT });
    tap(g, cell(1, -2));
    expect(scene.circle).toEqual({ x: UNIT, y: -2 * UNIT });
  });
});

describe("UI blocks", () => {
  // The game's row: home (-1,0), reset (0,0), fullscreen (1,0); an empty row;
  // the debug row: density (-1,2), border (0,2), upload (1,2), fps (2,2).
  const ui = () => UI_BLOCKS.map((b) => ({ ...b }));
  const spots = [
    ["home", -0.5, 0.5], ["reset", 0.5, 0.5], ["fullscreen", 1.5, 0.5], ["fps", 2.5, 2.5], ["border", 0.5, 2.5],
  ] as const;

  test("they are 1x1: a row for the game, a gap, and a row of debug blocks", () => {
    expect(ui().map((b) => [b.id, b.x, b.y, b.w, b.h])).toEqual([
      ["home", -1, 0, 1, 1], ["reset", 0, 0, 1, 1], ["fullscreen", 1, 0, 1, 1],
      ["density", -1, 2, 1, 1], ["border", 0, 2, 1, 1], ["upload", 1, 2, 1, 1], ["fps", 2, 2, 1, 1],
    ]);
  });

  test("a tap on one runs it and does nothing else", () => {
    const { scene, g, events } = board(...ui(), H(3, 4, "a"));
    for (const [, x, y] of spots) tap(g, cell(x, y));
    expect(events.ui).toEqual(spots.map(([id]) => id));
    expect(events.changes).toBe(0);
    expect(scene.circle).toBeNull();
  });

  test("dragging one pans the board instead of moving it (the density slider aside)", () => {
    const { scene, g, at, events } = board(...ui());
    for (const [id, x, y] of spots) {
      const before = scene.camera;
      drag(g, cell(x, y), cell(x + 2, y + 1));
      expect(scene.camera).toEqual({ ...before, offsetX: before.offsetX + 2 * UNIT, offsetY: before.offsetY + UNIT });
      scene.camera = before;
      expect(at(id)).toMatchObject({ moved: false });
    }
    expect(scene.dragging).toBeNull();
    expect(events.ui).toEqual([]);
  });

  test("they block other blocks", () => {
    // a in row 0 right of the game row; b in column 2 below the debug row;
    // c above the home block.
    const { g, at } = board(...ui(), H(4, 0, "a"), V(2, 5, "b"), V(-1, -4, "c"));
    drag(g, cell(5, 0.5), cell(-5, 0.5));
    expect(at("a").x).toBe(2);
    drag(g, cell(2.5, 6), cell(2.5, -5));
    expect(at("b").y).toBe(3);
    drag(g, cell(-0.5, -3), cell(-0.5, 5));
    expect(at("c").y).toBe(-2);
  });

  test("with the border off, blocks are culled to the screen edge instead", () => {
    // Cell (9,0) is on the 1200 px screen (x 1140..1200) but outside the 80% border.
    const { scene } = board(...ui(), H(8, 0, "edge"));
    expect(latticeRect(scene, borderOnScreen(scene)).x + latticeRect(scene, borderOnScreen(scene)).width).toBe(8);
    expect(visibleBlocks(scene).map((b) => b.id)).not.toContain("edge");
    scene.border = false;
    expect(borderOnScreen(scene)).toEqual({ x: 0, y: 0, width: 1200, height: 1200 });
    expect(visibleBlocks(scene).map((b) => b.id)).toContain("edge");
  });

  test("restart forgets moves, history, the goal and the goals reached, the circle and the camera; keeps settings", () => {
    const { scene, g, at } = board(...ui(), H(2, 4, "a"));
    scene.border = false;
    scene.goal = { id: "a", target: { x: 5, y: 4 }, solution: [] };
    scene.done = [{ id: "b", target: { x: 0, y: 6 }, solution: [] }];
    drag(g, cell(3, 4.5), cell(5, 4.5));
    tap(g, cell(-3, 6));
    drag(g, cell(-3, 6), cell(-1, 7)); // pan
    expect(at("a")).toMatchObject({ moved: true });
    expect(scene.circle).not.toBeNull();
    restart(scene, fixedLayout([...ui(), V(5, 5, "new")]));
    expect(scene.moved.size).toBe(0);
    expect(scene.history).toEqual([]);
    expect(scene.goal).toBeNull();
    expect(scene.done).toEqual([]);
    expect(scene.circle).toBeNull();
    expect(scene.border).toBe(false);
    // Centred on the middle of the reset block.
    expect(toScreen(scene.camera, { x: UNIT / 2, y: UNIT / 2 })).toEqual({ x: 600, y: 600 });
    expect(visibleBlocks(scene).map((b) => b.id).sort()).toEqual(["border", "density", "fps", "fullscreen", "home", "new", "reset", "upload"]);
  });
});

describe("goal", () => {
  test("solved once the red block's top-left is on the target, and not after an undo", () => {
    const { scene, g } = board(W(-1, 0), H(0, 0, "r"), W(8, 0));
    scene.goal = { id: "r", target: { x: 6, y: 0 }, solution: [] };
    expect(goalSolved(scene)).toBe(false);
    tap(g, cell(1, 0.5));
    expect(goalSolved(scene)).toBe(true);
    undo(scene);
    expect(goalSolved(scene)).toBe(false);
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
