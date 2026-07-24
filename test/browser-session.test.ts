import { expect, test } from "bun:test";
import { createPuzzle } from "../src/puzzle";
import { createClosureState } from "../src/world/closure";
import { createPrototypeState } from "../src/world/generation";
import { pageHtml } from "../src/web/page";
import * as sessionModule from "../src/web/session";

type Codec = {
  decodeBrowserSession?: (value: string | null) => unknown;
  encodeBrowserSession?: (value: unknown) => string;
};

test("round-trips exact Play, World, Closure, camera, zoom, and move snapshots", () => {
  const codec = sessionModule as Codec;
  expect(codec.encodeBrowserSession).toBeFunction();
  expect(codec.decodeBrowserSession).toBeFunction();
  const play = createPuzzle();
  const session = {
    version: 1,
    mode: "world",
    zoom: 1.4,
    currentSeed: 42,
    initialState: play,
    playState: { ...play, blocks: play.blocks.map((block) => block.id === "A" ? { ...block, y: block.y - 1 } : block), moves: 1 },
    moveHistory: [{
      type: "block-move",
      blockId: "A",
      direction: "up",
      requestedSteps: 1,
      movedSteps: 1,
      before: play,
      after: { ...play, moves: 1 },
    }],
    worldState: createPrototypeState(),
    closureState: createClosureState("separator"),
  };

  expect(codec.decodeBrowserSession!(codec.encodeBrowserSession!(session))).toEqual(session);
});

test("rejects corrupt and unsupported browser sessions", () => {
  const codec = sessionModule as Codec;
  expect(codec.decodeBrowserSession).toBeFunction();
  expect(codec.decodeBrowserSession!("not json")).toBeUndefined();
  expect(codec.decodeBrowserSession!(JSON.stringify({ version: 99 }))).toBeUndefined();
  expect(codec.decodeBrowserSession!(null)).toBeUndefined();
});

test("shows the retained semantic move count", () => {
  expect(pageHtml).toContain('id="history"');
});
