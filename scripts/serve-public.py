"""The public game: serves public/ (the last committed build, scripts/publish.sh) at the
root of https://hockey-mandolin.exe.xyz/, and takes play data uploads into play-data/.
Everything else on the VM stays behind the exe.dev login (the homepage is on :8000)."""
import datetime
import functools
import http.server
import json
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
PLAY_DATA = ROOT / "play-data"
MAX_UPLOAD = 1_000_000  # bytes per upload
MAX_FILES = 500  # uploads kept, all devices together
MAX_TOTAL = 200_000_000  # bytes kept


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self) -> None:
        # The game's play data: automatic uploads name their device and replace its last
        # upload; the upload block's each get a new file.
        path, _, query = self.path.partition("?")
        if path != "/play-data":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_UPLOAD:
            self.send_error(413)
            return
        body = self.rfile.read(length)
        try:
            json.loads(body)
        except ValueError:
            self.send_error(400)
            return
        PLAY_DATA.mkdir(exist_ok=True)
        device = urllib.parse.parse_qs(query).get("device", [""])[0]
        if device and re.fullmatch(r"[A-Za-z0-9-]{1,40}", device):
            name = f"device-{device}.json"
        else:
            name = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ") + ".json"
        files = list(PLAY_DATA.iterdir())
        if not (PLAY_DATA / name).exists() and (len(files) >= MAX_FILES or sum(f.stat().st_size for f in files) + length > MAX_TOTAL):
            self.send_error(507)
            return
        (PLAY_DATA / name).write_bytes(body)
        self.send_response(204)
        self.end_headers()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


handler = functools.partial(Handler, directory=str(ROOT / "public"))
http.server.ThreadingHTTPServer(("0.0.0.0", 8080), handler).serve_forever()
