# Infinite World generation glossary

Terms already established through the finite-level and state-space discussion.

## Terms

**Exact state**:
The position of every block together with all other rule-relevant world data at one instant.

**Decision state**:
An equivalence class of exact states that have the same consequential movement choices; harmless translations inside the class are searched once.
_Avoid_: Simplified state

**Interaction region**:
The set of positions a block can occupy without changing consequential blocker relationships.
_Avoid_: Free space

**Event boundary**:
A position at which moving a block changes an interaction region or a blocker dependency and therefore creates another decision state.

**Blocker dependency**:
A directed relationship in which one block restricts the consequential reachable positions of another block.
_Avoid_: Blocker link

**Importance cone**:
The Red Block plus the transitive blocker dependencies that can affect its route to a Checkpoint.
