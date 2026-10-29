import { toScreen } from "./camera";
import { Gestures } from "./gestures";
import { initialScene, type Scene } from "./scene";

const COLORS = {
  background: "#f3f2ee",
  dot: "#d3d1ca",
  square: "#4f6d8f",
  dragging: "#e0823d",
  circle: "#d64545",
};
const GRID = 50; // world units between background dots

const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const scene = initialScene(innerWidth, innerHeight);
const gestures = new Gestures(scene);

function draw(scene: Scene): void {
  const dpr = devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Dots show the canvas moving; spacing doubles when zoomed out so they never crowd.
  const { scale, offsetX, offsetY } = scene.camera;
  let step = GRID * scale;
  while (step < 24) step *= 2;
  ctx.fillStyle = COLORS.dot;
  for (let x = ((offsetX % step) + step) % step; x < width; x += step) {
    for (let y = ((offsetY % step) + step) % step; y < height; y += step) {
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  for (const square of scene.squares) {
    const at = toScreen(scene.camera, square);
    const size = square.size * scale;
    ctx.fillStyle = square.id === scene.draggingId ? COLORS.dragging : COLORS.square;
    ctx.beginPath();
    ctx.roundRect(at.x, at.y, size, size, 8 * scale);
    ctx.fill();
  }

  if (scene.circle) {
    const at = toScreen(scene.camera, scene.circle);
    ctx.fillStyle = COLORS.circle;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

let queued = false;
function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    draw(scene);
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
addEventListener("resize", redraw);

redraw();
