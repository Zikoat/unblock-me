# Unblock Me terminal MVP

Slide the Red Block horizontally until it fully occupies the Checkpoint.

## Run

From PowerShell:

```powershell
cd C:\Users\sscho\Documents\Codex\2026-07-19\hi\unblock-me
bun install
bun run start
```

Enter `BLOCK DIRECTION` commands such as `A up` or `R right`. Enter `help` for
the command summary and `quit` to exit.

## Verify

The following local commands have been verified for this MVP:

```powershell
bun run check
bun run verify:tmux
bun run report
```

`bun run report` writes the self-contained verification report to
`artifacts/terminal-mvp-verification.html`.

## Pending human verification

Android download/open/video playback and a rendered 412-pixel phone-width
inspection of the report are pending human verification.
