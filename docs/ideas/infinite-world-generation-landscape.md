# Infinite World generation landscape

This document preserves candidate mechanics, generation techniques, and unresolved questions without promoting them into approved implementation scope.

## Established observations

- Exact positions remain part of the World model, while harmless translations inside one Interaction Region should collapse into one Decision State.
- The generated/committed shape may be jagged. A Generation Request fills only content that has not already been generated.
- A Block may be generated outside the active camera when an already generated Block has a Blocker Dependency on it.
- Generation and visibility are separate. A generation area may extend beyond the viewport so work can finish before cells come into view.
- A Generation Site is the temporary location targeted by one request. A Generated Region is the durable, possibly irregular content created in response; they are not the same.
- Current movement is reversible when existing cells and mechanics do not change. Irreversible mechanics would require new reasoning.
- Concealment is not required for the first experiments. Generation may happen beyond the Viewport, but committed content can be visible whenever the camera reaches it.
- The first stopping experiment should attempt Dependency closure, with a sampled hard size cap and immovable separators preventing runaway generation.
- One Red Block and one Dependency Gate are a useful starting prototype, not a permanent restriction on the Infinite World.
- A Generation Request may target space where current play cannot extend. A later experiment may start an independent puzzle region there with another colored Objective Block and Checkpoint.

## Candidate World lifecycle

These states are not yet accepted domain language:

1. **Ungenerated** — no content has been chosen.
2. **Generated but concealed** — content is committed in the background but hidden and non-interactive.
3. **Visible but naturally dormant** — content is visible, but its Blocks cannot move because existing Blocker Dependencies constrain them.
4. **Active** — content is visible and its Blocks can participate in play.

An artificial “visible but disabled” state may be unnecessary if natural Blocker Dependencies can make a region dormant.

Possible reveal triggers include reaching a Checkpoint, moving a nearby Block, destroying a nearby Block, or entering a camera-adjacent reveal threshold. These are separate from Generation Requests.

## Candidate ways to bound one generation request

### Sampled size budget

Sample a target region size from explicit generation settings and stop when the budget is reached. This is easy to measure but may cut through unresolved Blocker Dependencies.

### Immovable separators

Place immovable Blocks or Walls strategically so Blocks inside one Generated Region cannot interact with Blocks beyond its intended boundary. A complete flood-fill enclosure is unnecessary when a few separators eliminate all cross-boundary movement.

### Dependency closure

Continue generating Blocks while existing Blocks depend on ungenerated content. Stop when every open Blocker Dependency terminates at already committed geometry, an immovable object, or another explicit terminal condition.

### Dependency Gate

Generate a new region whose consequential movement is blocked by one existing Block. The new region depends on the existing Block, while the existing Block does not depend on the new region. Moving or destroying that Block activates the new region.

The gate can be visually distinguished so the player can understand which action opens new play. The exact canonical term and whether visual distinction is always desirable remain unresolved.

### Empty separation

Leave enough empty space that two regions cannot currently interact. This is simple but may create uninteresting travel and may cease to separate regions when long movement is possible.

## Candidate high-level progression structures

### One Red Block with expanding dependencies

Retain one Red Block and add new regions that eventually affect its route through successive Checkpoints.

### Multiple Objective Blocks

Introduce multiple colored Blocks with matching Checkpoints. Each region may be important primarily to its own Objective Block while still interacting with older regions.

This would require replacing “the Red Block” as the general domain term. “Objective Block” is a candidate, not yet accepted language.

### Independent puzzle regions

Use immovable separators so each region has its own Objective Block and dependency graph. A neighboring region may remain concealed or dormant until progress elsewhere.

### Destruction-driven progression

Reward destroying Blocks, possibly making destruction of every Block a long-term objective. Destroying a key Block can irreversibly activate a dormant region.

## Candidate destructive mechanics

### Destroyer

A fixed area destroys a Block when at least one cell crosses an active destroying boundary. Unlike a Checkpoint, complete overlap would not be required.

### Destructive Edge

Each side of a Destroyer may independently be destructive or inert. Direction therefore matters.

### Movable Destroyer

A Block may also act as a Destroyer. It may have independently configured Destructive Edges and horizontal, vertical, both-axis, or immovable movement.

The informal nickname “war rig” is preserved only as inspiration; “Movable Destroyer” is the current candidate domain term.

Combining Movable Destroyers with colored/Objective Blocks and Checkpoints is mechanically possible but substantially enlarges generation and solvability analysis.

## Generation settings to expose

Every applicable setting should retain its distribution definition and sampled value.

- Viewport-independent generation horizon
- Generated Region cell/area budget
- Board or local-region width and height
- Total Block count and occupied-cell density
- Block-size distribution and maximum Block size
- Shape distribution
- Movement-capability weights: horizontal, vertical, both-axis, immovable
- Wall and immovable-Block density, spacing, and clustering
- Checkpoint count, shape, size, placement, and reveal effect
- Dependency Gate count and placement
- Desired dependency depth and branching
- Concealed/dormant/active region proportions
- Reveal-trigger weights
- Destroyer and Destructive Edge distributions
- Scramble/generation tactic and effort
- Candidate count and solver/search budgets
- Target difficulty/interest measurement ranges

Generation evidence should include sampled settings, seed, complete generated geometry, attempts, total duration, phase timings, solver/search counts, proof or witness data when present, feedback, and source commit.

## Suggested implementation order

1. **Approved interaction instrumentation** — comfortable square cells, pan/zoom, persistence, feedback, export, and screenshot/video evidence.
2. **Shared camera and palette** — add terminal `move DIRECTION [N]` camera panning over a fixed viewport and use the same deterministic Block colors in terminal and web.
3. **Explicit finite generator configuration** — distribution-backed settings and complete sampled-value/timing export without changing the fundamental generator.
4. **Finite exact-search oracle** — measure Exact States, Decision State candidates, solution paths, and counterexamples to state collapsing.
5. **40×40 multi-request experiment** — keep a finite board, initially request one corner, retain unrequested Generation Sites, and request more sites after commits or moves.
6. **Bounded Generated Region prototype** — attempt dependency closure, stop at a sampled hard cap, and use immovable separators to close remaining dependencies.
7. **Dependency Gate prototype** — generate one naturally dormant region behind one existing Block and measure whether the dependency is genuinely one-way.
8. **Unbounded-canvas/finite-play experiment** — allow unlimited camera coordinates while surrounding the approximately 40×40 playable area with immovable Blocks.
9. **Multiple Objective Block experiment** — allow a Generation Request outside current play to start a separate colored Objective Block and Checkpoint region.
10. **Static destruction experiment** — introduce irreversible mechanics with explicit history/recovery semantics.
11. **Movable Destroyer experiment** — defer until static destruction can be generated and solved reliably.
12. **Infinite World composition** — combine only the locally validated region lifecycle, dependency, and progression contracts.

## Shared terminal and web presentation

- The terminal needs a camera independent of Block movement. Candidate syntax: `move right 5`.
- The terminal renders a fixed-size local viewport, initially somewhere between 10×10 and 20×20 cells; zoom is unnecessary.
- Each Block receives a deterministic muted color shared by terminal and web, with its letter shown in the foreground.
- The Red Block retains a bright red treatment.
- The same world state and camera coordinates should produce comparable terminal and web views.

## Unresolved decisions

- Whether committed content may be concealed, visible-but-disabled, or only naturally dormant through Blocker Dependencies.
- Which events create Generation Requests and which events reveal already generated content.
- What consequential property every Generated Region must add.
- Which stopping rule is primary: size budget, immovable separators, dependency closure, or a combination.
- Whether the first region prototype remains centered on one Red Block or introduces multiple Objective Blocks.
- Whether Checkpoints reveal content, score progress, terminate only finite levels, or combine these roles.
- Whether a Dependency Gate is moved, destroyed, or either.
- Which destructive contact semantics apply when both the mover and target have Destructive Edges.
- Which solver measurements predict human interest well enough to guide generation.
- Whether the first terminal viewport is 10×10, 20×20, or configurable.
- Whether the canonical terminal camera command is `move`, `pan`, or `camera`.
