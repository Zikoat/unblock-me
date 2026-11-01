// The finish's effects around the red block (the score track's own are in score-track.ts):
// the landing's hit (a squash, a flash, shock rings, the board shaking), a gold glow under
// the block growing with each star, confetti, a word for how well it went, and a shine over
// the block as the stars land in their row. All are worked out from the time alone (no
// state), so the animation inspector can show any moment.
import type { Point } from "./camera";
import { UNIT } from "./layout";
import { FINISH, type finishTimes } from "./score-track";

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
};

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
    const a = strength * 3.2 * Math.exp(-k / 110);
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
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2, R = Math.max(r.width, r.height) * (0.9 + 0.25 * stars);
  const g = ctx.createRadialGradient(cx, cy, Math.min(r.width, r.height) * 0.3, cx, cy, R);
  g.addColorStop(0, `rgba(255, 214, 90, ${a})`);
  g.addColorStop(1, "rgba(255, 214, 90, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
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
      const grow = UNIT * (0.25 + 1.1 * strength) * easeOut(p);
      ctx.save();
      ctx.globalAlpha = (1 - p) ** 1.5 * (lag ? 0.6 : 1);
      ctx.strokeStyle = lag ? "#ffffff" : "#ffcf3f";
      ctx.lineWidth = (lag ? 3 : 6) * (1 - p) + 1;
      ctx.beginPath();
      ctx.roundRect(r.x - grow, r.y - grow, r.width + 2 * grow, r.height + 2 * grow, 10 + grow);
      ctx.stroke();
      ctx.restore();
    }
  }
  confetti(ctx, fx);
  word(ctx, fx);
}

const CONFETTI = ["#ffcf3f", "#d64545", "#3b6fd4", "#2f9e6e", "#e66bb0", "#ffffff", "#ff8a3d"];
/** A cannon of confetti from the block: the bigger the result, the more. */
function confetti(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx;
  const from = confettiAt(fx);
  const count = fx.medal ? 110 : times.kept >= 5 ? 70 : times.kept >= 3 ? 36 : 18;
  const life = CONFETTI_MS, s = (t - from) / 1000;
  if (s < 0 || s * 1000 > life) return;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const drag = 1.8, gravity = UNIT * 7;
  for (let i = 0; i < count; i++) {
    const h = (k: number) => hash(i * 7 + k);
    // Up and out, a fan wider for the bigger bursts.
    const angle = -Math.PI / 2 + (h(1) - 0.5) * (fx.medal ? 3.4 : 2.4);
    const speed = UNIT * (4 + 7 * h(2)) * (fx.medal ? 1.25 : 1);
    const delay = h(3) * 0.08, k = Math.max(0, s - delay);
    const f = (1 - Math.exp(-drag * k)) / drag;
    const x = cx + Math.cos(angle) * speed * f + Math.sin(k * (3 + 3 * h(4)) + h(5) * 6) * UNIT * 0.18 * k;
    const y = cy + Math.sin(angle) * speed * f + (gravity / drag) * (k - f);
    const fade = 1 - clamp((k * 1000 - (life - 700)) / 700);
    if (fade <= 0) continue;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y);
    ctx.rotate(h(6) * 6 + k * (4 + 8 * h(7)) * (h(8) < 0.5 ? -1 : 1));
    // Flutters: seen edge on and face on in turn.
    ctx.scale(1, Math.cos(k * (8 + 10 * h(9))));
    ctx.fillStyle = CONFETTI[i % CONFETTI.length]!;
    const w = UNIT * (0.1 + 0.08 * h(10)), hh = UNIT * 0.06;
    if (i % 5 === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-w / 2, -hh / 2, w, hh);
    ctx.restore();
  }
}

const wordFor = (fx: Pick<Fx, "medal" | "times">) => (fx.medal ? "PERFECT!" : fx.times.kept >= 5 ? "AWESOME!" : fx.times.kept >= 4 ? "GREAT!" : fx.times.kept >= 3 ? "NICE!" : "DONE!");
const wordAt = (fx: Pick<Fx, "medal" | "times">) => (fx.medal && fx.times.medalHit !== null ? fx.times.medalHit + 60 : fx.times.starsEnd);
const confettiAt = (fx: Pick<Fx, "medal" | "times">) => (fx.medal && fx.times.medalHit !== null ? fx.times.medalHit : fx.times.starsEnd - 150);
const CONFETTI_MS = 2600;

/** The finish's parts and when each plays (ms from the goal reached), for the animation
 * inspector's time line. */
export function finishParts(fx: Pick<Fx, "medal" | "times">): { name: string; from: number; to: number }[] {
  const { times } = fx;
  return [
    { name: "Landing: squash, flash, rings, jolt", from: 0, to: 600 },
    { name: "Stars fill (pop, spin, burst)", from: FINISH.START_MS, to: times.starsEnd },
    ...(times.medalAt !== null ? [{ name: fx.medal ? "Medal falls, hits, sun rays" : "Medal (undone: gray)", from: times.medalAt, to: times.gather + FINISH.GATHER_MS * 0.6 }] : []),
    { name: "Confetti", from: confettiAt(fx), to: Math.min(times.end, confettiAt(fx) + CONFETTI_MS) },
    { name: `Word: ${wordFor(fx)}`, from: wordAt(fx), to: times.gather + FINISH.GATHER_MS * 0.4 + 500 },
    { name: "Stars gather (arcs, trails), gold", from: times.gather, to: times.landed },
    { name: "Row lands: hop, shine, ring", from: times.landed, to: times.end },
  ];
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
  const size = UNIT * (fx.medal ? 0.72 : 0.6);
  ctx.save();
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  const widths = [...text].map((c) => ctx.measureText(c).width * 1.04);
  const total = widths.reduce((a, b) => a + b, 0);
  const margin = UNIT * 0.2, v = fx.view;
  const cx = Math.min(v.x + v.width - margin - total / 2, Math.max(v.x + margin + total / 2, r.x + r.width / 2));
  const y = Math.max(v.y + size, r.y - size * 0.75) - UNIT * 0.35 * easeOut(clamp(k / 2400)) - UNIT * 0.5 * out ** 2;
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
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = fx.medal ? "#264a94" : "#9a4a00";
    ctx.lineWidth = size * 0.2;
    ctx.strokeText(c, 0, 0);
    ctx.shadowColor = "transparent";
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, "#fff6c2");
    g.addColorStop(0.5, "#ffd23f");
    g.addColorStop(1, "#f29a0b");
    ctx.fillStyle = g;
    ctx.fillText(c, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

/** Over the whole screen: a warm flash on the medal's hit (screen px). */
export function screenFlash(ctx: CanvasRenderingContext2D, fx: Fx, width: number, height: number): void {
  const { t, times } = fx;
  if (!fx.medal || times.medalHit === null) return;
  const p = (t - times.medalHit) / 350;
  if (p < 0 || p >= 1) return;
  const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.75);
  g.addColorStop(0, `rgba(255, 245, 200, ${0.18 * (1 - p)})`);
  g.addColorStop(1, `rgba(255, 200, 60, ${0.45 * (1 - p)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}
