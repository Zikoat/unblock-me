// The score track, drawn on a goal's target (reports/score-track.html): the moves used fill
// it from one end, and a line across it marks where each star is lost. During play the
// stars are outlines, still in reach. Once the goal is reached they fill in one at a time,
// a medal falls in if it was won, then the track goes and the five stars gather in a row
// that stays on the target.
import { scoreTrack } from "./stars";

const STAR = "#fdd835", STAR_EDGE = "#e07b00", GRAY = "#9a9da2", FILL = "rgba(142, 63, 60, 0.78)", LINE = "rgba(80, 82, 86, 0.25)";
const BLUE = "#3b6fd4", BLUE_DARK = "#2f5bb3", BLUE_DARKER = "#264a94";

/** The finish, in ms from the moment the goal is reached. */
export const FINISH = { START_MS: 250, STAR_MS: 420, POP_MS: 300, MEDAL_WAIT_MS: 700, MEDAL_MS: 1000, MEDAL_FALL: 0.35, HOLD_MS: 600, GATHER_MS: 900 };

/** When each part of the finish happens for a goal of `fewest` finished in `used` moves:
 * the stars kept fill from START_MS, STAR_MS apart; the medal (if under the game's best)
 * comes a moment after the last; then a pause, and the stars gather. */
export function finishTimes(fewest: number, used: number): { kept: number; medalAt: number | null; gather: number; end: number } {
  const kept = scoreTrack(fewest).lines.filter((at) => used <= at).length + 1;
  const starsEnd = FINISH.START_MS + (kept - 1) * FINISH.STAR_MS + FINISH.POP_MS;
  const medalAt = used < fewest ? starsEnd + FINISH.MEDAL_WAIT_MS : null;
  const gather = (medalAt !== null ? medalAt + FINISH.MEDAL_MS : starsEnd) + FINISH.HOLD_MS;
  return { kept, medalAt, gather, end: gather + FINISH.GATHER_MS };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** A filled star's pop: a damped spring from and back to its size, up to about 1.25. */
const pop = (p: number) => 1 + 0.4 * Math.sin(1.5 * Math.PI * p) * (1 - p) ** 2;

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
}

/** A star about `s` across: gold, an outline still in reach, or a gray outline (lost). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: "filled" | "outline" | "gray"): void {
  starPath(ctx, x, y + s * 0.057, s * 0.6);
  ctx.lineJoin = "round";
  if (look === "filled") {
    ctx.fillStyle = STAR;
    ctx.fill();
    ctx.lineWidth = s * 0.06;
    ctx.strokeStyle = STAR_EDGE;
  } else {
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fill();
    ctx.lineWidth = s * 0.09;
    ctx.strokeStyle = look === "gray" ? GRAY : STAR_EDGE;
  }
  ctx.stroke();
}

/** The blue rosette, its disc about `s` across, centred with its tails on (x, y). */
function rosette(ctx: CanvasRenderingContext2D, x: number, y0: number, s: number, gray: boolean): void {
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
  { t = null, undone = false, radius = 12 }: { t?: number | null; undone?: boolean; radius?: number } = {},
): void {
  const vertical = rect.height > rect.width;
  const L = vertical ? rect.height : rect.width, T = vertical ? rect.width : rect.height;
  const { step, lines, end } = scoreTrack(fewest);
  const w = L / end, cv = T / 2;
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
      ctx.translate(shake * 4, Math.abs(shake) * 2.5);
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
    ctx.fillStyle = FILL;
    ctx.fillRect(0, 0, Math.min(used, end) * w, T);
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
    ctx.save();
    ctx.globalAlpha = 1 - collapse;
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = vertical ? "center" : "left";
    upright(vertical ? size * 0.9 : T * 0.18, cv, () => ctx.fillText(String(used), 0, 0));
    ctx.restore();
  }

  // The icons: the four stars on their lines, the last one at the end; the medal (only
  // once it comes in) where the moves ended.
  const s0 = Math.min(T * 0.6, step * w * 0.95);
  const stars = [...lines.map((line) => ({ u: line * w, at: line })), { u: end * w, at: Infinity }];
  const kept = stars.filter((st) => used <= st.at);
  const lost = stars.filter((st) => used > st.at);
  // The row they gather into: the medal, the stars not won, then the stars won.
  const row = [...(medalP !== null ? ["medal"] : []), ...lost.map((st) => st.at), ...kept.map((st) => st.at)];
  const sf = Math.min(T * 0.62, L / (row.length * 1.2));
  const size = s0 + (sf - s0) * ease;
  const place = (key: number | "medal", u: number) => u + (L / 2 + (row.indexOf(key) - (row.length - 1) / 2) * sf * 1.2 - u) * ease;
  for (const st of stars) {
    const k = kept.indexOf(st);
    const fillAt = FINISH.START_MS + k * FINISH.STAR_MS;
    const filled = finished && k >= 0 && t >= fillAt;
    const scale = filled ? pop(clamp((t - fillAt) / FINISH.POP_MS)) : 1;
    const look = filled ? "filled" : k >= 0 ? "outline" : "gray";
    ctx.save();
    ctx.globalAlpha = k >= 0 ? 1 : 0.3 + 0.3 * ease;
    upright(place(st.at, st.u), cv, () => star(ctx, 0, 0, size * scale, look));
    ctx.restore();
  }
  if (medalP !== null) {
    const u = place("medal", Math.min(used, end) * w), ms = size * 0.8;
    if (undone) {
      // Would have been won but for an undo: it only fades in, gray and faint.
      ctx.save();
      ctx.globalAlpha = 0.45 * clamp(medalP * 2);
      upright(u, cv, () => rosette(ctx, 0, 0, ms, true));
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
        ctx.arc(u, cv, ms * (0.6 + 1.8 * settle), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.min(1, (1 - settle) * 1.6);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * 2 * Math.PI + (i % 2) * 0.26, dist = ms * (0.7 + (2.2 + (i % 3) * 0.6) * (1 - (1 - settle) ** 2));
          ctx.fillStyle = i % 3 ? STAR : "#ffffff";
          sparkle(ctx, u + Math.cos(a) * dist, cv + Math.sin(a) * dist, ms * (0.4 + 0.2 * (i % 2)) * (1 - settle * 0.8));
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = land < 1 ? clamp(land * 2.5) : 1;
      upright(u, cv, () => {
        ctx.rotate((-70 * (1 - land) * Math.PI) / 180);
        ctx.scale(scale, scale);
        rosette(ctx, 0, 0, ms, false);
      });
      ctx.restore();
    }
  }
  ctx.restore();
}
