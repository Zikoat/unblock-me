// Draws a scene on a canvas. Everything on the board is drawn in world units under one
// camera transform, so it all zooms and pans together.
import { worldRect } from "./camera";
import { intersects, UI_AREA, UNIT, type Block } from "./layout";
import { starsEarned, starsWorth } from "./stars";
import { bestKnown, medal, type Goal } from "./goal";
import { borderOnScreen, latticeRect, quickPush, visibleBlocks, whereIs, type Scene } from "./scene";

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
  // Reached goals: a darker, duller red, so the one in play stands out.
  done: "#8e3f3c",
  doneTarget: "rgba(120, 66, 60, 0.10)",
  doneLine: "rgba(120, 66, 60, 0.32)",
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
/** The way-to-target cue: it starts CUE_DELAY ms after the red block appears (once the
 * throb has peaked), grows towards the target, holds, and fades; CUE_MS in all. */
const CUE_DELAY = 200, CUE_GROW = 450, CUE_HOLD = 700, CUE_FADE = 450;
export const CUE_MS = CUE_DELAY + CUE_GROW + CUE_HOLD + CUE_FADE;
/** How long a stuck block shakes, in ms. */
export const SHAKE_MS = 220;
/** How long a tap's ripple lasts, in ms. */
export const RIPPLE_MS = 600;
/** How long a new red block's heartbeat lasts, in ms. */
export const THROB_MS = 450;
/** One heartbeat: up to 15% larger and back, quick out, slower settle. */
const throbScale = (t: number) => (t <= 0 || t >= 1 ? 1 : 1 + 0.15 * Math.sin(Math.PI * Math.pow(t, 0.7)));

export function draw(
  canvas: HTMLCanvasElement,
  scene: Scene,
  { fullscreen, density, fps = true, sliding, sparkles = [], throb = null, cue = null, ripples = [], shake = null, now = 0 }: {
    fullscreen: boolean;
    density: number;
    /** Whether the fps counter is showing. */
    fps?: boolean;
    /** Where the sliding block is drawn now, and where its slide runs from and to. */
    sliding?: { id: string; x: number; y: number; from: { x: number; y: number }; to: { x: number; y: number } } | null;
    sparkles?: Sparkle[];
    /** A block that just became red, and when, for one heartbeat. */
    throb?: { id: string; born: number } | null;
    /** A new red block's way to its target, shown for a moment from `born`. */
    cue?: { id: string; born: number } | null;
    /** Background taps' ripples: where (world units) and when each started. */
    ripples?: { at: { x: number; y: number }; born: number }[];
    /** A block that was tapped but cannot move, shaking since `born`. */
    shake?: { id: string; born: number } | null;
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
  // Targets, the reached ones and the current one: a pale area with a soft outline, a little
  // larger than the red block so it still shows around the block on it. Culled like blocks.
  const inView = latticeRect(scene, borderOnScreen(scene));
  const targets = [...scene.done, ...(goal ? [goal] : [])]
    .map((g) => ({ goal: g, cells: targetCells(scene, g) }))
    .filter((t): t is { goal: Goal; cells: Cells } => !!t.cells && intersects(t.cells, inView));
  // Targets side by side overlap by their margins: each is filled only where no earlier one
  // was, and outlined only outside the others, so touching targets read as one shape.
  const area = (c: Cells, path: Path2D) => path.roundRect(c.x * UNIT - TARGET_MARGIN, c.y * UNIT - TARGET_MARGIN, c.w * UNIT + 2 * TARGET_MARGIN, c.h * UNIT + 2 * TARGET_MARGIN, 12);
  const outside = (others: typeof targets) => {
    const clip = new Path2D();
    clip.rect(view.x - UNIT, view.y - UNIT, view.width + 2 * UNIT, view.height + 2 * UNIT);
    for (const o of others) area(o.cells, clip);
    ctx.clip(clip, "evenodd");
  };
  const drawTarget = (i: number) => {
    const { goal: g, cells } = targets[i]!;
    const own = new Path2D();
    area(cells, own);
    ctx.save();
    outside(targets.slice(0, i));
    ctx.fillStyle = g === goal ? COLORS.target : COLORS.doneTarget;
    ctx.fill(own);
    ctx.restore();
    ctx.save();
    outside(targets.filter((_, j) => j !== i));
    ctx.strokeStyle = g === goal ? COLORS.targetLine : COLORS.doneLine;
    ctx.lineWidth = 2;
    ctx.stroke(own);
    ctx.restore();
  };
  // Reached targets go under the blocks (their red blocks sit on them); the current one goes
  // over them, so it shows even where blocks stand on it.
  targets.forEach((t, i) => t.goal !== goal && drawTarget(i));

  // The sliding block is drawn until its slide ends, even when it ends outside the view and
  // culling would leave it out.
  const blocks = visibleBlocks(scene);
  if (sliding && !blocks.some((b) => b.id === sliding.id)) {
    const home = scene.layout.byId(sliding.id);
    if (home) blocks.push({ ...home, moved: scene.moved.has(sliding.id) });
  }
  // Where a click would send the block under the mouse: a faint trail fading towards it.
  const hovered = scene.hover && !sliding && !scene.dragging ? blocks.find((b) => b.id === scene.hover) : null;
  const to = hovered && quickPush(scene, hovered);
  if (hovered && to) {
    const horizontal = hovered.w > hovered.h;
    const forward = horizontal ? to.x > hovered.x : to.y > hovered.y;
    const near = horizontal ? (forward ? hovered.x + hovered.w : hovered.x) : forward ? hovered.y + hovered.h : hovered.y;
    const far = horizontal ? (forward ? to.x + hovered.w : to.x) : forward ? to.y + hovered.h : to.y;
    const [a, b] = [Math.min(near, far) * UNIT, Math.max(near, far) * UNIT];
    const g = horizontal ? ctx.createLinearGradient(near * UNIT, 0, far * UNIT, 0) : ctx.createLinearGradient(0, near * UNIT, 0, far * UNIT);
    g.addColorStop(0, hovered.id === goal?.id ? "rgba(214, 69, 69, 0.22)" : "rgba(79, 109, 143, 0.22)");
    g.addColorStop(1, "rgba(79, 109, 143, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    if (horizontal) ctx.roundRect(a, hovered.y * UNIT + GAP, b - a, hovered.h * UNIT - 2 * GAP, 8);
    else ctx.roundRect(hovered.x * UNIT + GAP, a, hovered.w * UNIT - 2 * GAP, b - a, 8);
    ctx.fill();
  }

  // A throbbing block grows over its neighbours, so it goes on top.
  if (throb) blocks.sort((a, b) => Number(a.id === throb.id) - Number(b.id === throb.id));
  for (const shown of blocks) {
    const block = shown.id === sliding?.id ? { ...shown, x: sliding.x, y: sliding.y } : shown;
    // Red blocks stay red after their goal is reached, a darker red.
    const isGoal = block.id === goal?.id;
    const wasGoal = !isGoal && scene.done.some((g) => g.id === block.id);
    ctx.fillStyle = block.ui ? COLORS.ui
      : block.wall ? COLORS.wall
      : block.id === scene.dragging?.id ? COLORS.dragging
      : block.id === scene.stuckId ? COLORS.stuck
      : isGoal ? COLORS.goal
      : wasGoal ? COLORS.done
      : block.moved ? COLORS.moved
      : COLORS.block;
    const beat = throb?.id === block.id ? throbScale((now - throb.born) / THROB_MS) : 1;
    // A stuck block shakes along its axis, a few px each way, dying down.
    const st = shake?.id === block.id ? (now - shake.born) / SHAKE_MS : 1;
    const jolt = st >= 0 && st < 1 ? Math.sin(st * Math.PI * 4) * 4 * (1 - st) : 0; // two wiggles
    if (beat !== 1 || jolt) {
      ctx.save();
      if (jolt) ctx.translate(block.w > block.h ? jolt : 0, block.w > block.h ? 0 : jolt);
      const cx = (block.x + block.w / 2) * UNIT, cy = (block.y + block.h / 2) * UNIT;
      ctx.translate(cx, cy);
      ctx.scale(beat, beat);
      ctx.translate(-cx, -cy);
    }
    ctx.beginPath();
    ctx.roundRect(block.x * UNIT + GAP, block.y * UNIT + GAP, block.w * UNIT - 2 * GAP, block.h * UNIT - 2 * GAP, block.wall ? 3 : 8);
    ctx.fill();
    if (block.ui === "reset") resetIcon(ctx, block);
    else if (block.ui === "border") borderIcon(ctx, block, scene.border);
    else if (block.ui === "fullscreen") fullscreenIcon(ctx, block, fullscreen);
    else if (block.ui === "upload") uploadIcon(ctx, block);
    else if (block.ui === "reports") reportsIcon(ctx, block);
    else if (block.ui === "fps") fpsIcon(ctx, block, fps);
    else if (block.ui === "density") densityIcon(ctx, block, density);
    else if (block.ui === "home") homeIcon(ctx, block);
    if (beat !== 1 || jolt) ctx.restore();
  }

  // The new red block's way to its target: a red trail growing from it along its lane,
  // over the blocks in the way.
  const cueing = cue && goal && cue.id === goal.id ? blocks.find((b) => b.id === goal.id) : null;
  if (cue && goal && cueing) {
    const t = now - cue.born - CUE_DELAY;
    if (t > 0) {
      const grow = 1 - Math.pow(1 - Math.min(1, t / CUE_GROW), 3);
      const fade = 1 - Math.max(0, Math.min(1, (t - CUE_GROW - CUE_HOLD) / CUE_FADE));
      const horizontal = cueing.w > cueing.h;
      const at = horizontal ? cueing.x : cueing.y, aim = horizontal ? goal.target.x : goal.target.y;
      const size = horizontal ? cueing.w : cueing.h;
      if (aim !== at && fade > 0) {
        const forward = aim > at;
        const near = forward ? at + size : at;
        const far = near + ((forward ? aim + size : aim) - near) * grow;
        const g = horizontal ? ctx.createLinearGradient(near * UNIT, 0, far * UNIT, 0) : ctx.createLinearGradient(0, near * UNIT, 0, far * UNIT);
        g.addColorStop(0, `rgba(214, 69, 69, ${0.4 * fade})`);
        g.addColorStop(1, "rgba(214, 69, 69, 0)");
        ctx.fillStyle = g;
        const [a, b] = [Math.min(near, far) * UNIT, Math.max(near, far) * UNIT];
        ctx.beginPath();
        if (horizontal) ctx.roundRect(a, cueing.y * UNIT + GAP, b - a, cueing.h * UNIT - 2 * GAP, 8);
        else ctx.roundRect(cueing.x * UNIT + GAP, a, cueing.w * UNIT - 2 * GAP, b - a, 8);
        ctx.fill();
      }
    }
  }

  targets.forEach((t, i) => t.goal === goal && drawTarget(i));

  // A reached target keeps a check, above whatever block is on it.
  for (const { goal: g, cells } of targets) {
    if (g === goal) continue;
    goalCheck(ctx, cells.x + cells.w / 2, cells.y + cells.h / 2);
    goalStars(ctx, g, cells);
  }
  for (const s of sparkles) sparkle(ctx, s, now);

  // A tap on the background: one small yellow ring spreading out and fading, like a drop
  // landing in water. Nothing stays.
  for (const ripple of ripples) {
    const t = (now - ripple.born) / RIPPLE_MS;
    if (t >= 0 && t < 1) {
      const spread = 1 - Math.pow(1 - t, 3);
      ctx.strokeStyle = `rgba(242, 182, 50, ${(1 - t) * 0.9})`;
      ctx.lineWidth = (3 - 2 * spread) / scene.camera.scale;
      ctx.beginPath();
      ctx.arc(ripple.at.x, ripple.at.y, (4 + 26 * spread) / scene.camera.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The culling border is a screen thing, so it is drawn in screen pixels.
  if (scene.border) {
    const border = borderOnScreen(scene);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(border.x + 0.5, border.y + 0.5, border.width - 1, border.height - 1);
  }
  // The goal's glow, over the blocks.
  const band = goalBand(scene);
  if (band) drawBand(ctx, band, dpr);
  const toUi = uiArrow(scene);
  if (toUi) drawPin(ctx, toUi, COLORS.ui, 16, dpr, true);
  const toRed = redArrow(scene);
  if (toRed) drawPin(ctx, toRed, COLORS.goal, 13, dpr);
  // A slide entirely out of view (an undo, say): a small green arrow points to it while it runs.
  if (sliding) {
    const block = scene.layout.byId(sliding.id);
    if (block) {
      const x = Math.min(sliding.from.x, sliding.to.x), y = Math.min(sliding.from.y, sliding.to.y);
      const swept = { x, y, width: Math.max(sliding.from.x, sliding.to.x) + block.w - x, height: Math.max(sliding.from.y, sliding.to.y) + block.h - y };
      const toChange = edgeArrow(scene, onScreen(scene, swept));
      if (toChange) drawPin(ctx, toChange, COLORS.moved, 11, dpr);
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

/** "fps" with a switch under it, like the border toggle's. */
function fpsIcon(ctx: CanvasRenderingContext2D, block: Block, on: boolean): void {
  const x = block.x * UNIT;
  const y = block.y * UNIT;
  ctx.fillStyle = COLORS.icon;
  ctx.font = `600 ${UNIT * 0.22}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("fps", x + UNIT / 2, y + UNIT * 0.34);
  const w = UNIT * 0.36;
  const h = UNIT * 0.18;
  const left = x + (UNIT - w) / 2;
  const top = y + UNIT * 0.56;
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

/** An arrow up out of a tray: send the play data. */
function uploadIcon(ctx: CanvasRenderingContext2D, block: Block): void {
  const x = block.x * UNIT, y = block.y * UNIT;
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = UNIT * 0.07;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x + UNIT * 0.5, y + UNIT * 0.6);
  ctx.lineTo(x + UNIT * 0.5, y + UNIT * 0.24);
  ctx.moveTo(x + UNIT * 0.36, y + UNIT * 0.37);
  ctx.lineTo(x + UNIT * 0.5, y + UNIT * 0.24);
  ctx.lineTo(x + UNIT * 0.64, y + UNIT * 0.37);
  ctx.moveTo(x + UNIT * 0.27, y + UNIT * 0.6);
  ctx.lineTo(x + UNIT * 0.27, y + UNIT * 0.74);
  ctx.lineTo(x + UNIT * 0.73, y + UNIT * 0.74);
  ctx.lineTo(x + UNIT * 0.73, y + UNIT * 0.6);
  ctx.stroke();
}

/** A reached goal's stars along its long edge: what it was worth (1..5), the earned ones
 * filled in gold. */
function goalStars(ctx: CanvasRenderingContext2D, g: Goal, cells: Cells): void {
  const d = g.difficulty;
  if (!d || g.used === undefined) return;
  const worth = starsWorth(bestKnown(g)!);
  const earned = starsEarned(worth, bestKnown(g)!, g.used);
  const horizontal = cells.w > cells.h;
  const step = 13, r = 5.2;
  const long = (horizontal ? cells.w : cells.h) * UNIT;
  const first = (long - step * (worth - 1)) / 2;
  for (let i = 0; i < worth; i++) {
    const along = first + i * step;
    const x = cells.x * UNIT + (horizontal ? along : cells.w * UNIT - 11);
    const y = cells.y * UNIT + (horizontal ? cells.h * UNIT - 11 : along);
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = i < earned ? COLORS.star : "rgba(255, 255, 255, 0.35)";
    ctx.fill();
  }
  if (medal(g)) goalMedal(ctx, (cells.x + 0.27) * UNIT, (cells.y + 0.4) * UNIT);
}

/** A gold medal on a red and white ribbon: solved in fewer moves than the game knew. */
function goalMedal(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = UNIT * 0.12;
  ctx.fillStyle = COLORS.icon;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.9, y - r * 2.1);
  ctx.lineTo(x - r * 0.1, y - r * 2.1);
  ctx.lineTo(x + r * 0.35, y - r * 0.6);
  ctx.lineTo(x - r * 0.45, y - r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c44";
  ctx.beginPath();
  ctx.moveTo(x + r * 0.9, y - r * 2.1);
  ctx.lineTo(x + r * 0.1, y - r * 2.1);
  ctx.lineTo(x - r * 0.35, y - r * 0.6);
  ctx.lineTo(x + r * 0.45, y - r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.star;
  ctx.fill();
  ctx.strokeStyle = "#b07d12";
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
  ctx.strokeStyle = COLORS.done;
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

type Cells = { x: number; y: number; w: number; h: number };

/** The cells a goal's target covers: the red block's size at the target. */
function targetCells(scene: Scene, goal: Goal): Cells | null {
  const red = scene.layout.byId(goal.id);
  return red ? { ...goal.target, w: red.w, h: red.h } : null;
}

/** The arrow to the red block, when it is out of view (tapping it goes there). */
export function redArrow(scene: Scene): EdgeArrow | null {
  const goal = scene.goal;
  const red = goal && scene.layout.byId(goal.id);
  const at = goal && whereIs(scene, goal.id);
  if (!red || !at) return null;
  return edgeArrow(scene, onScreen(scene, { x: at.x, y: at.y, width: red.w, height: red.h }));
}

export type Band = { side: "left" | "right" | "top" | "bottom"; x: number; y: number; width: number; height: number; alpha: number };
const BAND_DEPTH = 70; // px from the view's edge inwards

/** How much of [lo, hi] lies inside [from, to], 0..1. */
const inside = (lo: number, hi: number, from: number, to: number) => Math.max(0, Math.min(hi, to) - Math.max(lo, from)) / (hi - lo);

/**
 * When the target is out of view: a red glow at the edge of the view on the target's side,
 * on the goal's own track (left or right of a horizontal red block's row, above or below a
 * vertical one's column). Tapping it goes to the target. It fades rather than pops, with how
 * far the view's edge has moved over things: out as the target comes into view, out as its
 * track leaves the view, and out as the red block goes off that same side (then the red
 * block's pin is the way there, and both would clutter the edge).
 */
export function goalBand(scene: Scene): Band | null {
  const goal = scene.goal;
  const cells = goal && targetCells(scene, goal);
  const red = goal && scene.layout.byId(goal.id);
  const at = goal && whereIs(scene, goal.id);
  if (!goal || !cells || !red || !at) return null;
  const t = onScreen(scene, { x: cells.x, y: cells.y, width: cells.w, height: cells.h });
  const r = onScreen(scene, { x: at.x, y: at.y, width: red.w, height: red.h });
  const v = borderOnScreen(scene);
  const right = v.x + v.width, bottom = v.y + v.height;
  let band: Band;
  if (cells.w > cells.h) {
    const side = t.right > right ? "right" : t.left < v.x ? "left" : null;
    if (!side) return null;
    const y0 = Math.max(t.top, v.y), y1 = Math.min(t.bottom, bottom);
    if (y1 <= y0) return null;
    const hidden = 1 - inside(t.left, t.right, v.x, right);
    const redIn = side === "right" ? inside(r.left, r.right, -Infinity, right) : inside(r.left, r.right, v.x, Infinity);
    const alpha = hidden * inside(t.top, t.bottom, v.y, bottom) * redIn;
    band = { side, x: side === "right" ? right - BAND_DEPTH : v.x, y: y0, width: BAND_DEPTH, height: y1 - y0, alpha };
  } else {
    const side = t.bottom > bottom ? "bottom" : t.top < v.y ? "top" : null;
    if (!side) return null;
    const x0 = Math.max(t.left, v.x), x1 = Math.min(t.right, right);
    if (x1 <= x0) return null;
    const hidden = 1 - inside(t.top, t.bottom, v.y, bottom);
    const redIn = side === "bottom" ? inside(r.top, r.bottom, -Infinity, bottom) : inside(r.top, r.bottom, v.y, Infinity);
    const alpha = hidden * inside(t.left, t.right, v.x, right) * redIn;
    band = { side, x: x0, y: side === "bottom" ? bottom - BAND_DEPTH : v.y, width: x1 - x0, height: BAND_DEPTH, alpha };
  }
  return band.alpha > 0.01 ? band : null;
}

/** The glow: clear inside, red at the view's edge. Drawn in screen pixels. */
function drawBand(ctx: CanvasRenderingContext2D, b: Band, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [x0, y0, x1, y1] = b.side === "right" ? [b.x, 0, b.x + b.width, 0]
    : b.side === "left" ? [b.x + b.width, 0, b.x, 0]
    : b.side === "bottom" ? [0, b.y, 0, b.y + b.height]
    : [0, b.y + b.height, 0, b.y];
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "rgba(255, 110, 90, 0)");
  g.addColorStop(1, `rgba(255, 110, 90, ${0.85 * b.alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.width, b.height);
}

/** The arrow to the UI blocks, when none of them are in view (tapping it goes there). */
export function uiArrow(scene: Scene): EdgeArrow | null {
  return scene.layout.byId("reset") ? edgeArrow(scene, onScreen(scene, UI_AREA)) : null;
}

/** A pin: a circle drawn out into a point along `angle`, towards what it marks. The home
 * pin carries a house; the others are plain. Drawn in screen pixels. */
function drawPin(ctx: CanvasRenderingContext2D, a: EdgeArrow, fill: string, radius: number, dpr: number, house = false): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const reach = radius * 1.45; // from the circle's middle to the point
  const spread = Math.acos(radius / reach); // where the sides meet the circle
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x + Math.cos(a.angle) * reach, a.y + Math.sin(a.angle) * reach);
  ctx.arc(a.x, a.y, radius, a.angle + spread, a.angle - spread + Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  // A round stroke in the same colour blunts the point.
  ctx.strokeStyle = fill;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.stroke();
  if (!house) return;
  // A small outlined house, like the home block's.
  const s = radius * 0.5;
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x - s, a.y - s * 0.1);
  ctx.lineTo(a.x, a.y - s);
  ctx.lineTo(a.x + s, a.y - s * 0.1);
  ctx.moveTo(a.x - s * 0.72, a.y - s * 0.3);
  ctx.lineTo(a.x - s * 0.72, a.y + s * 0.8);
  ctx.lineTo(a.x + s * 0.72, a.y + s * 0.8);
  ctx.lineTo(a.x + s * 0.72, a.y - s * 0.3);
  ctx.stroke();
}
