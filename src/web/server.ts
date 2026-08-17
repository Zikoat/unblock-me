import { join, resolve } from "node:path";

const dist = resolve(import.meta.dir, "..", "..", "dist");
const port = Number(Bun.env.PORT ?? 3000);
const files: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app": "app/index.html",
  "/app/": "app/index.html",
  "/app/index.html": "app/index.html",
  "/app/app.js": "app/app.js",
};

export function startServer(serverPort = port): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: serverPort,
    fetch(request) {
      const file = files[new URL(request.url).pathname];
      if (!file) return new Response("Not found", { status: 404 });
      return new Response(Bun.file(join(dist, file)), { headers: { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html" } });
    },
  });
}

if (import.meta.main) {
  startServer();
  console.log(`Unblock Me home: http://localhost:${port} (game: /app/)`);
}
