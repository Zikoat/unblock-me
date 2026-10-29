# Unblock Me

An infinite canvas filled with squares, rebuilt from scratch (the old game is tagged `legacy-2026-10`).

- Tap: puts the circle there; the next tap moves it.
- Drag the background: pan. Drag a square: move it (orange while dragged).
- Two fingers: zoom and pan together, no rotation. Mouse wheel: zoom at the cursor.
- Zoom stops when two squares fill the width, and when 670 world units fill a third of it.

How it works:
- Everything is drawn in world units under one canvas transform, so anything added later zooms with the rest.
- The world is cut into 200-unit cells; a PRNG seeded by the cell decides whether it has a square and where, so squares are the same every time you come back. Only moved squares are stored (localStorage) and drawn green.
- Culling: only squares touching the border (80% of the screen, drawn as a grey outline) are generated and drawn. Later the border becomes the screen edge.
- The corner counter shows frames drawn in the last second (0 when idle; frames are only drawn on change) and how many squares were drawn. `window.unblock` exposes the scene for debugging.

```bash
bun install
bun run build   # dist/, served at https://hockey-mandolin.exe.xyz/unblock-me/ and deployed to GitHub Pages
bun run check   # typecheck + unit tests
bun run e2e     # drives the built app in Chromium with touch and mouse
```
