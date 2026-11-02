// The score track, drawn on a goal's target (reports/score-track.html): the moves used fill
// it from one end, and a line across it marks where each star is lost. During play the
// stars are outlines, still in reach. Once the goal is reached they fill in one at a time,
// a medal falls in if it was won, then the track goes and the five stars gather in a row
// that stays on the target.
import { scoreTrack } from "./stars";
import { glow, sprite, wedges } from "./sprites";

const STAR = "#fdd835", STAR_EDGE = "#e07b00", LINE = "rgba(150, 40, 40, 0.45)";
/** The moves' fill (the red block's red, lighter: the same hue), and the outline of a star
 * not won (light, to show on the fill). */
const TRACK_COLORS = { fill: "rgba(232, 115, 115, 0.85)", gray: "#c9ccd1" };
const BLUE = "#3b6fd4", BLUE_DARK = "#2f5bb3", BLUE_DARKER = "#264a94";

/** The finish, in ms from the moment the goal is reached. */
export const FINISH = { START_MS: 600, STAR_MS: 420, POP_MS: 300, MEDAL_WAIT_MS: 700, MEDAL_MS: 1000, MEDAL_FALL: 0.35, HOLD_MS: 800, GATHER_MS: 900, LAND_MS: 700 };

/** When each part of the finish happens for a goal of `fewest` finished in `used` moves:
 * the stars kept fill from START_MS, STAR_MS apart; the medal (if under the game's best)
 * comes a moment after the last; then a pause, and the stars gather. */
export function finishTimes(fewest: number, used: number): { kept: number; starsEnd: number; medalAt: number | null; medalHit: number | null; gather: number; landed: number; end: number } {
  const kept = scoreTrack(fewest).lines.filter((at) => used <= at).length + 1;
  const starsEnd = FINISH.START_MS + (kept - 1) * FINISH.STAR_MS + FINISH.POP_MS;
  const medalAt = used < fewest ? starsEnd + FINISH.MEDAL_WAIT_MS : null;
  const medalHit = medalAt === null ? null : medalAt + FINISH.MEDAL_FALL * FINISH.MEDAL_MS;
  const gather = (medalAt !== null ? medalAt + FINISH.MEDAL_MS : starsEnd) + FINISH.HOLD_MS;
  // Once gathered, the row lands: a hop along it and a shine over the block.
  const landed = gather + FINISH.GATHER_MS;
  return { kept, starsEnd, medalAt, medalHit, gather, landed, end: landed + FINISH.LAND_MS };
}

/** Where the stars won sit on the track over `rect` (world px), in the order they fill. */
export function starPoints(rect: { x: number; y: number; width: number; height: number }, fewest: number, used: number): { x: number; y: number }[] {
  const vertical = rect.height > rect.width;
  const L = vertical ? rect.height : rect.width, T = vertical ? rect.width : rect.height;
  const { step, lines, end } = scoreTrack(fewest);
  const w = L / (end + step / 2);
  return [...lines, end].filter((at, i) => i === lines.length || used <= at).map((at) => (vertical ? { x: rect.x + T / 2, y: rect.y + rect.height - at * w } : { x: rect.x + at * w, y: rect.y + T / 2 }));
}

/** One icon as drawn: which, where along the track (world px), its size and opacity (for the
 * animation inspector's curves). */
export type TraceEntry = { name: string; along: number; scale: number; opacity: number };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** A filled star's pop: a damped spring from and back to its size, up to about 1.45. */
const pop = (p: number) => 1 + 0.75 * Math.sin(1.5 * Math.PI * p) * (1 - p) ** 2;

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
}

/** A star about `s` across: gold, an outline still in reach (solid pale centre), or one
 * lost (grey outline; `solid` 0..1 how much its centre hides what is under it: the fill,
 * whose colour it takes, during play, nothing once the stars have gathered). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: "filled" | "outline" | "gray", solid = 0): void {
  starPath(ctx, x, y + s * 0.057, s * 0.6);
  ctx.lineJoin = "round";
  if (look === "filled") {
    ctx.fillStyle = STAR;
    ctx.fill();
    ctx.lineWidth = s * 0.09; // as thick as an outline star's
    ctx.strokeStyle = STAR_EDGE;
  } else {
    if (look === "gray") {
      ctx.fillStyle = `rgba(234, 134, 134, ${solid})`; // the moves' fill over the board
      ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * (1 - solid)})`;
    } else ctx.fillStyle = "#f7e7e3"; // near the pale track it sits on
    ctx.fill();
    ctx.lineWidth = s * 0.09;
    ctx.strokeStyle = look === "gray" ? TRACK_COLORS.gray : STAR_EDGE;
  }
  if (look === "gray") {
    // Faint while the track shows, clearer in the gathered row.
    ctx.save();
    ctx.globalAlpha *= 0.45 + 0.5 * (1 - solid);
    ctx.stroke();
    ctx.restore();
  } else ctx.stroke();
}

/** The blue rosette, its disc about `s` across, centred with its tails on (x, y). */
export function rosette(ctx: CanvasRenderingContext2D, x: number, y0: number, s: number, gray: boolean): void {
  const r = s / 2, y = y0 - r * 0.335;
  const tail = (side: number, fill: string) => {
    ctx.fillStyle = gray ? "#8a8d91" : fill;
    ctx.beginPath();
    ctx.moveTo(x + side * r * 0.5, y);
    ctx.lineTo(x + side * r * 0.9, y + r * 1.9);
    ctx.lineTo(x + side * r * 0.45, y + r * 1.6);
    ctx.lineTo(x + side * r * 0.1, y + r * 1.95);
    ctx.lineTo(x, y);
    ctx.fill();
  };
  tail(-1, BLUE_DARK);
  tail(1, BLUE_DARKER);
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12, rr = i % 2 ? r * 1.05 : r * 1.28;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.fillStyle = gray ? "#a6a9ad" : BLUE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = gray ? "#d0d2d5" : STAR;
  ctx.fill();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = gray ? "#8a8d91" : STAR_EDGE;
  ctx.stroke();
}

/** A four-point sparkle. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** A soft gold glow, `r` across, behind a star. */
function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  glow(ctx, "halo", x, y, r, alpha);
}

/** A star's fill: a white ring spreading from it and six sparkles thrown out (`p` 0..1). */
function burst(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, p: number, seed: number): void {
  const out = easeOut(p);
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = s * 0.14 * (1 - p);
  ctx.beginPath();
  ctx.arc(x, y, s * (0.45 + 0.75 * out), 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed * 0.7, d = s * (0.5 + 1.1 * out);
    ctx.fillStyle = i % 2 ? STAR : "#ffffff";
    sparkle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.22 * (1 - p * 0.7));
  }
  ctx.restore();
}

/** Sun rays: wedges of light turning slowly round (x, y), `r` long. */
function sunRays(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, turn: number): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.fillStyle = "rgb(255, 225, 110)";
  ctx.globalAlpha *= alpha * 0.6;
  wedges(ctx, r, 12, Math.PI / 14);
  ctx.globalAlpha *= 0.8;
  wedges(ctx, r * 0.55, 12, Math.PI / 14);
  ctx.restore();
}

/**
 * The track over `rect` (world px), along its long side: left to right, or bottom to top
 * for a tall one. `t` is ms since the goal was reached, null while it is played; past the
 * finish only the row of stars stays.
 */
export function drawScoreTrack(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  fewest: number,
  used: number,
  { t = null, undone = false, radius = 12, trace, detail = 1 }: { t?: number | null; undone?: boolean; radius?: number; trace?: TraceEntry[]; detail?: number } = {},
): void {
  const vertical = rect.height > rect.width;
  const L = vertical ? rect.height : rect.width, T = vertical ? rect.width : rect.height;
  const { step, lines, end } = scoreTrack(fewest);
  // The moves span the track up to half a step past the last star, so that star sits inside
  // the end, as far from it as the stars are from each other (and the fill goes on to the end).
  const span = end + step / 2, w = L / span, cv = T / 2;
  const times = finishTimes(fewest, used);
  const finished = t !== null;
  const medalP = finished && times.medalAt !== null && t >= times.medalAt ? clamp((t - times.medalAt) / FINISH.MEDAL_MS) : null;
  const linesShown = finished ? 1 - clamp((t - times.gather + FINISH.HOLD_MS) / FINISH.HOLD_MS) : 1;
  const collapse = finished ? clamp((t - times.gather) / FINISH.GATHER_MS) : 0;
  const ease = easeInOut(collapse);

  ctx.save();
  // Local frame: u along the track, v across it.
  if (vertical) {
    ctx.translate(rect.x, rect.y + rect.height);
    ctx.rotate(-Math.PI / 2);
  } else ctx.translate(rect.x, rect.y);
  // The medal's hit jolts the whole track for a moment.
  if (medalP !== null && !undone) {
    const k = ((t ?? 0) - times.medalAt! - FINISH.MEDAL_FALL * FINISH.MEDAL_MS) / 220;
    if (k >= 0 && k < 1) {
      const shake = Math.sin(k * Math.PI * 5) * (1 - k) ** 2;
      ctx.translate(shake * 7, Math.abs(shake) * 4);
    }
  }
  /** Draw at local (u, v), the right way up whichever way the track runs. */
  const upright = (u: number, v: number, paint: () => void) => {
    ctx.save();
    ctx.translate(u, v);
    if (vertical) ctx.rotate(Math.PI / 2);
    paint();
    ctx.restore();
  };

  // The bar: the moves used, and the star lines.
  if (collapse < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - collapse;
    ctx.beginPath();
    ctx.roundRect(0, 0, L, T, radius);
    ctx.clip();
    ctx.fillStyle = TRACK_COLORS.fill;
    ctx.fillRect(0, 0, Math.min(used, span) * w, T);
    ctx.globalAlpha = (1 - collapse) * linesShown;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const line of lines) {
      ctx.moveTo(line * w, 0);
      ctx.lineTo(line * w, T);
    }
    ctx.stroke();
    ctx.restore();
    // The move count, white with a shadow, at the start of the track.
    const size = Math.min(T * 0.42, Math.max(8, ((fewest - 1) * w - T * 0.3) / (0.62 * String(used).length)));
    // A picture made once (text with a shadow drawn every frame was slow).
    const text = String(used), font = `700 ${size}px system-ui, sans-serif`;
    ctx.save();
    ctx.globalAlpha = 1 - collapse;
    ctx.font = font;
    const tw = ctx.measureText(text).width, bw = tw + size * 0.4, bh = size * 1.4;
    upright(vertical ? size * 0.9 : T * 0.18 + tw / 2, cv, () =>
      sprite(ctx, `count:${text}:${size}`, bw, bh, null, (c) => {
        c.shadowColor = "rgba(0, 0, 0, 0.55)";
        c.shadowBlur = 2;
        c.shadowOffsetY = 0.6;
        c.fillStyle = "#ffffff";
        c.font = font;
        // Digits sit on the baseline; a cap height is about 0.72 of the size, so this
        // centres them on the stars' line.
        c.textBaseline = "alphabetic";
        c.textAlign = "center";
        c.fillText(text, 0, size * 0.36);
      }),
    );
    ctx.restore();
  }

  // The icons: the four stars on their lines, the last one inside the end; the medal
  // (only once it comes in) where the moves ended.
  // Never wider than the gap between two lines, so the stars never touch.
  const s0 = Math.min(T * 0.6, step * w * 0.8);
  const stars = [...lines.map((line) => ({ u: line * w, at: line })), { u: end * w, at: Infinity }];
  const kept = stars.filter((st) => used <= st.at);
  const lost = stars.filter((st) => used > st.at);
  // The row they gather into: the medal, the stars not won, then the stars won.
  const row = [...(medalP !== null ? ["medal"] : []), ...lost.map((st) => st.at), ...kept.map((st) => st.at)];
  // Sized so the whole row fits inside the red block on the target (the target reaches 3
  // px past it, the block stops 3 px short of its cells), with room at each end.
  const sf = Math.min(T * 0.55, (L - 28) / ((row.length - 1) * 1.2 + 1.2));
  const size = s0 + (sf - s0) * ease;
  const placeAt = (key: number | "medal", u: number, e: number) => u + (L / 2 + (row.indexOf(key) - (row.length - 1) / 2) * sf * 1.2 - u) * e;
  const place = (key: number | "medal", u: number) => placeAt(key, u, ease);
  /** Across the track while gathering: each icon swings out on an arc (alternate sides),
   * and once landed hops in turn, a wave along the row. */
  const swing = (key: number | "medal", e: number) => {
    const r = row.indexOf(key), arc = Math.sin(Math.PI * e) * T * 0.75 * (r % 2 ? 1 : -1);
    const h = finished ? (t - times.landed - r * 70) / 340 : -1;
    return cv + arc - (h > 0 && h < 1 ? Math.sin(Math.PI * h) * T * 0.3 : 0);
  };
  const gathering = collapse > 0 && collapse < 1;
  for (const st of stars) {
    const k = kept.indexOf(st);
    const fillAt = FINISH.START_MS + k * FINISH.STAR_MS;
    const filled = finished && k >= 0 && t >= fillAt;
    const since = filled ? t - fillAt : Infinity;
    const scale = filled ? pop(clamp(since / FINISH.POP_MS)) : 1;
    const look = filled ? "filled" : k >= 0 ? "outline" : "gray";
    const u = place(st.at, st.u), v = swing(st.at, ease);
    // It spins in as it fills, and turns once more on its way to the row.
    const turn = (filled ? -(1 - easeOut(clamp(since / (FINISH.POP_MS * 1.6)))) * Math.PI * 1.2 : 0) + ease * Math.PI * 2 * (filled ? 1 : 0);
    // Gathering, a filled star trails ghosts of itself.
    if (gathering && filled && detail >= 1) {
      for (let j = 3; j >= 1; j--) {
        const e = easeInOut(clamp(collapse - j * 0.045));
        ctx.save();
        ctx.globalAlpha = 0.28 / j;
        upright(placeAt(st.at, st.u, e), swing(st.at, e), () => star(ctx, 0, 0, (s0 + (sf - s0) * e) * 0.9, "filled"));
        ctx.restore();
      }
    }
    // A won star glows while the stars are shown, a slow pulse each out of step.
    if (filled && collapse < 1 && detail >= 0.5) {
      const glow = clamp(since / 200) * (0.55 + 0.25 * Math.sin(t / 140 + k * 1.3)) * (1 - collapse);
      halo(ctx, u, v, size * 1.15, glow);
    }
    ctx.save();
    upright(u, v, () => {
      ctx.rotate(turn);
      star(ctx, 0, 0, size * scale, look, 1 - ease);
      // The fill flashes white for a moment.
      if (since < 220) {
        ctx.globalAlpha = 1 - since / 220;
        starPath(ctx, 0, size * scale * 0.057, size * scale * 0.6);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
    });
    ctx.restore();
    // A ring and a few sparkles burst from it as it fills.
    if (since < 480) burst(ctx, u, v, size, since / 480, k);
    trace?.push({ name: st.at === Infinity ? "Star (end)" : `Star ${st.at}`, along: u, scale: (size / s0) * scale, opacity: look === "gray" ? 0.45 + 0.5 * ease : 1 });
  }
  if (medalP !== null) {
    const u = place("medal", Math.min(used, span) * w), ms = size * 0.8, mv = swing("medal", ease);
    if (undone) {
      // Would have been won but for an undo: it only fades in, gray and faint.
      ctx.save();
      ctx.globalAlpha = 0.45 * clamp(medalP * 2);
      upright(u, mv, () => rosette(ctx, 0, 0, ms, true));
      ctx.restore();
    } else {
      // Falls in from 3.5x, speeding up and spinning; hits hard (squash and a stiff
      // bounce), and a ring and sparkles burst out on the hit.
      const land = clamp(medalP / FINISH.MEDAL_FALL), settle = clamp((medalP - FINISH.MEDAL_FALL) / (1 - FINISH.MEDAL_FALL));
      const scale = land < 1 ? 3.5 - 2.5 * land ** 2 : 1 - 0.25 * Math.exp(-5 * settle) * Math.cos(3 * Math.PI * settle);
      if (land >= 1 && settle < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - settle;
        ctx.strokeStyle = STAR;
        ctx.lineWidth = ms * 0.25 * (1 - settle);
        ctx.beginPath();
        ctx.arc(u, mv, ms * (0.6 + 1.8 * settle), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.min(1, (1 - settle) * 1.6);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * 2 * Math.PI + (i % 2) * 0.26, dist = ms * (0.7 + (2.2 + (i % 3) * 0.6) * (1 - (1 - settle) ** 2));
          ctx.fillStyle = i % 3 ? STAR : "#ffffff";
          sparkle(ctx, u + Math.cos(a) * dist, mv + Math.sin(a) * dist, ms * (0.4 + 0.2 * (i % 2)) * (1 - settle * 0.8));
        }
        ctx.restore();
      }
      // Sun rays turn behind it from its hit until the row has gathered.
      if (land >= 1) {
        const k = medalP < 1 ? settle : 1, fade = 1 - clamp((collapse - 0.6) / 0.4);
        sunRays(ctx, u, mv, ms * (1.2 + 1.6 * easeOut(clamp(k * 2))), 0.42 * fade * clamp(k * 3), (t ?? 0) / 1400);
      }
      trace?.push({ name: "Medal", along: u, scale: scale * (size / s0), opacity: land < 1 ? clamp(land * 2.5) : 1 });
      ctx.save();
      ctx.globalAlpha = land < 1 ? clamp(land * 2.5) : 1;
      upright(u, mv, () => {
        ctx.rotate((-70 * (1 - land) * Math.PI) / 180);
        ctx.scale(scale, scale);
        rosette(ctx, 0, 0, ms, false);
      });
      ctx.restore();
    }
  }
  ctx.restore();
}
