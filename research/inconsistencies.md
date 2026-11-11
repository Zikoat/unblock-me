# Inconsistencies and errors found (2026-11-11)

What is wrong where, and the suggested correct version. Items in code, reports and analyses were
fixed where marked; items in the goal spec, the one-engine plan, the user's own transcripts and
the existing research are only noted here, as the brief asks.

## In the game and its analyses (fixed or fixable)

1. **TODO.md said real extra moves in the world "waits on the mixed-against-tidy trials (K1A
   to K2B)".** The K trials were played on 2026-11-11 (mixedness split 1–1). *Fixed:* the item
   now waits on the playlist's play logs (?trial=R1) and the roadmap's decoy test.
2. **trial-mixed-report.ts's verdict order has 20 boards and leaves the K boards out**, though
   the K verdicts exist; the "ρ 0.30 over 20 boards" numbers are over the 20 without K.
   *Fixed in the lab:* `lab/verdicts.ts` ORDER_ALL has all 24 with the K boards placed (K2A
   second, K1A sixth, K2B eleventh, K1B fourteenth: an agent's reading, not the user's words).
   The report page itself is left as it was; its numbers are labelled by n.
3. **The early trials 8A–16B have no play logs** (trial logging came in commit 1f58053, after
   they were played), while reports/trial-features.html presents play-log columns for "the
   trials". Anything that reads a play-log number for 8A–16B is reading nothing. *Noted*; the
   lab scripts skip them.
4. **Two devices in the trial logs, not one player.** The G and J1A reaches (and one J1B) come
   from device dcf04bb3, the rest from 73e1dd1f. The verdicts for G came with phone screenshots,
   so dcf04bb3 is most likely the user's phone, but it is not proven. The reports say "one
   player"; keep devices apart in analyses (`lab/plays.ts` does).
5. **The Judge's "decisions" wish is in the spec as a difficulty term, but on every trial set it
   ranked worst** (G2B, the worst board, had the most). The spec and the Judge are untouched;
   the roadmap says not to use decisions as a measure until it is re-derived from logged play.
6. **The walls report's numbers were inflated** (counted on the maker's proofs, which carry
   detours); the page already carries the agent's later note. No change.
7. **`play()` in test/experiments/trial-grid.ts returns the first session with a reach**, which
   for J1B is the phone's 30-move play, not the user's 17-move one on the computer that the
   verdict text refers to. `lab/plays.ts` lists every session so the reader can choose.
8. **serve-public.py keeps at most 500 files.** The playlist writes one file per board per page
   load; at 12 boards a run this is fine for now but a few players would fill it. Raise
   MAX_FILES when players arrive (noted in the roadmap).

## In the user's instructions (noted only)

9. **"Analyse the state space of the boards played so far"** assumes the full state space of an
   open board can be built. It cannot: on every open-room trial 35–56 blocks matter by lane
   overlap and a search bounded to fewest + 3 passes 2 M states before the goal. The intended
   reading is the reduced space (room blocks moving, world blocks as single-move tolls), which
   is what open-core.ts already does; the roadmap says so.
10. **"Can they get stuck in a wrong part of the state space"**: slides are reversible, so no
    state is a trap. The useful version is "how far from the goal, in moves, can a player get
    while the board gives no sign" (userMaxOff in lab/statespace.ts; see for-the-user.md D1).
11. **"Extra moves ... matched the user on early pairs but not later ones"** is right, but the
    brief's "rank correlation about 0.3 over 20 boards" is over the 20 without the K boards.
12. **The user asked for cycle complexity "including red movements" and separately disliked
    blocks on red's own track.** Both hold at once only if red's own come-backs are not of the
    push-blocks-ahead kind; the Referee's track-block rule keeps them apart. No conflict in
    practice, but a generator that maximises red's moves could reintroduce track pushing.

## In the goal spec and the one-engine plan (noted only)

13. **goal-spec: the extra-moves factor (1 + extra/fewest)^4** rewards extra moves only when the
    Auditor proves the fewest; on the open world it almost never does at 12+ moves, so the wish
    is inert in play. Suggested: keep the factor, source extra moves from room patches whose
    proofs are exact (roadmap 4.3), and say in the spec that the factor applies only to proved
    goals.
14. **goal-spec's "decisions"** (see 5): suggested to mark it "under test" in the spec.
15. **one-engine** assumes the maker runs inside the engine with the Referee, Judge and Auditor as
    assertions. A room library shipped as data (roadmap 4.3) fits that plan but is not in it;
    suggested: a "patches" input to the engine, verified by the same assertions.

## In the existing research (noted only)

16. The AI notes' errors are listed in context/ai-notes-verification.md (VM only); the ones that
    matter for the roadmap: Jarušek's result is *for* length as the predictor; Collette's 93 is
    single-square steps; the stubborn-set pseudocode is unsound; critical-position abstraction is
    Fernau 2003, not new.
17. papers.md says Fogleman's database is "the dataset to calibrate any difficulty number
    against". It has optimal length and cluster size, no human data; it calibrates solvers, not
    felt difficulty. Olieslagers' OSF logs are the only human Rush Hour move data in hand.

## In the data

18. The device logs' `goal` events before commit ce82324 carry only the proof's length, not the
    proof, so world goals before 2026-11-11 cannot be measured against their solution without
    regenerating them from the seed and stored moves (possible: the maker is deterministic).
19. play-data holds a `trial-16A/16B` pair of files with no reach and no moves (opened, not
    played); harmless.
