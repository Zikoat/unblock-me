import { worldRect, type Point } from "./camera";
import { Gestures } from "./gestures";
import { borderOnScreen, newScene, resize, visibleSquares, type Scene } from "./scene";
import { squaresIn } from "./world";

const COLORS = {
  background: "#f3f2ee",
  dot: "#d3d1ca",
  border: "#b9b6ad",
  square: "#4f6d8f",
  moved: "#3f9a7a",
  dragging: "#e0823d",
  circle: "#d64545",
};
const DOT_SPACING = 100; // world units
const DOT_SIZE = 4;
const STORAGE_KEY = "unblock-me:moved";

const canvas = document.querySelector("canvas")!;
const fps = document.querySelector<HTMLElement>("#fps")!;
const ctx = canvas.getContext("2d")!;

function loadMoved(): Map<string, Point> {
  try {
    const saved: [string, number, number][] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Map(saved.map(([id, x, y]) => [id, { x, y }]));
  } catch {
    return new Map();
  }
}

function saveMoved(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...scene.moved].map(([id, p]) => [id, p.x, p.y])));
  } catch {
    // Private mode or full storage: moves just don't survive a reload.
  }
}

const scene = newScene(innerWidth, innerHeight, loadMoved());
const gestures = new Gestures(scene, saveMoved);
// For tests and debugging in the console.
Object.assign(window, {
  unblock: {
    scene,
    visibleSquares: () => visibleSquares(scene),
    onScreen: () => squaresIn(worldRect(scene.camera, { x: 0, y: 0, width: scene.width, height: scene.height }), scene.moved),
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
  for (let x = Math.floor(view.x / DOT_SPACING) * DOT_SPACING; x < view.x + view.width; x += DOT_SPACING) {
    for (let y = Math.floor(view.y / DOT_SPACING) * DOT_SPACING; y < view.y + view.height; y += DOT_SPACING) {
      ctx.fillRect(x - DOT_SIZE / 2, y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
    }
  }

  const squares = visibleSquares(scene);
  for (const square of squares) {
    ctx.fillStyle = square.id === scene.draggingId ? COLORS.dragging : square.moved ? COLORS.moved : COLORS.square;
    ctx.beginPath();
    ctx.roundRect(square.x, square.y, square.size, square.size, 8);
    ctx.fill();
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
  return squares.length;
}

// Frames are only drawn when something changes, so the counter shows 0 fps when idle.
const frames: number[] = [];
let shown = 0;
function showFps(now: number): void {
  while (frames.length && frames[0]! <= now - 1000) frames.shift();
  fps.textContent = `${frames.length} fps · ${shown} squares`;
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
