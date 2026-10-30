// The page around a report: theme tokens (light and dark), type, cards, tables, notes.

export const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function reportPage({ title, description, css = "", body, script = "" }: {
  title: string;
  description: string;
  css?: string;
  body: string;
  script?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<style>
  .viz-root {
    color-scheme: light;
    --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
    --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
    --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
      --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
      --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .viz-root { min-height: 100vh; background: var(--page); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 56px; }
  .back { color: var(--ink-2); text-decoration: none; font-size: 14px; }
  h1 { font-size: 24px; margin: 8px 0 4px; }
  .lede { color: var(--ink-2); margin: 0 0 20px; max-width: 66ch; }
  .card { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  h2 { font-size: 16px; margin: 0; }
  .sub { color: var(--ink-2); font-size: 13px; margin: 2px 0 10px; }
  .card p { max-width: 66ch; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; font-size: 13px; margin-top: 10px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 10px; text-align: right; border-bottom: 1px solid var(--grid); white-space: nowrap; }
  th { color: var(--ink-2); font-weight: 600; }
  .notes { color: var(--ink-2); font-size: 13px; margin-top: 18px; }
  .notes li { margin-bottom: 4px; }
  a { color: inherit; }
${css}
</style>
</head>
<body>
<div class="viz-root">
<main>
  <a class="back" href="./">← All reports</a>
${body}
</main>
</div>
${script ? `<script>\n${script}\n</script>` : ""}
</body>
</html>
`;
}
