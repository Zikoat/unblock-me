// Draws a scene on a canvas. Everything on the board is drawn in world units under one
// camera transform, so it all zooms and pans together.
import { worldRect } from "./camera";
import { intersects, UNIT, type Block } from "./layout";
import { drawScoreTrack, FINISH, finishTimes, starPoints, type TraceEntry } from "./score-track";
import { bestKnown, type Goal } from "./goal";
import { cinemaOverlay, dance, glitch, lit, overMore, tilt } from "./finish-fx2";
import { onBlock, over, punch, quake, screenFlash, soul as drawSoul, SOUL, squash, timeWarp, under, wave, type Fx } from "./finish-fx";
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
  // The goal in play is a lighter shade of the red block's red (its target's area; the
  // score track's fill is in score-track.ts); reached goals are gold: the block, and its target's area and outline,
  // which show where it was once the block has moved away.
  target: "rgba(232, 115, 115, 0.18)",
  targetLine: "#e06666",
  done: "#d49a2a",
  doneTarget: "rgba(240, 176, 40, 0.2)",
  doneLine: "#dcaa45",
  star: "#f2b632",
  ui: "#1d1d1f",
  wall: "#5f5d57",
  icon: "#f3f2ee",
};
/** How long a reached target's area takes to fade out as its block lands on it (and back
 * in as it leaves), ms. */
const AREA_FADE_MS = 300;
/** Per reached goal: whether its block was on its target at the last frame, and since when. */
const onTargetSince = new Map<string, { on: boolean; since: number }>();
let areasFading = false;
/** Whether a reached target's area is still fading (main.ts keeps frames coming). */
export const fading = () => areasFading;
/** Forget the targets' fades (the inspector replays from a snapshot). */
export function resetFades(): void {
  onTargetSince.clear();
  areasFading = false;
}
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
  { fullscreen, density, fps = true, sliding, sparkles = [], throb = null, cue = null, ripples = [], shake = null, pinThrob = null, used = 0, trace, finish = null, soul = null, now = 0 }: {
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
    /** Collects the finishing goal's icons as drawn (the animation inspector). */
    trace?: TraceEntry[];
    /** A tapped edge arrow, throbbing since `born`. */
    pinThrob?: { pin: "red" | "ui"; born: number } | null;
    /** Moves made on the current goal so far, for its score track. */
    used?: number;
    /** The goal just reached, and when: its score track plays the finish. */
    finish?: { id: string; born: number; dir?: { x: number; y: number } } | null;
    /** The last red block's soul flying to the new one (world px), and when it set off. */
    soul?: { from: { x: number; y: number; width: number; height: number }; toId: string; born: number } | null;
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
  // The finish's effects round the block (finish-fx.ts); its hits jolt the whole board.
  const fx = finishFx(scene, finish, now, worldRect(camera, { x: 0, y: 0, width, height }), camera.scale);
  // The soul still on its way: the new red block shows as it was until it arrives.
  const soulK = soul ? now - soul.born : Infinity;
  if (fx) {
    const q = quake(fx), f = punch(fx), cx = fx.rect.x + fx.rect.width / 2, cy = fx.rect.y + fx.rect.height / 2;
    ctx.translate(q.x + cx, q.y + cy);
    ctx.scale(f, f);
    ctx.rotate(tilt(fx));
    ctx.translate(-cx, -cy);
  }

  const view = worldRect(camera, { x: 0, y: 0, width, height });
  const goal = scene.goal;
  // Targets, the reached ones and the current one: a pale area a little larger than the red
  // block, so it still shows around the block on it. Culled like blocks.
  const inView = latticeRect(scene, borderOnScreen(scene));
  const targets = [...scene.done, ...(goal ? [goal] : [])]
    .map((g) => ({ goal: g, cells: targetCells(scene, g) }))
    .filter((t): t is { goal: Goal; cells: Cells } => !!t.cells && intersects(t.cells, inView));
  const onTarget = (x: number, y: number) => targets.some(({ cells: c }) => x >= c.x * UNIT - TARGET_MARGIN && x <= (c.x + c.w) * UNIT + TARGET_MARGIN && y >= c.y * UNIT - TARGET_MARGIN && y <= (c.y + c.h) * UNIT + TARGET_MARGIN);
  const litDots: number[] = [];
  // Round dots at the lattice corners (not on targets), all in one path so they cost one fill.
  ctx.fillStyle = COLORS.dot;
  ctx.beginPath();
  for (let x = Math.floor(view.x / UNIT) * UNIT; x < view.x + view.width + UNIT; x += UNIT) {
    for (let y = Math.floor(view.y / UNIT) * UNIT; y < view.y + view.height + UNIT; y += UNIT) {
      if (onTarget(x, y)) continue;
      // The finish's shock waves ripple through the dots.
      const w = fx ? wave(fx, x, y) : null, dx = x + (w?.dx ?? 0), dy = y + (w?.dy ?? 0), r = DOT_SIZE / 2 + (w ? Math.min(DOT_SIZE, w.lift * 0.15) : 0);
      // Lit gold where a wave is passing (drawn after, in one path of their own).
      if (w && fx && lit(w.lift, fx)) {
        litDots.push(dx, dy, r * 1.6);
        continue;
      }
      ctx.moveTo(dx + r, dy);
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  if (litDots.length) {
    ctx.fillStyle = "#ffcf3f";
    ctx.beginPath();
    for (let i = 0; i < litDots.length; i += 3) {
      ctx.moveTo(litDots[i]! + litDots[i + 2]!, litDots[i + 1]!);
      ctx.arc(litDots[i]!, litDots[i + 1]!, litDots[i + 2]!, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  // Reached targets side by side overlap by their margins: each is filled only where no
  // earlier one was, so touching ones read as one shape. The current target is drawn whole,
  // over them.
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
    // The current target: a pale coral area with an outline. A reached one: a pale gold area
    // with an outline, faded out while its block stands on it (no ring round the block).
    const shown = g === goal ? 1 : areaShown(g, now);
    if (shown <= 0) return;
    // Only other reached targets that show (not faded under their blocks) join this one.
    const reached = (j: number) => targets[j]!.goal !== goal && areaShown(targets[j]!.goal, now) > 0;
    ctx.save();
    ctx.globalAlpha = shown;
    if (g !== goal) outside(targets.slice(0, i).filter((_, j) => reached(j)));
    ctx.fillStyle = g === goal ? COLORS.target : COLORS.doneTarget;
    ctx.fill(own);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = shown;
    if (g !== goal) outside(targets.filter((_, j) => j !== i && reached(j)));
    ctx.strokeStyle = g === goal ? COLORS.targetLine : COLORS.doneLine;
    ctx.lineWidth = 2;
    ctx.stroke(own);
    ctx.restore();
  };
  /** How much of a reached target's area shows: none with its block on it, all without. It
   * starts fading as soon as a tap sends the block there, and back as soon as a drag moves
   * it a little off. */
  const areaShown = (g: Goal, now: number) => {
    const at = scene.dragging?.id === g.id ? scene.dragging : whereIs(scene, g.id);
    const on = !!at && Math.abs(at.x - g.target.x) + Math.abs(at.y - g.target.y) < 0.15;
    let s = onTargetSince.get(g.id);
    if (!s) onTargetSince.set(g.id, (s = { on, since: -Infinity }));
    if (s.on !== on) onTargetSince.set(g.id, (s = { on, since: now }));
    const t = Math.min(1, (now - s.since) / AREA_FADE_MS);
    if (t < 1) areasFading = true;
    return on ? 1 - t : t;
  };
  areasFading = false;
  const trackRect = (c: Cells) => ({ x: c.x * UNIT - TARGET_MARGIN, y: c.y * UNIT - TARGET_MARGIN, width: c.w * UNIT + 2 * TARGET_MARGIN, height: c.h * UNIT + 2 * TARGET_MARGIN });
  const fewestOf = (g: Goal) => bestKnown(g) ?? g.solution.length;
  /** A reached block's colour: red until its finish gathers the stars, fading to gold
   * as they gather. */
  const doneColor = (id: string) => {
    const g = finish?.id === id ? scene.done.find((d) => d.id === id) : null;
    if (!g || g.used === undefined) return COLORS.done;
    const k = Math.max(0, Math.min(1, (finishClock(scene, finish, now)! - finishTimes(fewestOf(g), g.used).gather) / FINISH.GATHER_MS));
    return mix(COLORS.goal, COLORS.done, k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  };
  // Reached targets go under the blocks (their red blocks sit on them); the current one goes
  // over them, so it shows even where blocks stand on it.
  targets.forEach((t, i) => t.goal !== goal && drawTarget(i));
  if (fx) under(ctx, fx);

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
      : isGoal ? (soulK < SOUL.TRAVEL_MS && block.id === soul?.toId ? mix(block.moved ? COLORS.moved : COLORS.block, COLORS.goal, Math.max(0, (soulK / SOUL.TRAVEL_MS - 0.85) / 0.15)) : COLORS.goal)
      : wasGoal ? doneColor(block.id)
      : block.moved ? COLORS.moved
      : COLORS.block;
    const beat = throb?.id === block.id ? throbScale((now - throb.born) / THROB_MS) : 1;
    // A stuck block shakes along its axis, a few px each way, dying down.
    const st = shake?.id === block.id ? (now - shake.born) / SHAKE_MS : 1;
    const jolt = st >= 0 && st < 1 ? Math.sin(st * Math.PI * 4) * 4 * (1 - st) : 0; // two wiggles
    // The other blocks hop as a shock wave passes under them.
    // And all dance to the beat for a while.
    const hop = fx && block.id !== finish?.id ? wave(fx, (block.x + block.w / 2) * UNIT, (block.y + block.h / 2) * UNIT).lift + dance(fx, blocks.indexOf(shown), block.x * UNIT) : 0;
    if (hop > 0.3) {
      const bx = (block.x + block.w / 2) * UNIT, by = (block.y + block.h) * UNIT, k = Math.min(0.25, hop / UNIT);
      ctx.save();
      ctx.translate(bx, by - hop * 1.2);
      ctx.scale(1 - k * 0.3, 1 + k * 0.5);
      ctx.translate(-bx, -by);
    }
    const squashed = fx && block.id === finish?.id ? squash(fx) : null;
    if (squashed) {
      ctx.save();
      ctx.translate(squashed.about.x, squashed.about.y);
      ctx.scale(squashed.sx, squashed.sy);
      ctx.translate(-squashed.about.x, -squashed.about.y);
    }
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
    if (squashed) {
      ctx.save();
      ctx.clip();
      onBlock(ctx, fx!);
      ctx.restore();
    }
    if (block.ui === "reset") resetIcon(ctx, block);
    else if (block.ui === "border") borderIcon(ctx, block, scene.border);
    else if (block.ui === "fullscreen") fullscreenIcon(ctx, block, fullscreen);
    else if (block.ui === "upload") uploadIcon(ctx, block);
    else if (block.ui === "reports") reportsIcon(ctx, block);
    else if (block.ui === "testbed") testbedIcon(ctx, block);
    else if (block.ui === "fps") fpsIcon(ctx, block, fps);
    else if (block.ui === "density") densityIcon(ctx, block, density);
    else if (block.ui === "home") homeIcon(ctx, block);
    if (beat !== 1 || jolt) ctx.restore();
    if (squashed) ctx.restore();
    if (hop > 0.3) ctx.restore();
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

  // Each target's score track, over the blocks: the current goal's as it is played, a
  // reached one's finish and then its row of stars.
  for (const { goal: g, cells } of targets) {
    if (g === goal) drawScoreTrack(ctx, trackRect(cells), fewestOf(g), used, { undone: g.undone });
    else if (g.used !== undefined) drawScoreTrack(ctx, trackRect(cells), fewestOf(g), g.used, { t: finish?.id === g.id ? (finishClock(scene, finish, now) ?? Infinity) : Infinity, undone: g.undone, trace: finish?.id === g.id ? trace : undefined });
  }
  for (const s of sparkles) sparkle(ctx, s, now);
  if (fx) {
    over(ctx, fx);
    overMore(ctx, fx);
  }
  if (soul && soulK >= 0) {
    const to = scene.layout.byId(soul.toId), at = whereIs(scene, soul.toId);
    if (to && at) drawSoul(ctx, soul.from, { x: at.x * UNIT + GAP, y: at.y * UNIT + GAP, width: to.w * UNIT - 2 * GAP, height: to.h * UNIT - 2 * GAP }, soulK, camera.scale);
  }

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

  if (fx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    screenFlash(ctx, fx, width, height);
    cinemaOverlay(ctx, fx, width, height);
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
  const pinBeat = (pin: "red" | "ui") => (pinThrob?.pin === pin ? 1 + 2 * (throbScale((now - pinThrob.born) / THROB_MS) - 1) : 1);
  if (toUi) drawPin(ctx, toUi, COLORS.ui, 16 * pinBeat("ui"), dpr, true);
  const toRed = redArrow(scene);
  if (toRed) drawPin(ctx, toRed, COLORS.goal, 13 * pinBeat("red"), dpr);
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
  if (fx) glitch(ctx, canvas, fx);
}

/** The finishing goal's own time at `now` (ms since it was reached, slowed and stopped
 * round the medal's hit: timeWarp), or null. */
function finishClock(scene: Scene, finish: { id: string; born: number } | null, now: number): number | null {
  const g = finish && scene.done.find((d) => d.id === finish.id);
  if (!finish || !g || g.used === undefined) return null;
  const times = finishTimes(bestKnown(g) ?? g.solution.length, g.used);
  return timeWarp(times, times.medalAt !== null && !g.undone).warp(now - finish.born);
}

/** The finishing goal's effects at `now`, if one is finishing and its block shows. */
function finishFx(scene: Scene, finish: { id: string; born: number; dir?: { x: number; y: number } } | null, now: number, view: Fx["view"], zoom: number): Fx | null {
  const g = finish && scene.done.find((d) => d.id === finish.id);
  const block = g && scene.layout.byId(g.id), at = g && whereIs(scene, g.id);
  if (!finish || !g || g.used === undefined || !block || !at) return null;
  const times = finishTimes(bestKnown(g) ?? g.solution.length, g.used);
  const t = finishClock(scene, finish, now)!;
  if (t < 0 || t > times.end) return null;
  return {
    t,
    times,
    rect: { x: at.x * UNIT + GAP, y: at.y * UNIT + GAP, width: block.w * UNIT - 2 * GAP, height: block.h * UNIT - 2 * GAP },
    dir: finish.dir ?? { x: 0, y: 0 },
    medal: times.medalAt !== null && !g.undone,
    view,
    zoom,
    used: g.used,
    stars: starPoints({ x: g.target.x * UNIT - TARGET_MARGIN, y: g.target.y * UNIT - TARGET_MARGIN, width: block.w * UNIT + 2 * TARGET_MARGIN, height: block.h * UNIT + 2 * TARGET_MARGIN }, bestKnown(g) ?? g.solution.length, g.used),
  };
}

/** Between two #rrggbb colours, `k` of the way from `a` to `b`. */
function mix(a: string, b: string, k: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * k)).join(", ")})`;
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

/** A lab flask: the testbed. */
function testbedIcon(ctx: CanvasRenderingContext2D, block: Block): void {
  const x = block.x * UNIT, y = block.y * UNIT, u = UNIT;
  ctx.strokeStyle = COLORS.icon;
  ctx.fillStyle = COLORS.icon;
  ctx.lineWidth = u * 0.06;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + u * 0.42, y + u * 0.22);
  ctx.lineTo(x + u * 0.42, y + u * 0.42);
  ctx.lineTo(x + u * 0.26, y + u * 0.74);
  ctx.lineTo(x + u * 0.74, y + u * 0.74);
  ctx.lineTo(x + u * 0.58, y + u * 0.42);
  ctx.lineTo(x + u * 0.58, y + u * 0.22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + u * 0.36, y + u * 0.22);
  ctx.lineTo(x + u * 0.64, y + u * 0.22);
  ctx.stroke();
  // The liquid in it.
  ctx.beginPath();
  ctx.moveTo(x + u * 0.33, y + u * 0.6);
  ctx.lineTo(x + u * 0.67, y + u * 0.6);
  ctx.lineTo(x + u * 0.74, y + u * 0.74);
  ctx.lineTo(x + u * 0.26, y + u * 0.74);
  ctx.closePath();
  ctx.fill();
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

/** Both edge pins; when they would overlap, they step apart along the edge they sit on. */
function pins(scene: Scene): { ui: EdgeArrow | null; red: EdgeArrow | null } {
  const ui = uiArrowAlone(scene), red = redArrowAlone(scene);
  if (!ui || !red) return { ui, red };
  const apart = 40;
  if (Math.hypot(ui.x - red.x, ui.y - red.y) >= apart) return { ui, red };
  const view = borderOnScreen(scene);
  const midX = (ui.x + red.x) / 2, midY = (ui.y + red.y) / 2;
  // On the top or bottom edge they move sideways; on the left or right one, up and down.
  const flat = Math.min(Math.abs(midY - view.y), Math.abs(midY - view.y - view.height)) < Math.min(Math.abs(midX - view.x), Math.abs(midX - view.x - view.width));
  const first = flat ? ui.x <= red.x : ui.y <= red.y; // keep their order
  const step = (s: number) => (flat ? { x: midX + s * apart / 2, y: midY } : { x: midX, y: midY + s * apart / 2 });
  return { ui: { ...ui, ...step(first ? -1 : 1) }, red: { ...red, ...step(first ? 1 : -1) } };
}

type Cells = { x: number; y: number; w: number; h: number };

/** The cells a goal's target covers: the red block's size at the target. */
function targetCells(scene: Scene, goal: Goal): Cells | null {
  const red = scene.layout.byId(goal.id);
  return red ? { ...goal.target, w: red.w, h: red.h } : null;
}

/** The arrow to the red block, when it is out of view (tapping it goes there). */
export function redArrow(scene: Scene): EdgeArrow | null {
  return pins(scene).red;
}
function redArrowAlone(scene: Scene): EdgeArrow | null {
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

/** The arrow to the fullscreen block, when it is out of view (tapping it goes there); none
 * where there is no fullscreen block. */
export function uiArrow(scene: Scene): EdgeArrow | null {
  return pins(scene).ui;
}
function uiArrowAlone(scene: Scene): EdgeArrow | null {
  const b = scene.layout.byId("fullscreen");
  return b ? edgeArrow(scene, onScreen(scene, { x: b.x, y: b.y, width: b.w, height: b.h })) : null;
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
