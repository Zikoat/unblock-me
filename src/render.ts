// Draws a scene on a canvas. Everything on the board is drawn in world units under one
// camera transform, so it all zooms and pans together.
import { worldRect, type Rect } from "./camera";
import { intersects, UNIT, type Block } from "./layout";
import { drawScoreTrack, FINISH, finishTimes, starPoints, type TraceEntry } from "./score-track";
import { bestKnown, shownUsed, type Goal } from "./goal";
import { islandSide, redId, squareOf } from "./island";
import { timed } from "./perf";
import { cinemaOverlay, dance, glitch, glitchShift, lit, overMore, tilt } from "./finish-fx2";
import { onBlock, over, punch, quake, screenFlash, soul as drawSoul, SOUL, soulFlash, squash, type SoulStyle, timeWarp, under, wave, type Fx } from "./finish-fx";
import { borderOnScreen, latticeRect, quickPush, uiToolbar, visibleBlocks, whereIs, type Scene } from "./scene";

export const COLORS = {
  background: "#f3f2ee",
  dot: "#d3d1ca",
  border: "#b9b6ad",
  block: "#4f6d8f",
  moved: "#3f9a7a",
  dragging: "#e0823d",
  stuck: "#8d97a3",
  goal: "#d64545",
  goalWaiting: "#c99390", // the next red block, shown while the last one's finish plays
  // The goal in play is a lighter shade of the red block's red (its target's area; the
  // score track's fill is in score-track.ts); reached goals are gold: the block, and its target's area and outline,
  // which show where it was once the block has moved away.
  target: "rgba(232, 115, 115, 0.18)",
  targetLine: "#e06666",
  done: "#d49a2a",
  doneTarget: "rgb(242, 229, 198)", // gold at 0.2 over the background, opaque: overlapping areas cover outlines inside them
  doneLine: "#dcaa45",
  star: "#f2b632",
  ui: "#1d1d1f",
  wall: "#5f5d57",
  outside: "#5f5d57", // round an island square being played: its walls' colour, one surface
  hud: "#e9e7e0", // the level and moves over it
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
  { fullscreen, density, walls = 0, fps = true, sliding, sparkles = [], throb = null, cue = null, ripples = [], shake = null, pinThrob = null, pinHeld = null, used = 0, trace, finish = null, soul = null, waiting = false, appear = 1, stillRed = null, detail = 1, now = 0, hud = null, surface = null, labels = [] }: {
    fullscreen: boolean;
    density: number;
    /** The walls slider's position, 0..1. */
    walls?: number;
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
    pinThrob?: { pin: "red" | "ui"; born: number; at?: { x: number; y: number } | null } | null;
    /** An edge arrow held down. */
    pinHeld?: "red" | "ui" | null;
    /** Moves made on the current goal so far, for its score track. */
    used?: number;
    /** The goal just reached, and when: its score track plays the finish. An island square's
     * (`island`) plays in a card in the middle of the screen instead, with no effects round
     * the block; a square's earlier goal's (`quiet`) has neither. */
    finish?: { id: string; born: number; dir?: { x: number; y: number }; island?: boolean; quiet?: boolean } | null;
    /** On an island square: its number and the moves so far (shown over
     * the surface at the top). */
    hud?: { level: number; moves: number } | null;
    /** The island's surface fading out (`alpha`) round its last square (`rects`), once reached. */
    surface?: { rects: Rect[]; alpha: number } | null;
    /** The island squares' levels, on their top walls (lattice units). */
    labels?: { x: number; y: number; text: string }[];
    /** The next red block is shown, its soul not yet set off (the last one's finish plays). */
    waiting?: boolean;
    /** How far the current goal has faded in since it was shown, 0..1: its red block (from
     * its own colour), its target and its score track. */
    appear?: number;
    /** A reached red block still red: its finish plays, or its soul is yet to set off. */
    stillRed?: string | null;
    /** The last red block's soul flying to the new one (world px), and when it set off. */
    soul?: { from: { x: number; y: number; width: number; height: number }; toId: string; born: number; style: SoulStyle } | null;
    /** How much of the finish's detail to draw (less when frames come late: main.ts). */
    detail?: number;
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
  // A view with no size (a window shrunk to nothing) or a zoom that isn't a size: nothing to
  // draw, and drawing would never end (the view's lattice would be endless).
  if (!(camera.scale > 0) || !Number.isFinite(camera.scale) || width <= 0 || height <= 0) return;

  ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.offsetX, dpr * camera.offsetY);
  // The finish's effects round the block (finish-fx.ts); its hits jolt the whole board.
  const fx = finish?.island || finish?.quiet ? null : finishFx(scene, finish, now, worldRect(camera, { x: 0, y: 0, width, height }), camera.scale, detail);
  // The soul still on its way: the new red block shows as it was until it arrives.
  // (-1 while the soul waits to set off: the next red block stays muted till it lands.)
  const soulK = soul ? (soul.born < 0 ? -1 : now - soul.born) : Infinity;
  if (fx) {
    const q = quake(fx), f = punch(fx), jump = glitchShift(fx), cx = fx.rect.x + fx.rect.width / 2, cy = fx.rect.y + fx.rect.height / 2;
    ctx.translate(q.x + jump + cx, q.y + cy);
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
  // No dot where a corner touches a wall: it would peek out of the gap beside the wall.
  const wallCells = new Set(visibleBlocks(scene).filter((b) => b.wall).flatMap((b) => Array.from({ length: b.w * b.h }, (_, i) => `${b.x + (i % b.w)},${b.y + Math.floor(i / b.w)}`)));
  const byWall = (x: number, y: number) => wallCells.has(`${x - 1},${y - 1}`) || wallCells.has(`${x},${y - 1}`) || wallCells.has(`${x - 1},${y}`) || wallCells.has(`${x},${y}`);
  // Round dots at the lattice corners (not on targets), all in one path so they cost one fill.
  timed(ctx, "dots", () => {
    ctx.fillStyle = COLORS.dot;
    ctx.beginPath();
    for (let x = Math.floor(view.x / UNIT) * UNIT; x < view.x + view.width + UNIT; x += UNIT) {
      for (let y = Math.floor(view.y / UNIT) * UNIT; y < view.y + view.height + UNIT; y += UNIT) {
        if (onTarget(x, y) || (wallCells.size && byWall(x / UNIT, y / UNIT))) continue;
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
  });
  // Reached targets that overlap read as one shape: every outline first, then every area
  // over them, an area a pixel in from its outline's outer edge, so only the union's outline
  // shows (each at its own fade: one fading under its block fades its part of the shape).
  // The current target is drawn whole, over them.
  // (An island square's bay target fits its bay, so its corners are as round as the walls';
  // a target inside a square is round as the world's.)
  const area = (c: Cells, path: Path2D, radius = 12, inset = 0) => path.roundRect(c.x * UNIT - TARGET_MARGIN + inset, c.y * UNIT - TARGET_MARGIN + inset, c.w * UNIT + 2 * (TARGET_MARGIN - inset), c.h * UNIT + 2 * (TARGET_MARGIN - inset), radius - inset);
  const drawTarget = (i: number) => {
    const { goal: g, cells } = targets[i]!;
    const own = new Path2D();
    area(cells, own, scene.locked && g.id === redId(squareOf(g) ?? -1) ? WALL_RADIUS : 12);
    // The current target: a pale coral area with an outline.
    ctx.fillStyle = COLORS.target;
    ctx.fill(own);
    ctx.strokeStyle = COLORS.targetLine;
    ctx.lineWidth = 2;
    ctx.stroke(own);
  };
  // A reached one: a pale gold area with an outline, faded out while its block stands on it
  // (no ring round the block).
  const drawReached = () => {
    const shown = targets.filter((t) => t.goal !== goal).map((t) => ({ cells: t.cells, a: areaShown(t.goal, now) })).filter((t) => t.a > 0);
    ctx.save();
    ctx.strokeStyle = COLORS.doneLine;
    ctx.lineWidth = 2;
    for (const t of shown) {
      const p = new Path2D();
      area(t.cells, p);
      ctx.globalAlpha = t.a;
      ctx.stroke(p);
    }
    ctx.fillStyle = COLORS.doneTarget;
    for (const t of shown) {
      const p = new Path2D();
      area(t.cells, p, 12, 1);
      ctx.globalAlpha = t.a;
      ctx.fill(p);
    }
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
    if (finish?.island && finish.id === id) return COLORS.goal; // an island square's stays red (its card goes gold)
    if (id === stillRed) return COLORS.goal; // red till its soul draws it in
    const g = finish?.id === id ? scene.done.find((d) => d.id === id) : null;
    if (!g || g.used === undefined || g.step) return COLORS.done;
    const k = Math.max(0, Math.min(1, (finishClock(scene, finish, now)! - finishTimes(fewestOf(g), shownUsed(g)!).gather) / FINISH.GATHER_MS));
    return mix(COLORS.goal, COLORS.done, k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  };
  // Reached targets go under the blocks (their red blocks sit on them); the current one goes
  // over them, so it shows even where blocks stand on it.
  drawReached();
  if (fx) timed(ctx, "under", () => under(ctx, fx));

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
    const { horizontal, near, far } = lane(hovered, hovered.w > hovered.h ? to.x : to.y);
    const g = horizontal ? ctx.createLinearGradient(near, 0, far, 0) : ctx.createLinearGradient(0, near, 0, far);
    g.addColorStop(0, hovered.id === goal?.id ? "rgba(214, 69, 69, 0.22)" : "rgba(79, 109, 143, 0.22)");
    g.addColorStop(1, "rgba(79, 109, 143, 0)");
    ctx.fillStyle = g;
    laneFill(ctx, hovered, near, far);
  }

  // A throbbing block grows over its neighbours, so it goes on top.
  if (throb) blocks.sort((a, b) => Number(a.id === throb.id) - Number(b.id === throb.id));
  const uiIcon = (block: Block) => {
    if (block.ui === "reset") resetIcon(ctx, block);
    else if (block.ui === "border") borderIcon(ctx, block, scene.border);
    else if (block.ui === "fullscreen") fullscreenIcon(ctx, block, fullscreen);
    else if (block.ui === "upload") uploadIcon(ctx, block);
    else if (block.ui === "reports") reportsIcon(ctx, block);
    else if (block.ui === "testbed") testbedIcon(ctx, block);
    else if (block.ui === "fps") fpsIcon(ctx, block, fps);
    else if (block.ui === "density") densityIcon(ctx, block, density);
    else if (block.ui === "walls") wallsIcon(ctx, block, walls);
    else if (block.ui === "home") homeIcon(ctx, block);
  };
  timed(ctx, "blocks", () => {
    // On an island square its walls are the colour of the surface round it.
    drawWalls(ctx, blocks.filter((b) => b.wall), scene.locked ? COLORS.outside : COLORS.wall);
    for (const shown of blocks) {
      if (shown.wall) continue;
      if (shown.ui && scene.locked) continue; // over the island's surface instead (below)
      const block = shown.id === sliding?.id ? { ...shown, x: sliding.x, y: sliding.y } : shown;
      // Red blocks stay red after their goal is reached, a darker red.
      const isGoal = block.id === goal?.id;
      const wasGoal = !isGoal && scene.done.some((g) => g.id === block.id);
      ctx.fillStyle = block.ui ? COLORS.ui
        : block.wall ? COLORS.wall
        : block.id === scene.dragging?.id ? COLORS.dragging
        : block.id === scene.stuckId ? COLORS.stuck
        : isGoal ? (waiting ? mix(block.moved ? COLORS.moved : COLORS.block, COLORS.goalWaiting, appear) : soulK < SOUL.TRAVEL_MS && block.id === soul?.toId ? COLORS.goalWaiting : block.id === soul?.toId && soulFlash(soulK) > 0 ? mix(COLORS.goal, "#ffffff", soulFlash(soulK)) : COLORS.goal)
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
      uiIcon(block);
      if (beat !== 1 || jolt) ctx.restore();
      if (squashed) ctx.restore();
      if (hop > 0.3) ctx.restore();
    }
  });

  // The old red block's red drawing in to its soul: over the blocks, under the stars.
  if (soul && soulK >= 0) {
    const to = scene.layout.byId(soul.toId), at = whereIs(scene, soul.toId);
    if (to && at) drawSoul(ctx, soul.from, { x: at.x * UNIT + GAP, y: at.y * UNIT + GAP, width: to.w * UNIT - 2 * GAP, height: to.h * UNIT - 2 * GAP }, soulK, camera.scale, soul.style, "under");
  }

  // The new red block's way to its target: a red trail growing from it along its lane,
  // over the blocks in the way.
  // (Not before its clock starts: once the soul gets there.)
  const cueing = cue && cue.born >= 0 && goal && cue.id === goal.id ? blocks.find((b) => b.id === goal.id) : null;
  if (cue && goal && cueing) {
    const t = now - cue.born - CUE_DELAY;
    if (t > 0) {
      const grow = 1 - Math.pow(1 - Math.min(1, t / CUE_GROW), 3);
      const fade = 1 - Math.max(0, Math.min(1, (t - CUE_GROW - CUE_HOLD) / CUE_FADE));
      const horizontal = cueing.w > cueing.h;
      const at = horizontal ? cueing.x : cueing.y, aim = horizontal ? goal.target.x : goal.target.y;
      if (aim !== at && fade > 0) {
        const { near, far: end } = lane(cueing, aim), far = near + (end - near) * grow;
        const g = horizontal ? ctx.createLinearGradient(near, 0, far, 0) : ctx.createLinearGradient(0, near, 0, far);
        g.addColorStop(0, `rgba(214, 69, 69, ${0.4 * fade})`);
        g.addColorStop(1, "rgba(214, 69, 69, 0)");
        ctx.fillStyle = g;
        laneFill(ctx, cueing, near, far);
      }
    }
  }

  ctx.save();
  ctx.globalAlpha = appear;
  targets.forEach((t, i) => t.goal === goal && drawTarget(i));
  ctx.restore();

  // Each target's score track, over the blocks: the current goal's as it is played, a
  // reached one's finish and then its row of stars.
  timed(ctx, "score tracks", () => {
    for (const { goal: g, cells } of targets) {
      // (Not an island square's: the bar at the top has its moves.)
      if (g === goal && !g.unrated && !scene.locked) {
        ctx.save();
        ctx.globalAlpha = appear;
        drawScoreTrack(ctx, trackRect(cells), fewestOf(g), used, { undone: g.undone });
        ctx.restore();
      }
      else if (g.used !== undefined && !g.step && !(finish?.island && finish.id === g.id)) drawScoreTrack(ctx, trackRect(cells), fewestOf(g), shownUsed(g)!, { t: finish?.id === g.id ? (finishClock(scene, finish, now) ?? Infinity) : Infinity, undone: g.undone, trace: finish?.id === g.id ? trace : undefined, detail });
    }
  });
  timed(ctx, "sparkles", () => sparkles.forEach((s) => sparkle(ctx, s, now)));
  // The island's surface goes over everything round the square: other squares' targets and
  // their stars too.
  // (With the smaller border on, it lets the world show through: the view outside, to test.)
  if (scene.locked) greyOutside(ctx, scene, scene.locked, scene.border ? 0.7 : 1);
  else if (surface) greyOutside(ctx, scene, surface.rects, surface.alpha);
  // On an island square the UI blocks show over its surface as a toolbar at the top left, but
  // only with the debug UI on (the fullscreen block too: otherwise none show there). Each is
  // drawn as on the board, scaled to its place.
  for (const { block, rect } of uiToolbar(scene)) {
    const k = rect.width / (block.w * UNIT);
    ctx.save();
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (rect.x - block.x * UNIT * k), dpr * (rect.y - block.y * UNIT * k));
    ctx.fillStyle = COLORS.ui;
    ctx.beginPath();
    ctx.roundRect(block.x * UNIT + GAP, block.y * UNIT + GAP, block.w * UNIT - 2 * GAP, block.h * UNIT - 2 * GAP, 8);
    ctx.fill();
    uiIcon(block);
    ctx.restore();
  }
  // The squares' levels on their top walls (over the surface: the one being played shows it).
  // On a square, its level keeps on the screen and clear of the square, to a readable size:
  // when the square fills the height, its top wall is mostly above the screen.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.hud;
  for (const l of labels) {
    if (!scene.locked) {
      ctx.font = `800 ${UNIT * 0.5}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.fillText(l.text, l.x * UNIT, l.y * UNIT + UNIT * 0.03);
      continue;
    }
    // In the space over the square: on its top wall where that shows, else halfway up it,
    // and never bigger than it fits.
    const { size, y } = levelLine(borderOnScreen(scene), camera.scale);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText(l.text, l.x * UNIT * camera.scale + camera.offsetX, y);
    ctx.restore();
  }
  if (fx) {
    over(ctx, fx);
    overMore(ctx, fx);
  }
  if (soul && soulK >= 0) {
    const to = scene.layout.byId(soul.toId), at = whereIs(scene, soul.toId);
    if (to && at) drawSoul(ctx, soul.from, { x: at.x * UNIT + GAP, y: at.y * UNIT + GAP, width: to.w * UNIT - 2 * GAP, height: to.h * UNIT - 2 * GAP }, soulK, camera.scale, soul.style, "over");
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
    timed(ctx, "screenFlash", () => screenFlash(ctx, fx, width, height));
    timed(ctx, "cinema", () => cinemaOverlay(ctx, fx, width, height));
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
  // (Not before the cue's trail starts growing, fading in with it.)
  const band = goalBand(scene);
  const bandIn = !cue || !goal || cue.id !== goal.id ? 1 : cue.born < 0 ? 0 : Math.max(0, Math.min(1, (now - cue.born - CUE_DELAY) / CUE_GROW));
  if (band && bandIn > 0) drawBand(ctx, { ...band, alpha: band.alpha * bandIn }, dpr);
  const toUi = uiArrow(scene);
  const pinBeat = (pin: "red" | "ui") => (pinHeld === pin ? 0.85 : pinThrob?.pin === pin ? 1 + 2 * (throbScale((now - pinThrob.born) / THROB_MS) - 1) : 1);
  if (toUi) drawPin(ctx, toUi, COLORS.ui, 16 * pinBeat("ui"), dpr, true);
  const toRed = redArrow(scene);
  if (toRed) drawPin(ctx, toRed, COLORS.goal, 13 * pinBeat("red"), dpr);
  // A tapped arrow's ripple, where it was tapped (it stays as the view goes).
  if (pinThrob?.at && pinThrob.born >= 0) {
    const k = (now - pinThrob.born) / THROB_MS;
    if (k < 1) {
      const out = 1 - Math.pow(1 - k, 3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = pinThrob.pin === "red" ? COLORS.goal : COLORS.ui;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(pinThrob.at.x, pinThrob.at.y, 16 + 26 * out, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
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
  if (fx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    timed(ctx, "glitch", () => glitch(ctx, fx, width, height));
  }
  // All laid out in the view: the screen, or the smaller border when that is on.
  const shown = borderOnScreen(scene);
  if (hud && !finish?.island) islandHud(ctx, hud, shown, camera.scale, dpr); // (the card has its level)
  if (finish?.island) {
    const g = scene.done.find((d) => d.id === finish.id);
    if (g && g.used !== undefined) islandCard(ctx, g, finishClock(scene, finish, now) ?? 0, width, height, shown, dpr, detail, hud?.level ?? 0);
  }
}

/** Where an island square's finish card sits on the screen (CSS px), in the middle of `view`
 * (the screen or the smaller border), for the next button too. */
export function islandCardRect(view: Rect): Rect {
  // The title over it and the button under it fit too (all sized to its width: CARD), all
  // of it centred: on a short screen it all comes out smaller.
  const margin = 16, below = CARD.gap + CARD.button;
  const w = Math.max(40, Math.min(0.82 * view.width, 460, (view.height - 2 * margin) / (CARD.title + 0.5 + below))), h = w / 2;
  const top = view.y + (view.height - (CARD.title + 0.5 + below) * w) / 2;
  return { x: view.x + (view.width - w) / 2, y: top + CARD.title * w, width: w, height: h };
}
/** The finish card's parts, as shares of its width: its corners' radius, the title over it,
 * and the gap to the next button and the button's height (its font size: button / 2.6). */
export const CARD = { radius: 0.03, title: 0.14, gap: 0.06, button: 0.1 };

/** A played square's level, in the space over it: on its top wall where that shows, else
 * halfway up it, and never bigger than it fits (its font size, and its middle on the screen). */
function levelLine(view: Rect, scale: number): { size: number; y: number } {
  const over = (view.height - islandSide(view)) / 2;
  return { size: Math.min(UNIT * 0.5 * scale, 0.6 * over, 34), y: view.y + Math.max(over - (UNIT * scale) / 2, over / 2) };
}

/** The moves so far, over the island's surface at the top right of the screen, on the same
 * baseline as the level (on the square's top wall). */
function islandHud(ctx: CanvasRenderingContext2D, hud: { level: number; moves: number }, view: Rect, scale: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const level = levelLine(view, scale);
  ctx.font = `800 ${level.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  const m = ctx.measureText("Level");
  const baseline = level.y + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
  const size = Math.max(15, Math.min(22, Math.min(view.width, view.height) * 0.05));
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.hud;
  ctx.textAlign = "right";
  ctx.fillText(`${hud.moves} ${hud.moves === 1 ? "move" : "moves"}`, view.x + view.width - 16, baseline);
}

/** An island square's finish, in the middle of the screen: the board dimmed, and a card
 * like the reached target (the red block on it, its score track over it) playing the same
 * finish as a target does (`t`: the finish's clock), with the level above. */
function islandCard(ctx: CanvasRenderingContext2D, g: Goal, t: number, width: number, height: number, view: Rect, dpr: number, detail: number, level: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fewest = bestKnown(g) ?? g.solution.length, used = shownUsed(g)!;
  const times = finishTimes(fewest, used);
  const shown = Math.min(1, Math.max(0, t / 300));
  ctx.fillStyle = `rgba(20, 20, 18, ${0.55 * shown})`;
  ctx.fillRect(0, 0, width, height);
  const r = islandCardRect(view);
  // It rises a little into place as the dim comes up.
  const rise = (1 - easeOutCubic(shown)) * 30;
  ctx.globalAlpha = shown;
  ctx.translate(0, rise);
  // The block alone (no target round it); it goes gold as the stars gather, as on the board.
  const k = Math.max(0, Math.min(1, (t - times.gather) / FINISH.GATHER_MS));
  ctx.fillStyle = mix(COLORS.goal, COLORS.done, k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, CARD.radius * r.width);
  ctx.fill();
  // The moves' fill grows from none to the moves used as the finish starts; the stars'
  // row keeps room at each end.
  const grow = easeOutCubic(Math.min(1, Math.max(0, t / FINISH.START_MS)));
  drawScoreTrack(ctx, r, fewest, used, { t, undone: g.undone, radius: CARD.radius * r.width, detail, room: r.width * 0.09, grow });
  ctx.font = `800 ${Math.round(r.width * 0.075)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f3f2ee";
  ctx.fillText(`Level ${level} complete`, width / 2, r.y - r.width * 0.06);
  ctx.globalAlpha = 1;
}
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** While an island square is played, everything outside it is one surface in the walls'
 * colour: the view's area with a hole the shape of the square's inside and its bay (`rects`:
 * the square and bay with their walls), traced along the walls' inner edges and rounded like
 * them, so the walls are part of it with no seam. */
function greyOutside(ctx: CanvasRenderingContext2D, scene: Scene, rects: Rect[], alpha = 1): void {
  const c = scene.camera;
  const view = { x: -c.offsetX / c.scale, y: -c.offsetY / c.scale, width: scene.width / c.scale, height: scene.height / c.scale };
  const [sq, bay] = rects as [Rect, Rect | undefined]; // (no bay: the last square's, its gate shut)
  const g = GAP / UNIT;
  // Clockwise round the inside, out along the exit into the bay on its right, and back.
  const l = sq.x + 1 - g, t = sq.y + 1 - g, r = sq.x + sq.width - 1 + g, b = sq.y + sq.height - 1 + g;
  const bt = bay ? Math.max(t, bay.y + 1 - g) : t, bb = bay ? Math.min(b, bay.y + bay.height - 1 + g) : t, br = bay ? bay.x + bay.width - 1 + g : r;
  const pts = (bay ? [[l, t], [r, t], [r, bt], [br, bt], [br, bb], [r, bb], [r, b], [l, b]] : [[l, t], [r, t], [r, b], [l, b]])
    .map(([x, y]) => [x! * UNIT, y! * UNIT] as const)
    .filter(([x, y], i, all) => x !== all[(i + 1) % all.length]![0] || y !== all[(i + 1) % all.length]![1]); // a bay on the top or bottom row
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS.outside;
  ctx.beginPath();
  // Well past the screen's edges: the canvas can be a little taller than the scene thinks
  // (a phone's browser bar coming and going).
  ctx.rect(view.x - view.width, view.y - view.height, view.width * 3, view.height * 3);
  const at = (i: number) => pts[(i + pts.length) % pts.length]!;
  ctx.moveTo((at(-1)[0] + at(0)[0]) / 2, (at(-1)[1] + at(0)[1]) / 2);
  for (let i = 0; i < pts.length; i++) ctx.arcTo(at(i)[0], at(i)[1], at(i + 1)[0], at(i + 1)[1], WALL_RADIUS);
  ctx.closePath();
  ctx.fill("evenodd");
  ctx.restore();
}

/** Walls, joined into one shape where they touch: each wall cell is its inset square, a
 * strip across the gap to each wall beside it, the corner where four walls meet, and a
 * fillet in each inner (concave) corner; outer corners are round. Walls never hop or shake,
 * so they are drawn as one, under the other blocks. */
/** Block `b`'s way along its lane to `aim` (its x or y there), in world px: from where a
 * block in the next cell would start (a gap in from its edge) to where `b` would end there. */
function lane(b: Block, aim: number): { horizontal: boolean; near: number; far: number } {
  const horizontal = b.w > b.h, at = horizontal ? b.x : b.y, size = horizontal ? b.w : b.h;
  const forward = aim > at, inset = forward ? GAP : -GAP;
  return { horizontal, near: (forward ? at + size : at) * UNIT + inset, far: (forward ? aim + size : aim) * UNIT - inset };
}

/** Fill `b`'s lane from `near` to `far` (world px along it), as wide as a block. */
function laneFill(ctx: CanvasRenderingContext2D, b: Block, near: number, far: number): void {
  const [lo, hi] = [Math.min(near, far), Math.max(near, far)];
  ctx.beginPath();
  if (b.w > b.h) ctx.roundRect(lo, b.y * UNIT + GAP, hi - lo, b.h * UNIT - 2 * GAP, 8);
  else ctx.roundRect(b.x * UNIT + GAP, lo, b.w * UNIT - 2 * GAP, hi - lo, 8);
  ctx.fill();
}

const WALL_RADIUS = 3;
function drawWalls(ctx: CanvasRenderingContext2D, walls: Block[], color: string): void {
  if (!walls.length) return;
  const cells = new Set<string>();
  for (const w of walls) for (let x = w.x; x < w.x + w.w; x++) for (let y = w.y; y < w.y + w.h; y++) cells.add(`${x},${y}`);
  const wall = (x: number, y: number) => cells.has(`${x},${y}`);
  const g = GAP, r = WALL_RADIUS, inner = UNIT - 2 * g;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const X = x * UNIT, Y = y * UNIT;
    const left = wall(x - 1, y), right = wall(x + 1, y), up = wall(x, y - 1), down = wall(x, y + 1);
    const round = (a: boolean, b: boolean) => (a || b ? 0 : r);
    ctx.roundRect(X + g, Y + g, inner, inner, [round(up, left), round(up, right), round(down, right), round(down, left)]);
    if (right) ctx.rect(X + UNIT - g, Y + g, g, inner);
    if (left) ctx.rect(X, Y + g, g, inner);
    if (down) ctx.rect(X + g, Y + UNIT - g, inner, g);
    if (up) ctx.rect(X + g, Y, inner, g);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      if (!wall(x + sx, y) || !wall(x, y + sy)) continue;
      // The gap's corner square: filled where four walls meet...
      const qx = sx > 0 ? X + UNIT - g : X, qy = sy > 0 ? Y + UNIT - g : Y;
      if (wall(x + sx, y + sy)) {
        ctx.rect(qx, qy, g, g);
        continue;
      }
      // ...else an inner corner, rounded by a fillet reaching into the open side.
      const px = sx > 0 ? X + UNIT - g : X + g, py = sy > 0 ? Y + UNIT - g : Y + g;
      const a0 = Math.atan2(-sy, 0), a1 = Math.atan2(0, -sx);
      const sweep = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      ctx.moveTo(px, py);
      ctx.lineTo(px + sx * r, py);
      ctx.arc(px + sx * r, py + sy * r, r, a0, a1, sweep < 0);
      ctx.closePath();
    }
  }
  ctx.fill();
}

/** The finishing goal's own time at `now` (ms since it was reached, slowed and stopped
 * round the medal's hit: timeWarp), or null. */
function finishClock(scene: Scene, finish: { id: string; born: number } | null, now: number): number | null {
  const g = finish && scene.done.find((d) => d.id === finish.id);
  if (!finish || !g || g.used === undefined) return null;
  const times = finishTimes(bestKnown(g) ?? g.solution.length, shownUsed(g)!);
  return timeWarp(times, times.medalAt !== null && !g.undone).warp(now - finish.born);
}

/** The finishing goal's effects at `now`, if one is finishing and its block shows. */
function finishFx(scene: Scene, finish: { id: string; born: number; dir?: { x: number; y: number } } | null, now: number, view: Fx["view"], zoom: number, detail: number): Fx | null {
  const g = finish && scene.done.find((d) => d.id === finish.id);
  const block = g && scene.layout.byId(g.id), at = g && whereIs(scene, g.id);
  if (!finish || !g || g.used === undefined || !block || !at) return null;
  const times = finishTimes(bestKnown(g) ?? g.solution.length, shownUsed(g)!);
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
    used: shownUsed(g)!,
    detail,
    stars: starPoints({ x: g.target.x * UNIT - TARGET_MARGIN, y: g.target.y * UNIT - TARGET_MARGIN, width: block.w * UNIT + 2 * TARGET_MARGIN, height: block.h * UNIT + 2 * TARGET_MARGIN }, bestKnown(g) ?? g.solution.length, shownUsed(g)!),
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

/** A 3x2 patch of cells, walls (filled) among them more of them the higher the share, above
 * a slider showing where it is. */
function wallsIcon(ctx: CanvasRenderingContext2D, block: Block, share: number): void {
  const x = block.x * UNIT, y = block.y * UNIT;
  const size = UNIT * 0.1, gap = UNIT * 0.05;
  // The cells fill in an order that looks scattered.
  const filled = Math.round(share * 6), order = [4, 0, 2, 5, 1, 3];
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const left = x + UNIT * 0.275 + (i % 3) * (size + gap);
    const top = y + UNIT * 0.22 + Math.floor(i / 3) * (size + gap);
    ctx.beginPath();
    ctx.rect(left, top, size, size);
    if (order.indexOf(i) < filled) {
      ctx.fillStyle = COLORS.icon;
      ctx.fill();
    } else {
      ctx.strokeStyle = COLORS.icon;
      ctx.stroke();
    }
  }
  sliderTrack(ctx, block, share);
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
  if (scene.locked) return { ui: null, red: null };
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
