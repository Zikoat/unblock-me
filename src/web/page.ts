export const pageHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unblock Me</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#11151c; color:#f4f0e5; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:start center; padding:20px; }
    main { width:min(100%, 660px); }
    h1 { margin:0; font-size:clamp(2rem, 8vw, 4rem); letter-spacing:-.08em; }
    .lede { color:#bdc6d5; margin:.45rem 0 1rem; }
    .mode-switch { display:flex; gap:.45rem; margin:0 0 .8rem; }
    .mode-switch button[aria-pressed="true"] { background:#d8ff7a; color:#17210a; border-color:#d8ff7a; }
    #board-frame { width:min(100%, 560px); overflow:hidden; border-radius:14px; background:#090d13; touch-action:none; }
    #board { width:100%; height:100%; display:grid; gap:4px; padding:4px; background:#202936; border:2px solid #5c6c80; border-radius:14px; position:relative; touch-action:none; user-select:none; transform:scale(var(--board-zoom,1)); transform-origin:center; }
    .cell { background:#151b24; border-radius:6px; }
    .checkpoint { margin:-2px; z-index:1; border-radius:4px; background:repeating-linear-gradient(45deg,#80661e 0 7px,#aa8e39 7px 14px); }
    .wall { background:#050608; box-shadow:inset 0 0 0 2px #37404c; }
    .block { z-index:2; min-width:0; min-height:0; overflow:hidden; margin:4px; padding:0; border:0; border-radius:10px; cursor:grab; touch-action:none; color:#11151c; font-weight:800; font-size:1rem; box-shadow:0 3px 0 rgba(0,0,0,.25); background:hsl(var(--block-hue) 72% 72%); will-change:transform; }
    .block:active { cursor:grabbing; }
    .block[data-block-id="R"] { background:#ff624d; }
    .world-block { z-index:2; display:grid; place-items:center; margin:2px; border-radius:6px; color:#11151c; font-weight:850; }
    .unknown { background:#0b0f15; }
    #mode-controls:empty { display:none; }
    #mode-controls { display:flex; flex-wrap:wrap; gap:.45rem; margin:.8rem 0 0; }
    .meta { display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; margin:1rem 0; }
    .badge, button { border-radius:999px; padding:.55rem .8rem; border:1px solid #526178; background:#202936; color:inherit; }
    button { cursor:pointer; font-weight:700; }
    .meta button:hover { background:#303c4d; }
    #status { min-height:1.5rem; color:#bdc6d5; }
    #win { display:none; margin-top:1rem; padding:1rem; border-radius:10px; background:#d8ff7a; color:#17210a; font-weight:850; }
    #win.visible { display:block; }
    .instructions { color:#bdc6d5; font-size:.93rem; }
  </style>
</head>
<body>
  <main>
    <h1>unblock me</h1>
    <p class="lede" id="lede">Drag a block along its axis. Put the Red Block fully onto the Checkpoint.</p>
    <nav class="mode-switch" aria-label="App mode">
      <button data-mode="play" aria-pressed="true">Play</button>
      <button data-mode="world" aria-pressed="false">World</button>
      <button data-mode="closure" aria-pressed="false">Closure</button>
    </nav>
    <div id="board-frame"><div id="board" aria-label="Sliding block puzzle"></div></div>
    <div id="mode-controls"></div>
    <div class="meta">
      <span class="badge" id="moves">0 moves</span>
      <span class="badge" id="seed">Fixed level</span>
      <span class="badge" id="zoom">100% zoom</span>
      <span class="badge" id="history">0 recorded moves</span>
      <button data-action="new-level">New generated level</button>
      <button data-action="restart">Restart</button>
    </div>
    <div id="status" role="status">Drag a block across one or more cells.</div>
    <div id="win" role="alert">Checkpoint reached — you win.</div>
    <p class="instructions" id="instructions">Desktop: click and drag. Phone: touch and drag. One drag may cross several cells.</p>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>`;
