# research/

Background for Infinite Unblock Me: papers, the user's notes and history, and an index of the game's
own reports. Built 2026-11-11. Everything here informs the game; none of it is a spec. The game's own
specs and features (reports/, goal spec, Judge, stars…) may also be changed, rewritten or removed later.

## Start here

0. [roadmap.md](roadmap.md): the plan (the question, evidence, data pipeline, next experiments);
   [for-the-user.md](for-the-user.md): what we need from the user; [inconsistencies.md](inconsistencies.md).
   Analysis scripts: `../lab/`.

1. [context/README.md](context/README.md): what the user asked for and decided, by phase, with a
   timeline; [context/preferences.md](context/preferences.md) for their taste in levels.
2. [reports.md](reports.md): every report in ../reports/, what it was for, its data, and whether the
   user approved it. Play and pair analyses are AI-written from one player's few verdicts.
3. [papers.md](papers.md): annotated bibliography by theme, most relevant first, with what each paper
   gives the game and where the AI notes got it wrong.
4. The user's AI notes (unverified): [context/ai-research-notes.md](context/ai-research-notes.md)
   (literature-review summary; its sections 12 "Open research questions" and 14 "Evidence standards"
   are worth reading) and [context/ai-chat-state-space-and-difficulty.txt](context/ai-chat-state-space-and-difficulty.txt)
   (the chat). Their claims are checked in [context/ai-notes-verification.md](context/ai-notes-verification.md).

## Layout

| Path | What | In git |
|---|---|---|
| `raw/papers/` | original PDFs, `<firstauthorYEAR-short-title>.pdf`; `MANIFEST-tar.txt` maps the user's tar names | manifest only |
| `raw/FINDS.md` | every downloaded paper/code/dataset with citation, URL, licence, why; "Not downloaded" list | yes |
| `raw/notes/` | the user's own inputs (AI literature notes) | yes |
| `raw/web/` | saved web pages (Fast Downward pruning docs, ProB, Fogleman's blog, Nelson's note) | no |
| `raw/code/` | shallow clones: aibasel/downward, WeiJiMaLab/rush_hour, fogleman/rush, cogtoolslab/fun-puzzles_cogsci25, lkseg/sokoban-level-generator-mcts. Untrusted: read, don't run | no |
| `raw/data/` | Fogleman's 6×6 Rush Hour database (2.58 M puzzles with optimal lengths), OSF 23vrb human Rush Hour data | no |
| `cleaned/<slug>/` | one folder per paper: `<slug>.md` (front matter with citation, licence and relevance; full text; MathJax; markdown tables; figures as cropped PNGs with described alt text and extracted data) | open-licence papers only, see `cleaned/.gitignore` |
| `context/` | user messages by phase, preferences, AI notes and their verification | yes |
| `tools/` | conversion scripts and the cleaning standard ([tools/README.md](tools/README.md)) | yes |

The repo is public on GitHub, so PDFs, web copies, clones, datasets and the full-text conversions of
copyrighted papers stay on the VM only (hockey-mandolin, `~/unblock-me/research/`). Everything is
there for an agent on the VM.

## Status (2026-11-11)

- 63 documents converted (59 PDFs, 4 web pages); one more (mazurkiewicz1977) is a scan with no text
  layer and no OCR on the VM. `tools/check.py cleaned` checks them all.
- Long documents (Hearn's thesis, the Gnad JAIR/AIJ articles, van Opheusden, Seipp) had their key
  definitions, theorems and tables checked closely and the rest more lightly; each says so in its
  `notes:` front matter field.
- Values "read off" plots are approximate; cleaners flagged the papers' own typos and inconsistencies
  in the text as cleaner's notes or [sic].
