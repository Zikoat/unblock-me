import { worldRect, type Point } from "./camera";
import { Gestures } from "./gestures";
import { borderOnScreen, latticeRect, newScene, resize, restart, visibleBlocks, type Scene } from "./scene";
import { blocksIn, fixedLayout, randomLayout, slideRange, UNIT, type Block, type Placed } from "./world";

const COLORS = {
  background: "#f3f2ee",
  dot: "#d3d1ca",
  border: "#b9b6ad",
  block: "#4f6d8f",
  moved: "#3f9a7a",
  tapped: "#8b5fbf",
  dragging: "#e0823d",
  circle: "#d64545",
  reset: "#1d1d1f",
  icon: "#f3f2ee",
};
const DOT_SIZE = 4; // world units, one dot per lattice corner
const GAP = 3; // world units between a block's edge and its lattice cells
// v3: dense layout with a seed; v2 had no seed, v1 stored free world positions.
const SEED_KEY = "unblock-me:v3:seed";
const MOVED_KEY = "unblock-me:v3:moved";
const TAPPED_KEY = "unblock-me:v3:tapped";

const canvas = document.querySelector("canvas")!;
const fps = document.querySelector<HTMLElement>("#fps")!;
const ctx = canvas.getContext("2d")!;

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function save(): void {
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(seed));
    localStorage.setItem(MOVED_KEY, JSON.stringify([...scene.moved].map(([id, p]) => [id, p.x, p.y])));
    localStorage.setItem(TAPPED_KEY, JSON.stringify([...scene.tapped]));
  } catch {
    // Private mode or full storage: changes just don't survive a reload.
  }
}

const newSeed = () => Math.floor(Math.random() * 2 ** 32);
let seed = load<number>(SEED_KEY, newSeed());
const moved = load<[string, number, number][]>(MOVED_KEY, []);
const scene = newScene(innerWidth, innerHeight, {
  layout: randomLayout(seed),
  moved: new Map(moved.map(([id, x, y]) => [id, { x, y }])),
  tapped: new Set(load<string[]>(TAPPED_KEY, [])),
});
const gestures = new Gestures(scene, {
  onChange: save,
  // The reset block: a new seed lays out every block anew; everything else is forgotten.
  onReset: () => {
    seed = newSeed();
    restart(scene, randomLayout(seed));
    save();
  },
});
// For tests and debugging in the console.
Object.assign(window, {
  unblock: {
    scene,
    UNIT,
    visibleBlocks: () => visibleBlocks(scene),
    seed: () => seed,
    onScreen: () => blocksIn(scene.layout, latticeRect(scene, { x: 0, y: 0, width: scene.width, height: scene.height }), scene),
    slideRange: (id: string) => slideRange(scene.layout, visibleBlocks(scene).find((b) => b.id === id)!, scene),
    redraw: () => redraw(),
    /** Replace the random layout with exactly these blocks (for tests). */
    place: (blocks: Placed[]) => {
      restart(scene, fixedLayout(blocks));
      redraw();
    },
  },
});

function draw(scene: Scene): number {
  const dpr = devicePixelRatio || 1;
  const { width, height, camera } = scene;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // From here on everything is drawn in world units; this one transform zooms and pans it all.
  ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.offsetX, dpr * camera.offsetY);

  const view = worldRect(camera, { x: 0, y: 0, width, height });
  ctx.fillStyle = COLORS.dot;
  for (let x = Math.floor(view.x / UNIT) * UNIT; x < view.x + view.width; x += UNIT) {
    for (let y = Math.floor(view.y / UNIT) * UNIT; y < view.y + view.height; y += UNIT) {
      ctx.fillRect(x - DOT_SIZE / 2, y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
    }
  }

  const blocks = visibleBlocks(scene);
  for (const block of blocks) {
    ctx.fillStyle = block.reset ? COLORS.reset
      : block.id === scene.dragging?.id ? COLORS.dragging
      : block.tapped ? COLORS.tapped
      : block.moved ? COLORS.moved
      : COLORS.block;
    ctx.beginPath();
    ctx.roundRect(block.x * UNIT + GAP, block.y * UNIT + GAP, block.w * UNIT - 2 * GAP, block.h * UNIT - 2 * GAP, 8);
    ctx.fill();
    if (block.reset) drawResetIcon(block);
  }

  if (scene.circle) {
    ctx.fillStyle = COLORS.circle;
    ctx.beginPath();
    ctx.arc(scene.circle.x, scene.circle.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // The culling border is a screen thing, so it is drawn in screen pixels.
  const border = borderOnScreen(scene);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(border.x + 0.5, border.y + 0.5, border.width - 1, border.height - 1);
  return blocks.length;
}

/** A circular arrow in the middle of the block. */
function drawResetIcon(block: Block): void {
  const cx = (block.x + block.w / 2) * UNIT;
  const cy = (block.y + block.h / 2) * UNIT;
  const r = Math.min(block.w, block.h) * UNIT * 0.22;
  const end = -Math.PI / 2 + Math.PI * 1.6; // the arrow runs clockwise from the top
  ctx.strokeStyle = COLORS.icon;
  ctx.fillStyle = COLORS.icon;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, end);
  ctx.stroke();
  // Arrowhead at the end of the arc, pointing along it.
  const tip = { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) };
  const along = end + Math.PI / 2;
  const size = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(tip.x + size * Math.cos(along), tip.y + size * Math.sin(along));
  ctx.lineTo(tip.x + size * Math.cos(along + 2.4), tip.y + size * Math.sin(along + 2.4));
  ctx.lineTo(tip.x + size * Math.cos(along - 2.4), tip.y + size * Math.sin(along - 2.4));
  ctx.closePath();
  ctx.fill();
}

// Frames are only drawn when something changes, so the counter shows 0 fps when idle.
const frames: number[] = [];
let shown = 0;
function showFps(now: number): void {
  while (frames.length && frames[0]! <= now - 1000) frames.shift();
  fps.textContent = `${frames.length} fps · ${shown} blocks`;
}
setInterval(() => showFps(performance.now()), 500);

let queued = false;
function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame((now) => {
    queued = false;
    shown = draw(scene);
    frames.push(now);
    showFps(now);
  });
}

const point = (e: PointerEvent | WheelEvent) => ({ x: e.offsetX, y: e.offsetY });

canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  gestures.down(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointermove", (e) => {
  gestures.move(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointerup", (e) => {
  gestures.up(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointercancel", (e) => {
  gestures.cancel(e.pointerId);
  redraw();
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  gestures.wheel(point(e), e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY);
  redraw();
}, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("resize", () => {
  resize(scene, innerWidth, innerHeight);
  redraw();
});

redraw();
