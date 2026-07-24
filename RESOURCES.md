# Infinite World generation resources

## Knowledge

- [Hearn & Demaine: “PSPACE-Completeness of Sliding-Block Puzzles”](https://arxiv.org/abs/cs/0205005)
  Establishes why unrestricted global sliding-block search cannot be the scaling strategy.
- [Junghanns & Schaeffer: “Sokoban: Improving the Search with Relevance Cuts”](https://doi.org/10.1016/S0304-3975(00)00080-3)
  Primary reference for pruning moves according to their influence on relevant recent moves.
- [Helmert: “A Planning Heuristic Based on Causal Graph Analysis”](https://cdn.aaai.org/ICAPS/2004/ICAPS04-021.pdf)
  Primary reference for representing directed dependencies and deriving search guidance from them.
- [Gnad et al.: “Symmetry Breaking in Star-Topology Decoupled Search”](https://doi.org/10.1609/icaps.v27i1.13810)
  Relevant example of avoiding multiplication across independent state components.
- [Spierewka, Szrajber & Szajerman: “Procedural Level Generation with Difficulty Level Estimation for Puzzle Games”](https://www.iccs-meeting.org/archive/iccs2021/papers/127460103.pdf)
  Solver-measured puzzle generation with multiple difficulty metrics and generation settings.
- [Shyne, Facey & Cooper: “Procedurally Puzzling”](https://doi.org/10.1609/aiide.v20i1.31873)
  Tests the relationship between algorithmic difficulty measurements and subjective player experience.
- [Shu, Liu & Yannakakis: “Experience-Driven PCG via Reinforcement Learning”](https://arxiv.org/abs/2106.15877)
  Example of generating endless, playable segments while optimizing explicit experience measurements.

## Wisdom (Communities)

No community participation preference has been established. Human play feedback collected by this project is currently the primary source of experiential judgment.

## Gaps

- A proof that the proposed interaction-region equivalence preserves reachability for this exact ruleset.
- Evidence connecting this game’s dependency measurements to human interest rather than only solver cost.
- A validated local solvability contract for committing new Infinite World regions.
