# Mobile Grid and Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep browser cells square on narrow phones and visually connect adjacent Checkpoint cells.

**Architecture:** Preserve the existing CSS Grid board and explicit engine coordinates. Remove intrinsic-content sizing from both grid tracks and Block buttons, then let Checkpoint cells extend halfway into the existing grid gap so their shared edge connects without changing engine geometry.

**Tech Stack:** TypeScript, Bun test, CSS Grid, Playwright.

## Global Constraints

- Keep the existing shared terminal/browser movement engine.
- Keep a comfortable board size; do not add a small-board fit special case.
- Produce one phone-openable HTML report with inspected desktop and phone screenshots.

---

### Task 1: Square tracks and connected Checkpoint

**Files:**
- Create: `test/web-layout.test.ts`
- Modify: `src/web/client.ts`
- Modify: `src/web/page.ts`
- Modify: `scripts/web-playwright.mjs`

**Interfaces:**
- Consumes: `pageHtml`, `#board`, `.cell`, `.checkpoint`, `.block`.
- Produces: zero-minimum grid tracks and measurable square/connected layout.

- [ ] **Step 1: Write a failing page-style regression test**

Assert that the page CSS removes Block intrinsic minimum sizing and extends Checkpoint cells into half the four-pixel grid gap.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `bun test test/web-layout.test.ts`

Expected: failure because the CSS declarations do not exist.

- [ ] **Step 3: Implement zero-minimum tracks and connected Checkpoint styling**

Use `minmax(0, 1fr)` for inline row/column templates. Give Block buttons zero intrinsic minimum dimensions and clipped text. Extend Checkpoint cells two pixels into the four-pixel gap.

- [ ] **Step 4: Add browser geometry assertions**

At phone width, assert representative cell width and height differ by less than one pixel and the gap between the two Checkpoint cells is at most one pixel.

- [ ] **Step 5: Run the focused test and browser verification**

Run: `bun test test/web-layout.test.ts`

Run: `node scripts/verify-web.mjs`

Expected: both exit successfully.

### Task 2: Evidence and publication

**Files:**
- Modify: `scripts/web-playwright.mjs`
- Generate: `artifacts/issue-11-mobile-grid-report.html`

**Interfaces:**
- Consumes: verified desktop and phone screenshots.
- Produces: a self-contained phone-openable report linked from issue #11.

- [ ] **Step 1: Capture desktop and phone screenshots**

Record the initial fixed board and a large generated board at phone width.

- [ ] **Step 2: Visually inspect both screenshots**

Confirm cells are square, Block labels are clipped within their cells, and Checkpoint stripes form one connected area.

- [ ] **Step 3: Generate the self-contained report**

Embed the screenshots, verification result, commit identifier, and deployed-app link.

- [ ] **Step 4: Commit, push, deploy, and close issue #11**

Publish directly to the repository default branch, wait for Pages success, attach or link the report, and close only after the evidence is available.
