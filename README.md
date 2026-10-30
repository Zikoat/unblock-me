# infinite unblock me

https://hockey-mandolin.exe.xyz/ (public): the last commit, built into public/ by the
post-commit hook (scripts/install-hooks.sh, scripts/publish.sh) and served by
scripts/serve-public.py (unblock-me-public.service, port 8080), which also takes the play
data uploads into play-data/. Open games reload themselves when a new build is published.

`bun run build` builds dist/ for the end-to-end test (`bun run e2e`).
