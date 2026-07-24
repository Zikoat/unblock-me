# Decision State compression validation

Source commit: `efae70fa53ab7681d687b71cff4cd00c568adbbe`

The finite Exact State search is the correctness oracle. The candidate search retains complete positioned Blocks, derives each Block's Interaction Region and Blocker Dependencies, and expands Event Boundary moves without enumerating the Cartesian product of independent harmless translations.

| Case | Exact States | Exact Decision States | Candidate states | Reachability match | Spurious states |
|---|---:|---:|---:|---:|---:|
| independent-parallel | 16 | 1 | 1 | yes | 0 |
| checkpoint-event-boundary | 5 | 2 | 2 | yes | 0 |
| dependency-gate-counterexample | 6 | 4 | 6 | no | 2 |

## Result

The independent-parallel case confirms the intended memory collapse: 16 Exact States become one Decision State. Full Checkpoint occupancy remains a distinct Event Boundary.

The candidate is not yet a correct general search. The Dependency Gate case produces spurious reachable Decision States by combining Interaction Region positions that are individually reachable but not jointly compatible. Exact search rejected that over-approximation. Future compression must retain compatibility/order constraints or a witnessed compatible representative when composing Block regions.

The durable counterexample is in the adjacent JSON record with seed `1803`, source commit `efae70fa53ab7681d687b71cff4cd00c568adbbe`, complete initial geometry, and the spurious witness state.
