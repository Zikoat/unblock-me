# Terminal MVP design

## Purpose

Build the first playable Unblock Me milestone: one hard-coded finite puzzle that runs in a terminal, accepts an LLM-friendly command stream, enforces sliding-block rules, and ends with a clear win state. This milestone validates the game loop without implementing the Infinite World or human-oriented cursor controls.

## Chosen approach

Use a pure rules engine with a thin terminal adapter.

This keeps the board transitions deterministic and independently testable while leaving the CLI small. A single monolithic CLI would contain fewer files but couple rules to I/O. A generic multi-client command/event platform would support future adapters prematurely. The chosen boundary is the smallest structure that can be reused by a later web client without designing that client now.

## Scope

The MVP includes:

- TypeScript executed by Bun.
- One hard-coded, solvable 7×5 puzzle.
- Axis-locked rectangular blocks, Walls, a Red Block, and a Checkpoint.
- One-cell atomic moves.
- A long-running, line-oriented stdin/stdout interface.
- In-memory state only.
- Move counting, invalid-move feedback, and a terminal win state.
- Automated unit and integration tests.
- A tmux-driven end-to-end playthrough.
- One self-contained HTML verification report with an embedded human-speed MP4.

Cursor selection, raw keyboard controls, mouse, touch, web UI, persistence across runs, puzzle loading, generation, and every Infinite World mechanic remain deferred.

## Puzzle

The board is 7 cells wide and 5 cells high. The left 5×5 region is the puzzle area. The two rightmost cells on the Red Block's row form the horizontal 2×1 Checkpoint; the other added cells are Walls.

Initial state:

```text
. . . . . # #
. . A . . # #
R R A . B * *
. . . . B # #
. . . . . # #
```

`R` is the horizontal 2×1 Red Block. `A` and `B` are vertical 2×1 blocks. `#` is a Wall, `*` is an unoccupied Checkpoint cell, and `.` is empty.

One known seven-move solution is:

```text
A up
B down
R right
R right
R right
R right
R right
```

The Red Block wins only when both of its cells occupy the two Checkpoint cells. Partial overlap does not win.

## Architecture

- `src/game.ts` owns domain types and pure state transitions. Given a state and an action, it returns either the next state or a domain error without performing I/O.
- `src/puzzle.ts` defines the one initial puzzle and returns a fresh state.
- `src/render.ts` converts a state into the complete text frame and legend.
- `src/commands.ts` parses case-insensitive input into a move, `help`, or `quit` command.
- `src/cli.ts` owns readline, the in-memory current state, output ordering, and process termination.
- `src/index.ts` starts the CLI.

The rules engine has no dependency on terminal APIs. The CLI depends on the parser, renderer, and game engine; none depend on the CLI.

## Command and output contract

The project-local start command is intended to be:

```powershell
bun run start
```

Startup prints the title, syntax once, legend, initial board, `moves=0`, and `won=false`. A move is one line containing `<block-id> <direction>`, such as `A up`. IDs and directions are case-insensitive and surrounding whitespace is ignored.

After every valid move, the program prints the complete board followed by explicit move and win state. `help` repeats the syntax and legend. `quit` exits successfully. EOF also exits successfully. Restarting the command creates a fresh puzzle; no state file is read or written.

On full Checkpoint overlap, the final frame includes `won=true` and `YOU WIN`, then the process exits successfully.

## Error handling

Malformed input, an unknown block, a direction outside the block's axis, collisions with another block or Wall, and moves beyond the board each produce a specific one-line error. Failed actions leave state and move count unchanged, then reprint the current frame so an LLM never has to infer whether state changed.

Unexpected internal failures print a concise fatal error to stderr and produce a nonzero exit code. User mistakes are not fatal.

## Automated verification

Implementation follows test-first development with Bun's test runner.

Tests cover:

- initial puzzle validity and non-overlapping occupancy;
- legal movement on the fixed axis;
- rejection of the other axis, blocks, Walls, and bounds;
- unchanged state and move count after rejection;
- partway stopping through repeated one-cell moves;
- partial Checkpoint overlap remaining unwon;
- full Checkpoint overlap producing the Won state;
- case-insensitive command parsing and whitespace;
- `help`, `quit`, malformed input, and EOF;
- rendering the initial, intermediate, and won frames;
- a subprocess integration test that pipes the known solution into `bun run start` and asserts exit code zero and `YOU WIN`.

The repository exposes `bun run typecheck`, `bun test`, and a combined `bun run check` command. Production TypeScript has no runtime dependency beyond Bun.

## tmux verification

Ubuntu 24.04 under WSL provides tmux 3.4. Verification launches `bun run start` in a detached tmux session against the mounted repository, sends the seven solution commands with `tmux send-keys`, and captures timestamped panes throughout the interaction. Characters are entered 80 milliseconds apart, each submitted command is followed by a 700-millisecond reading pause, the initial board remains visible for one second, and the won frame remains visible for 1.5 seconds. The check asserts the initial frame, intermediate movement, final `won=true`, `YOU WIN`, and successful process termination.

The tmux workflow must run the actual production start script, not a test-only entry point or prototype.

## HTML verification report

Generate one self-contained `terminal-mvp-verification.html` outside Git history. It contains:

- the feature request and approved scope;
- the exact start command and working directory;
- architecture and puzzle summary;
- automated command outputs with pass/fail counts;
- independent verification steps and results;
- the tmux commands and captured terminal transcript;
- a human-speed MP4 showing the complete tmux-driven interaction;
- deployment and publication status;
- known limitations and deferred work;
- the Android opening procedure and a clearly marked status for the human phone check.

Report generation converts timestamped tmux pane captures into a terminal-style MP4 using a project-local ffmpeg binary, then base64-embeds the MP4 in a `<video controls>` element. Text reflows for a narrow phone viewport without horizontal page scrolling.

The finished report is uploaded as a single asset on a private GitHub Release. The user signs into GitHub on Android, downloads the HTML file, and opens it with Chrome or an HTML-capable viewer. The report may not claim Android verification until the user confirms that download, rendering, seeking, and playback work on the actual phone.

## Completion criteria

The milestone is complete only when:

1. `bun run start` launches the production game from the repository.
2. The known solution reaches `YOU WIN` interactively.
3. Type checking, all tests, the subprocess playthrough, and the tmux playthrough pass from a clean state.
4. The self-contained HTML report exists, its embedded video plays locally, and it is attached to the private release.
5. Start and report-opening instructions refer only to commands and artifacts that were freshly verified.
