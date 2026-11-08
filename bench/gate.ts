// The Gate (reports/goal-spec.md): what a Contender's Bench scores must be to ship it.
// Times are as measured where the Bench ran (this VM), not on a mid phone: how the two
// compare is not known yet.

export type Scores = {
  maker: string;
  set: string;
  cases: number;
  /** Shares (0..1) of the cases whose Goal the Referee took, and whose two answers matched. */
  legal: number;
  deterministic: number;
  /** Audited fitness over the case's record (0 for none or an illegal Goal). */
  quality: { median: number; worst5: number };
  /** Milliseconds per Goal. */
  time: { median: number; slowest5: number };
  /** Goals the Auditor found shorter, their share, and the moves over at the mean and most. */
  padding: { share: number; mean: number; max: number };
};

export const GATE = { legal: 1, deterministic: 1, qualityMedian: 0.95, qualityWorst5: 0.8, slowest5Ms: 300 };

/** Does `scores` pass, also against the shipping Contender's scores on the same set if given?
 * The reasons it fails, if not. */
export function gate(scores: Scores, shipping?: Scores, limits = GATE): { pass: boolean; fails: string[] } {
  const fails: string[] = [];
  const pc = (x: number) => `${(100 * x).toFixed(1)}%`;
  if (scores.legal < limits.legal) fails.push(`legal ${pc(scores.legal)} < ${pc(limits.legal)}`);
  if (scores.deterministic < limits.deterministic) fails.push(`deterministic ${pc(scores.deterministic)} < ${pc(limits.deterministic)}`);
  if (scores.quality.median < limits.qualityMedian) fails.push(`quality median ${scores.quality.median.toFixed(3)} < ${limits.qualityMedian}`);
  if (scores.quality.worst5 < limits.qualityWorst5) fails.push(`quality worst 5% ${scores.quality.worst5.toFixed(3)} < ${limits.qualityWorst5}`);
  if (scores.time.slowest5 > limits.slowest5Ms) fails.push(`time slowest 5% ${Math.round(scores.time.slowest5)} ms > ${limits.slowest5Ms} ms`);
  if (shipping && shipping.maker !== scores.maker) {
    if (scores.quality.median < shipping.quality.median) fails.push(`quality median ${scores.quality.median.toFixed(3)} below the shipping ${shipping.maker}'s ${shipping.quality.median.toFixed(3)}`);
    if (scores.quality.worst5 < shipping.quality.worst5) fails.push(`quality worst 5% ${scores.quality.worst5.toFixed(3)} below the shipping ${shipping.maker}'s ${shipping.quality.worst5.toFixed(3)}`);
  }
  return { pass: fails.length === 0, fails };
}

/** The value at share `p` (0..1) of the sorted values, nearest rank. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}
