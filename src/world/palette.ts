export type RgbColor = readonly [number, number, number];

const mutedPalette: readonly RgbColor[] = [
  [142, 132, 220],
  [215, 124, 190],
  [220, 143, 119],
  [196, 190, 103],
  [103, 177, 178],
  [111, 155, 208],
];

export function blockColor(id: string): RgbColor {
  if (id.toUpperCase() === "R") return [255, 98, 77];
  const index = Math.max(0, id.toUpperCase().charCodeAt(0) - 65);
  return mutedPalette[index % mutedPalette.length]!;
}

export function rgbCss(color: RgbColor): string {
  return `rgb(${color.join(" ")})`;
}
