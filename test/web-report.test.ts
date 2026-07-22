import { expect, test } from "bun:test";
import { renderWebReport } from "../scripts/web-report-template";

test("embeds videos and every required screenshot in the web report", () => {
  const screenshots = ["Initial board", "Half drag in progress", "Canceled drag restored", "Completed multi-cell drag", "Generated level", "Terminal/web parity"]
    .map((caption, index) => ({ caption, alt: caption, base64: `png-${index}` }));

  const html = renderWebReport({
    commit: "abc123",
    desktopVideoBase64: "desktop-video",
    generatedSeed: "Seed 42",
    mobileVideoBase64: "mobile-video",
    screenshots,
    tests: "50 pass\n0 fail",
    typecheck: "typecheck passed",
  });

  expect(html).toContain("data:video/mp4;base64,desktop-video");
  expect(html).toContain("data:video/mp4;base64,mobile-video");
  for (const [index, screenshot] of screenshots.entries()) {
    expect(html).toContain(`<figcaption>${screenshot.caption}</figcaption>`);
    expect(html).toContain(`data:image/png;base64,png-${index}`);
  }
});
