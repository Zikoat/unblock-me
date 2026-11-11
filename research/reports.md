# Reports index

Everything below (specs, features, measures, formulas, conclusions) may be changed, rewritten or removed later. Nothing here is a fixed requirement.

How to read this: each report has a link, the question it answered (date, first commit), where its numbers come from, and whether the user (Sigurd) weighed in. User quotes are from the Claude Code transcripts (UTC dates). "No recorded review" means no user comment on the page was found in the transcripts. That doesn't prove they never looked at it.

More context: [context/](context/README.md) (transcripts summary) and [papers.md](papers.md) (papers).

All pages are listed at https://hockey-mandolin.exe.xyz/reports/. They are built from reports/ in the repo, and goal-spec.md is served as goal-spec.html. data/, play-data/ and bench/results/ are gitignored, so they exist only on the VM (hockey-mandolin). Experiment scripts live in test/experiments/.

**Caution for analysis and pair reports** (marked *Caution* below): AI-written from few data points (mostly one player), not hard rules, not peer reviewed, and not necessarily closer to the goal. They are linked because they guided the current goal spec and engine.

## 1. Visuals

### score-track
- https://hockey-mandolin.exe.xyz/reports/score-track.html
- Made for: designing the move/star bar on the goal and its finish animation (stars earned at the end, medal drop, "undone once"). Dated 2026-10-30, first commit 7ab3d6a, about 33 commits that day.
- Data: hand-built page. The example goal and the "six goals from play" come from the user's uploaded play data (play-data/, 21 goals).
- Status: designed with the user step by step on 2026-10-30 ("ugly as fuck" on the first try, then many specific tweaks; "i liked the 'Stars earned at the end' best"). Later the same day: "This animation is the correct one, the one up top is a bit outdated", with a request to integrate it into the game. On 2026-11-05: "8 score track is done, we use the stars." Approved and in the game. The top part of the page is outdated by the user's own word.

### goal-colors
- https://hockey-mandolin.exe.xyz/reports/goal-colors.html
- Made for: picking the goal colours (in play and reached) and the border/fade behaviour. Dated 2026-11-01, commits 24f74df, 9fe711a, a4ad65e.
- Data: screenshots of the game (?theme= variants), embedded in the page.
- Status: requested by the user, who said the old goal looked like "stained period blood". User: "I like either coral or gold … Use coral now, but unsure if gold is better" (2026-11-01). Then: "Maybe use coral for current goal and gold for finished goals?" The page states that choice as chosen. Approved.

### soul
- https://hockey-mandolin.exe.xyz/reports/soul.html (films and stills in reports/soul/)
- Made for: choosing the look of the red block's "soul" flying to the next red block (comet, flame, glint). Dated 2026-11-06, commits 8f8f1eb to 0144beb, four rounds.
- Data: films of the real game via Playwright (test/experiments/soul-look.mjs, src/finish-fx.ts styles).
- Status: requested and reviewed round by round on 2026-11-06. User: "I don't like Gold Star or Ghost Block"; "Of the four particle effects, I maybe like Soft best, at least for Comet"; "Rotate Glint". Round four (comet until the 7th world goal, then comet, flame or glint at random) is in the game. No explicit sign-off on round four.

Finish effects (landing hit, star bursts and the rest) have no report. They were tuned live in the in-game testbed. See TODO.md "Finish, animation and game feel".

## 2. Game features and identified preferences for good levels

The extra-moves line of work runs in this order: walls → extra-moves → extra-maker → extra-gen → trial-features → open-gen → trial-mixed. Trial boards are played at https://hockey-mandolin.exe.xyz/?trial=<label>. Each label is a blind pair, A against B (8A/8B, 12A/12B, 16A/16B, M1, G1, G2, H1–H3, J1, K1, K2). Play logs are in play-data/trial-*.json, almost all from one device (the user's).

Latest state (2026-11-11, from chat, not in any report): over all 20 trial boards, extra moves track the user's verdicts only weakly (rho 0.30, down from 0.55 on the first 12). The K pairs split 1–1 on "mixed" come-backs. The agent's newest guess is that difficulty comes from how many blocks *look* relevant (open edges, world blocks that might matter). The user then asked for a state-space analysis of the boards plus a literature review (this research/ folder).

### play-analysis
- https://hockey-mandolin.exe.xyz/reports/play-analysis.html
- Made for: "is the difficulty measure a good measure?", using real play. Dated 2026-10-30, commits fa2ab3a and 5b0cc56.
- Data: 42 goals reached on 2026-10-30 from the user's own uploaded play (play-data/), re-measured with a search capped at 1M boards. Script: test/experiments/play-analysis.ts (regen, measure, report). An Opus subagent did the analysis.
- Findings it drove: fewest moves explains felt difficulty as well as the difficulty score, and distance explains almost nothing. Choices are counted as blocks in red's chain (later the Judge's "decisions"). Stars come from the fewest moves (1 to 5). The log had missed the first move after each load (fixed).
- Status: requested by the user. Their only comments were on form: "do both 1 and 2" (adopt the suggestions), "could you do graphs on that html report", "too much text, only big numbers, graphs, and conclusions". No recorded review of the findings themselves.
- *Caution*: AI-written from few data points (one player, one day), not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.
- Also a difficulty-measure note: the star rule and the "decisions" idea start here.

### blocks-on-track
- https://hockey-mandolin.exe.xyz/reports/blocks-on-track.html
- Made for: how often the red block must push blocks along its own lane, before and after a penalty (halve a candidate's score per such block). Dated 2026-11-01, commit 9ea6181.
- Data: simulation on 40 boards (densities 4–28), old and new ranking, effort levels 0 and 2. Script: test/experiments/blocks-on-track.ts.
- Result: goals with track blocks fell from 9 in 10 to almost none. The cost is easier, closer goals (about 11 fewest moves instead of 17 for goals made ahead).
- Status: the preference is the user's own: "I dont like that there are multiple blocks on the same track" (2026-10-30), and on 2026-11-01 "not a nice experience to move a lot brick in front of you … penalize this … then create a report". No recorded comment on the report itself. In the goal spec this is now the Judge's "track blocks" factor (½ per block).

### world-ramp
- https://hockey-mandolin.exe.xyz/reports/world-ramp.html
- Made for: the difficulty curve of the first world goals after the island, plus the island's exact fewest moves. Dated 2026-11-05, commits 2446fe1, 0c98dec, 16ae204.
- Data: simulation, 8 seeds × the first 40 world goals played by their proofs, before and after the ramp. Quick measure against long measure. Island squares by exact BFS. Scripts: test/experiments/world-ramp.ts and world-ramp-report.ts.
- Result: a target ("ramp aim") rising from 4 to 10 fewest moves over the first 30 goals. Goals land within a move or two of it.
- Status: requested by the user on 2026-11-05 ("ramp the difficulty slowly … across 30 levels"). Reviewed: "Quick vs long measure is correct, it is tuned to 5 percent. try option 1" (the target), then "Decrease the start of the ramp" (6 → 4). Approved and in the game.

### walls
- https://hockey-mandolin.exe.xyz/reports/walls.html
- Made for: the user's gut feeling that good goals need blocks moved twice or more, and that walls (fixed 1×1 cells) would make that more common. Dated 2026-11-09, commits 5816374, b51ef0a, 0b65f55.
- Data: simulation. A sweep of wall share × block density on fresh boards (7200 boards at effort 0, 720 at effort 2), using today's maker's own proofs. Raw JSONL in data/walls/. Scripts: test/experiments/walls.ts, walls-candidates.ts, walls-profile.ts, walls-report.ts.
- Result: random walls make re-moved blocks rarer, not more common, because they shrink the push search's candidate pool. Long proofs (from block density) carry the re-moves.
- Status: co-designed with the user ("The wall report should put numbers on that gut feeling, but we need to create it together"). The user critiqued the graphs ("none of your axe's have labels …") and they were redone. User's takeaway (2026-11-09): "'Goals with a block moved 2+ times' is the closest we have gotten to the 'feature' of a goal we want". Important later correction: extra-maker found that most re-moves in the maker's proofs were detours, not real, and the agent said this "also inflated the walls report's numbers". Walls are now in the game (4% by default).
- *Caution*: AI-written from few data points (simulated boards judged against one player's feel), measured on proofs that later proved inflated. Not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.

### extra-moves
- https://hockey-mandolin.exe.xyz/reports/extra-moves.html
- Made for: defining "extra moves" (Σ over the blocks a solution moves of (times moved − 1), red counting; the user's "cycle complexity" wish) and testing it in three blind pairs at 8, 12 and 16 fewest moves. Dated 2026-11-09, commit 49a94f5.
- Data: 6,557 goals on small random walled boards (6×6, 7×7), each searched exhaustively (test/experiments/extra-moves.ts → data/extra/). Pairs picked by extra-pick.ts into src/trials.ts. The answer key is folded in the page.
- Status: the user asked for the pairs on 2026-11-09 ("one which has this number high, and one which has this number low … then i can feel them out") and played them blind the same day. 12A: "quite the challenge … i lost track of which blocks i had moved … these are signs of good levels". 12B "simple … not that good". 16B "more fun" than 16A. 8A was liked slightly better than 8B, but "both of them seemed to require extra moves". The high side won at 12 and 16; 8 was unclear. The user then asked: "make the maker prefer cycle complexity? but including red movements". No comment on the page's statistics section.
- *Caution*: AI-written from few data points (three pairs, one player), not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.

### extra-maker
- https://hockey-mandolin.exe.xyz/reports/extra-maker.html
- Made for: does making the maker and the Judge weigh extra moves (factor (1 + extra/fewest)^4, commit 005ad54) change the goals picked? Dated 2026-11-09, commit ead5fbd.
- Data: the maker run on fresh boards with the same seeds before and after the change (test/experiments/extra-maker.ts → data/extra-maker/), plus a deep audit (extra-audit.ts), two Bench runs, and one blind pair M1A/M1B (maker-trials.ts → src/trials-maker.ts).
- Result: the change hardly alters which goal is picked. Most extra moves in the maker's proofs on the open world are detours, and real ones need confined boards.
- Status: the user played M1 ("m1a was much more difficult"). Their response to the report's conclusion: "i think maybe we need something more than this, because the type of level generation might be completely different now". They proposed rooms with the walls removed, or building boards from empty, which became extra-gen.
- *Caution*: AI-written from few data points (one pair, one player), not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.

### extra-gen
- https://hockey-mandolin.exe.xyz/reports/extra-gen.html
- Made for: generating boards with real extra moves. A: walled rooms searched whole (live or from a library), then opened up. B: simulated annealing from empty. Success rates within time budgets. Dated 2026-11-09, commit e71e1fb (pointer to open-gen added on 2026-11-10).
- Data: exact BFS solver on bounded grids (test/experiments/extra-gen-core.ts, extra-gen-make.ts, extra-gen.ts → data/extra-gen/). Two blind pairs G1 (rooms) and G2 (annealing) from extra-gen-trials.ts → src/trials-gen.ts.
- Status: the user played them blind (2026-11-09). G1A: "only 2 of the outer blocks are 'open' … only 1 path really was back and forth". G1B: "no outer blocks were lose … Worse than previous". "G2a better opening", "G2b is worst, no openings and very simple solution". The main lesson was the sealed-looking edge, not the generators' numbers. No comment on the rest of the page.
- *Caution*: AI-written from few data points (two pairs, one player), not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.

### trial-features
- https://hockey-mandolin.exe.xyz/reports/trial-features.html
- Made for: which board number tracks how the 12 trial boards felt (fewest, extra moves with and without red, decisions, states, branching, open threads, chain and others), ranked against the verdicts. Dated 2026-11-09, commit f885d08.
- Data: every trial board measured exactly on its frame (test/experiments/trial-features.ts), the play logs (play-data/trial-*.json), and the user's verdicts as quoted in chat (the order between pairs is the agent's reading).
- Result: the extra-moves family tracks best (rho about 0.5, 4 of 4 clear pairs). The Judge's decisions, fewest moves and state counts don't. The page itself warns that n = 12 with one player gives hints, not findings.
- Status: the agent picked this step itself when the user answered "Idk". The user's only reaction was to the chat summary's wording ("you do not articulate yourself clearly"), then they chose open rooms. No recorded review of the page. Later trials (H, J) weakened its main result (see trial-mixed).
- *Caution*: AI-written from few data points (12 boards, one player), not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.

### open-gen
- https://hockey-mandolin.exe.xyz/reports/open-gen.html
- Made for: rooms with real extra moves whose edge is open (no sealed ring). The goal is proven exact in any surroundings by an upper and a lower bound that must agree. Dated 2026-11-10, commits c456c18 and eb55ce5.
- Data: test/experiments/open-core.ts, open-gen.ts, open-gen-make.ts, open-high.ts → data/open-gen/. Blind pairs H1–H3 (open-gen-trials.ts → src/trials-open.ts) and J1 (src/trials-open-j.ts). Edge openness compared with the G rooms. 2 to 4 minutes per room on the VM, so rooms would be a library made ahead.
- Status: the user played the H pairs (2026-11-10): "H1A … felt pretty integrated … i can't really tell the difference, what exactly do you ask me to verify?". H2B felt better than H2A. H3: "didn't know if some of the blocks were part of the larger level or the small puzzle … i like that". J1 went against extra moves: "J1a pretty simple … J1b a lot harder, and better" (J1A had 6 extra moves, J1B none). The user also proposed pulling world blocks into a room. No comment on the method or the bounds.
- *Caution*: AI-written from few data points (four pairs, one player), not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.

### trial-mixed
- https://hockey-mandolin.exe.xyz/reports/trial-mixed.html
- Made for: after J1, does the *order* of the come-backs (mixed, against one tidy wave) track the verdicts better than their count? It also covers pulling world blocks into rooms, and has the K pairs' answer key. Dated 2026-11-10, commit 7f4e468.
- Data: test/experiments/mixed-core.ts and trial-mixed.ts → data/trial-mixed.json. Pulling in: open-pull.ts → data/open-gen/pulled.jsonl. K pairs: open-pull-trials.ts → src/trials-open-k.ts. 20 boards against the verdicts and play logs.
- Result: no mixedness number beats plain extra moves (mixed rho 0.28, extra moves 0.30 over 20 boards). Pulling in world blocks barely changed anything.
- Status: the user played the K pairs on 2026-11-11. K1A "decent difficulty" but "23 of the surrounding blocks static, so that is not that good". K1B "definitely easier". K2A "very difficult, i got stuck … unsure [which blocks were part of the room] … very good level". K2B "good, but … easier". Mixedness won one pair and lost the other. No comment on the page's analysis.
- *Caution*: AI-written from few data points (20 boards, one player), not hard rules, not peer reviewed, not necessarily closer to the goal. Linked because it guided the current goal spec and engine.

## 3. Architecture and feature notes, tangential to core generation

The goal spec, stars, the Judge and the difficulty measures matter for goal generation, but they can pull an agent off track. They describe today's machinery and wishes, not proven truths about what makes a level good.

### goal-spec (Markdown) and goal-spec-visual
- https://hockey-mandolin.exe.xyz/reports/goal-spec.html (source reports/goal-spec.md)
- https://hockey-mandolin.exe.xyz/reports/goal-spec-visual.html
- Made for: what a goal is and how goal makers compete, without prescribing the algorithm. It covers the contract (Request → Goal), Referee (hard rules), Judge (soft wishes, fitness), Auditor, Bench, Records, Gate and Tuner. First draft 2026-11-06 (9ec14e8), revised until 2026-11-09 (005ad54, extra moves in the Judge).
- Data: written spec. The visual page works one real goal (seed 11, density 12). The Judge's weights were partly fitted to play (decisions-variants.ts: a decision costs about 0.7 of a move's time). The Bench is in bench/.
- Status: the idea is the user's (2026-11-06: a white-box verifier and the algorithm as a "free variable", "let a fable subagent try to create a better implementation"). User asked: "1 spec in english, and then another spec visualized" and "the visual spec should be a report". Reviewed on 2026-11-07: "Request board should be seed and stored moves … The map seems nonsensical, I don't understand it. Is effort necessary? … Notes should not be part of the contract". The user also corrected how "choices" are counted; these became "decisions", counted as forks a person meets. On 2026-11-08: "I don't know what aim is" → "maybe call it ramp aim", after which the commit says "nothing left to settle". The extra-moves factor's form ((1 + extra/fewest)^4) is the agent's choice. The user asked only that the maker prefer extra moves, counting red. Then on 2026-11-08 (one-engine) the user said the Referee, Judge and Auditor might become assertions and unit tests in one engine, so the spec's structure is not final.
- Could fit group 2 too: the Judge's wishes (track blocks, extra moves, decisions, distance, ramp aim) are the current statement of the desired solution shape.
- Related doc, not a report: docs/goal-search.md (the goal search problem stated on its own).

### goal-trace
- https://hockey-mandolin.exe.xyz/reports/goal-trace.html
- Made for: "how the current goal generation and min move algorithms work", with one goal's search logged and played back as a film, and the ranking formula in MathML. Dated 2026-11-06, commits 3946448, d076c31, ac64004.
- Data: test/experiments/goal-trace.ts re-runs makeGoalTournament (src/goal-search.ts) and the A* measure (src/difficulty.ts) with tracing, on seed 11 near (20, 6), with and without an aim.
- Status: requested and reviewed on 2026-11-06. The user asked for dependency lines and "list the actual measures / goals which we want to optimize", then said "the report has too much text … render the formula with math … more descriptive names". The user then moved on to the goal spec. The ranking shown (choices, distance, track blocks) is the pre-spec formula. The Judge in goal-spec has since replaced "choices" with "decisions" and added extra moves and ramp aim.

### one-engine
- https://hockey-mandolin.exe.xyz/reports/one-engine.html
- Made for: the end-state architecture. One Rust engine runs offline in the browser and online inside SpacetimeDB, with the maker, its checks and the Bench folded in. Also covers the home island and offline island. A plan; nothing is built. Dated 2026-11-08, commits cfb2647 to 957c6a6.
- Data: none (design document, from the user's description and the TODO design).
- Status: requested by the user on 2026-11-08 with detailed aims ("reuse a single engine code for offline and online play … we may even remove the referee, judge and auditor and instead move them to assertions"). Reviewed with notes the same day. "A starter island does not need to be rectangular." "The player who did an action should receive the new board state … through subscriptions." "What becomes of the goal spec's parts: This may change during implementation." "Stamp: I need to see this logic when it is created." The offline-island pan was the user's design. TODO.md: "The multiplayer server, the home and offline islands … waits on the features settling".

### island-candidates
- https://hockey-mandolin.exe.xyz/reports/island-candidates.html
- Made for: candidate 6×6 tutorial squares (2×1 blocks only, red exits through a bay) for the island before the world. Dated 2026-11-04, commits 0cc8a79 and cf927ad (varied squares).
- Data: random boards shuffled to the state farthest from solved, by exact search (test/experiments/island-levels.ts).
- Status: the user designed the island (walled squares, 1×2 blocks only, shuffled to the farthest state). After the page they answered the agent's questions with "2r. 3r" and asked to integrate the levels "that way it is easier for me to feel the levels". Later comments were on the levels in the game ("Level 1 and 2 have similar solutions", "Levels 1-3 are too easy", "Difficult ramps a bit fast"), not on the page. The island is in the game. The page shows candidates, not necessarily the shipped squares (src/island-levels.ts).

### Stars
No report of their own. The star rule (1 to 5 from the fewest moves, at most one star lost per extra move, a medal for beating the game's best) came out of play-analysis and the user's requests on 2026-10-30. Its look is in score-track. TODO.md has open items: many 1-star results, and medals on long goals where the game's fewest is overstated.

## Status summary

| Report | User review |
|---|---|
| score-track | approved, in game (top part outdated) |
| goal-colors | approved (coral in play, gold reached) |
| soul | reviewed rounds 1–3; round 4 in game, no explicit sign-off |
| play-analysis | requested; comments on form only |
| blocks-on-track | preference is the user's; no comment on the report |
| world-ramp | reviewed and acted on (target ramp, start lowered) |
| walls | co-designed, graphs critiqued, takeaway drawn; numbers later found inflated |
| extra-moves | trial verdicts given; statistics not commented on |
| extra-maker | M1 verdict; user pushed for a different approach |
| extra-gen | G verdicts (edges looked sealed); rest not commented on |
| trial-features | no review of the page |
| open-gen | H and J verdicts (J1 against extra moves); method not commented on |
| trial-mixed | K verdicts; analysis not commented on |
| goal-spec(-visual) | reviewed and corrected; open questions settled 2026-11-08; may be folded into one engine |
| goal-trace | reviewed on form; formula superseded by the spec's Judge |
| one-engine | reviewed with notes; plan only |
| island-candidates | used to pick the island approach; levels judged in game, not on the page |
