# infinite unblock me

https://hockey-mandolin.exe.xyz/ (public): the last commit, built into public/ by the
post-commit hook (scripts/install-hooks.sh, scripts/publish.sh) and served by
scripts/serve-public.py (unblock-me-public.service, port 8080), which also takes the play
data uploads into play-data/. Open games reload themselves when a new build is published.

The player travels in the URL: a game page gets `?p=<its device id>` (a random UUID), so
opening it in another browser (Telegram's "Open in Safari") goes on with the same progress,
fetched from the server's `GET /progress?p=<id>` (src/carry.ts). Anyone with that link gets
that progress and play log; fine for a game, there is no sign-in.

`bun run build` builds dist/ for the end-to-end test (`bun run e2e`).

Goal makers are judged on the Bench (reports/goal-spec.md): `bun bench/run.ts --maker
reference|current|current2 --set quick|full` plays one on fixed cases (bench/cases-*.json,
made by `bun bench/cases.ts`), checks every goal with the Referee, scores it with the Judge
after the Auditor's recount, keeps any record it beats (bench/records.json) and says whether
it passes the Gate. Run it through scripts/capped.sh; the full set takes about 2 minutes for
today's maker, 14 for the Reference.

Research (papers, notes, experiments in test/experiments/, lab/, run data and most reports)
lives on the VM in ~/unblock-me-lab, a local git repo that is never pushed. Its committed
reports are still served at /reports/: the build and scripts/publish.sh take them in.
