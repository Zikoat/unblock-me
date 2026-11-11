# Verification of the two AI texts

Checked 2026-11-11 against the downloaded papers (cleaned text in `research/cleaned/<slug>/<slug>.md`, PDFs in `research/raw/papers/`). The two texts, both by the same other AI (ChatGPT), not peer reviewed:

- **chat** = [`ai-chat-state-space-and-difficulty.txt`](ai-chat-state-space-and-difficulty.txt) (4 answers; cited as chat A1–A4 with the answer's own section number, e.g. "chat A3 §5").
- **notes** = [`ai-research-notes.md`](ai-research-notes.md) (cleaned copy of `raw/notes/research-and-design-notes-2026-11-11.md`; cited as "notes §6.1", bibliography as "notes bib N").

Verdicts: **correct** · **overstated** (true core, claim goes further than the source) · **wrong** · **unverifiable** (no source in hand). Locations point to sections, tables and figures of the cleaned files.

## The short version

Biggest problems:

1. **Jarušek & Pelánek 2011** is used (chat A3 opening) to say state-space structure explains Rush Hour difficulty that solution length can't. For Rush Hour the paper finds the opposite: shortest path already predicts solving time well (Pearson 0.77, Spearman 0.90) and their simulated-player model adds nothing (0.75/0.90). The chat corrects itself later (A3 §3), the opening line is still wrong for Rush Hour.
2. **Collette et al. 2006**: "hardest configuration required 93 moves" (chat A3 §2). It is 93 **single-square steps**; in the usual one-slide-one-move metric the hardest 6×6 needs 51 moves (Fogleman's full enumeration). The ScienceDirect identifier the notes give (`S0304397506002376`) does not resolve to any article; the paper only exists as CG 2006, LNCS 4630 (2007), pp. 220–233.
3. **del Solar-Zavala et al. 2026** is called a "July 2026 preprint" with "preliminary findings". It is a peer-reviewed IEEE Access article (vol. 14, pp. 134148–134164, published 28 Aug 2026), and the authors themselves call the 0.72 Spearman an optimistic upper bound driven by sample size.
4. **Strong stubborn sets pseudocode** (chat A2 §1): "add every **enabled** action that interferes with a" is wrong under both published definitions. Alkhazraji et al. 2012 require *all* dependent operators; Wehrle & Helmert 2014 require all operators interfering in *any state on a strongly optimal plan*, not only those enabled now. The notes' version ("add actions that interfere with a") is right.
5. **Kristensen & Burelli 2024**: "models that combined player/cohort data with simulated agent statistics performed better" (chat A3 §10). One game (Lily's Garden); agent data helped only for cold-start and cohort predictions; for per-player predictions on levels with history it did not help and made the best model worse.
6. **Bennati et al. 2014**: the chat's chart label "Optimal among correct (%)" is wrong; the 31.3 % / 77.0 % are optimal solutions as a share of **all** trials.
7. **Trenquelleon et al. 2023**: the stated 87.5 % accuracy doesn't match their own confusion matrix (diagonal 85.3 %), and the classifier never predicts classes 3–5 (Hard / Very Hard), so it does not separate hard levels at all.
8. **Bento et al. 2019**: "harder for a specialized solver than human-designed" holds only for an aggregate that keeps the best of 20 runs per maze (16.4 vs 18 of 90 solved); single runs solve more than the human set (best single variant 19.5).
9. **Kartal et al. 2016**: feature *weights* were set by hand (10, 5, 1), not learned; the validation study had 6 participants on 20 levels.
10. **Sturtevant 2013** is a workshop paper and says explicitly it does not do automatic content generation; the chat files it under "generating puzzles by searching backward".

The AI's own ideas presented as if established or as the natural next step (none has been tested anywhere): critical-position / interval abstraction and event-based actions for unbounded boards; dependency-complexity features and $C(P)$; decision information $I(s)$ for clearance choices; "goal dependency analysis + SSS" as a solver architecture; causal-plan-first generation; cluster-level search as a generation unit. The math the AI uses (regret identity, binomial count, sweep test, A\* bounds, PDB max/sum) is correct; details below.

## 1. Rush Hour, difficulty and generation papers

### jarusek2011 — What Determines Difficulty of Transport Puzzles? (FLAIRS-24, 2011)

- **Chat A3 opening**: "They found that state-space structure explains difficulty differences that static measures such as state-space size and optimal solution length cannot adequately capture." **Overstated for Rush Hour.** The abstract says this in general, but Table 2 (section "Evaluation and Discussion") gives Rush Hour: shortest path Pearson 0.77 / Spearman 0.90; model ($B=25$) 0.75 / 0.90. The authors: "For Rush hour the shortest path metric provides a good explanation of problem difficulty, in this case the computational model metric does not bring any improvement." The model helps for Sokoban and especially the Replacement puzzle (shortest path 0.28/0.21 there). Data: 45 Rush Hour instances, 6×6, state spaces 600–80 000 states.
- **Chat A3 §3** ("for their particular Rush Hour dataset, shortest-path length was already a strong predictor ... 0.77; 0.90 ... did not improve") and **notes §6** ("optimal path length is still a strong baseline for Rush Hour"): **correct.**
- **Chat A3 §3**: "combines random exploration with a preference for optimal moves ... mean number of steps to reach the goal". **Correct**, but the model is not the chat's softmax $\pi_\beta\propto\exp(-\beta d^*)$: it picks successor $s'$ with probability proportional to $d(s)$, plus a bonus $B$ if $d(s')<d(s)$ (section "Computational Model of Human Behaviour", "Basic Model"), so it gets less random near the goal.
- Notes bib 1 ("Rush Hour, Sokoban and Replacement puzzles"): **correct.**
- Not mentioned by the AI but relevant to its $C_{\text{counter}}$ idea: they also tried "number of counterintuitive moves" (Carder et al. 2008) and report it works about as well as shortest path.
- Two copies exist and are identical in text (checked word by word): the AAAI proceedings PDF we keep (`raw/papers/jarusek2011-...pdf`, with page numbers 428–433) and the author's `flairs-transport.pdf`.

### collette2006 — On the Symbolic Computation of the Hardest Configurations of the Rush Hour Game (CG 2006)

- **Chat A3 §2**: "BDDs and symbolic backward exploration to analyze roughly 36 billion configurations ... Their hardest configuration required 93 moves." **36 billion correct** ($3.6\cdot10^{10}$ valid configurations, $2.98\cdot10^{10}$ solvable, abstract and §6). **93 is misleading**: the transition relation moves one car one square (§5, proposition 12), so 93 is single-square **steps** (Fig. 1c "hardest (93 steps)"). In the one-slide metric the hardest 6×6 without walls needs **51 moves** (Fogleman's full enumeration, `raw/web/fogleman-rush/page.md`, "Hardest Puzzles"; Fogleman also notes the step/move difference).
- **Chat A3 §2**: "an established approach for generating Rush Hour puzzles". **Overstated**: it computes the hardest configurations and classifies every configuration by optimal length (retrograde analysis, §2.1); there is no generator, though the "non-dominated configurations" filter (Table 3) is a selection idea.
- **Notes §5** ("Symbolic backward analysis with BDDs has previously been applied to hardest Rush Hour configurations"): **correct.** Worth knowing: §2.2 already partitions the space by the per-row/per-column vehicle pattern, which is an invariant of moves — the same idea as del Solar's "clusters".
- **Notes bib 8** link `sciencedirect.com/.../pii/S0304397506002376`: **wrong identifier.** Elsevier's PII resolver answers "Article Not Recognized", Crossref has no work with that PII, and Crossref lists no Rush Hour paper by these authors in *Theoretical Computer Science*. The only publication is Computers and Games 2006, LNCS 4630, Springer 2007, pp. 220–233, DOI 10.1007/978-3-540-75538-8_20. Our copy (`collette2006-...pdf`, from paperzz) is that paper.

### olieslagers2026 — A Computational Model of Backward Reasoning in Human Problem Solving (Computational Brain & Behavior, 2026)

- **Chat A3 §4**: "published 25 September 2026 ... Rush Hour and Tower of London ... roughly 80–90% of participants' moves were classified as sensible ... players tended to prefer actions that required shorter chains". **Correct** (front matter; Results, "Sensible Actions in AND-OR Trees", Fig. 5A: "between 80% and 90% of people's actions"; depth preference is built into the model, leaf probability $\propto(1-\gamma)^{\text{depth}}$, and RT grows with depth). Rush Hour data: 42 MTurk participants, 70 puzzles; Tower of London: 469 participants.
- **Notes §6.4** ("models Rush Hour decisions using AND/OR trees and releases behavioral data and code"): **correct** (code `raw/code/rush_hour`, data `raw/data/osf-23vrb`).
- What the AI leaves out: the tree is an AND-OR tree with **cycles cut** ("cycle nodes", section "AND-OR Trees in Rush Hour"), and the model predicts the **next move** a person makes; it gives no per-puzzle difficulty score. Puzzle difficulty in the paper is just optimal length. The AI's "dependency cycles" difficulty feature (chat A3 §4, notes §6.4) is its own idea, not from this paper.

### bennati2014 — Gestalt Effects in Planning: Rush-Hour as an Example (CogSci 2014)

- **Chat A4 §4**: "eye-tracking study with 30 participants ... Players could still find solutions, but were considerably less likely to find optimal ones". **Correct** (Methods; Table 1: with cluster 85.4 % correct, 31.3 % optimal; without 80.6 % correct, 77.0 % optimal).
- **Chat A4 §4** chart legend "Optimal among correct (%)": **wrong.** The "Optimal" column is a share of all trials (77.0 ≤ 80.6; the text says "almost every correct solution is the optimal solution" for no-cluster boards). Among correct solutions, cluster boards are about 37 % optimal (31.3/85.4), not 31.3 %.
- "People treat visually grouped pieces as one object": **correct** as the authors' interpretation (Introduction, definition of "distracting cluster").

### trenquelleon2023 — Procedural Generation of Rush Hour Levels (CG 2022, LNCS 2023, pp. 181–190)

- **Chat A4 §1**: blocker-closure heuristic, greedy best-first search beating BFS, 6×6 and 7×7, "87.5% classification accuracy ... difficulty defined by optimal solution length". Heuristic, venue, boards and the difficulty definition: **correct** (§3, Algorithm 1; §4.3). GBFS beats BFS only on solvable levels; on unsolvable ones both explore the whole graph (§3).
- **87.5 %: overstated.** It is the number in the text (§4.3), but the confusion matrix (Fig. 7) has diagonal 85.3 % and no level is ever predicted as class 3 or higher, so Hard / Very Hard are never recognised. The classifier is no use for picking hard levels.
- Note: the blocker-closure count is a greedy-search score, not an admissible heuristic (transitively added cars need not move). For a lower bound see Hauptman's BlockersLowerBound (§3.3.1).

### delsolar2026 — Using Effective State Representations and Search to Identify Interesting Safari Rush Hour Puzzle Instances (IEEE Access, 2026)

- **Chat A4 §2**: "July 2026 · Preprint ... preliminary findings from a preprint". **Wrong**: IEEE Access vol. 14, pp. 134148–134164, published 28 Aug 2026, DOI 10.1109/ACCESS.2026.3728357, CC BY 4.0. Notes bib 5 rightly says to check the final version.
- Numbers: 331,552 clusters sampled, 7,516 legal with a solution, longest solution 131 moves, Spearman 0.72 between cluster size and the cluster's longest solution. **All correct** (§V.A–B, Figs. 8–9).
- What the AI leaves out: the authors say these correlations "seem to be driven by the sample size" and treat 0.72 as "an optimistic upper bound" (§V.B). Difficulty is optimal move count only; no human data.
- **Chat A4 §2 / notes §9.5**: clusters "need not all be mutually reachable or equally difficult ... not automatically an exact quotient". **Correct**, with a nuance: a cluster (per-row/column arrangement type) is closed under moves, i.e. an exact union of connected components, not an arbitrary grouping (§III.A, §IV.B; 62.78 % of boards are in each cluster's largest component). Same invariant as Collette §2.2.

### schaa2026 — Modeling Puzzle Difficulty via A\* Search Behavior, Solution Paths, and Spatial Metrics (preprint, 2026)

- **Chat A4 §3**: "Schaa, Quiroz & Barriga · July 2026 · Preprint"; Sokoban, Safari Rush Hour, Asteroid Escape. Preprint and games **correct**; the date is **unverifiable** (the PDF has no date).
- "lower effective branching factors correlated with greater perceived difficulty, while greater total search effort generally correlated positively": **correct** (§4.1, Fig. 2).
- "For Safari Rush Hour, search-effort and solution-path metrics ... roughly Spearman 0.4–0.65": **correct for those metrics**, but it omits that the strongest predictor was plain solution length ("Movements", $\rho\approx0.96$ on the ThinkFun set, §4.1). That repeats the Jarušek lesson: length first.
- "They also combine human judgments with designer-assigned difficulty ratings": **wrong in effect.** The datasets (two user-rated, one designer-labelled per game) are analysed **separately**, not combined (§3.1 Table 1, §4.1). The Safari Rush Hour sets are small (47 and 42 boards).
- Notes bib 6 "explores search and structural predictors across puzzle families including Safari Rush Hour": **overstated**; structural/spatial metrics were only computed for Sokoban (§5.2).

### hauptman2009 — GP-Rush (GECCO 2009)

- **Chat A4 §6**: GECCO 2009, IDA\*, 6×6 and 8×8, evolved heuristics: **correct.** "removing just one blocking vehicle can make a difficult configuration almost trivial": **overstated**. The paper says relaxing "even a single vehicle ... may render a difficult problem easy", but its example removes **two** vehicles (M and I in JAM09 → two steps) (§3.3). The claim that PDBs/relaxations are weak for Rush Hour is the authors' argument; they did not build and measure a PDB.
- Notes §8 repeats "naive removal of one blocker": same verdict.

### sturtevant2013 — An Argument for Large-Scale BFS for Game Design and Content Generation (Fling!)

- **Chat A4 §5**: "Sturtevant · AIIDE 2013 ... combining exhaustive BFS, retrograde analysis, and selective forward search ... precompute endgame regions exactly". Method: **correct.** Venue: it is a paper at the AIIDE 2013 **workshop** on AI in the Game Design Process, not the main conference.
- Placed under "Research on generating puzzles by searching backward": **overstated.** The paper states "we do not address the automatic content creation step here" (Introduction); it is an analysis tool for a designer.

### kartal2016 — Data-Driven Sokoban Puzzle Generation with MCTS (AIIDE 2016)

- **Chat A4 §5**: MCTS generation by simulated play (solvable by construction), anytime: **correct.** "They learn inexpensive difficulty features from human assessments ... A second user study supported the relationship": **overstated.** Features were *selected* by correlation with human pairwise votes, but the weights were set by hand ("set empirically to be 10, 5, and 1", section "Level Evaluation"); the validation study had 6 participants on 20 levels.

### bento2019 — Procedural Generation of Initial States of Sokoban (IJCAI 2019)

- **Chat A3 §8**: "Beta combines backward search, pattern-database-based hardness measures, and novelty": **correct** (§5). "found instances harder for a specialized solver than human-designed examples": **overstated.** Only the aggregate that keeps the best of 20 runs per maze beats the human xSokoban set (16.4 ± 1.3 vs 18 of 90 solved); the best single-run variant solves 19.5 (Table 1, §7.1). Generated states also have shorter estimated solutions than the human ones.
- **Chat A3 §7**: "related work has used pattern databases to evaluate and generate difficult Sokoban states": **correct** (this paper).

### kristensen2024 — Difficulty Modelling in Mobile Puzzle Games (Int. J. Computer Games Technology, 2024)

- **Chat A3 §10**: "In a 2024 empirical study of commercial mobile puzzle games, models that combined player/cohort data with simulated agent statistics performed better than using the categories separately." **Overstated.** One game (Lily's Garden), difficulty = attempts per completion. Agent data helped for cold-start levels and cohort predictions (§6.2, §7); for per-player predictions on levels with history, agent data "do not significantly improve the predictions" and adding it worsened the best model (§6.1, Fig. 5). The abstract's "in all scenarios" refers to cohort statistics + simulated data, not per-player.

### valenzuela2025 — Using Search Algorithm Statistics for Assessing Maze and Puzzle Difficulty (Entertainment Computing, 2025)

- **Chat A3 §7**: "A\* closed-list size correlated with perceived difficulty and player movements in Sokoban". **Correct but weak for difficulty**: Spearman 0.286 with perceived difficulty (95 % CI 0.16–0.40), 0.762 with player movements; 18 generated boards, 77 players (Table 2, §4.2). The abstract calls the difficulty correlation "high"; the text calls 0.286 weak.

### chen2023, shen2024 — Entropy / Generalized Entropy and Solution Information (AIIDE 2023, 2024)

- **Chat A3 §5**: difficulty as information needed to guide a player to a solution, taking the player's policy into account; experiments on The Witness. **Correct.** Chen defines MUSE/ReMUSE over "sensible" moves; Shen recasts it as $-\log_2$ of solution probability under a player policy (MSI, TSI). The AI's $I(s)$ is its own per-state variant (see §3).

### dart2012, alvarez2019

- Dart & Nelson, CIG 2012, backward construction of causal prerequisite chains: **correct** (we only have the author's web note, `raw/web/nelson-smart-terrain`).
- Alvarez et al., IEEE CoG 2019, interactive constrained MAP-Elites keeping elites per feature cell: **correct.** It is a dungeon-design paper with no user study; nothing about puzzle difficulty.

## 2. State-space reduction papers

- **Goubault, Heindel & Mimram 2013** (chat A1 §2, notes bib 9): directed geometric spaces, equivalent interleavings as homotopic paths, compared with POR. **Correct** (abstract: the two approaches "make essentially the same use of persistent transitions").
- **Gnad & Hoffmann 2018** (chat A1 §3, notes §3.3): search over center transitions, leaves tracked with compatible states and costs. **Correct.** Caveat the AI omits: a star topology requires leaves to interact **only via the center** (Def. 1, strict-star factoring). Two crossing Unblock Me pieces interact directly, so every piece that collides with another leaf must be in the center; the center has to separate the piece-interaction graph.
- **Gnad, Wehrle & Hoffmann 2016, Decoupled SSS** (chat A2 §4: "outperform either technique by an exponential factor on some planning problem families"). **Correct as theory** (exponential separation on Logistics variants, §5). Empirically gains are small: blind search coverage 145 → 151 of 418 for DS → DSSS (Table 1). It needs a **fork** factoring, which exists only if the causal graph has more than one strongly connected component; mutually blocking pieces form one SCC, so plain Unblock Me boards may have no fork factoring at all. Star-topology DSSS is in gnad2019 (JAIR).
- **Strong stubborn sets** (chat A2 §1): "the published SSS conditions preserve completeness and optimal solution cost" **correct** (Alkhazraji et al. 2012, Def. 2 and theorem; Wehrle & Helmert 2014, Thm. 1). "For Rush Hour, [the landmark] could contain all actions that move the target piece to the exit" **correct** when the goal is "target at/through the exit" and the state is not a goal. Pseudocode "add every **enabled** action that interferes with a": **wrong** — see short version item 4. Alkhazraji Def. 2: for each applicable $o\in T$, $\mathrm{dep}(o)\subseteq T$ (all dependent operators). Wehrle & Helmert 2014 Def. 8: all operators in the envelope that interfere with $o$ in any state on a strongly optimal plan. Notes §3.2 is correct and also says the sketch is not a full implementation.
- **Fast Downward** (chat A2 §4): options `stubborn_sets_simple()`, `stubborn_sets_ec()`, `atom_centric_stubborn_sets()` **correct** (`raw/web/fast-downward-pruning`, docs version 26.6; also `limited_pruning`, `null`). Atom-centric "calculates the reduction through state-variable propositions rather than enumerating all potential actions first": **roughly correct** (Röger et al. 2020: an atom-centric fixed-point computation that is significantly faster, plus a new atom-selection strategy).
- **ProB** (chat A1 §4): two threads, 5,410 states, 208 with POR. **Correct** (`raw/web/prob-state-space-visualization`), but that POR is for **deadlock checking**, not shortest paths. The same page also shows a full Rush Hour state graph (4,782 states).
- **Junghanns & Schaeffer 2001** (chat A1 §4; notes bib 14): relevance cuts use move influence with respect to the last *m* moves. **Correct**, and the chat rightly says it is not independence-preserving: the paper calls the cuts unsafe; several problems were solved non-optimally (§ "A Closer Look at Relevance Cuts"). The notes' description "domain-dependent cuts to exclude irrelevant ordering/region choices" hides that they lose optimality. Our PDF (from the author's `tcs.ps`, 26 pp.) has the same title, authors and abstract as TCS 252(1–2):151–175 and calls itself a "revised and enhanced version of an earlier paper" (the CG'98 one); it is the author preprint of the TCS article.
- **Korf & Felner 2002, PDBs** (chat A3 §7, notes §8): max of PDBs is admissible; summing needs more care. **Correct**, but the AI makes it sound harder than it is for this game: disjoint additive PDBs only need disjoint piece groups whose tables count only their own pieces' moves, which works whenever each move moves one piece (§3). Unblock Me qualifies, so sums over disjoint blocker groups are admissible without general cost partitioning.
- **Mazurkiewicz traces, Petri net unfoldings, CEGAR** (chat A1, notes bib 15–17): textbook background, correctly described; no claim to check. Canonical references now downloaded (see FINDS).

## 3. The AI's own proposals and its math

| Item | Where | Status | Check |
|---|---|---|---|
| Cartesian product $G_A\square G_B$; $\binom{20}{10}=184{,}756$ interleavings vs $11\times11=121$ states | chat A1 §1, §3 | **correct** | Computed. A forbidden interior grid point removes 4 commuting squares (2 on an edge, 1 at a corner). |
| Sweep-disjoint ⇒ moves commute | chat A2 §2, notes §3.1 | **correct** (sufficient, not necessary) | Proof: a slide is legal iff its swept cells (start to end, inclusive) are free of other pieces. B's move only frees cells and occupies cells inside sweep(B), disjoint from sweep(A), so A stays legal after B (and vice versa); different pieces change different coordinates, so both orders give the same state. Holds for slide or per-cell cost, finite or infinite board. Random check on 300 6×6 boards: all 15,726 sweep-disjoint pairs commute; 37 of 1,491 overlapping pairs also commute (both pass through a shared free cell). Being state-independent per move $(piece, from, to)$, it is a valid conservative non-interference test for SSS. Moves of the **same** piece never commute in this sense. |
| "Independent moves can't simply be pruned" | chat A2 §2, notes §3.1 | **correct** | That is why SSS needs landmarks and enabling sets. |
| Regret $R(s,a)=1+d^*(T(s,a))-d^*(s)\ge0$ and $\sum R=L-d^*(s_0)$ | chat A3 §5, notes §6.1, listed as "Established" in notes §14 | **correct, trivial** | $\ge0$ is the triangle inequality $d^*(s)\le1+d^*(s')$ for unit costs. Infinite if $s'$ is a dead state (possible with one-way exits). Telescoping needs the run to end at a goal ($d^*=0$). For per-cell costs use $c(a)$ instead of 1. Undirected graphs: $R\in\{0,1,2\}$. Checked on 212 random boards: no negative regret, telescoping exact. It is a definition, not a literature result. |
| Downhill moves suffice for optimal solving | chat A3 §6, notes §5 | **correct** | Every solvable non-goal state has a successor with $d^*-1$. |
| $H_\pi$ hitting time, softmax policy $\pi_\beta$ | chat A3 §3, notes §6.2 | **correct as math, untested as a difficulty measure** | Linear system has a finite solution if the goal is reached a.s. Not Jarušek's model (see §1). |
| Decision information $I(s)=-\log_2 p_*(s)$ | chat A3 §5, notes §6.3 | **untested proposal** (the AI says so) | Examples (50 % → 1 bit, 1 of 8 → 3 bits) correct. Depends heavily on how actions are enumerated (every stop on a long lane is a separate action); the AI notes this. Nearest published: Shen 2024 TSI/MSI (path-level). |
| $C(P)=\min_{\pi\in\mathrm{Opt}}\sum_k\mathrm{Complexity}(D(s_k))$ | chat A4 §9 | **untested proposal** (the AI says so) | Well-defined once Complexity is fixed; computable by DP over the downhill DAG. Taking the min over optimal plans makes it a best-case score for a player who already knows an optimal plan. |
| AND/OR blocker features, cycles, counterintuitive moves | chat A3 §4, notes §6.4 | **untested proposal** | Built from Olieslagers' tree, but that paper cuts cycles and scores moves, not puzzles. Jarušek found a counterintuitive-move count no better than length for Rush Hour. |
| Critical-position / interval abstraction, event-based actions | chat A2 §3, A3 §9, notes §4 | **untested proposal** | Not from any paper in hand. The AI does say it needs a proof (bisimulation / cost-preserving). Closest real work to check: Fernau et al. 2003 (polynomial when vehicle count is bounded), Brumleve et al. 2012 ("far away is equivalent" on infinite boards), CEGAR (seipp2018). |
| "Critical-position + goal dependency + SSS + A\*" architecture | chat A2 §5, notes §4.4, §10 | **untested proposal** | Each part exists; the combination for unbounded boards does not. SSS on finite boards is the only part with an off-the-shelf reference (Fast Downward). |
| Decoupled search for Unblock Me | chat A1 §3, notes §3.3 | **plausible, unproven** | See star/fork caveats in §2. |
| Causal-plan-first generation | chat A4 §5, notes §9.3 | **untested proposal** | Dart & Nelson do it for adventure games only. |
| A\* bounds $L\le d^*(s_0)\le U$ from min open $f$ | chat A3 §7, notes §8 | **correct** | With admissible $h$ and correct bookkeeping (reopening or consistent $h$); the notes flag this. |
| "Good puzzle = Solvability + Reasoning − Tedium − Ambiguity" | chat A3 | proposal, labelled as such | — |

## 4. Bibliographic details

- notes bib 8 (Collette): ScienceDirect PII is invalid; use LNCS 4630 / DOI 10.1007/978-3-540-75538-8_20.
- notes bib 5 / chat A4 §2 (del Solar): IEEE Access, not a July preprint.
- notes bib 4 (Trenquelleon): CG 2022, published in LNCS 2023, pp. 181–190, DOI 10.1007/978-3-031-34017-8_15.
- chat A4 §5 (Sturtevant 2013): AIIDE workshop paper.
- notes bib 14 (Junghanns): TCS 252(1–2):151–175, 2001, DOI 10.1016/S0304-3975(00)00080-3 — correct.
- chat A1 §4 / notes bib 13: ProB URL correct.
- Links in the raw notes carry `?utm_source=chatgpt.com`; removed in the cleaned copy.

## 5. Addenda from the paper cleaners (second wave)

Findings reported while the later papers were cleaned; details and page references are in each paper's cleaned file.

- **Critical-position abstraction is not new** (chat A2 §3, notes §4, open question 1). Fernau et al. 2003 (`fernau2003-…`) prove for Rush Hour on the infinite plane that each of k cars needs at most $2k^3$ discretized stopping positions with solvability kept (solutions at most k times longer, Lemma 3), and give a candidate set that keeps the move count exact for a bounded number of moves (§3): start, goal, lane borders and car-length offsets chained through pushing cars, not just collision endpoints. Brumleve et al. 2012 add that "solvable in ≤ n slides" is decidable on an unbounded board with finitely many pieces.
- **Collette's hardest board in slides**: van Assema 2014 counts it at 49 slides (joint third-hardest); the 6×6 maximum is 51. Van Assema also grouped configurations by line contents ("cluster groups") in 2014, before del Solar 2026; his "clusters" are connected components (mutually reachable), his "cluster groups" are not.
- **Decoupled SSS 2016**: Gnad, Hoffmann & Wehrle 2019 (JAIR) say the IJCAI 2016 fork definition is incorrect (misses a condition, can prune all solutions; Sec. 5.1, App. A Ex. 3). Use the 2019 definitions.
- **Star-topology decoupling** (chat A1 §3, notes §3.3): leaves may not interact with each other at all (Gnad & Hoffmann 2018 Def. 2); any two blocks that can collide must both be in the center. "Only impose cross-component constraints when an interaction matters" overstates it. It is the decoupled state (center path + leaf prices), not the center state, that represents many leaf positions.
- **Goubault et al. 2013**: the "commuting squares, holes, distinct path classes" picture is only the paper's motivation (Fig. 1); its result is a correspondence between persistent sets and future components in acyclic systems (Thm 3.10).
- **Atom-centric stubborn sets** (chat A2 §4): returns the same stubborn sets; what it avoids is the precomputed action-pair interference table, not action enumeration (Röger et al. 2020). The Fast Downward page also lists `limited_pruning`, which turns pruning off when it prunes too little; the chat omits it.
- **Frontier search on Rush Hour**: graphs with odd cycles need two BFS layers kept (Korf 2004); Rush Hour has odd cycles under the one-slide-one-move model.
- **Relevance cuts lose optimality** (Junghanns & Schaeffer 2001 §5: 6 of 44 solutions non-optimal); the chat doesn't say so.
