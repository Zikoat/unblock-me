// Draws a scene on a canvas. Everything on the board is drawn in world units under one
// camera transform, so it all zooms and pans together.
import { worldRect } from "./camera";
import { UI_AREA, UNIT, type Block } from "./layout";
import { borderOnScreen, visibleBlocks, type Scene } from "./scene";

export const COLORS = {
  background: "#f3f2ee",
  dot: "#d3d1ca",
  border: "#b9b6ad",
  block: "#4f6d8f",
  moved: "#3f9a7a",
  dragging: "#e0823d",
  stuck: "#8d97a3",
  goal: "#d64545",
  target: "rgba(214, 69, 69, 0.14)",
  targetLine: "rgba(214, 69, 69, 0.45)",
  circle: "#3a3936",
  star: "#f2b632",
  ui: "#1d1d1f",
  wall: "#5f5d57",
  icon: "#f3f2ee",
};
const DOT_SIZE = 4.5; // world units across, one dot per lattice corner
const GAP = 3; // world units between a block's edge and its lattice cells
const TARGET_MARGIN = 3; // world units the target reaches past the red block's cells

/** A star flying out of the red block when it first reaches its target (world units, ms). */
export type Sparkle = { x: number; y: number; dx: number; dy: number; born: number; life: number; size: number; spin: number };

/** `density` is the slider's position, 0..1. `sliding` draws one block somewhere between
 * cells while a tap's slide is animated. `now` times the sparkles. */
export function draw(
  canvas: HTMLCanvasElement,
  scene: Scene,
  { fullscreen, density, sliding, sparkles = [], now = 0 }: {
    fullscreen: boolean;
    density: number;
    /** Where the sliding block is drawn now, and where its slide runs from and to. */
    sliding?: { id: string; x: number; y: number; from: { x: number; y: number }; to: { x: number; y: number } } | null;
    sparkles?: Sparkle[];
    now?: number;
  },
): void {
  const ctx = canvas.getContext("2d")!;
  const dpr = devicePixelRatio || 1;
  const { width, height, camera } = scene;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.offsetX, dpr * camera.offsetY);

  const view = worldRect(camera, { x: 0, y: 0, width, height });
  // Round dots at the lattice corners, all in one path so they cost one fill.
  ctx.fillStyle = COLORS.dot;
  ctx.beginPath();
  for (let x = Math.floor(view.x / UNIT) * UNIT; x < view.x + view.width + UNIT; x += UNIT) {
    for (let y = Math.floor(view.y / UNIT) * UNIT; y < view.y + view.height + UNIT; y += UNIT) {
      ctx.moveTo(x + DOT_SIZE / 2, y);
      ctx.arc(x, y, DOT_SIZE / 2, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  const goal = scene.goal;
  const red = goal ? scene.layout.byId(goal.id) : undefined;
  if (goal && red) {
    // The target: a pale area with a soft outline, a little larger than the red block, so it
    // still shows around the block when the block is on it.
    ctx.beginPath();
    ctx.roundRect(goal.target.x * UNIT - TARGET_MARGIN, goal.target.y * UNIT - TARGET_MARGIN, red.w * UNIT + 2 * TARGET_MARGIN, red.h * UNIT + 2 * TARGET_MARGIN, 12);
    ctx.fillStyle = COLORS.target;
    ctx.fill();
    ctx.strokeStyle = COLORS.targetLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The sliding block is drawn until its slide ends, even when it ends outside the view and
  // culling would leave it out.
  const blocks = visibleBlocks(scene);
  if (sliding && !blocks.some((b) => b.id === sliding.id)) {
    const home = scene.layout.byId(sliding.id);
    if (home) blocks.push({ ...home, moved: scene.moved.has(sliding.id) });
  }
  for (const shown of blocks) {
    const block = shown.id === sliding?.id ? { ...shown, x: sliding.x, y: sliding.y } : shown;
    const isGoal = block.id === goal?.id;
    ctx.fillStyle = block.ui ? COLORS.ui
      : block.wall ? COLORS.wall
      : block.id === scene.dragging?.id ? COLORS.dragging
      : block.id === scene.stuckId ? COLORS.stuck
      : isGoal ? COLORS.goal
      : block.moved ? COLORS.moved
      : COLORS.block;
    ctx.beginPath();
    ctx.roundRect(block.x * UNIT + GAP, block.y * UNIT + GAP, block.w * UNIT - 2 * GAP, block.h * UNIT - 2 * GAP, block.wall ? 3 : 8);
    ctx.fill();
    if (block.ui === "reset") resetIcon(ctx, block);
    else if (block.ui === "border") borderIcon(ctx, block, scene.border);
    else if (block.ui === "fullscreen") fullscreenIcon(ctx, block, fullscreen);
    else if (block.ui === "reports") reportsIcon(ctx, block);
    else if (block.ui === "density") densityIcon(ctx, block, density);
    else if (block.ui === "home") homeIcon(ctx, block);
  }

  // Once the goal has been reached, its check stays on the target, above the red block.
  if (goal && red && scene.reached) goalCheck(ctx, goal.target.x + red.w / 2, goal.target.y + red.h / 2);
  for (const s of sparkles) sparkle(ctx, s, now);

  if (scene.circle) {
    ctx.fillStyle = COLORS.circle;
    ctx.beginPath();
    ctx.arc(scene.circle.x, scene.circle.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // The culling border is a screen thing, so it is drawn in screen pixels.
  if (scene.border) {
    const border = borderOnScreen(scene);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(border.x + 0.5, border.y + 0.5, border.width - 1, border.height - 1);
  }
  const toUi = uiArrow(scene);
  if (toUi) drawArrow(ctx, toUi, COLORS.ui, 16, dpr);
  // A slide entirely out of view (an undo, say): a small green arrow points to it while it runs.
  if (sliding) {
    const block = scene.layout.byId(sliding.id);
    if (block) {
      const x = Math.min(sliding.from.x, sliding.to.x), y = Math.min(sliding.from.y, sliding.to.y);
      const swept = { x, y, width: Math.max(sliding.from.x, sliding.to.x) + block.w - x, height: Math.max(sliding.from.y, sliding.to.y) + block.h - y };
      const toChange = edgeArrow(scene, onScreen(scene, swept));
      if (toChange) drawArrow(ctx, toChange, COLORS.moved, 11, dpr);
    }
  }
}

/** A circular arrow in the middle of the block. */
function resetIcon(ctx: CanvasRenderingContext2D, block: Block): void {
  const cx = (block.x + 0.5) * UNIT;
  const cy = (block.y + 0.5) * UNIT;
  const r = UNIT * 0.2;
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

/** A small copy of the culling border with a switch inside it. */
function borderIcon(ctx: CanvasRenderingContext2D, block: Block, on: boolean): void {
  const x = block.x * UNIT;
  const y = block.y * UNIT;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + UNIT * 0.2, y + UNIT * 0.2, UNIT * 0.6, UNIT * 0.6);
  const w = UNIT * 0.36;
  const h = UNIT * 0.18;
  const left = x + (UNIT - w) / 2;
  const top = y + (UNIT - h) / 2;
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, h / 2);
  ctx.fillStyle = on ? COLORS.icon : COLORS.ui;
  ctx.fill();
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(on ? left + w - h / 2 : left + h / 2, top + h / 2, h / 2 - 2.5, 0, Math.PI * 2);
  ctx.fillStyle = on ? COLORS.ui : COLORS.icon;
  ctx.fill();
}

/** Four corner brackets: pointing out to enter fullscreen, in to leave it. */
function fullscreenIcon(ctx: CanvasRenderingContext2D, block: Block, active: boolean): void {
  const cx = (block.x + 0.5) * UNIT;
  const cy = (block.y + 0.5) * UNIT;
  const r = UNIT * 0.22; // corner distance from the middle
  const arm = UNIT * 0.1;
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = UNIT * 0.05;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    // Outward: the corner is outermost and the arms run back towards the middle. Inward:
    // the corner sits nearer the middle and the arms run outwards.
    const at = active ? { x: cx + sx * (r - arm), y: cy + sy * (r - arm) } : { x: cx + sx * r, y: cy + sy * r };
    const dir = active ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(at.x + dir * sx * arm, at.y);
    ctx.lineTo(at.x, at.y);
    ctx.lineTo(at.x, at.y + dir * sy * arm);
    ctx.stroke();
  }
}

/** Six little blocks that fill up with density, above a slider showing where it is. */
function densityIcon(ctx: CanvasRenderingContext2D, block: Block, density: number): void {
  const x = block.x * UNIT;
  const y = block.y * UNIT;
  const size = UNIT * 0.1;
  const gap = UNIT * 0.05;
  const filled = Math.round(density * 6);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const left = x + UNIT * 0.275 + (i % 3) * (size + gap);
    const top = y + UNIT * 0.22 + Math.floor(i / 3) * (size + gap);
    ctx.beginPath();
    ctx.roundRect(left, top, size, size, 1.5);
    if (i < filled) {
      ctx.fillStyle = COLORS.icon;
      ctx.fill();
    } else {
      ctx.strokeStyle = COLORS.icon;
      ctx.stroke();
    }
  }
  sliderTrack(ctx, block, density);
}

/** A house: the homepage. */
function homeIcon(ctx: CanvasRenderingContext2D, block: Block): void {
  const x = block.x * UNIT;
  const y = block.y * UNIT;
  ctx.fillStyle = COLORS.icon;
  ctx.beginPath();
  ctx.moveTo(x + UNIT * 0.5, y + UNIT * 0.24);
  ctx.lineTo(x + UNIT * 0.76, y + UNIT * 0.48);
  ctx.lineTo(x + UNIT * 0.69, y + UNIT * 0.48);
  ctx.lineTo(x + UNIT * 0.69, y + UNIT * 0.74);
  ctx.lineTo(x + UNIT * 0.56, y + UNIT * 0.74);
  ctx.lineTo(x + UNIT * 0.56, y + UNIT * 0.6);
  ctx.lineTo(x + UNIT * 0.44, y + UNIT * 0.6);
  ctx.lineTo(x + UNIT * 0.44, y + UNIT * 0.74);
  ctx.lineTo(x + UNIT * 0.31, y + UNIT * 0.74);
  ctx.lineTo(x + UNIT * 0.31, y + UNIT * 0.48);
  ctx.lineTo(x + UNIT * 0.24, y + UNIT * 0.48);
  ctx.closePath();
  ctx.fill();
}

/** The slider at the bottom of a slider block, with its knob at `at` (0..1). */
function sliderTrack(ctx: CanvasRenderingContext2D, block: Block, at: number): void {
  const left = (block.x + 0.24) * UNIT;
  const right = (block.x + 0.76) * UNIT;
  const mid = (block.y + 0.7) * UNIT;
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(left, mid);
  ctx.lineTo(right, mid);
  ctx.stroke();
  ctx.fillStyle = COLORS.icon;
  ctx.beginPath();
  ctx.arc(left + (right - left) * at, mid, UNIT * 0.065, 0, Math.PI * 2);
  ctx.fill();
}

/** Three rising bars on a baseline: the reports. */
function reportsIcon(ctx: CanvasRenderingContext2D, block: Block): void {
  const left = (block.x + 0.27) * UNIT;
  const base = (block.y + 0.72) * UNIT;
  const bar = UNIT * 0.11;
  const gap = UNIT * 0.06;
  ctx.fillStyle = COLORS.icon;
  [0.18, 0.3, 0.42].forEach((height, i) => {
    ctx.beginPath();
    ctx.roundRect(left + i * (bar + gap), base - height * UNIT, bar, height * UNIT, [2, 2, 0, 0]);
    ctx.fill();
  });
}

/** A check on the target, in the middle of the cells the red block covers there: white
 * with a red edge, so it reads on the block and on the pale target alike. */
function goalCheck(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const cx = x * UNIT;
  const cy = y * UNIT;
  const s = UNIT * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s, cy);
  ctx.lineTo(cx - s * 0.3, cy + s * 0.7);
  ctx.lineTo(cx + s, cy - s * 0.6);
  ctx.strokeStyle = COLORS.goal;
  ctx.lineWidth = UNIT * 0.13;
  ctx.stroke();
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = UNIT * 0.07;
  ctx.stroke();
}

/** One star: flies out fast and slows down, turning, then fades. */
function sparkle(ctx: CanvasRenderingContext2D, s: Sparkle, now: number): void {
  const p = Math.min(1, Math.max(0, (now - s.born) / s.life));
  const travel = p * (2 - p);
  const x = s.x + s.dx * travel;
  const y = s.y + s.dy * travel;
  const r = s.size * (1 - 0.4 * p);
  ctx.save();
  ctx.globalAlpha = 1 - p * p;
  ctx.translate(x, y);
  ctx.rotate(s.spin * p);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const d = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = COLORS.star;
  ctx.fill();
  ctx.restore();
}

type ScreenRect = { left: number; top: number; right: number; bottom: number };
type EdgeArrow = { x: number; y: number; angle: number };

/** A lattice rectangle in screen pixels. */
function onScreen(scene: Scene, r: { x: number; y: number; width: number; height: number }): ScreenRect {
  const { scale, offsetX, offsetY } = scene.camera;
  const left = r.x * UNIT * scale + offsetX;
  const top = r.y * UNIT * scale + offsetY;
  return { left, top, right: left + r.width * UNIT * scale, bottom: top + r.height * UNIT * scale };
}

/** Where an arrow pointing at `target` sits: just inside the edge of the view (the smaller
 * border when it is on), on the line from the view's middle. Null when `target` is in view. */
function edgeArrow(scene: Scene, target: ScreenRect): EdgeArrow | null {
  const view = borderOnScreen(scene);
  if (target.right > view.x && target.left < view.x + view.width && target.bottom > view.y && target.top < view.y + view.height) return null;
  const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
  const dx = (target.left + target.right) / 2 - cx, dy = (target.top + target.bottom) / 2 - cy;
  const margin = 26;
  const k = Math.min(Math.abs((view.width / 2 - margin) / dx || Infinity), Math.abs((view.height / 2 - margin) / dy || Infinity));
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

/** The arrow to the UI blocks, when none of them are in view (tapping it goes there). */
export function uiArrow(scene: Scene): EdgeArrow | null {
  return scene.layout.byId("reset") ? edgeArrow(scene, onScreen(scene, UI_AREA)) : null;
}

/** A round marker with a chevron pointing along `angle`. Drawn in screen pixels. */
function drawArrow(ctx: CanvasRenderingContext2D, a: EdgeArrow, fill: string, radius: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.angle);
  const s = radius / 16;
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-3 * s, -6 * s);
  ctx.lineTo(4 * s, 0);
  ctx.lineTo(-3 * s, 6 * s);
  ctx.stroke();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
