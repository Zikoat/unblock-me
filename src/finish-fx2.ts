// Yet more of the finish (finish-fx.ts has the rest): the medal's fall shot like a film
// (letterbox bars, a dark vignette, speed lines, the view tilting), its hit (lightning to
// the stars, a giant ghost of the medal, the screen glitching), a rubber stamp of the moves,
// a dance party (every block bobbing to the beat), an emoji burst, and the dots lighting up
// as the shock waves pass. Like the rest, all from the time alone.
import { UNIT } from "./layout";
import { FINISH, rosette } from "./score-track";
import { big, wordAt, confettiAt, type Fx } from "./finish-fx";
import type { Sound } from "./sfx";

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const hash = (i: number) => {
  const x = Math.sin(i * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

/** How much the film look is on (0..1): in as the medal falls, out after its hit. */
function cinema(fx: Fx): number {
  const { t, times } = fx;
  if (!fx.medal || times.medalAt === null || times.medalHit === null) return 0;
  return clamp((t - times.medalAt + 120) / 160) * (1 - clamp((t - times.medalHit - 150) / 300));
}

/** The view's tilt (radians, about the block): leaning in as the medal falls, snapping
 * back with a wobble on its hit. */
export function tilt(fx: Fx): number {
  const { t, times } = fx;
  if (!fx.medal || times.medalAt === null || times.medalHit === null) return 0;
  if (t <= times.medalHit) return -0.07 * clamp((t - times.medalAt + 120) / (times.medalHit - times.medalAt + 120)) ** 2;
  const k = (t - times.medalHit) / 500;
  return k < 1 ? -0.07 * Math.exp(-5 * k) * Math.cos(4 * Math.PI * k) : 0;
}

/** A beat for the dance party: the word's moment to the stars gathering. */
const BEAT_MS = 400;
/** How high block `i` bobs now (world px). */
export function dance(fx: Fx, i: number, x: number): number {
  const { t, times } = fx, from = wordAt(fx) + 300, to = times.gather + 200;
  if (t < from || t > to) return 0;
  const env = clamp((t - from) / 300) * clamp((to - t) / 300);
  const phase = ((t - from) / BEAT_MS + (i % 2) * 0.5 + x / (UNIT * 40)) % 1;
  return env * UNIT * 0.16 * big(fx.zoom) * Math.sin(Math.PI * phase) ** 2;
}

/** Whether a dot the waves lift by `lift` (world px) lights up gold. */
export const lit = (lift: number, fx: Fx) => lift > 3 * big(fx.zoom);

/** On the board (world px), over everything: lightning, the giant medal, the stamp and the
 * emoji burst. */
export function overMore(ctx: CanvasRenderingContext2D, fx: Fx): void {
  lightning(ctx, fx);
  ghostMedal(ctx, fx);
  emoji(ctx, fx);
  stamp(ctx, fx);
}

/** Jagged bolts from the medal to each star and out round it, flickering, on its hit. */
function lightning(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx, B = big(fx.zoom);
  if (!fx.medal || times.medalHit === null) return;
  const k = t - times.medalHit;
  if (k < 0 || k > 520) return;
  const flick = Math.floor(k / 45), a = (1 - k / 520) * (flick % 3 === 2 ? 0.4 : 1);
  const from = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const ends = [...fx.stars, ...Array.from({ length: 6 }, (_, i) => {
    const ang = (i / 6) * Math.PI * 2 + hash(i + flick * 0.1), d = UNIT * (2 + 1.5 * hash(i + 40)) * B;
    return { x: from.x + Math.cos(ang) * d, y: from.y + Math.sin(ang) * d };
  })];
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ends.forEach((to, j) => {
    const pts = [from];
    const n = 7, dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < n; i++) {
      const off = (hash(j * 13 + i * 7 + flick * 31) - 0.5) * len * 0.35;
      pts.push({ x: from.x + (dx * i) / n - (dy / len) * off, y: from.y + (dy * i) / n + (dx / len) * off });
    }
    pts.push(to);
    for (const [w, color, alpha] of [[9, "rgba(120, 200, 255, 0.35)", 1], [3.5, "#bfe6ff", 1], [1.4, "#ffffff", 1]] as const) {
      ctx.globalAlpha = a * alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = w * B;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  });
  ctx.restore();
}

/** A giant see-through medal swelling out of the block on its hit. */
function ghostMedal(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx, B = big(fx.zoom);
  if (!fx.medal || times.medalHit === null) return;
  const p = (t - times.medalHit) / 550;
  if (p < 0 || p >= 1) return;
  ctx.save();
  ctx.globalAlpha = 0.55 * (1 - p) ** 1.5;
  ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
  ctx.rotate(p * 0.6);
  rosette(ctx, 0, 0, UNIT * B * (0.8 + 7 * easeOut(p)), false);
  ctx.restore();
}

const EMOJI = ["🎉", "⭐", "✨", "🏆", "🔥", "💯", "🥳", "💥"];
/** Emoji thrown out with the confetti, tumbling and falling. */
function emoji(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r } = fx, B = big(fx.zoom), s = (t - confettiAt(fx) - 60) / 1000;
  if (s < 0 || s > 2.2) return;
  const n = fx.medal ? 14 : times.kept >= 5 ? 9 : 5, cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${UNIT * 0.55 * B}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  for (let i = 0; i < n; i++) {
    const h = (k: number) => hash(i * 11 + k + 500);
    const ang = -Math.PI / 2 + (h(1) - 0.5) * 2.6, speed = UNIT * B * (5 + 4 * h(2)), drag = 1.6, g = UNIT * 8 * B;
    const f = (1 - Math.exp(-drag * s)) / drag;
    const x = cx + Math.cos(ang) * speed * f, y = cy + Math.sin(ang) * speed * f + (g / drag) * (s - f);
    const pop = Math.min(1, s * 6);
    ctx.save();
    ctx.globalAlpha = 1 - clamp((s - 1.6) / 0.6);
    ctx.translate(x, y);
    ctx.rotate((h(3) - 0.5) * 6 * s);
    ctx.scale(pop, pop);
    ctx.fillText(EMOJI[i % EMOJI.length]!, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** When the stamp comes down. */
export const stampAt = (fx: Pick<Fx, "medal" | "times">) => wordAt(fx) + 750;
/** A rubber stamp of the moves (RECORD with the medal), slammed down below the block: it
 * falls from big, hits with a puff of dust, and stays till the stars gather. */
function stamp(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const { t, times, rect: r, view: v } = fx, B = big(fx.zoom), k = t - stampAt(fx);
  if (k < 0) return;
  const out = clamp((t - times.gather - FINISH.GATHER_MS * 0.3) / 400);
  if (out >= 1) return;
  const text = fx.medal ? "RECORD!" : `${fx.used} MOVE${fx.used === 1 ? "" : "S"}`;
  const size = UNIT * 0.42 * B;
  const fall = clamp(k / 160), scale = fall < 1 ? 3 - 2 * fall * fall : 1 + 0.08 * Math.exp(-(k - 160) / 60) * Math.cos((k - 160) / 25);
  const cx = Math.min(v.x + v.width - UNIT * 1.6 * B, Math.max(v.x + UNIT * 1.6 * B, r.x + r.width / 2));
  const cy = Math.min(v.y + v.height - UNIT * 0.8 * B, r.y + r.height + UNIT * 0.75 * B);
  ctx.save();
  // Dust puffing out from under it as it lands.
  const d = (k - 160) / 500;
  if (d > 0 && d < 1) {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2, dist = UNIT * B * (0.9 + 0.9 * easeOut(d));
      ctx.globalAlpha = 0.35 * (1 - d);
      ctx.fillStyle = "#b9a58a";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * dist * 1.5, cy + Math.sin(ang) * dist * 0.5, UNIT * 0.18 * B * (1 + d), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = (fall < 1 ? 0.5 + 0.5 * fall : 0.92) * (1 - out);
  ctx.translate(cx, cy);
  ctx.rotate(-0.16);
  ctx.scale(scale, scale);
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + size * 0.9, h = size * 1.6, ink = fx.medal ? "#2f5bb3" : "#c62828";
  ctx.strokeStyle = ink;
  ctx.lineWidth = size * 0.14;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.3);
  ctx.stroke();
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + size * 0.16, -h / 2 + size * 0.16, w - size * 0.32, h - size * 0.32, size * 0.2);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fillText(text, 0, size * 0.05);
  ctx.restore();
}

/** Over the screen (screen px), before the pins: the film look (vignette, letterbox bars,
 * speed lines rushing in round the edges). */
export function cinemaOverlay(ctx: CanvasRenderingContext2D, fx: Fx, width: number, height: number): void {
  const c = cinema(fx);
  if (c <= 0) return;
  const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.hypot(width, height) / 2);
  g.addColorStop(0, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, `rgba(10, 5, 0, ${0.55 * c})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  // Speed lines: from just inside the screen's edge towards the middle, a new set every few frames.
  const set = Math.floor(fx.t / 40), R = Math.hypot(width, height) / 2;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  for (let i = 0; i < 48; i++) {
    const h = (k: number) => hash(i * 3 + k + set * 211);
    const ang = (i / 48) * Math.PI * 2 + h(1) * 0.12, inner = R * (0.55 + 0.25 * h(2));
    ctx.globalAlpha = 0.55 * c * h(3);
    ctx.lineWidth = 1 + 3 * h(4);
    ctx.beginPath();
    ctx.moveTo(width / 2 + Math.cos(ang) * inner, height / 2 + Math.sin(ang) * inner);
    ctx.lineTo(width / 2 + Math.cos(ang) * R * 1.1, height / 2 + Math.sin(ang) * R * 1.1);
    ctx.stroke();
  }
  ctx.restore();
  const bar = height * 0.11 * easeOut(c);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, bar);
  ctx.fillRect(0, height - bar, width, bar);
}

/** The screen glitching on the hits: strips of the picture torn sideways, tinted (device
 * px, the canvas drawn onto itself). */
export function glitch(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, fx: Fx): void {
  const { t, times } = fx;
  const hits = [{ at: 0, len: 140, n: 3 }, ...(fx.medal && times.medalHit !== null ? [{ at: times.medalHit, len: 320, n: 8 }] : [])];
  for (const { at, len, n } of hits) {
    const k = t - at;
    if (k < 0 || k > len) continue;
    const set = Math.floor(k / 35), W = canvas.width, H = canvas.height, power = 1 - k / len;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n; i++) {
      const h = (q: number) => hash(i * 5 + q + set * 97 + at);
      const y = Math.floor(h(1) * H), sh = Math.max(2, Math.floor(H * (0.01 + 0.05 * h(2)))), dx = Math.round((h(3) - 0.5) * W * 0.12 * power);
      ctx.drawImage(canvas, 0, y, W, sh, dx, y, W, sh);
      ctx.fillStyle = i % 2 ? `rgba(0, 255, 255, ${0.18 * power})` : `rgba(255, 0, 140, ${0.18 * power})`;
      ctx.fillRect(0, y, W, sh);
    }
    ctx.restore();
  }
}

/** These parts for the inspector's time line, and their sounds (ms from the goal reached). */
export function moreParts(fx: Pick<Fx, "medal" | "times">): { name: string; from: number; to: number }[] {
  const { times } = fx;
  return [
    ...(fx.medal && times.medalAt !== null ? [
      { name: "Film look: bars, vignette, speed lines, tilt", from: times.medalAt - 120, to: times.medalHit! + 450 },
      { name: "Lightning, giant medal, glitch", from: times.medalHit!, to: times.medalHit! + 550 },
    ] : []),
    { name: "Emoji burst", from: confettiAt(fx) + 60, to: confettiAt(fx) + 2260 },
    { name: "Stamp", from: stampAt(fx), to: times.gather + FINISH.GATHER_MS * 0.3 + 400 },
    { name: "Dance party (every block bobs)", from: wordAt(fx) + 300, to: times.gather + 200 },
  ];
}
export function moreCues(fx: Pick<Fx, "medal" | "times">): { at: number; sound: Sound; n?: number }[] {
  const { times } = fx;
  return [
    { at: 0, sound: "glitch", n: 0 },
    ...(fx.medal && times.medalAt !== null ? [
      { at: times.medalAt, sound: "heartbeat" as const },
      { at: times.medalAt, sound: "riser" as const, n: (times.medalHit! - times.medalAt) / 0.35 },
      { at: times.medalHit!, sound: "zap" as const },
      { at: times.medalHit!, sound: "glitch" as const, n: 1 },
    ] : []),
    { at: stampAt(fx), sound: "stamp" },
    { at: wordAt(fx) + 300, sound: "beat", n: times.gather + 200 - wordAt(fx) - 300 },
  ];
}
