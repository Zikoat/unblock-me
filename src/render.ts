// Draws a scene on a canvas. Everything on the board is drawn in world units under one
// camera transform, so it all zooms and pans together.
import { worldRect } from "./camera";
import { UNIT, type Block } from "./layout";
import { borderOnScreen, visibleBlocks, type Scene } from "./scene";

export const COLORS = {
  background: "#f3f2ee",
  dot: "#d3d1ca",
  border: "#b9b6ad",
  block: "#4f6d8f",
  moved: "#3f9a7a",
  tapped: "#8b5fbf",
  dragging: "#e0823d",
  circle: "#d64545",
  ui: "#1d1d1f",
  wall: "#5f5d57",
  icon: "#f3f2ee",
};
const DOT_SIZE = 4; // world units, one dot per lattice corner
const GAP = 3; // world units between a block's edge and its lattice cells

/** `density` is the slider's position, 0..1. */
export function draw(canvas: HTMLCanvasElement, scene: Scene, { fullscreen, density }: { fullscreen: boolean; density: number }): void {
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
  ctx.fillStyle = COLORS.dot;
  for (let x = Math.floor(view.x / UNIT) * UNIT; x < view.x + view.width; x += UNIT) {
    for (let y = Math.floor(view.y / UNIT) * UNIT; y < view.y + view.height; y += UNIT) {
      ctx.fillRect(x - DOT_SIZE / 2, y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
    }
  }

  for (const block of visibleBlocks(scene)) {
    ctx.fillStyle = block.ui ? COLORS.ui
      : block.wall ? COLORS.wall
      : block.id === scene.dragging?.id ? COLORS.dragging
      : block.tapped ? COLORS.tapped
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
  }

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
  const left = x + UNIT * 0.24;
  const right = x + UNIT * 0.76;
  const mid = y + UNIT * 0.7;
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(left, mid);
  ctx.lineTo(right, mid);
  ctx.stroke();
  ctx.fillStyle = COLORS.icon;
  ctx.beginPath();
  ctx.arc(left + (right - left) * density, mid, UNIT * 0.065, 0, Math.PI * 2);
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
