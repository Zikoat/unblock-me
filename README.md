# Unblock Me terminal MVP

Slide the Red Block horizontally until it fully occupies the Checkpoint.

## Browser app

After the GitHub Pages workflow deploys this branch, use the homepage at
<https://zikoat.github.io/unblock-me/> and choose **Play Unblock Me**, or open
the game directly at <https://zikoat.github.io/unblock-me/app/>.

The development build on this exe.dev VM is available at
<https://hockey-mandolin.exe.xyz/> (game: `/app/`). exe.dev authentication may
be required.

## Terminal app

```bash
cd unblock-me
bun install
bun run start
```

Enter `BLOCK DIRECTION` commands such as `A up` or `R right`. Enter `help` for
the command summary and `quit` to exit.

## Verify

Verification is a plain test suite — there are no separate verification
commands and no Windows/PowerShell dependency:

```bash
bun run check
```

The terminal playthrough test runs the real `bun src/index.ts`, drives the
known solution to the winning state, and writes frame-by-frame PNG screenshots,
a transcript, and a manifest to `artifacts/terminal/`.

## Pending human verification

Android download/open/video playback and a rendered 412-pixel phone-width
inspection of the report are pending human verification.
