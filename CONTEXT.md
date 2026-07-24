# Unblock Me

A sliding-block puzzle whose long-term destination is continued play through an Infinite World.

## Language

**Red Block**:
The distinguished horizontal block whose progress defines success. It reaches a Checkpoint only by fully occupying all of the Checkpoint's cells.
_Avoid_: Goal block, target block

**Checkpoint**:
A marked 2×1 area that the Red Block can fully occupy. Reaching it ends a finite puzzle, while a future Infinite World may use it as a nonterminal progress marker.
_Avoid_: Destination area, goal zone, Exit

**Wall**:
An impassable cell that no block can occupy.
_Avoid_: Impassable block

**Infinite World**:
The ultimate play space: an unbounded world that reveals generated puzzle space as play advances.
_Avoid_: Infinite board, endless level

**Exact State**:
The position of every block together with all other rule-relevant World data at one instant.

**Decision State**:
An equivalence class of Exact States that have the same consequential movement choices. Harmless translations inside the class are searched once.
_Avoid_: Simplified state

**Interaction Region**:
The set of positions a Block can occupy without changing consequential Blocker Dependencies.
_Avoid_: Free space

**Event Boundary**:
A position at which moving a Block changes an Interaction Region or Blocker Dependency and therefore creates another Decision State.

**Blocker Dependency**:
A directed relationship in which one Block restricts the consequential reachable positions of another Block.
_Avoid_: Blocker link

**Committed World**:
The cells and complete Blocks whose generated contents have been accepted as fixed, whether visible or concealed.

**Generation Boundary**:
The jagged boundary between the Committed World and cells whose contents have not been generated.
_Avoid_: Edge, frontier, Reveal Boundary

**Viewport**:
The part of the World currently visible through the camera.

**Generation Horizon**:
The area around and beyond the Viewport in which background generation may be requested before content becomes visible.

**Generation Site**:
A bounded location at the Generation Boundary targeted by one Generation Request, often near a Block whose possible movement could be affected by ungenerated cells.
_Avoid_: Reveal Site

**Generation Request**:
A request to propose the missing World content at a Generation Site.
_Avoid_: Reveal Request

**Generated Region**:
A bounded, possibly irregular set of new cells and complete Blocks proposed in response to a Generation Request. It may extend beyond both its Generation Site and the Viewport.

**Generation Invariant**:
A condition a Generated Region must satisfy before it is added to the Revealed World. The required invariants are not yet specified.
_Avoid_: Promise, certificate
