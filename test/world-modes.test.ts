import { expect, test } from "bun:test";
import { pageHtml } from "../src/web/page";
import * as closurePrototype from "../src/prototypes/dependency-closure/state";
import * as worldPrototype from "../src/prototypes/multi-region/state";

type ViewCell = {
  blockId?: string;
  committed: boolean;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
};

test("projects only the 10×10 World Viewport with complete world coordinates", () => {
  const project = (worldPrototype as unknown as {
    projectWorldViewport?: (state: worldPrototype.PrototypeState) => ViewCell[];
  }).projectWorldViewport;
  expect(project).toBeFunction();

  const state = worldPrototype.reducePrototype(
    worldPrototype.createPrototypeState(),
    { type: "move-camera", direction: "right", steps: 20 },
  );
  const cells = project!(state);

  expect(cells).toHaveLength(100);
  expect(cells.every((cell) => cell.committed)).toBe(true);
  expect(cells[0]).toMatchObject({ x: 0, y: 0, worldX: 20, worldY: 0 });
});

test("projects Dependency closure around its current frontier", () => {
  const project = (closurePrototype as unknown as {
    projectClosureViewport?: (state: closurePrototype.ClosureState) => ViewCell[];
  }).projectClosureViewport;
  expect(project).toBeFunction();

  const state = closurePrototype.reduceClosure(
    closurePrototype.createClosureState("runaway"),
    { type: "step" },
  );
  const cells = project!(state);

  expect(cells).toHaveLength(100);
  expect(cells.some((cell) => cell.blockId === "R")).toBe(true);
});

test("offers finite Play, World generation, and Dependency closure browser modes", () => {
  expect(pageHtml).toContain('data-mode="play"');
  expect(pageHtml).toContain('data-mode="world"');
  expect(pageHtml).toContain('data-mode="closure"');
});
