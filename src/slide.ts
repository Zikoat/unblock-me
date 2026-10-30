// How a tapped block slides: ease out cubic at 1.5x speed, the setting that felt best.

export const ease = (t: number) => 1 - (1 - t) ** 3;

/** How long a slide of `cells` cells takes. */
export const slideDuration = (cells: number) => Math.min(420, 140 + 30 * cells) / 1.5;
