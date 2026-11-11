// The blind trials' verdicts (one player, read from chat by the earlier agents; see
// reports/trial-mixed.html), and rank statistics. Shared by the lab scripts.

/** Best/hardest first, as the earlier reports placed them. H1 counted as a near tie. */
export const ORDER = ["12A", "J1B", "16B", "M1A", "G2A", "H1A", "H1B", "G1A", "H2B", "16A", "H3A", "8A", "H3B", "8B", "M1B", "G1B", "J1A", "H2A", "12B", "G2B"];
/** Blind pairs, the preferred (harder/better) side first; slight: called only a little apart. */
export const PAIRS: { win: string; lose: string; slight: boolean }[] = [
  { win: "8A", lose: "8B", slight: true }, { win: "12A", lose: "12B", slight: false }, { win: "16B", lose: "16A", slight: false },
  { win: "M1A", lose: "M1B", slight: false }, { win: "G1A", lose: "G1B", slight: true }, { win: "G2A", lose: "G2B", slight: false },
  { win: "H2B", lose: "H2A", slight: false }, { win: "H3A", lose: "H3B", slight: true }, { win: "J1B", lose: "J1A", slight: false },
  { win: "K2A", lose: "K2B", slight: false }, { win: "K1A", lose: "K1B", slight: false },
];
/** The K boards in the order: K2A near the top (very hard, got stuck), K1A mid, K2B and K1B lower. */
export const ORDER_ALL = ["12A", "K2A", "J1B", "16B", "M1A", "K1A", "G2A", "H1A", "H1B", "G1A", "K2B", "H2B", "16A", "K1B", "H3A", "8A", "H3B", "8B", "M1B", "G1B", "J1A", "H2A", "12B", "G2B"];

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]![1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman's rank correlation (ties averaged). */
export function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return NaN;
  const ra = ranks(a), rb = ranks(b);
  const ma = ra.reduce((x, y) => x + y, 0) / a.length, mb = rb.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (ra[i]! - ma) * (rb[i]! - mb); da += (ra[i]! - ma) ** 2; db += (rb[i]! - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** How many blind pairs a number orders as the player did (higher = harder/better). */
export function pairScore(pairs: typeof PAIRS, v: (label: string) => number, only?: Set<string>) {
  let right = 0, wrong = 0, tied = 0;
  for (const p of pairs) {
    if (only && !(only.has(p.win) && only.has(p.lose))) continue;
    const a = v(p.win), b = v(p.lose);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a > b) right++; else if (a < b) wrong++; else tied++;
  }
  return { right, wrong, tied };
}
