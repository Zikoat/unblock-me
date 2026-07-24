# Mission: Infinite World generation

## Why
Understand and shape a fast puzzle-generation algorithm that produces interesting finite levels now and can grow into a continuous Infinite World without requiring exhaustive search over an infinite state space.

## Success looks like
- Explain which exact block arrangements may safely collapse into one decision state.
- Design finite experiments that validate search optimizations before applying them to an Infinite World.
- Relate explicit generation settings and solver measurements to human level feedback.
- Choose a bounded generation contract that can extend the world while retaining solvability evidence.

## Constraints
- Search must remain fast in CPU time and memory as the visible world grows.
- Generation settings, sampled values, timings, board state, moves, feedback, and source provenance must be exportable.
- Human preference is the authority for whether a level is interesting; solver measurements are candidate predictors.
- The current TypeScript/Bun rules engine and browser game are the finite experimental platform.

## Out of scope
- Implementing the full Infinite World before its local generation and solvability contracts have been validated on finite regions.
