# Multi-cell drag and generated-level design

## Scope

Refine the finite terminal and web clients while keeping one shared TypeScript rules engine. This milestone fixes the shifting Checkpoint, adds multi-cell movement, expands block geometry, generates varied solvable finite levels, and strengthens visual evidence. Infinite World generation remains deferred.

## Shared game model

A block has a rectangular `width` and `height` plus a movement capability: horizontal, vertical, or both. Non-square bars remain locked to their declared axis. Square blocks, including 1×1 and 2×2 blocks, may move on both axes. The Red Block and Checkpoint remain horizontal 2×1.

The engine retains a one-cell atomic transition as its primitive. A shared multi-step operation repeatedly applies that transition until it reaches the requested count or encounters a collision or boundary. It returns the final state and the number of cells traversed. Move count continues to count cells, preserving the first MVP rule.

Both terminal and browser clients import this engine. Neither client owns collision, win, or block-movement rules.

## Terminal interface

The command syntax is `BLOCK DIRECTION [N]`. The step count is an optional positive integer; omission means one cell. For example, `R right 4` attempts four atomic right moves. If an obstruction permits only part of the request, the block stops at the furthest legal cell and the terminal reports the traversed and requested counts. A request that cannot move even one cell returns the existing specific engine error.

## Web rendering and drag behavior

Every background cell receives explicit CSS Grid row and column coordinates. Blocks render separately at explicit coordinates, so moving a block cannot influence Checkpoint, Wall, or empty-cell placement. This addresses the reproduced root cause: auto-positioned background cells were being reflowed around explicitly positioned block items.

On pointer down, the browser records the engine state and captures the pointer. During pointer movement, it converts displacement to a cell offset, restricts bars to their axis, and probes repeated engine moves without committing state. The block follows the pointer with a CSS transform and clamps at the furthest legal cell. For square blocks, the dominant drag axis determines movement for that drag.

Pointer release commits the previewed atomic moves and renders the resulting state. Pointer cancellation clears the preview and restores the original position and state. A short CSS settling transition may align the preview to its final cell, but it will be removed if visual inspection shows ambiguity or lag.

## Generated finite levels

Generation is deterministic for a seed. Board width varies from 6–10 cells and height from 5–8 cells. The generator randomizes the horizontal 2×1 Checkpoint position, Wall cells, and a size-scaled collection of horizontal bars, vertical bars, and square blocks.

The generator constructs a valid solved arrangement first. It reserves room for the Red Block to leave the Checkpoint, places non-overlapping Walls and blocks, then performs legal reverse scrambling while preventing premature terminal states. The retained reverse path is followed by the final move back onto the Checkpoint, forming a proof solution. Candidates that cannot produce a meaningful scramble are discarded and retried deterministically.

Generated states must pass structural validation, start unwon, differ across representative seeds, and reach `won=true` when their proof solution is replayed.

## Parity and verification

An occupancy projection converts any engine state into a coordinate matrix. The terminal renderer and browser DOM are checked against this same matrix, proving that they display the same Walls, Checkpoint cells, and block cells even though their visual styles differ.

Playwright verifies desktop mouse and emulated mobile touch behavior:

- Checkpoint cell bounding boxes remain fixed across movement.
- One drag moves a block multiple legal cells and increments the move count per cell.
- A half-drag screenshot shows an in-progress transformed block while engine state is unchanged.
- A pointer-cancel screenshot shows the block restored and engine state unchanged.
- A generated board varies in dimensions and contents and has a replayable proof solution.
- Terminal and browser occupancy projections match for fixed and generated states.

The phone-openable HTML report embeds desktop and mobile videos plus screenshots of the initial board, in-progress half drag, canceled drag, completed multi-cell drag, generated board, and terminal/web parity. The screenshots are visually inspected before publication for fixed background geometry, legible blocks, clipping, and correct drag states.

## Error handling

Invalid terminal step counts produce parser errors without changing state. Web drags that have no legal displacement restore the block without incrementing moves. Pointer cancellation and loss of capture never commit a preview. Generator exhaustion returns a specific error rather than publishing an unproven level.

## Out of scope

This milestone does not add persistence, accounts, a general puzzle editor, arbitrary Red Block orientation, or Infinite World generation.
