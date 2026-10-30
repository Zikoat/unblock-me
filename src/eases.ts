// Easing curves for sliding a tapped block: t in 0..1 to progress (0 at the start, 1 at
// the end; some overshoot past 1 on the way).

export type Ease = { name: string; f: (t: number) => number };

const out = (f: (t: number) => number) => (t: number) => 1 - f(1 - t);
const bounce = (t: number) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

export const EASES: Ease[] = [
  { name: "Linear", f: (t) => t },
  { name: "Ease out quad", f: out((t) => t * t) },
  { name: "Ease out cubic", f: out((t) => t * t * t) },
  { name: "Ease out quart", f: out((t) => t ** 4) },
  { name: "Ease out expo", f: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)) },
  { name: "Ease in-out cubic", f: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2) },
  { name: "Back out", f: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2 },
  { name: "Spring", f: (t) => (t >= 1 ? 1 : 1 - Math.exp(-6 * t) * Math.cos(9 * t)) },
  { name: "Bounce out", f: bounce },
];

export const DEFAULT_EASE = "Ease out cubic";

export const easeNamed = (name: string): Ease => EASES.find((e) => e.name === name) ?? EASES.find((e) => e.name === DEFAULT_EASE)!;

/** How long a slide of `cells` cells takes at normal speed. */
export const slideDuration = (cells: number) => Math.min(420, 140 + 30 * cells);

/** The speed slider: 0..1 on its track maps to 0.25x .. 4x, evenly on a log scale, with
 * normal speed (1x) in the middle. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const speedAt = (position: number) => MIN_SPEED * (MAX_SPEED / MIN_SPEED) ** position;
export const positionOf = (speed: number) => Math.log(speed / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED);
