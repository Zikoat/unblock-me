# infinite unblock me

https://hockey-mandolin.exe.xyz/ (public): the last commit, built into public/ by the
post-commit hook (scripts/install-hooks.sh, scripts/publish.sh) and served by
scripts/serve-public.py (unblock-me-public.service, port 8080).

https://hockey-mandolin.exe.xyz:8000/unblock-me/ (behind the exe.dev login): dist/, rebuilt
on every save (unblock-me.service), served by the homepage.
