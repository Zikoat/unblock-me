# Browser Viewport Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop wheel and phone pinch zoom without committing a Block or camera drag.

**Architecture:** A pure zoom module calculates bounded wheel/pinch values. The board is scaled inside a clipped frame. Capture-phase pointer tracking recognizes the second pointer before Block or World-pan handlers and cancels their previews for the remainder of that gesture.

**Tech Stack:** TypeScript, DOM Pointer/Wheel Events, CSS transforms, Playwright.

## Global Constraints

- Apply zoom to Play, World, and Closure.
- Keep the comfortable base size; do not special-case small boards.
- A pinch owns both pointers and cannot commit Block movement or World pan.
- Report only wheel/pinch requirements with ordinary HTTPS MP4 assets.

---

### Task 1: Bounded zoom model

**Files:**
- Create: `src/web/zoom.ts`
- Create: `test/web-zoom.test.ts`

- [ ] Write failing tests for wheel direction, pinch ratio, and bounds.
- [ ] Implement `zoomFromWheel` and `zoomFromPinch`.
- [ ] Run the focused tests.

### Task 2: Browser gesture ownership

**Files:**
- Modify: `src/web/page.ts`
- Modify: `src/web/client.ts`

- [ ] Add a clipped board frame and zoom badge.
- [ ] Apply wheel zoom without requiring a modifier key.
- [ ] Track two pointers in capture phase and scale by their distance ratio.
- [ ] Cancel Block and World-pan previews when pinch begins.
- [ ] Keep the resulting zoom visible across mode switches.

### Task 3: Targeted evidence

**Files:**
- Create: `scripts/zoom-playwright.mjs`
- Create: `scripts/generate-zoom-report.ts`
- Modify: `package.json`

- [ ] Verify desktop wheel and phone pinch.
- [ ] Begin the phone pinch on a movable Block and assert its state is unchanged.
- [ ] Capture only wheel/pinch screenshots and videos.
- [ ] Generate, inspect, publish, deploy, and close #13.
