export type NumericSettingDefinition =
  | { kind: "fixed"; value: number }
  | { integer?: boolean; kind: "bounded-uniform"; max: number; min: number }
  | {
    integer?: boolean;
    kind: "bounded-normal";
    max: number;
    mean: number;
    min: number;
    standardDeviation: number;
  };

export interface SampledNumericSetting {
  definition: NumericSettingDefinition;
  sampled: number;
}

export interface GenerationTiming {
  phases: Record<string, number>;
  totalMs: number;
}

export function sampleNumericSetting(
  definition: NumericSettingDefinition,
  random: () => number,
): SampledNumericSetting {
  let sampled: number;
  if (definition.kind === "fixed") {
    sampled = definition.value;
  } else if (definition.kind === "bounded-uniform") {
    sampled = definition.min + random() * (definition.max - definition.min);
  } else {
    const first = Math.max(Number.EPSILON, random());
    const second = random();
    const standardNormal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    sampled = definition.mean + standardNormal * definition.standardDeviation;
  }
  const minimum = definition.kind === "fixed" ? definition.value : definition.min;
  const maximum = definition.kind === "fixed" ? definition.value : definition.max;
  const bounded = Math.max(minimum, Math.min(maximum, sampled));
  return {
    definition: { ...definition },
    sampled: definition.kind !== "fixed" && definition.integer ? Math.round(bounded) : bounded,
  };
}

export function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1_000) / 1_000;
}
