# Unblock Me

An infinite canvas with squares, rebuilt from scratch (the old game is tagged `legacy-2026-10`).

- Tap: puts the circle there; the next tap moves it.
- Drag the background: pan. Drag a square: move it (it changes colour while dragged).
- Two fingers: zoom and pan together, no rotation. Mouse wheel: zoom at the cursor.

```bash
bun install
bun run build   # dist/, served at https://hockey-mandolin.exe.xyz/unblock-me/ and deployed to GitHub Pages
bun run check   # typecheck + unit tests
bun run e2e     # drives the built app in Chromium with touch and mouse
```
