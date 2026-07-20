export interface ReportTemplateData {
  bunVersion: string;
  gitCommit: string;
  runId: string;
  terminalTranscript: string;
  testOutput: string;
  tmuxOutput: string;
  tmuxVersion: string;
  typecheckOutput: string;
  videoBase64: string;
  videoBytes: number;
  workingDirectory: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function evidence(value: string): string {
  return `<pre>${escapeHtml(value.trim() || "No output captured.")}</pre>`;
}

export function renderReport(data: ReportTemplateData): string {
  const escapedDirectory = escapeHtml(data.workingDirectory);
  const escapedCommit = escapeHtml(data.gitCommit);
  const escapedRun = escapeHtml(data.runId);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unblock Me terminal MVP verification</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #10151f; color: #edf3ff; }
    * { box-sizing: border-box; }
    body { margin: 0; overflow-x: hidden; }
    main { width: min(100%, 900px); margin: 0 auto; padding: 20px 14px 40px; }
    h1 { font-size: clamp(1.55rem, 7vw, 2.35rem); margin: 0 0 .35rem; }
    h2 { font-size: 1.2rem; margin: 1.8rem 0 .6rem; }
    p, li { line-height: 1.5; }
    section { background: #182131; border: 1px solid #31415d; border-radius: 12px; padding: 14px; margin-top: 12px; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    code { overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; padding: 12px; background: #090d14; border-radius: 8px; color: #d8f6e5; font-size: .78rem; line-height: 1.38; }
    table { border-collapse: collapse; width: 100%; font-size: .9rem; }
    th, td { border: 1px solid #3a4a67; padding: 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #24334d; }
    .status { color: #9ff0bc; font-weight: 700; }
    .pending { color: #ffd58a; font-weight: 700; }
    video { display: block; width: 100%; max-width: 100%; height: auto; background: #000; border-radius: 8px; }
    .muted { color: #b7c2d6; }
    @media (max-width: 412px) { main { padding: 14px 10px 28px; } section { padding: 12px; } th, td { padding: 6px; } }
  </style>
</head>
<body>
  <main>
    <h1>Unblock Me terminal MVP verification</h1>
    <p class="muted">Self-contained evidence report for tmux run <code>${escapedRun}</code>, commit <code>${escapedCommit}</code>.</p>

    <section>
      <h2>Request and scope</h2>
      <p>The request is a playable terminal MVP of the Unblock Me sliding-block puzzle, with an independently captured proof that the Red Block reaches the Checkpoint.</p>
      <p>Approved scope: the finite 7×5 puzzle, command-line interaction, automated checks, tmux evidence, and this portable verification report. The Infinite World is explicitly deferred.</p>
    </section>

    <section>
      <h2>Start command and architecture</h2>
      <p>Working directory: <code>${escapedDirectory}</code></p>
      <pre>bun run start</pre>
      <p>The production CLI parses movement commands, applies puzzle rules, renders the terminal board, and reports success once the Red Block fully occupies the Checkpoint.</p>
    </section>

    <section>
      <h2>Verification evidence</h2>
      <table>
        <thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead>
        <tbody>
          <tr><td>Typecheck</td><td class="status">Captured</td><td><code>bun run typecheck</code></td></tr>
          <tr><td>Automated tests</td><td class="status">Captured</td><td><code>bun test</code></td></tr>
          <tr><td>Bun runtime</td><td class="status">Captured</td><td>${escapeHtml(data.bunVersion)}</td></tr>
          <tr><td>tmux playthrough</td><td class="status">Captured</td><td><code>bun run verify:tmux</code>; ${escapeHtml(data.tmuxVersion)} on captured environment</td></tr>
          <tr><td>Video encoding</td><td class="status">Embedded</td><td>${data.videoBytes.toLocaleString("en-US")} bytes of H.264 MP4, base64 in this file</td></tr>
        </tbody>
      </table>
      <h3>Typecheck output</h3>${evidence(data.typecheckOutput)}
      <h3>Test output</h3>${evidence(data.testOutput)}
      <h3>tmux command output</h3>${evidence(data.tmuxOutput)}
    </section>

    <section>
      <h2>Human-speed tmux interaction</h2>
      <p>The frames retain the captured pauses: 80 ms per typed character, 700 ms after each submitted move, a one-second opening hold, and a 1.5-second winning hold.</p>
      <video controls src="data:video/mp4;base64,${data.videoBase64}">Your browser does not support embedded MP4 playback.</video>
    </section>

    <section>
      <h2>tmux transcript</h2>
      ${evidence(data.terminalTranscript)}
    </section>

    <section>
      <h2>Deployment status</h2>
      <p><span class="pending">Pending publication:</span> upload this generated HTML file as a single asset on a private GitHub Release. It is intentionally ignored by Git and has no external scripts, stylesheets, images, or video URLs.</p>
    </section>

    <section>
      <h2>Limitations</h2>
      <ul>
        <li>This MVP contains one finite puzzle; the Infinite World is deferred.</li>
        <li>The report proves a recorded local tmux run, not every terminal emulator or phone viewer.</li>
        <li>Base64 embedding increases file size so the report should remain a release asset rather than source history.</li>
      </ul>
    </section>

    <section>
      <h2>Android phone verification</h2>
      <ol>
        <li>Sign in to GitHub with an account that can read the private repository.</li>
        <li>Download this HTML asset from the private release and open it in Chrome or an HTML-capable viewer.</li>
        <li>Confirm readable text, no horizontal scrolling, video controls, playback, seeking, and reopening the downloaded file.</li>
      </ol>
      <p class="pending">Status: Pending human verification.</p>
    </section>
  </main>
</body>
</html>`;
}
