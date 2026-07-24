# Browser World Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the accepted World-generation and Dependency-closure terminal experiments into switchable browser modes.

**Architecture:** Move the pure reducers into `src/world/` and make both terminal prototypes and browser projections consume them. The existing finite Play mode remains intact. Browser-only code owns DOM projection and pointer interpretation.

**Tech Stack:** TypeScript, Bun, DOM Pointer Events, Playwright.

## Global Constraints

- Render only the actual Viewport in World and Closure modes.
- Empty-space drag pans; a Block-origin drag is never interpreted as camera pan.
- Use the same reducers and deterministic Block colors in terminal and browser.
- Do not add persistence or zoom in this issue.

---

### Task 1: Shared World projections

**Files:**
- Create: `src/world/generation.ts`
- Create: `src/world/closure.ts`
- Create: `src/world/palette.ts`
- Modify: `src/prototypes/multi-region/state.ts`
- Modify: `src/prototypes/dependency-closure/state.ts`
- Create: `test/world-modes.test.ts`

**Interfaces:**
- Produces: `projectWorldViewport(state)`, `projectClosureViewport(state)`, and `blockColor(id)`.
- Consumes: existing prototype state/reducer shapes.

- [ ] Write tests requiring 10×10 local projections with complete world coordinates.
- [ ] Run the focused tests and confirm the new projection APIs and mode controls are absent.
- [ ] Move reducers into shared modules and make prototype files re-export them.
- [ ] Implement projections and shared palette.
- [ ] Run focused tests and typecheck.

### Task 2: Browser modes and pointer ownership

**Files:**
- Modify: `src/web/page.ts`
- Modify: `src/web/client.ts`
- Modify: `scripts/web-playwright.mjs`

**Interfaces:**
- Consumes: shared World and Closure reducers/projections.
- Produces: mode buttons, World pan, Closure controls, DOM world coordinates, and status.

- [ ] Add `Play`, `World`, and `Closure` controls.
- [ ] Render World and Closure projections as square 10×10 boards.
- [ ] Interpret dominant-axis empty-cell drags as multi-cell camera movement.
- [ ] Reserve Block-origin drags for Block behavior.
- [ ] Expose Closure scenario, step, run, and reset controls.
- [ ] Add desktop and phone Playwright flows.

### Task 3: Report and delivery

**Files:**
- Modify: `scripts/web-report-template.ts`
- Modify: `test/web-report.test.ts`
- Generate: `artifacts/issue-12-browser-world-modes.html`

**Interfaces:**
- Consumes: Playwright screenshots/videos and verification output.
- Produces: one phone-openable issue report.

- [ ] Capture and inspect Play, World before/after pan, and all Closure outcomes.
- [ ] Generate a self-contained report.
- [ ] Run one final `bun run check` and Playwright report pass.
- [ ] Commit, push, confirm Pages, publish the report, and close #12.
