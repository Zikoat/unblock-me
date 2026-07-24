# Control and Block Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make controls recognizable and keep block styling proportional across board sizes, zoom levels, and renderers.

**Architecture:** Separate status-chip and control CSS, then expose a rendered-cell-size custom property from the existing board configuration path. Both gameplay and world blocks consume shared geometry tokens. A focused Playwright script supplies computed-style assertions, screenshots, and report evidence.

**Tech Stack:** Bun, TypeScript, CSS, Playwright, Edge, existing issue-report template

## Global Constraints

- Do not change game rules or interaction behavior.
- Keep Play, World, and Closure rendering in the existing HTML/CSS board.
- Keep verification output concise and the report specific to GitHub issue #25.

---

### Task 1: Distinguish controls and normalize block geometry

**Files:**
- Modify: `src/web/page.ts`
- Modify: `src/web/client.ts`
- Test: `test/web-layout.test.ts`

**Interfaces:**
- Consumes: `configureBoard(width, height, label, worldMap)` and existing `.block` / `.world-block` elements.
- Produces: CSS custom property `--cell-size` and shared `--block-*` geometry tokens.

- [ ] **Step 1: Write failing layout-contract tests**

Add assertions that `pageHtml` contains separate `.badge` and `button:not(.block)` rules, shared `.block, .world-block` geometry tokens, and cell-relative `calc(var(--cell-size) * ...)` values. Also assert that the former `.badge, button` combined selector is absent.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test test/web-layout.test.ts`

Expected: FAIL because the combined badge/button rule remains and no cell-relative geometry tokens exist.

- [ ] **Step 3: Implement the minimal style and sizing change**

In `page.ts`, define flat informational badges and elevated non-block controls with hover, active, focus-visible, selected, and disabled states. Define shared geometry tokens on `#board`; consume them from `.block` and `.world-block`.

In `client.ts`, have `configureBoard` derive the visible grid-cell size from the board frame and visible column count and set:

```ts
const visibleColumns = worldMap ? width / 2 : width;
const cellSize = boardFrame.getBoundingClientRect().width / visibleColumns;
board.style.setProperty("--cell-size", `${cellSize}px`);
```

Keep the existing transform-based zoom path so the cell and its geometry scale together.

- [ ] **Step 4: Run focused and full checks**

Run: `bun test test/web-layout.test.ts && bun run check && bun run build:web`

Expected: all tests pass, TypeScript reports no errors, and the web build completes.

- [ ] **Step 5: Commit**

```text
git add src/web/page.ts src/web/client.ts test/web-layout.test.ts
git commit -m "fix: clarify controls and normalize block styling (#25)"
```

### Task 2: Add targeted browser evidence and report

**Files:**
- Create: `scripts/control-style-playwright.mjs`
- Create: `scripts/generate-control-style-report.ts`
- Modify: `package.json`
- Generate: `artifacts/issue-25-control-style-report.html`
- Generate: `artifacts/issue-25-control-style.mp4`

**Interfaces:**
- Consumes: deployed/local web app, `renderIssueReport`, and CSS computed styles.
- Produces: JSON browser evidence, inspected screenshots, an H.264 video, and targeted HTML report.

- [ ] **Step 1: Implement focused Playwright verification**

Create a script that:

1. Opens the local app at desktop and phone sizes.
2. Confirms a metadata badge and action button have different background, border, shadow, and cursor affordances.
3. Captures screenshots at two generated board dimensions.
4. Zooms the board and compares `border-radius / cell width`, `margin / cell width`, and shadow proportions before and after.
5. Switches to World and confirms `.world-block` uses the shared geometry tokens.
6. Fails on page or console errors.
7. Records human-paced interactions when passed `--record --human`.

- [ ] **Step 2: Generate the targeted report**

Use `renderIssueReport` with the issue title/number/link and direct requirements at the top, focused screenshots and findings in the body, and compact build/test/deploy/no-console-error checks at the bottom. Add `report:control-style` to `package.json`.

- [ ] **Step 3: Run verification and inspect screenshots**

Run: `bun run check && bun run build:web && node scripts/control-style-playwright.mjs --json && bun run report:control-style`

Expected: concise passing output and generated HTML/video artifacts. Inspect every screenshot for recognizable controls, flat labels, consistent block proportions, and clipping or overlap.

- [ ] **Step 4: Commit**

```text
git add package.json scripts/control-style-playwright.mjs scripts/generate-control-style-report.ts
git commit -m "docs: report issue 25 visual consistency"
```

### Task 3: Publish and close the issue

**Files:**
- Create: `static/reports/issue-25-control-style.mp4`

**Interfaces:**
- Consumes: generated report and video.
- Produces: GitHub Pages video URL, release-hosted HTML report, and issue resolution.

- [ ] **Step 1: Publish source and Pages video**

Copy the validated video to `static/reports`, commit it, and push the current default branch.

- [ ] **Step 2: Wait for deployment once**

Run the repository’s existing Pages workflow check once and open the deployed app/report video URL. Confirm HTTP success and H.264 playback metadata.

- [ ] **Step 3: Publish the HTML report**

Create the issue #25 release asset using the full commit SHA or current branch as the release target.

- [ ] **Step 4: Resolve the issue**

Comment with the deployed app, targeted HTML report, and video links. Include the fresh behavioral review findings as separate feedback, then close #25 without claiming those out-of-scope findings were fixed.

- [ ] **Step 5: Commit any generated publication metadata**

```text
git add static/reports/issue-25-control-style.mp4
git commit -m "docs: publish issue 25 control-style video"
git push
```
