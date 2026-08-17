import { expect, test } from "bun:test";
import { homeHtml } from "../src/web/home";
import { pageHtml } from "../src/web/page";

test("links the homepage to the browser app subpage", () => {
  expect(homeHtml).toContain('href="./app/"');
  expect(homeHtml).toContain("Play Unblock Me");
});
test("removes Block intrinsic sizing from square board tracks", () => {
  expect(pageHtml).toContain("min-width:0; min-height:0; overflow:hidden;");
});

test("extends Checkpoint cells across half of the board gap", () => {
  expect(pageHtml).toContain(".checkpoint { margin:-2px;");
});

test("gives controls and informational badges different visual affordances", () => {
  expect(pageHtml).toContain(".badge {");
  expect(pageHtml).toContain("button:not(.block) {");
  expect(pageHtml).toContain("button:not(.block):active {");
  expect(pageHtml).toContain("button:not(.block):focus-visible {");
  expect(pageHtml).not.toContain(".badge, button {");
});

test("uses cell-relative geometry for every block renderer", () => {
  expect(pageHtml).toContain(".block, .world-block {");
  expect(pageHtml).toContain("--block-inset:calc(var(--cell-size");
  expect(pageHtml).toContain("margin:var(--block-inset);");
  expect(pageHtml).toContain("border-radius:var(--block-radius);");
  expect(pageHtml).toContain("font-size:var(--block-font-size);");
});
