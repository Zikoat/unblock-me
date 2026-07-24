import { expect, test } from "bun:test";
import { pageHtml } from "../src/web/page";
import * as zoomModule from "../src/web/zoom";
import * as cameraModule from "../src/web/map-camera";

type ZoomModule = {
  zoomFromPinch?: (startZoom: number, startDistance: number, currentDistance: number) => number;
  zoomFromWheel?: (currentZoom: number, deltaY: number) => number;
};

test("wheel zooms in for upward input and remains bounded", () => {
  const zoom = zoomModule as ZoomModule;
  expect(zoom.zoomFromWheel).toBeFunction();
  expect(zoom.zoomFromWheel!(1, -100)).toBeGreaterThan(1);
  expect(zoom.zoomFromWheel!(2.5, -100)).toBe(2.5);
  expect(zoom.zoomFromWheel!(0.75, 100)).toBe(0.75);
});

test("pinch uses the pointer-distance ratio and remains bounded", () => {
  const zoom = zoomModule as ZoomModule;
  expect(zoom.zoomFromPinch).toBeFunction();
  expect(zoom.zoomFromPinch!(1, 100, 150)).toBe(1.5);
  expect(zoom.zoomFromPinch!(2, 100, 200)).toBe(2.5);
  expect(zoom.zoomFromPinch!(1, 100, 20)).toBe(0.75);
});

test("provides a clipped board frame and visible zoom value", () => {
  expect(pageHtml).toContain('id="board-frame"');
  expect(pageHtml).toContain('id="zoom"');
});

test("one pointer pans continuously on both axes", () => {
  expect(cameraModule.panMapCamera(
    { x: 10, y: 20, zoom: 1 },
    { x: 100, y: 100 },
    { x: 150, y: 75 },
    50,
  )).toEqual({ x: 9, y: 20.5, zoom: 1 });
});

test("one two-pointer gesture keeps its map anchor while zooming and panning", () => {
  const result = cameraModule.pinchMapCamera(
    { x: 10, y: 20, zoom: 1 },
    { x: 150, y: 150 },
    { x: 200, y: 150 },
    { x: 225, y: 175 },
    100,
    150,
    50,
    5,
  );

  expect(result.zoom).toBe(1.5);
  expect(result.x).toBeCloseTo(10);
  expect(result.y).toBeCloseTo(19.6667, 3);
});

test("World map uses overscan so zooming out does not expose the board edge", () => {
  expect(pageHtml).toContain("#board.world-map");
});
