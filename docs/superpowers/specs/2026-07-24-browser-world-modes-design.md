# Browser World Modes Design

Issue: [#12](https://github.com/Zikoat/unblock-me/issues/12)

## Scope

The main browser app has three switchable modes:

- **Play** retains the current finite sliding puzzle.
- **World** uses the accepted 40×40 Committed World and renders only its 10×10
  Viewport. Empty-space drag pans the camera and requests every missing cell in
  the resulting Viewport. A request may create a disconnected Generated Region.
- **Closure** exposes the natural, runaway, and separator Dependency-closure
  scenarios with `step`, `run`, and explicit stop reasons.

The two browser experiments and the terminal commands consume the same pure
state modules. They do not maintain second implementations of generation.

## Interaction

Pointer origin owns the drag:

- A drag starting on a movable Play Block moves that Block.
- A drag starting on an empty World cell pans the camera.
- A drag starting on a World Block does nothing because the accepted prototype
  has not assigned movement rules to those Blocks.

This direct rule is implemented first. A separate drag-state prototype is
created only if human play shows the interaction feels wrong.

## Rendering and evidence

World and Closure render only a 10×10 Viewport using square cells. Complete
world coordinates remain in state and are exposed as DOM data attributes.
Multi-cell Blocks repeat their ID in every occupied cell, matching the
ANSI-independent terminal representation. Both terminal and browser use the
same deterministic palette.

Playwright verifies mode switching, mouse/touch World panning, and all three
Closure outcomes. The issue report embeds phone and desktop screenshots plus a
short interaction video.
