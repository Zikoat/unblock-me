# Terminal MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a tested Bun terminal puzzle whose Red Block reaches a Checkpoint, with a verified start command and self-contained HTML/video report.

**Architecture:** A pure game engine owns immutable state transitions; a thin parser, renderer, and readline CLI adapt it to one-line stdin/stdout commands. Verification drives the production command through both subprocess stdin and WSL tmux, then converts timestamped pane captures into an embedded MP4 report.

**Tech Stack:** Bun 1.3.12, TypeScript, Bun test, WSL Ubuntu 24.04, tmux 3.4, sharp, ffmpeg-static, GitHub CLI.

## Global Constraints

- The board is 7×5: a 5×5 puzzle area plus a two-cell right corridor.
- The 2×1 Red Block wins only by fully occupying the horizontal 2×1 Checkpoint.
- Every movable block has one fixed axis; one valid command moves one cell and increments the move count.
- The default interface is a long-running, line-oriented stdin/stdout process accepting `BLOCK DIRECTION`.
- State lives only for the process lifetime; the MVP writes no game-state persistence file.
- Invalid syntax or movement leaves state and move count unchanged and reprints the full frame.
- Production runtime code depends only on Bun; report libraries are development dependencies.
- Human cursor/keyboard, mouse, touch, web, generation, and Infinite World features are deferred.
- The final command must be verified from `C:\Users\sscho\Documents\Codex\2026-07-19\hi\unblock-me` as `bun run start`.

---

## File map

- `package.json`: start, test, typecheck, check, tmux verification, and report scripts.
- `tsconfig.json`: strict Bun TypeScript configuration.
- `.gitignore`: dependencies and generated evidence/report artifacts.
- `src/game.ts`: domain types, occupancy validation, legal move transition, and win detection.
- `src/puzzle.ts`: fresh hard-coded puzzle state.
- `src/commands.ts`: input command parser.
- `src/render.ts`: complete terminal frame rendering.
- `src/cli.ts`: readline loop over injected streams.
- `src/index.ts`: production entry point.
- `test/game.test.ts`: rule and win-state unit tests.
- `test/commands.test.ts`: parser unit tests.
- `test/render.test.ts`: frame unit tests.
- `test/cli.test.ts`: injected-stream and production subprocess tests.
- `test/report.test.ts`: generated report structure and embedded-video checks.
- `scripts/tmux-playthrough.ps1`: real production-command interaction and timestamped capture.
- `scripts/generate-report.ts`: capture rendering, MP4 encoding, and HTML assembly.
- `scripts/report-template.ts`: escaped responsive HTML template.
- `artifacts/`: ignored generated evidence, MP4, and HTML report.

---

### Task 1: Bun project and valid initial puzzle

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/game.ts`
- Create: `src/puzzle.ts`
- Test: `test/game.test.ts`

**Interfaces:**
- Produces: `Point`, `Axis`, `Direction`, `Block`, `GameState`, `blockCells(block)`, `validateState(state)`, and `createPuzzle()`.

- [ ] **Step 1: Add project configuration and the failing puzzle test**

`package.json` defines `start: bun src/index.ts`, `test: bun test`, `typecheck: tsc --noEmit`, and `check: bun run typecheck && bun test`. Add dev dependencies `@types/bun`, `typescript`, `sharp`, and `ffmpeg-static`. Configure strict TypeScript with `noEmit`, `module: Preserve`, and `moduleResolution: bundler`.

Write a test that imports `createPuzzle()` and expects width 7, height 5, no validation errors, Red Block cells `(0,2),(1,2)`, Checkpoint cells `(5,2),(6,2)`, and eight Walls in the added columns.

- [ ] **Step 2: Verify RED**

Run: `bun test test/game.test.ts`

Expected: FAIL because `src/puzzle.ts` does not exist.

- [ ] **Step 3: Implement the state types and puzzle**

Use these public shapes:

```ts
export type Axis = "horizontal" | "vertical";
export type Direction = "left" | "right" | "up" | "down";
export interface Point { x: number; y: number }
export interface Block { id: string; axis: Axis; length: number; x: number; y: number }
export interface GameState {
  width: number;
  height: number;
  blocks: readonly Block[];
  walls: readonly Point[];
  checkpoint: readonly Point[];
  moves: number;
  won: boolean;
}
export function blockCells(block: Block): Point[];
export function validateState(state: GameState): string[];
export function createPuzzle(): GameState;
```

The initial blocks are `R` horizontal at `(0,2)`, `A` vertical at `(2,1)`, and `B` vertical at `(4,2)`, all length 2.

- [ ] **Step 4: Verify GREEN**

Run: `bun test test/game.test.ts && bun run typecheck`

Expected: all current tests pass and type checking exits zero.

- [ ] **Step 5: Commit**

```powershell
git add package.json bun.lock tsconfig.json .gitignore src/game.ts src/puzzle.ts test/game.test.ts
git commit -m "feat: define terminal puzzle state"
```

---

### Task 2: Movement, rejection, and Checkpoint completion

**Files:**
- Modify: `src/game.ts`
- Test: `test/game.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Direction`, `blockCells`.
- Produces: `MoveAction`, `MoveErrorCode`, `MoveResult`, and `applyMove(state, action)`.

- [ ] **Step 1: Write failing movement tests**

Define expectations for `A up`, rejection of `A left`, a collision, a Wall, board bounds, unchanged object contents/move count on error, partial Checkpoint overlap at Red Block x=4, and Won at x=5. Test the seven-move solution `A up`, `B down`, then `R right` five times.

Use this API:

```ts
export interface MoveAction { blockId: string; direction: Direction }
export type MoveErrorCode = "unknown-block" | "wrong-axis" | "blocked" | "out-of-bounds" | "already-won";
export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; code: MoveErrorCode; message: string };
export function applyMove(state: GameState, action: MoveAction): MoveResult;
```

- [ ] **Step 2: Verify RED**

Run: `bun test test/game.test.ts`

Expected: FAIL because `applyMove` is not exported.

- [ ] **Step 3: Implement one-cell immutable transitions**

Find the selected block case-insensitively, verify direction axis, calculate the moved cells, reject bounds/Walls/other blocks, and replace only the moved block. Increment moves only on success. Set `won` only when every Red Block cell belongs to the Checkpoint set.

- [ ] **Step 4: Verify GREEN**

Run: `bun test test/game.test.ts && bun run typecheck`

Expected: all rule tests pass with zero type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/game.ts test/game.test.ts
git commit -m "feat: add sliding block rules"
```

---

### Task 3: Commands and complete frame rendering

**Files:**
- Create: `src/commands.ts`
- Create: `src/render.ts`
- Test: `test/commands.test.ts`
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Direction`, and domain error messages.
- Produces: `parseCommand(line)` and `renderFrame(state, notice?)`.

- [ ] **Step 1: Write failing parser and renderer tests**

Use these command shapes:

```ts
export type Command =
  | { type: "move"; blockId: string; direction: Direction }
  | { type: "help" }
  | { type: "quit" };
export type ParseResult =
  | { ok: true; command: Command }
  | { ok: false; message: string };
export function parseCommand(line: string): ParseResult;
export function renderFrame(state: GameState, notice?: string): string;
export const instructions: string;
```

Test whitespace/case, `help`, `quit`, missing/extra tokens, invalid directions, the exact initial grid, `moves=0 won=false`, legend, error notice, and the won frame containing `moves=7 won=true` plus `YOU WIN`.

- [ ] **Step 2: Verify RED**

Run: `bun test test/commands.test.ts test/render.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement parser and renderer**

Keep parsing free of I/O. Render `*` before blocks so `R` visibly replaces the Checkpoint as it overlaps. Always render the whole frame; notices appear above the board.

- [ ] **Step 4: Verify GREEN**

Run: `bun test test/commands.test.ts test/render.test.ts && bun run typecheck`

Expected: parser and rendering tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/commands.ts src/render.ts test/commands.test.ts test/render.test.ts
git commit -m "feat: add terminal command protocol"
```

---

### Task 4: Production CLI and verified start script

**Files:**
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `createPuzzle`, `applyMove`, `parseCommand`, `renderFrame`, and `instructions`.
- Produces: `runCli(input, output): Promise<number>` and the package `start` script.

- [ ] **Step 1: Write failing injected-stream and subprocess tests**

Use Node-compatible `Readable.from()` and a small `Writable` collector. Assert startup output, invalid-input state preservation, `help`, `quit`, EOF, and the known solution. Spawn `bun run start` from the repository, send the seven lines, and assert exit code 0, `moves=7 won=true`, and `YOU WIN`.

```ts
export async function runCli(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<number>;
```

- [ ] **Step 2: Verify RED**

Run: `bun test test/cli.test.ts`

Expected: FAIL because `src/cli.ts` and the start entry point are missing.

- [ ] **Step 3: Implement readline loop and production entry point**

Print title/instructions/initial frame once. For each line, parse; handle help/quit; apply moves; print error or success frame. Return zero for quit, EOF, or win. `src/index.ts` sets `process.exitCode = await runCli(process.stdin, process.stdout)` and catches unexpected failures to stderr with exit code 1.

- [ ] **Step 4: Verify GREEN and the exact user command**

Run:

```powershell
bun run check
@('A up','B down','R right','R right','R right','R right','R right') | bun run start
```

Expected: checks pass; production command prints `moves=7 won=true` and `YOU WIN`.

- [ ] **Step 5: Commit**

```powershell
git add src/cli.ts src/index.ts test/cli.test.ts
git commit -m "feat: add playable terminal loop"
```

---

### Task 5: tmux-driven production verification

**Files:**
- Create: `scripts/tmux-playthrough.ps1`
- Modify: `package.json`

**Interfaces:**
- Consumes: production `bun run start`, WSL Ubuntu-24.04, tmux 3.4.
- Produces: `artifacts/tmux/manifest.json`, timestamped pane text files, `transcript.txt`, and a nonzero exit on any failed assertion.

- [ ] **Step 1: Create a failing tmux verification script**

Before orchestration exists, add the `verify:tmux` package script and run it.

Run: `bun run verify:tmux`

Expected: FAIL because `scripts/tmux-playthrough.ps1` is missing.

- [ ] **Step 2: Implement tmux orchestration**

Resolve the repository and Windows Bun executable to WSL paths. Create an ignored temporary `bun` shim that invokes the same Windows Bun binary. Start a uniquely named detached session whose pane executes `bun run start` from the mounted repository and prints `__APP_EXIT__=<code>` afterward.

Capture the initial pane for one second. For each solution line, use `tmux send-keys -l` one character at a time, wait 80 milliseconds and capture after each character, press Enter, wait 700 milliseconds, and capture again. Hold/capture the won frame for 1.5 seconds. Write frame paths and durations to the manifest. Assert transcript markers for the initial state, moves 1–7, `won=true`, `YOU WIN`, and `__APP_EXIT__=0`. Kill only the uniquely named verification session in cleanup.

- [ ] **Step 3: Verify tmux GREEN**

Run: `bun run verify:tmux`

Expected: exit zero and summary containing `tmux 3.4`, `moves=7 won=true`, `YOU WIN`, and `__APP_EXIT__=0`.

- [ ] **Step 4: Re-run all checks**

Run: `bun run check && bun run verify:tmux`

Expected: all automated and tmux checks pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/tmux-playthrough.ps1
git commit -m "test: verify terminal game through tmux"
```

---

### Task 6: Embedded-video HTML verification report

**Files:**
- Create: `scripts/report-template.ts`
- Create: `scripts/generate-report.ts`
- Modify: `package.json`
- Test: `test/report.test.ts`

**Interfaces:**
- Consumes: tmux manifest/pane captures, test/typecheck output files, Git metadata, sharp, and ffmpeg-static.
- Produces: ignored `artifacts/terminal-mvp.mp4` and `artifacts/terminal-mvp-verification.html`.

- [ ] **Step 1: Write the failing report test**

The test runs the generator against a tiny fixture manifest and asserts that the resulting HTML has a responsive viewport, request/scope summary, exact start command, verification table, tmux transcript, deployment status, limitations, Android instructions, and `<video controls src="data:video/mp4;base64,...">`. Decode the data URI and assert the MP4 is nonempty.

- [ ] **Step 2: Verify RED**

Run: `bun test test/report.test.ts`

Expected: FAIL because the report generator does not exist.

- [ ] **Step 3: Implement capture rendering and MP4 encoding**

Escape each captured pane into an SVG using a monospace font, render PNGs with sharp, and write an ffmpeg concat manifest with the recorded durations. Invoke the path exported by ffmpeg-static to encode H.264 with `yuv420p`. Base64-embed the MP4 and escaped evidence into a narrow-screen responsive HTML template. The generator accepts fixture paths for tests and real `artifacts/tmux/manifest.json` for production.

- [ ] **Step 4: Generate fresh evidence and the final report**

Capture command outputs to ignored text files, then run:

```powershell
bun run typecheck *> artifacts/typecheck.txt
bun test *> artifacts/tests.txt
bun run verify:tmux *> artifacts/tmux-verification.txt
bun run report
```

Expected: report generator prints the absolute HTML path, embedded video byte count, test summary, and tmux success.

- [ ] **Step 5: Verify report GREEN**

Run: `bun test test/report.test.ts && bun run check`

Open the report locally and assert the video metadata loads, duration is greater than five seconds, controls are present, and the page has no horizontal overflow at a 412-pixel viewport. The Android phone step remains explicitly marked `Pending human verification` until the user confirms it.

- [ ] **Step 6: Commit report tooling**

```powershell
git add package.json bun.lock scripts/report-template.ts scripts/generate-report.ts test/report.test.ts .gitignore
git commit -m "feat: generate terminal MVP verification report"
```

---

### Task 7: Final review, publication, and handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-20-terminal-mvp.md`

**Interfaces:**
- Consumes: all production code, tests, tmux evidence, report, GitHub issue/map, and authenticated Git remote.
- Produces: verified instructions, pushed branch, and private GitHub Release asset.

- [x] **Step 1: Add only verified usage instructions**

Document:

```powershell
cd C:\Users\sscho\Documents\Codex\2026-07-19\hi\unblock-me
bun install
bun run start
```

Also document `bun run check`, `bun run verify:tmux`, and `bun run report` after each has passed.

- [ ] **Step 2: Run the full completion gate from a clean state**

Run `bun install --frozen-lockfile`, `bun run check`, the known stdin solution, `bun run verify:tmux`, `bun run report`, `git diff --check`, and `git status --short`. Read every output before making a completion claim.

- [ ] **Step 3: Request code review and address findings**

Use the required requesting-code-review workflow against the design and plan. Re-run the full completion gate after any change.

- [x] **Step 4: Commit the handoff**

```powershell
git add README.md docs/superpowers/plans/2026-07-20-terminal-mvp.md
git commit -m "docs: add verified terminal MVP instructions"
```

- [ ] **Step 5: Push and publish**

Push `codex/terminal-mvp`. Create a private-repository release/tag for the terminal MVP and upload `artifacts/terminal-mvp-verification.html` as a single asset without adding it to Git history. Verify the release asset is visible to the authenticated account.

- [ ] **Step 6: Resolve tracking and hand off**

Record verification results and links on the relevant GitHub issue, update the Wayfinder map with the implementation milestone status without promoting deferred scope, and give the user the freshly verified start command plus private release/report link. Ask the user to perform and report the Android download/open/video check.
