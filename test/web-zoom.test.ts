import { expect, test } from "bun:test";
import { pageHtml } from "../src/web/page";
import * as zoomModule from "../src/web/zoom";

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
