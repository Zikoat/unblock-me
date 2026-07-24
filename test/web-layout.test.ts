import { expect, test } from "bun:test";
import { pageHtml } from "../src/web/page";

test("removes Block intrinsic sizing from square board tracks", () => {
  expect(pageHtml).toContain("min-width:0; min-height:0; overflow:hidden;");
});

test("extends Checkpoint cells across half of the board gap", () => {
  expect(pageHtml).toContain(".checkpoint { margin:-2px;");
});
