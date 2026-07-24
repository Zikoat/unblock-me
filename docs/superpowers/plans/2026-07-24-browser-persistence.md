# Browser Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the exact current Play, World, and Closure session after reload or browser-page reopen.

**Architecture:** A versioned JSON snapshot stores complete state objects rather than relying on seeds or future generator code. A pure codec validates the outer shape. The browser writes after every accepted interaction and restores before its first render.

**Tech Stack:** TypeScript, localStorage, Bun test, Playwright.

## Global Constraints

- Store exact Block, Wall, Checkpoint, Generated Region, camera, and closure data.
- Store semantic Block moves with before/after Game State snapshots.
- Store mode and zoom.
- Do not add a server.
- Report only persistence evidence.

---

### Task 1: Versioned exact-session codec

**Files:**
- Create: `src/web/session.ts`
- Create: `test/browser-session.test.ts`

- [ ] Write failing exact round-trip and rejection tests.
- [ ] Implement versioned encoding/decoding.
- [ ] Verify complete nested positions survive the round trip.

### Task 2: Persist browser interactions

**Files:**
- Modify: `src/web/client.ts`
- Modify: `src/web/page.ts`

- [ ] Restore before initial render.
- [ ] Record each accepted Block move with semantic action and before/after snapshots.
- [ ] Persist mode, zoom, World camera/regions, and Closure progress.
- [ ] Reset current-level move history on new level/restart.
- [ ] Display the retained semantic move count.

### Task 3: Targeted close/reopen evidence

**Files:**
- Create: `scripts/persistence-playwright.mjs`
- Create: `scripts/generate-persistence-report.ts`
- Modify: `package.json`

- [ ] Interact with all three modes.
- [ ] Close the page and open another page in the same browser context.
- [ ] Assert exact Play coordinates/history, World camera, Closure result, mode, and zoom.
- [ ] Publish only before/after persistence screenshots and an HTTPS MP4.
