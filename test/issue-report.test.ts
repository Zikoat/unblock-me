import { expect, test } from "bun:test";
import * as templates from "../scripts/web-report-template";

test("renders a targeted issue report without inherited evidence", () => {
  const render = (templates as unknown as {
    renderIssueReport?: (data: {
      checks: string[];
      commit: string;
      deploymentUrl: string;
      issueUrl: string;
      screenshots: Array<{ alt: string; base64: string; caption: string }>;
      summary: string;
      title: string;
    }) => string;
  }).renderIssueReport;
  expect(render).toBeFunction();

  const html = render!({
    checks: ["80/80 cells measured square", "Checkpoint gap 0px"],
    commit: "5db70d3",
    deploymentUrl: "https://example.test/app",
    issueUrl: "https://example.test/issue/11",
    screenshots: [
      { alt: "Before", base64: "before-png", caption: "Before" },
      { alt: "After", base64: "after-png", caption: "After" },
    ],
    summary: "Only the mobile grid regression.",
    title: "Issue 11 — square mobile cells",
  });

  expect(html).toContain("80/80 cells measured square");
  expect(html).toContain("data:image/png;base64,before-png");
  expect(html).toContain("data:image/png;base64,after-png");
  expect(html).not.toContain("<video");
  expect(html).not.toContain("terminal/web movement engine");
  expect(html).not.toContain("<pre>");
});
