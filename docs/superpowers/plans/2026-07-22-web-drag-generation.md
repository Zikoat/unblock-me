# Multi-cell Drag and Generated Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix browser coordinate drift and add shared multi-cell movement, square blocks, varied proof-solvable levels, and screenshot-rich verification.

**Architecture:** `src/game.ts` remains the single rules authority. Terminal and browser adapt the same atomic and repeated-move APIs; generation constructs a solved random state and reverse-scrambles it. Browser rendering projects explicit engine coordinates and uses transforms only for uncommitted drag previews.

**Tech Stack:** Bun 1.3.12, TypeScript, DOM Pointer Events, CSS Grid, Playwright with installed Edge, FFmpeg.

## Global Constraints

- No subagents.
- Red Block and Checkpoint remain horizontal 2×1.
- Generated boards are 6–10 cells wide and 5–8 high.
- Move count counts traversed cells.
- Infinite World remains deferred.

---

### Task 1: Shared geometry and repeated movement

**Files:**
- Modify: `src/game.ts`
- Modify: `src/puzzle.ts`
- Modify: `src/render.ts`
- Test: `test/game.test.ts`
- Test: `test/render.test.ts`

**Interfaces:**
- Produces: `Block { id, width, height, movement, x, y }`, `applyMove(state, action)`, `applyMoves(state, action, requestedSteps)`, and `projectState(state)`.
- Consumes: no new project interfaces.

- [ ] **Step 1: Write failing tests** for rectangular `blockCells`, both-axis square movement, partial repeated movement, per-cell move counts, and coordinate projection.

```ts
expect(blockCells({ id: "S", width: 2, height: 2, movement: "both", x: 1, y: 1 })).toEqual([
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 },
]);
expect(applyMoves(state, { blockId: "R", direction: "right" }, 9)).toMatchObject({ ok: true, movedSteps: 4 });
```

- [ ] **Step 2: Run `bun test test/game.test.ts test/render.test.ts`** and confirm the new assertions fail against the length/axis model.
- [ ] **Step 3: Replace line-only geometry with rectangular geometry**, allow `movement: "both"` only for square blocks through validation, and implement repeated movement by looping the unchanged one-cell primitive until blocked.

```ts
export type Movement = Axis | "both";
export interface Block { id: string; width: number; height: number; movement: Movement; x: number; y: number }
export type MultiMoveResult = { ok: true; state: GameState; movedSteps: number; requestedSteps: number; stoppedBy?: MoveErrorCode } | MoveResult;
export function applyMoves(state: GameState, action: MoveAction, requestedSteps: number): MultiMoveResult;
export function projectState(state: GameState): string[][];
```

- [ ] **Step 4: Update the fixed puzzle and terminal renderer** to use the new shape and projection without changing its displayed occupancy.
- [ ] **Step 5: Run the focused tests** and expect them to pass.

### Task 2: Optional terminal step count

**Files:**
- Modify: `src/commands.ts`
- Modify: `src/cli.ts`
- Modify: `src/render.ts`
- Test: `test/commands.test.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `applyMoves(state, action, requestedSteps)` from Task 1.
- Produces: move commands with `steps: number`.

- [ ] **Step 1: Write failing parser and CLI tests** for `R right 4`, the default of one, zero/negative/non-integer rejection, and partial movement notices.

```ts
expect(parseCommand("R right 4")).toEqual({ ok: true, command: { type: "move", blockId: "R", direction: "right", steps: 4 } });
expect(parseCommand("R right 0")).toEqual({ ok: false, message: "Step count must be a positive integer." });
```

- [ ] **Step 2: Run `bun test test/commands.test.ts test/cli.test.ts`** and confirm failure.
- [ ] **Step 3: Parse `BLOCK DIRECTION [N]`** and route moves through `applyMoves`; report `Moved X of Y cells before blocked.` only for partial success.
- [ ] **Step 4: Update terminal help text** to `Enter <block-id> <direction> [steps] ...`.
- [ ] **Step 5: Run focused tests** and expect them to pass.

### Task 3: Random solved construction and proof scrambling

**Files:**
- Replace: `src/generator.ts`
- Test: `test/generator.test.ts`

**Interfaces:**
- Consumes: rectangular blocks, validation, `applyMove`, and coordinate projection from Task 1.
- Produces: `createGeneratedLevel(seed): GeneratedLevel` with randomized dimensions, geometry, Walls, Checkpoint, and replayable `solution`.

- [ ] **Step 1: Write failing table-driven tests** over representative seeds for bounds, determinism, structural validity, variation, square blocks, initial unwon state, and proof replay to `won=true`.

```ts
for (const seed of [1, 2, 42, 999, 123456]) {
  const level = createGeneratedLevel(seed);
  expect(level.state.width).toBeGreaterThanOrEqual(6);
  expect(level.state.width).toBeLessThanOrEqual(10);
  expect(level.state.height).toBeGreaterThanOrEqual(5);
  expect(level.state.height).toBeLessThanOrEqual(8);
  expect(validateState(level.state)).toEqual([]);
  expect(replay(level.state, level.solution).won).toBe(true);
}
```

- [ ] **Step 2: Run `bun test test/generator.test.ts`** and confirm the current template scramble fails variation assertions.
- [ ] **Step 3: Implement deterministic candidate construction**: choose dimensions and Checkpoint, place solved Red Block, reserve an escape cell, place non-overlapping random Walls and blocks, then move Red away and perform legal reverse scrambling.
- [ ] **Step 4: Retry failed candidates with deterministic derived attempts** and throw `Unable to generate a proven solvable level for seed N.` after the bounded limit.
- [ ] **Step 5: Run generator tests** and expect all sampled proof solutions to win.

### Task 4: Explicit web coordinates and continuous multi-cell drag

**Files:**
- Modify: `src/web/client.ts`
- Modify: `src/web/page.ts`
- Modify: `scripts/web-playwright.mjs`
- Create: `test/web-projection.test.ts`

**Interfaces:**
- Consumes: `applyMoves`, rectangular block geometry, and `projectState`.
- Produces: DOM attributes `data-x`, `data-y`, `data-width`, `data-height`, and drag preview state observable by Playwright.

- [ ] **Step 1: Add failing parity and Playwright assertions**: explicit Checkpoint coordinates remain fixed; a long drag moves multiple cells; pointer state remains uncommitted during preview; pointer cancellation restores position/state.

```js
await page.mouse.down();
await page.mouse.move(startX + cellPitch * 2.5, startY, { steps: 12 });
assert(await page.locator("[data-drag-preview='true']").count() === 1, "Preview missing");
await page.dispatchEvent("[data-block-id='R']", "pointercancel", { pointerId: 1 });
assert((await page.locator("#moves").textContent()) === "0 moves", "Cancel committed state");
```

- [ ] **Step 2: Run `bun test test/web-projection.test.ts` and `bun run test:web`** and confirm failures.
- [ ] **Step 3: Give every background cell explicit grid row/column**, render block spans from width/height, and expose coordinate data attributes.
- [ ] **Step 4: Implement preview drag state** using pointer displacement divided by measured cell pitch; use dominant axis for squares; call `applyMoves` against the pointer-down state to clamp legal preview distance.
- [ ] **Step 5: Commit previewed moves on release and clear transforms on cancellation**; retain a short transform transition only if screenshots remain clear.
- [ ] **Step 6: Update copy** to describe multi-cell dragging.
- [ ] **Step 7: Run focused tests** and expect fixed Checkpoint coordinates and mouse/touch flows to pass.

### Task 5: Screenshot-rich report, visual inspection, and deployment

**Files:**
- Modify: `scripts/web-playwright.mjs`
- Modify: `scripts/generate-web-report.ts`
- Modify: `.github/workflows/pages.yml` only if build inputs change
- Update: GitHub issue `#8`

**Interfaces:**
- Consumes: Playwright interaction states from Task 4.
- Produces: initial, half-drag, canceled, completed long-drag, generated-level, and parity PNGs plus desktop/mobile MP4s and one standalone HTML report.

- [ ] **Step 1: Capture named PNG evidence** during the real Playwright flow, including a screenshot before pointer release and another after `pointercancel`.
- [ ] **Step 2: Extend report generation** to base64-embed every PNG with a caption and retain both videos and command/test evidence.
- [ ] **Step 3: Run `bun run report:web`** and expect one phone-openable report with all required media.
- [ ] **Step 4: Open every screenshot with the image viewer** and inspect fixed Checkpoint geometry, in-progress transform, restored cancellation, block clipping, generated layout, and parity.
- [ ] **Step 5: Run `bun run check` and the focused Playwright verification once**, then commit and push.
- [ ] **Step 6: Watch the Pages workflow**, verify the live page and script return HTTP 200, replace the release report asset, record evidence on issue `#8`, and close it.
