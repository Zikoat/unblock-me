import { zoomFromPinch } from "./zoom";

export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function panMapCamera(
  start: MapCamera,
  startPointer: ScreenPoint,
  currentPointer: ScreenPoint,
  cellSize: number,
): MapCamera {
  return {
    ...start,
    x: start.x - (currentPointer.x - startPointer.x) / (cellSize * start.zoom),
    y: start.y - (currentPointer.y - startPointer.y) / (cellSize * start.zoom),
  };
}

export function pinchMapCamera(
  start: MapCamera,
  frameCenter: ScreenPoint,
  startCentroid: ScreenPoint,
  currentCentroid: ScreenPoint,
  startDistance: number,
  currentDistance: number,
  cellSize: number,
  halfViewportCells: number,
): MapCamera {
  const zoom = zoomFromPinch(start.zoom, startDistance, currentDistance);
  const anchorX = start.x + halfViewportCells
    + (startCentroid.x - frameCenter.x) / (cellSize * start.zoom);
  const anchorY = start.y + halfViewportCells
    + (startCentroid.y - frameCenter.y) / (cellSize * start.zoom);
  return {
    x: anchorX - halfViewportCells
      - (currentCentroid.x - frameCenter.x) / (cellSize * zoom),
    y: anchorY - halfViewportCells
      - (currentCentroid.y - frameCenter.y) / (cellSize * zoom),
    zoom,
  };
}
