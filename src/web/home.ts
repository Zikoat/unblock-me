export const homeHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%237c4a1e"/><rect x="12" y="12" width="40" height="40" rx="3" fill="%23f3d9a4"/><rect x="51" y="22" width="13" height="10" fill="%23f3d9a4"/><g fill="%23b7791f"><rect x="33.5" y="13.5" width="7" height="27" rx="2"/><rect x="13.5" y="43.5" width="17" height="7" rx="2"/></g><rect x="13.5" y="23.5" width="17" height="7" rx="2" fill="%23dc2626"/></svg>'>
  <title>Unblock Me</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#11151c; color:#f4f0e5; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; }
    main { width:min(100%, 680px); padding:clamp(1.5rem, 6vw, 4rem); border:1px solid #39475a; border-radius:18px; background:#171e28; box-shadow:0 16px 50px rgba(0,0,0,.28); }
    h1 { margin:0; font-size:clamp(2.5rem, 12vw, 5.5rem); letter-spacing:-.09em; }
    p { color:#bdc6d5; font-size:1.08rem; line-height:1.6; }
    .play { display:inline-flex; align-items:center; min-height:3rem; margin-top:1rem; padding:.75rem 1.1rem; border:1px solid #d8ff7a; border-radius:10px; background:#d8ff7a; color:#17210a; font-weight:850; text-decoration:none; box-shadow:0 3px 0 #83934a; }
    .play:hover { background:#e3ff99; }
    .play:focus-visible { outline:3px solid #7cc7ff; outline-offset:4px; }
    .hint { margin-top:1.8rem; font-size:.95rem; }
  </style>
</head>
<body>
  <main>
    <h1>unblock me</h1>
    <p>Slide the Red Block horizontally until it fully occupies the Checkpoint.</p>
    <a class="play" href="./app/">Play Unblock Me</a>
    <p class="hint">The browser game opens on its own page, with finite play, World exploration, and the Dependency-closure experiment.</p>
  </main>
</body>
</html>`;
