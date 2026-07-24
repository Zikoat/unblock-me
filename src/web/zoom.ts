const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;

export function zoomFromWheel(currentZoom: number, deltaY: number): number {
  if (deltaY === 0) return currentZoom;
  return clampZoom(currentZoom + (deltaY < 0 ? 0.1 : -0.1));
}

export function zoomFromPinch(startZoom: number, startDistance: number, currentDistance: number): number {
  if (startDistance <= 0) return clampZoom(startZoom);
  return clampZoom(startZoom * currentDistance / startDistance);
}

function clampZoom(value: number): number {
  return Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) * 1_000) / 1_000;
}
