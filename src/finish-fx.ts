// The finish's effects around the red block (the score track's own are in score-track.ts):
// the landing's hit (a squash, a flash, shock rings, the board shaking), a gold glow under
// the block growing with each star, confetti, a word for how well it went, and a shine over
// the block as the stars land in their row. All are worked out from the time alone (no
// state), so the animation inspector can show any moment.
import type { Point } from "./camera";
import { UNIT } from "./layout";
import { FINISH, type finishTimes } from "./score-track";
import type { Sound } from "./sfx";
import { timed } from "./perf";
import { glow, sprite, wedges } from "./sprites";

export type Fx = {
  /** ms since the goal was reached. */
  t: number;
  times: ReturnType<typeof finishTimes>;
  /** The block, world px. */
  rect: { x: number; y: number; width: number; height: number };
  /** The way it slid in (-1, 0 or 1 each), 0s if it was dragged there. */
  dir: Point;
  medal: boolean;
  /** What shows of the board (world px): the word stays inside it. */
  view: { x: number; y: number; width: number; height: number };
  /** The camera's zoom (screen px per world px). */
  zoom: number;
  /** The stars won, in the order they fill (world px). */
  stars: Point[];
  /** The moves it took. */
  used: number;
  /** How much detail (1 all; less on a slow phone, see main.ts): particle counts scale with
   * it, and below 1 the trails go. */
  detail: number;
};

/** How much bigger (in world px) the effects are drawn so they keep their size on the screen
 * when the view is zoomed out: never smaller than at a zoom of 0.9. */
export const big = (zoom: number) => Math.max(1, 0.9 / zoom);
/** When each star won fills (ms from the goal reached). */
export const fillAt = (k: number) => FINISH.START_MS + k * FINISH.STAR_MS;
/** Slow motion as the medal falls (time runs at RATE), then a frozen moment on its hit:
 * the finish's own time `t` against the time since the goal was reached (`raw`). */
const SLOW = { RATE: 0.35, FREEZE_MS: 130 };
export function timeWarp(times: ReturnType<typeof finishTimes>, medal: boolean): { warp: (raw: number) => number; raw: (t: number) => number; extra: number } {
  if (!medal || times.medalAt === null || times.medalHit === null) return { warp: (r) => r, raw: (t) => t, extra: 0 };
  const a = times.medalAt, h = times.medalHit, slow = (h - a) / SLOW.RATE, extra = slow - (h - a) + SLOW.FREEZE_MS;
  return {
    warp: (r) => (r <= a ? r : r <= a + slow ? a + (r - a) * SLOW.RATE : r <= a + slow + SLOW.FREEZE_MS ? h : r - extra),
    raw: (t) => (t <= a ? t : t < h ? a + (t - a) / SLOW.RATE : t === h ? a + slow : t + extra),
    extra,
  };
}

/** The shock waves through the board: from the landing, each star, the medal and the row. */
function waves(fx: Fx): { at: number; strength: number }[] {
  return [...hits(fx), ...fx.stars.map((_, k) => ({ at: fillAt(k), strength: 0.35 }))];
}
/** How the waves move a point of the board (world px) now: pushed out from the block
 * (dx, dy) and how high it is lifted (`lift`, world px). */
export function wave(fx: Fx, x: number, y: number): { dx: number; dy: number; lift: number } {
  const B = big(fx.zoom), r = fx.rect, cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const d = Math.hypot(x - cx, y - cy) || 1;
  let push = 0;
  for (const { at, strength } of waves(fx)) {
    const k = fx.t - at;
    if (k < 0 || k > 1600) continue;
    const front = k * UNIT * 0.014 * B, width = UNIT * 0.9 * B;
    push += strength * UNIT * 0.22 * B * Math.exp(-k / 700) * Math.exp(-(((d - front) / width) ** 2));
  }
  return { dx: ((x - cx) / d) * push, dy: ((y - cy) / d) * push, lift: push };
}

/** Stars fly in from the edge of the screen this long before their star fills. */
const INCOMING_MS = 520;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** The same "random" numbers every time for the same `i`. */
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The hits: the landing, the medal's (hardest) and the row's. */
function hits(fx: Fx): { at: number; strength: number }[] {
  const { times } = fx;
  return [
    { at: 0, strength: 1 },
    ...(fx.medal && times.medalHit !== null ? [{ at: times.medalHit, strength: 2.2 }] : []),
    { at: times.landed, strength: 0.5 },
  ];
}

/** How far the whole board is jolted now, world px. */
export function quake(fx: Fx): Point {
  let x = 0, y = 0;
  for (const { at, strength } of hits(fx)) {
    const k = fx.t - at;
    if (k < 0 || k > 420) continue;
    const a = strength * 3.2 * big(fx.zoom) * Math.exp(-k / 110);
    x += a * Math.sin(k / 17) * (fx.dir.x || 0.6);
    y += a * Math.cos(k / 13) * (fx.dir.y || 0.6);
  }
  return { x, y };
}

/** The block's squash and stretch on the hits, about its leading edge: [along x, along y,
 * the point it scales about]. */
export function squash(fx: Fx): { sx: number; sy: number; about: Point } {
  let s = 0;
  for (const { at, strength } of hits(fx)) {
    const p = (fx.t - at) / 380;
    if (p >= 0 && p < 1) s += 0.13 * Math.min(1.4, strength) * Math.exp(-5 * p) * Math.cos(3 * Math.PI * p);
  }
  const { rect: r, dir } = fx;
  const about = {
    x: dir.x > 0 ? r.x + r.width : dir.x < 0 ? r.x : r.x + r.width / 2,
    y: dir.y > 0 ? r.y + r.height : dir.y < 0 ? r.y : r.y + r.height / 2,
  };
  // Squashed along the way it came (or down, if dragged), bulging across.
  const alongX = dir.x !== 0;
  return alongX ? { sx: 1 - s, sy: 1 + s * 0.6, about } : { sx: 1 + s * 0.6, sy: 1 - s, about };
}

/** Under the blocks: a gold glow round the block, brighter with each star, and pulsing. */
export function under(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx;
  const stars = clamp((t - FINISH.START_MS + 100) / (times.starsEnd - FINISH.START_MS + 100));
  const fade = 1 - clamp((t - times.landed) / FINISH.LAND_MS);
  const a = clamp(t / 150) * (0.18 + 0.25 * stars + (fx.medal && times.medalHit !== null && t > times.medalHit ? 0.15 : 0)) * fade * (0.85 + 0.15 * Math.sin(t / 160));
  if (a <= 0) return;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2, R = Math.max(r.width, r.height) * (0.9 + 0.25 * stars) * Math.sqrt(big(fx.zoom));
  if (fx.detail < 0.3) return; // the least detail: no glow nor rays
  glow(ctx, "gold", cx, cy, R, a);
  // Giant light rays turning behind everything while the word shows, out to about the
  // screen's edge (beyond, the light has faded anyway).
  const k = t - wordAt(fx), out = clamp((t - times.gather - FINISH.GATHER_MS * 0.5) / 500);
  if (k > 0 && out < 1) {
    const reach = Math.hypot(fx.view.width, fx.view.height) * 0.34, a2 = (fx.medal ? 0.2 : 0.13) * clamp(k / 300) * (1 - out);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t / 2500);
    ctx.fillStyle = "rgb(255, 220, 110)";
    ctx.globalAlpha = a2 * 0.6;
    wedges(ctx, reach, 14, Math.PI / 28);
    ctx.restore();
  }
}

/** Over the block itself (clipped to it by the caller): the landing's white flash, a gold
 * flash on the medal's hit, and a shine sweeping across as the stars land. */
export function onBlock(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx;
  if (t < 260) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * (1 - t / 260) ** 2})`;
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  if (fx.medal && times.medalHit !== null && t > times.medalHit && t < times.medalHit + 300) {
    ctx.fillStyle = `rgba(255, 236, 150, ${0.6 * (1 - (t - times.medalHit) / 300)})`;
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  const p = (t - (times.landed - 250)) / 650;
  if (p > 0 && p < 1) {
    const span = r.width + r.height, x = r.x - r.height + span * 1.4 * easeOut(p) - span * 0.2;
    const g = ctx.createLinearGradient(x, r.y, x + r.height * 0.9, r.y + r.height * 0.3);
    g.addColorStop(0, "rgba(255, 255, 255, 0)");
    g.addColorStop(0.5, "rgba(255, 255, 255, 0.65)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
}

/** Over everything on the board: shock rings, confetti and the word. */
export function over(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx;
  // Rings: rounded outlines of the block spreading out on each hit.
  for (const { at, strength } of hits(fx)) {
    for (const lag of strength > 1 ? [0, 90, 180] : [0, 110]) {
      const p = (t - at - lag) / (420 + 160 * strength);
      if (p < 0 || p >= 1) continue;
      const grow = UNIT * big(fx.zoom) * (0.25 + 1.1 * strength) * easeOut(p);
      ctx.save();
      ctx.globalAlpha = (1 - p) ** 1.5 * (lag ? 0.6 : 1);
      ctx.strokeStyle = lag ? "#ffffff" : "#ffcf3f";
      ctx.lineWidth = ((lag ? 3 : 6) * (1 - p) + 1) * big(fx.zoom);
      ctx.beginPath();
      ctx.roundRect(r.x - grow, r.y - grow, r.width + 2 * grow, r.height + 2 * grow, 10 + grow);
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const [name, layer] of [["orbit", orbit], ["streaks", streaks], ["incoming", incoming], ["plusOnes", plusOnes], ["confetti", confetti], ["fireworks", fireworks], ["rain", rain], ["word", word]] as const) timed(ctx, name, () => layer(ctx, fx));
}

/** Small stars circling the block (two rings the opposite ways with the medal) from the
 * last star till the stars gather. */
function orbit(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx, B = big(fx.zoom);
  const a = clamp((t - times.starsEnd + 200) / 400) * (1 - clamp((t - times.gather) / (FINISH.GATHER_MS * 0.5)));
  if (a <= 0 || fx.detail < 0.3) return;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const rings = fx.medal ? [1, -1.4] : [1];
  // Batched: one fill per colour and trail step (a fill per star was slow).
  ctx.save();
  for (let g = fx.detail < 1 ? 0 : 1; g >= 0; g--) {
    ctx.globalAlpha = a * (g ? 0.3 : 1);
    for (const white of [false, true]) {
      ctx.beginPath();
      rings.forEach((dir, ring) => {
        const n = Math.round((10 + ring * 4) * fx.detail), rx = r.width / 2 + UNIT * (0.6 + ring * 0.45) * B, ry = r.height / 2 + UNIT * (0.5 + ring * 0.4) * B;
        for (let i = 0; i < n; i++) {
          if ((i % 3 === 0) !== white) continue;
          const ang = (i / n) * Math.PI * 2 + (dir * (t - g * 40)) / 420;
          starTo(ctx, cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry, UNIT * 0.1 * B * (1 + 0.3 * Math.sin(t / 90 + i)));
        }
      });
      ctx.fillStyle = white ? "#ffffff" : "#ffd23f";
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A "+1" floating up from each star as it fills. */
function plusOnes(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const B = big(fx.zoom), size = UNIT * 0.36 * B;
  fx.stars.forEach((s, k) => {
    const p = (fx.t - fillAt(k)) / 800;
    if (p < 0 || p >= 1) return;
    const pop = 1 + 0.6 * Math.exp(-8 * p) * Math.sin(p * 20);
    ctx.save();
    ctx.globalAlpha = 1 - clamp((p - 0.6) / 0.4);
    ctx.translate(s.x + UNIT * 0.15 * B, s.y - UNIT * 0.35 * B - UNIT * 0.8 * B * easeOut(p));
    ctx.scale(pop, pop);
    sprite(ctx, `plus:${size}`, size * 1.8, size * 1.4, fx.zoom * devicePixelRatio, (l) => {
      l.font = `900 ${size}px system-ui, sans-serif`;
      l.textAlign = "center";
      l.textBaseline = "middle";
      l.lineJoin = "round";
      l.lineWidth = size * 0.22;
      l.strokeStyle = "#9a4a00";
      l.strokeText("+1", 0, 0);
      l.fillStyle = "#ffe066";
      l.fillText("+1", 0, 0);
    });
    ctx.restore();
  });
}

/** Star rain: gold stars falling from the top of the screen as the row lands (a medal or
 * all five stars; a few for four). */
const rainCount = (fx: Pick<Fx, "medal" | "times">) => (fx.medal ? 46 : fx.times.kept >= 5 ? 30 : fx.times.kept >= 4 ? 14 : 0);
const rainAt = (fx: Pick<Fx, "times">) => fx.times.landed - 300;
function rain(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, view: v } = fx, B = big(fx.zoom), n = Math.round(rainCount(fx) * fx.detail);
  if (!n || t < rainAt(fx)) return;
  // Batched: the gold ones (outlined) in one path, the white ones in another.
  const gold = new Path2D(), white = new Path2D();
  for (let i = 0; i < n; i++) {
    const h = (k: number) => hash(i * 5 + k + 300);
    const s = (t - rainAt(fx) - h(1) * 900) / 1000;
    if (s < 0) continue;
    const y = v.y - UNIT * B + (UNIT * 3 * B + UNIT * 9 * B * s) * s;
    if (y > v.y + v.height + UNIT * B) continue;
    const x = v.x + v.width * h(2) + Math.sin(s * 4 + h(3) * 6) * UNIT * 0.3 * B;
    starTo(i % 4 ? gold : white, x, y, UNIT * (0.12 + 0.1 * h(6)) * B, s * (3 + 4 * h(4)) * (h(5) < 0.5 ? -1 : 1));
  }
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#ffd23f";
  ctx.fill(gold);
  ctx.strokeStyle = "#e07b00";
  ctx.lineWidth = 1.5 * B;
  ctx.stroke(gold);
  ctx.fillStyle = "#ffffff";
  ctx.fill(white);
  ctx.restore();
}

/** Add a star to the current path (turned `turn`), so many can be filled at once. */
function starTo(ctx: CanvasRenderingContext2D | Path2D, x: number, y: number, r: number, turn = 0): void {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + turn + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    if (i) ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    else ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
}

function starShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
}

/** Stars flying in from the edges of the screen, speeding up, three to each star won,
 * arriving as it fills. */
function incoming(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, view: v } = fx, B = big(fx.zoom);
  fx.stars.forEach((to, k) => {
    for (let j = 0; j < (fx.detail < 1 ? 1 : 3); j++) {
      const h = (n: number) => hash(k * 31 + j * 7 + n);
      const dur = INCOMING_MS - j * 70, p = (t - (fillAt(k) - dur)) / dur;
      if (p < 0 || p >= 1) continue;
      // From a point on the screen's edge.
      const side = Math.floor(h(1) * 4), along = h(2);
      const from = side === 0 ? { x: v.x + v.width * along, y: v.y } : side === 1 ? { x: v.x + v.width, y: v.y + v.height * along } : side === 2 ? { x: v.x + v.width * along, y: v.y + v.height } : { x: v.x, y: v.y + v.height * along };
      const dx = to.x - from.x, dy = to.y - from.y, bend = (h(3) - 0.5) * 0.6;
      const at = (q: number) => {
        const e = q * q * q; // speeding up into the star
        return { x: from.x + dx * e - dy * bend * Math.sin(Math.PI * e), y: from.y + dy * e + dx * bend * Math.sin(Math.PI * e) };
      };
      for (let g = fx.detail < 1 ? 0 : 5; g >= 0; g--) {
        const q = Math.max(0, p - g * 0.035), pt = at(q);
        ctx.save();
        ctx.globalAlpha = g ? 0.35 * (1 - g / 6) : 1;
        ctx.fillStyle = g ? "#ffe680" : "#ffd23f";
        starShape(ctx, pt.x, pt.y, UNIT * 0.2 * B * (1 - g * 0.1) * (0.6 + 0.4 * p));
        ctx.fill();
        if (!g) {
          ctx.lineWidth = 1.5 * B;
          ctx.strokeStyle = "#e07b00";
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
}

/** Flashes zooming out: light streaks shooting away from each star as it fills, and from
 * the medal out past the edges of the screen. */
function streaks(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r, view: v } = fx, B = big(fx.zoom);
  const burst = (x: number, y: number, n: number, p: number, reach: number, length: number, width: number, turn: number) => {
    if (p < 0 || p >= 1) return;
    ctx.save();
    ctx.lineCap = "round";
    // In one stroke per colour.
    ctx.globalAlpha = 1 - p;
    ctx.lineWidth = width * (1 - p * 0.7);
    for (const white of [false, true]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if ((i % 3 === 0) !== white) continue;
        const a = (i / n) * Math.PI * 2 + turn, out = easeOut(p) * reach * (0.8 + 0.4 * hash(i + turn * 10));
        const len = length * (1 - p);
        ctx.moveTo(x + Math.cos(a) * out, y + Math.sin(a) * out);
        ctx.lineTo(x + Math.cos(a) * (out + len), y + Math.sin(a) * (out + len));
      }
      ctx.strokeStyle = white ? "#ffffff" : "#fff3b0";
      ctx.stroke();
    }
    ctx.restore();
  };
  fx.stars.forEach((s, k) => burst(s.x, s.y, 10, (t - fillAt(k)) / 380, UNIT * 1.6 * B, UNIT * 0.9 * B, 3 * B, k * 0.4));
  if (fx.medal && times.medalHit !== null) {
    const reach = Math.hypot(v.width, v.height);
    burst(r.x + r.width / 2, r.y + r.height / 2, Math.round(28 * fx.detail), (t - times.medalHit) / 650, reach * 0.8, reach * 0.35, 5 * B, 0.1);
  }
  // The row landing: a smaller burst from the block.
  burst(r.x + r.width / 2, r.y + r.height / 2, 16, (t - times.landed) / 450, UNIT * 2.5 * B, UNIT * B, 3 * B, 0.3);
}

const FIREWORK = ["#ffcf3f", "#ff5a7a", "#5ab0ff", "#6be08a", "#c47aff", "#ff9a3d"];
/** When fireworks go up: more for a better result. */
const fireworkTimes = (fx: Pick<Fx, "medal" | "times">) => {
  const n = fx.medal ? 4 : fx.times.kept >= 5 ? 3 : fx.times.kept >= 4 ? 2 : 1;
  return Array.from({ length: n }, (_, i) => wordAt(fx) + 250 + i * 380);
};
const ROCKET_MS = 350, BLOOM_MS = 1300;
/** Fireworks round the block: a rocket up from it, and a bloom of sparks falling away. */
function fireworks(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, rect: r, view: v } = fx, B = big(fx.zoom);
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  fireworkTimes(fx).forEach((at, i) => {
    const k = t - at;
    if (k < 0 || k > ROCKET_MS + BLOOM_MS) return;
    const h = (n: number) => hash(i * 13 + n + 50);
    const m = UNIT * 0.8 * B;
    const to = {
      x: Math.min(v.x + v.width - m, Math.max(v.x + m, cx + (i % 2 ? 1 : -1) * UNIT * B * (1.5 + 2 * h(1)))),
      y: Math.min(v.y + v.height - m, Math.max(v.y + m, cy - UNIT * B * (1.5 + 1.5 * h(2)))),
    };
    const color = FIREWORK[(i + Math.floor(h(3) * 6)) % FIREWORK.length]!;
    ctx.save();
    if (k < ROCKET_MS) {
      const p = easeOut(k / ROCKET_MS);
      for (let g = 6; g >= 0; g--) {
        const q = Math.max(0, p - g * 0.06);
        ctx.globalAlpha = g ? 0.5 * (1 - g / 7) : 1;
        ctx.fillStyle = g ? color : "#ffffff";
        ctx.beginPath();
        ctx.arc(cx + (to.x - cx) * q, cy + (to.y - cy) * q, UNIT * 0.07 * B * (1 - g * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const s = (k - ROCKET_MS) / 1000, p = (k - ROCKET_MS) / BLOOM_MS;
      // The bang: a flash.
      if (p < 0.15) {
        glow(ctx, "white", to.x, to.y, UNIT * 1.2 * B, 1 - p / 0.15);
      }
      const drag = 2.2, gravity = UNIT * 2.6 * B;
      const pos = (j: number, s: number) => {
        const a = (j / 56) * Math.PI * 2 + h(4), speed = UNIT * B * (4 + 3.5 * hash(i * 97 + j));
        const f = (1 - Math.exp(-drag * s)) / drag;
        return { x: to.x + Math.cos(a) * speed * f, y: to.y + Math.sin(a) * speed * f + (gravity / drag) * (s - f) };
      };
      // Each spark streaks (a line from where it just was); batched in four groups that
      // twinkle in turn, white and coloured.
      ctx.lineCap = "round";
      ctx.lineWidth = UNIT * 0.09 * B * (1 - p * 0.6);
      for (let group = 0; group < 4; group++) {
        ctx.beginPath();
        for (let j = group; j < 56 * fx.detail; j += 4) {
          const a = pos(j, Math.max(0, s - 0.07)), b = pos(j, s);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.globalAlpha = (1 - p) ** 1.2 * (0.6 + 0.4 * Math.sin(k / 30 + group * 1.6));
        ctx.strokeStyle = group === 0 ? "#ffffff" : color;
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

/** A punch of the camera: the view jumps closer for a moment on each hit (a factor to scale
 * the board by, about the block). */
export function punch(fx: Fx): number {
  const { t, times } = fx;
  const kick = (at: number, amp: number) => {
    const k = t - at;
    return k < 0 ? 0 : k < 50 ? (amp * k) / 50 : amp * Math.exp(-(k - 50) / 160);
  };
  let f = kick(0, 0.035) + fx.stars.reduce((sum, _, k) => sum + kick(fillAt(k), 0.018), 0) + kick(times.landed, 0.025);
  if (fx.medal && times.medalHit !== null && times.medalAt !== null) {
    // The view creeps in as the medal falls in slow motion, and snaps on the hit.
    const q = clamp((t - times.medalAt) / (times.medalHit - times.medalAt));
    f += t <= times.medalHit ? 0.12 * q * q : 0.12 * Math.exp(-(t - times.medalHit) / 220);
    f += kick(times.medalHit, 0.08);
  }
  return 1 + f;
}

/** The finish's sounds, and when (ms from the goal reached). */
export function finishCues(fx: Pick<Fx, "medal" | "times">): { at: number; sound: Sound; n?: number }[] {
  const { times } = fx;
  return [
    { at: 0, sound: "thud" },
    { at: fillAt(0) - INCOMING_MS, sound: "incoming" },
    ...Array.from({ length: times.kept }, (_, k) => ({ at: fillAt(k), sound: "chime" as const, n: k })),
    ...(times.medalAt !== null && fx.medal ? [{ at: times.medalAt, sound: "fall" as const }, { at: times.medalAt, sound: "drumroll" as const, n: (times.medalHit! - times.medalAt) / SLOW.RATE }, { at: times.medalHit!, sound: "boom" as const }] : []),
    { at: wordAt(fx), sound: "cheer", n: fx.medal ? 1 : 0 },
    { at: times.landed + 120, sound: "jingle" },
    { at: confettiAt(fx), sound: "confetti" },
    { at: wordAt(fx), sound: "fanfare", n: fx.medal || times.kept >= 5 ? 1 : 0 },
    ...fireworkTimes(fx).map((at) => ({ at, sound: "firework" as const })),
    { at: times.gather, sound: "whoosh" },
    { at: times.landed, sound: "land" },
  ];
}

const CONFETTI = ["#ffcf3f", "#d64545", "#3b6fd4", "#2f9e6e", "#e66bb0", "#ffffff", "#ff8a3d"];
/** A cannon of confetti from the block: the bigger the result, the more. */
function confetti(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx;
  const from = confettiAt(fx);
  const count = Math.round((fx.medal ? 110 : times.kept >= 5 ? 70 : times.kept >= 3 ? 36 : 18) * fx.detail);
  const life = CONFETTI_MS, s = (t - from) / 1000;
  if (s < 0 || s * 1000 > life) return;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const B = big(fx.zoom), drag = 1.8, gravity = UNIT * 7 * B;
  // Batched: a path per colour (a fill per piece was slow); the pieces turned and fluttered
  // by working out their corners here.
  const paths = CONFETTI.map(() => new Path2D());
  for (let i = 0; i < count; i++) {
    const h = (k: number) => hash(i * 7 + k);
    // Up and out, a fan wider for the bigger bursts.
    const angle = -Math.PI / 2 + (h(1) - 0.5) * (fx.medal ? 3.4 : 2.4);
    const speed = UNIT * B * (4 + 7 * h(2)) * (fx.medal ? 1.25 : 1);
    const k = Math.max(0, s - h(3) * 0.08);
    const f = (1 - Math.exp(-drag * k)) / drag;
    const x = cx + Math.cos(angle) * speed * f + Math.sin(k * (3 + 3 * h(4)) + h(5) * 6) * UNIT * B * 0.18 * k;
    const y = cy + Math.sin(angle) * speed * f + (gravity / drag) * (k - f);
    const path = paths[i % CONFETTI.length]!, w = UNIT * B * (0.1 + 0.08 * h(10));
    if (i % 5 === 0) {
      path.moveTo(x + w * 0.45, y);
      path.arc(x, y, w * 0.45, 0, Math.PI * 2);
      continue;
    }
    // Flutters: seen edge on and face on in turn.
    const turn = h(6) * 6 + k * (4 + 8 * h(7)) * (h(8) < 0.5 ? -1 : 1), flat = Math.cos(k * (8 + 10 * h(9)));
    const ux = Math.cos(turn) * (w / 2), uy = Math.sin(turn) * (w / 2);
    const vx = -Math.sin(turn) * UNIT * B * 0.03 * flat, vy = Math.cos(turn) * UNIT * B * 0.03 * flat;
    path.moveTo(x - ux - vx, y - uy - vy);
    path.lineTo(x + ux - vx, y + uy - vy);
    path.lineTo(x + ux + vx, y + uy + vy);
    path.lineTo(x - ux + vx, y - uy + vy);
    path.closePath();
  }
  ctx.save();
  ctx.globalAlpha = 1 - clamp((s * 1000 - (life - 700)) / 700);
  paths.forEach((p, i) => {
    ctx.fillStyle = CONFETTI[i]!;
    ctx.fill(p);
  });
  ctx.restore();
}

const wordFor = (fx: Pick<Fx, "medal" | "times">) => (fx.medal ? "PERFECT!" : fx.times.kept >= 5 ? "AWESOME!" : fx.times.kept >= 4 ? "GREAT!" : fx.times.kept >= 3 ? "NICE!" : "DONE!");
export const wordAt = (fx: Pick<Fx, "medal" | "times">) => (fx.medal && fx.times.medalHit !== null ? fx.times.medalHit + 60 : fx.times.starsEnd);
export const confettiAt = (fx: Pick<Fx, "medal" | "times">) => (fx.medal && fx.times.medalHit !== null ? fx.times.medalHit : fx.times.starsEnd - 150);
const CONFETTI_MS = 2600;

/** The finish's parts and when each plays (ms from the goal reached), for the animation
 * inspector's time line. */
export function finishParts(fx: Pick<Fx, "medal" | "times">): { name: string; from: number; to: number }[] {
  const { times } = fx;
  return [
    { name: "Landing: squash, flash, rings, jolt", from: 0, to: 600 },
    { name: "Stars fly in from the edges", from: fillAt(0) - INCOMING_MS, to: fillAt(times.kept - 1) },
    { name: "Stars fill (pop, spin, burst, streaks)", from: FINISH.START_MS, to: times.starsEnd },
    ...(times.medalAt !== null ? [{ name: fx.medal ? "Medal falls, hits, sun rays" : "Medal (undone: gray)", from: times.medalAt, to: times.gather + FINISH.GATHER_MS * 0.6 }] : []),
    ...(fx.medal && times.medalAt !== null ? [{ name: "Slow motion, dolly in, hit-stop", from: times.medalAt, to: times.medalHit! + 300 }] : []),
    { name: "Shock waves through the grid; blocks hop", from: 0, to: times.landed + 1600 },
    { name: "+1s float up", from: fillAt(0), to: fillAt(times.kept - 1) + 800 },
    { name: "Orbiting stars", from: times.starsEnd - 200, to: times.gather + FINISH.GATHER_MS * 0.5 },
    { name: "Giant light rays", from: wordAt(fx), to: times.gather + FINISH.GATHER_MS * 0.5 + 500 },
    ...(rainCount(fx) ? [{ name: "Star rain", from: rainAt(fx), to: rainAt(fx) + 2000 }] : []),
    { name: "Confetti", from: confettiAt(fx), to: Math.min(times.end, confettiAt(fx) + CONFETTI_MS) },
    { name: "Fireworks", from: fireworkTimes(fx)[0]!, to: fireworkTimes(fx).at(-1)! + ROCKET_MS + BLOOM_MS },
    { name: `Word: ${wordFor(fx)}`, from: wordAt(fx), to: times.gather + FINISH.GATHER_MS * 0.4 + 500 },
    { name: "Stars gather (arcs, trails), gold", from: times.gather, to: times.landed },
    { name: "Row lands: hop, shine, ring", from: times.landed, to: times.end },
  ];
}

const widthsOf = new Map<string, number[]>();
/** The letters' widths (measured once per word and size). */
function letterWidths(ctx: CanvasRenderingContext2D, text: string, font: string): number[] {
  const key = `${text}:${font}`;
  let w = widthsOf.get(key);
  if (!w) widthsOf.set(key, (w = [...text].map((c) => ctx.measureText(c).width * 1.04)));
  return w;
}

/** The word for how it went, popping in letter by letter over the block, then floating up
 * and away as the stars gather. */
function word(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx;
  const text = wordFor(fx);
  const from = wordAt(fx);
  const k = t - from;
  if (k < 0) return;
  const out = clamp((t - times.gather - FINISH.GATHER_MS * 0.4) / 500);
  if (out >= 1) return;
  const B = big(fx.zoom), size = UNIT * B * (fx.medal ? 0.72 : 0.6);
  ctx.save();
  const font = `900 ${size}px system-ui, sans-serif`;
  ctx.font = font;
  const widths = letterWidths(ctx, text, font);
  const total = widths.reduce((a, b) => a + b, 0);
  const margin = UNIT * B * 0.2, v = fx.view;
  const cx = Math.min(v.x + v.width - margin - total / 2, Math.max(v.x + margin + total / 2, r.x + r.width / 2));
  const y = Math.max(v.y + size, r.y - size * 0.75) - UNIT * B * 0.35 * easeOut(clamp(k / 2400)) - UNIT * B * 0.5 * out ** 2;
  ctx.globalAlpha = 1 - out;
  let x = cx - total / 2;
  [...text].forEach((c, i) => {
    const w = widths[i]!, p = clamp((k - i * 45) / 420);
    x += w;
    if (p <= 0) return;
    // Each letter springs up from nothing, overshoots, and keeps a gentle bob.
    const s = 1 - Math.exp(-6 * p) * Math.cos(2.6 * Math.PI * p);
    const bob = Math.sin(k / 180 + i * 0.7) * size * 0.05;
    ctx.save();
    ctx.translate(x - w / 2, y + bob);
    ctx.rotate((1 - p) * (i % 2 ? 0.5 : -0.5));
    ctx.scale(s, s);
    // Each letter is a picture made once (text drawn afresh at every size is slow).
    const bw = w + size * 0.5, bh = size * 1.7, scale = fx.zoom * devicePixelRatio;
    sprite(ctx, `word:${c}:${size}:${fx.medal}`, bw, bh, scale, (l) => {
      l.font = font;
      l.textBaseline = "middle";
      l.textAlign = "center";
      l.lineJoin = "round";
      l.shadowColor = "rgba(0, 0, 0, 0.35)";
      l.shadowBlur = 6;
      l.shadowOffsetY = 2;
      l.strokeStyle = fx.medal ? "#264a94" : "#9a4a00";
      l.lineWidth = size * 0.2;
      l.strokeText(c, 0, 0);
      l.shadowColor = "transparent";
      const g = l.createLinearGradient(0, -size / 2, 0, size / 2);
      g.addColorStop(0, "#fff6c2");
      g.addColorStop(0.5, "#ffd23f");
      g.addColorStop(1, "#f29a0b");
      l.fillStyle = g;
      l.fillText(c, 0, 0);
    });
    // A shine runs along the letters, again and again.
    const shine = Math.max(0, Math.sin(k / 160 - i * 0.55)) ** 10;
    if (shine > 0.01) {
      ctx.globalAlpha *= shine * 0.85;
      sprite(ctx, `shine:${c}:${size}`, bw, bh, scale, (l) => {
        l.font = font;
        l.textBaseline = "middle";
        l.textAlign = "center";
        l.fillStyle = "#ffffff";
        l.fillText(c, 0, 0);
      });
    }
    ctx.restore();
  });
  ctx.restore();
}

/** Over the whole screen (screen px): a glow from the edges with each star, and a warm
 * flash on the medal's hit. */
export function screenFlash(ctx: CanvasRenderingContext2D, fx: Fx, width: number, height: number): void {
  const { t, times } = fx;
  // A warm glow pulses in from the screen's edges with each star.
  const pulse = fx.stars.reduce((m, _, k) => {
    const q = (t - fillAt(k)) / 300;
    return q >= 0 && q < 1 ? Math.max(m, (1 - q) * (0.12 + 0.05 * k)) : m;
  }, 0);
  if (pulse > 0) {
    // Strips along the edges only (a gradient over the whole screen costs every pixel).
    const d = Math.min(width, height) * 0.09;
    const strip = (x0: number, y0: number, x1: number, y1: number, x: number, y: number, w: number, h: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(255, 190, 40, ${pulse})`);
      g.addColorStop(1, "rgba(255, 190, 40, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    };
    strip(0, 0, 0, d, 0, 0, width, d);
    strip(0, height, 0, height - d, 0, height - d, width, d);
    strip(0, 0, d, 0, 0, 0, d, height);
    strip(width, 0, width - d, 0, width - d, 0, d, height);
  }
  if (!fx.medal || times.medalHit === null) return;
  const p = (t - times.medalHit) / 220;
  if (p < 0 || p >= 1) return;
  // A flat fill: the cheapest way to cover the screen.
  ctx.fillStyle = `rgba(255, 225, 130, ${0.4 * (1 - p)})`;
  ctx.fillRect(0, 0, width, height);
}

/** The red block's soul flying on to the next red block. */
export const SOUL = { TRAVEL_MS: 1000, BURST_MS: 450 };
/** How the soul looks: a red head with a trail, flying off with the old block's red (see
 * soul): a comet, a flame, or a glint (reports/soul.html). */
export const SOUL_STYLES = ["comet", "flame", "glint"] as const;
export type SoulStyle = (typeof SOUL_STYLES)[number];
/** The soul's parts in time, as shares of SOUL.TRAVEL_MS: the old block's red draws in to a
 * ball over GATHER, the ball setting off at LEAVE (the red still drawing in, following it)
 * and speeding up all the way into the new block. */
const GATHER = 0.3, LEAVE = 0.15;
type Rect = { x: number; y: number; width: number; height: number };

/** How pale the new red block flashes as the soul hits it, `k` ms after the soul set off
 * (0 none, 1 white). */
export function soulFlash(k: number): number {
  const b = (k - SOUL.TRAVEL_MS) / SOUL.BURST_MS;
  return b < 0 || b >= 1 ? 0 : 0.7 * (1 - b) ** 2;
}

/** The soul `k` ms after it set off, in `style`: the old block's red draws in to a ball on
 * its middle (the block gold under it), which sets off before it is all in, the red
 * following; it flies straight to the new block's middle, slow at first and faster all the
 * way, shedding sparks that drift back off its path; it hits: the block flashes (soulFlash,
 * in render.ts) and a ring goes out. */
export function soul(ctx: CanvasRenderingContext2D, from: Rect, to: Rect, k: number, zoom: number, style: SoulStyle): void {
  const B = big(zoom), p = clamp(k / SOUL.TRAVEL_MS), r = UNIT * 0.21 * B;
  const c0 = { x: from.x + from.width / 2, y: from.y + from.height / 2 }, c1 = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const len = Math.hypot(c1.x - c0.x, c1.y - c0.y) || 1, dir = { x: (c1.x - c0.x) / len, y: (c1.y - c0.y) / len };
  const along = (f: number) => {
    const e = clamp(f) ** 2;
    return { x: c0.x + (c1.x - c0.x) * e, y: c0.y + (c1.y - c0.y) * e };
  };
  const RED = "#d64545";
  ctx.save();
  if (p < 1) {
    const f = clamp((p - LEAVE) / (1 - LEAVE)), at = along(f), g = clamp(p / GATHER);
    /** Flicker: a smooth random wave per `i`, changing ~20 times a second. */
    const flicker = (i: number) => {
      const s = (k / 1000) * 20, n = Math.floor(s), u = s - n;
      return hash(i * 31 + n) * (1 - u) + hash(i * 31 + n + 1) * u;
    };
    const ribbon = (n: number, df: number, width: number, color: (t: number) => string, wobble = 0, seed = 0) => {
      ctx.lineCap = "round";
      for (let j = n; j >= 1; j--) {
        if (f - (j - 1) * df <= 0) continue;
        const a = along(f - j * df), b = along(f - (j - 1) * df), t = 1 - j / n;
        // Flames lick sideways, more towards the tail.
        const side = wobble * (1 - t) * (flicker(j + seed) - 0.5), ox = -dir.y * side, oy = dir.x * side;
        ctx.strokeStyle = color(t);
        ctx.lineWidth = Math.max(0.5, width * t * (wobble ? 0.75 + 0.5 * flicker(j + seed + 99) : 1));
        ctx.beginPath();
        ctx.moveTo(a.x + ox, a.y + oy);
        ctx.lineTo(b.x + ox, b.y + oy);
        ctx.stroke();
      }
    };
    /** Bits shed along the way, `n` of them alive at once, each drawn by `bit` (at x, y, its
     * age 0..1 and a random 0..1), drifting back the way the soul came and out to either
     * side as they fade (and up a little: `rise`, for embers). */
    const shed = (n: number, life: number, bit: (x: number, y: number, age: number, h: number) => void, rise = 0) => {
      const step = life / n, last = Math.floor(f / step);
      for (let i = 0; i < n; i++) {
        const id = last - i, born = id * step;
        if (born <= 0) continue;
        const age = (f - born) / life;
        if (age >= 1) continue;
        const back = r * (1 + 3 * hash(id)) * Math.sqrt(age), side = (hash(id + 500) - 0.5) * r * 6 * Math.sqrt(age), sp = along(born);
        bit(sp.x - dir.x * back - dir.y * side, sp.y - dir.y * back + dir.x * side - rise * r * 3 * age, age, hash(id + 900));
      }
      ctx.globalAlpha = 1;
    };
    const dot = (x: number, y: number, radius: number, fill: string, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    const ball = (fill: string | CanvasGradient, radius = r) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    const shaded = (stops: [number, string][], radius = r) => {
      const gr = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
      for (const [o, c] of stops) gr.addColorStop(o, c);
      return gr;
    };
    /** A four-pointed glint at (x, y), `long` to its tips, `thin` at its waist. */
    const glint = (x: number, y: number, long: number, thin: number, turn: number, fill: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(turn);
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = i % 2 ? thin : long;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    // The head shows as the red has drawn in (before, the red is the head).
    const head = clamp((g - 0.75) / 0.25);
    if (f > 0) {
      if (style === "comet") {
        ribbon(40, 0.012, r * 1.5, (t) => `rgba(214, 69, 69, ${0.75 * t})`);
        shed(10, 0.45, (x, y, age) => glow(ctx, "soul", x, y, r * (1.1 - 0.5 * age), 0.8 * (1 - age)));
      } else if (style === "flame") {
        // Tongues of fire: a wide red one, an orange one in it and a yellow core, each licking
        // sideways on its own; embers going off it.
        ribbon(26, 0.013, r * 2.6, (t) => `rgba(206, 52, 40, ${0.55 * t})`, r * 1.6, 1);
        ribbon(24, 0.012, r * 1.9, (t) => `rgba(245, 120, 40, ${0.7 * t})`, r * 1.2, 2);
        ribbon(18, 0.011, r * 1.1, (t) => `rgba(255, 196, 70, ${0.85 * t})`, r * 0.7, 3);
        shed(16, 0.45, (x, y, age, h) => dot(x, y, r * (0.22 - 0.14 * age), h < 0.4 ? "#ffb02e" : h < 0.8 ? "#f0702a" : "#d64545", 1 - age), 1);
      } else {
        // Glints twinkle and turn along the streak.
        ribbon(40, 0.012, r * 1.4, (t) => `rgba(214, 69, 69, ${0.7 * t})`);
        shed(9, 0.5, (x, y, age, h) => {
          const tw = Math.sin(age * Math.PI) * (0.7 + 0.3 * Math.sin(age * 20 + h * 9));
          if (tw <= 0) return;
          const turn = h * 2 + age * (h < 0.5 ? -3 : 3);
          ctx.globalAlpha = tw;
          glint(x, y, r * 0.9 * tw, r * 0.18 * tw, turn, RED);
          glint(x, y, r * 0.45 * tw, r * 0.1 * tw, turn, "#ffffff");
        });
      }
    }
    if (g < 1) {
      // The block's red drawing in, following the ball as it sets off, drawn out a little
      // the way it goes.
      const e = g < 0.5 ? 2 * g * g : 1 - (-2 * g + 2) ** 2 / 2;
      const w = from.width + (2 * r - from.width) * e, h = from.height + (2 * r - from.height) * e;
      // (Upright, as the block was: it spans from the block's middle to the ball's.)
      const x0 = Math.min(c0.x, at.x) - w / 2, x1 = Math.max(c0.x, at.x) + w / 2, y0 = Math.min(c0.y, at.y) - h / 2, y1 = Math.max(c0.y, at.y) + h / 2;
      ctx.globalAlpha = 1 - head;
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.roundRect(x0, y0, x1 - x0, y1 - y0, Math.min(w, h) / 2 > r * 0.99 ? r : 8 + (r - 8) * e);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (head > 0) {
      ctx.globalAlpha = head;
      if (style === "comet") {
        glow(ctx, "soul", at.x, at.y, r * 2.8, 0.5);
        ball(shaded([[0, "#ef6a6a"], [1, RED]]));
      } else if (style === "flame") {
        glow(ctx, "gold", at.x, at.y, r * (2.4 + 0.4 * flicker(7)), 0.55);
        ball(shaded([[0, "#ffe08a"], [0.45, "#ff9a3a"], [1, "#d8452e"]], r * (1 + 0.08 * flicker(8))));
      } else {
        // A red four-pointed glint turning, a white one in it, a thin pale one turning the
        // other way across it, its arms flashing out twice on the way.
        glow(ctx, "soul", at.x, at.y, r * 3, 0.55);
        const flare = Math.max(0, Math.sin(f * Math.PI * 4)) ** 4, turn = f * Math.PI * 1.5;
        glint(at.x, at.y, r * (1.6 + 1.6 * flare), r * 0.4, turn, RED);
        glint(at.x, at.y, r * 1.1, r * 0.12, Math.PI / 4 - f * Math.PI, "rgba(239, 106, 106, 0.85)");
        glint(at.x, at.y, r * (0.9 + 0.8 * flare), r * 0.2, turn, "#ffffff");
        ball(shaded([[0, "#ffffff"], [1, "rgba(255, 255, 255, 0)"]], r * 0.55));
      }
      ctx.globalAlpha = 1;
    }
  } else {
    // The hit: the block flashes (render.ts) and a ring goes out from it.
    const b = (k - SOUL.TRAVEL_MS) / SOUL.BURST_MS;
    if (b < 1) {
      const grow = UNIT * 0.7 * B * easeOut(b);
      ctx.globalAlpha = (1 - b) ** 1.5;
      ctx.strokeStyle = style === "flame" ? "#f0702a" : RED;
      ctx.lineWidth = (5 * (1 - b) + 1) * B;
      ctx.beginPath();
      ctx.roundRect(to.x - grow, to.y - grow, to.width + 2 * grow, to.height + 2 * grow, 8 + grow);
      ctx.stroke();
    }
  }
  ctx.restore();
}
