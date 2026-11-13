"""The public game: serves public/ (the last committed build, scripts/publish.sh) at the
root of https://hockey-mandolin.exe.xyz/, and takes play data uploads into play-data/.
Everything else on the VM stays behind the exe.dev login (the homepage is on :8000)."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
# (Tests run it on a free port, over dist/ and an empty play-data folder.)
PORT = int(os.environ.get("PORT", "8080"))
PUBLIC = pathlib.Path(os.environ.get("PUBLIC_DIR", ROOT / "public"))
PLAY_DATA = pathlib.Path(os.environ.get("PLAY_DATA_DIR", ROOT / "play-data"))
MAX_UPLOAD = 8_000_000  # bytes per upload (the stored rooms made uploads pass 1 MB)
MAX_FILES = 500  # uploads kept, all devices together
MAX_TOTAL = 200_000_000  # bytes kept


# A player's progress, for another browser opened with ?p=<id> (src/carry.ts): only these keys
# of the device's last upload (isProgressKey there), and only for a well-formed existing id.
# Anyone with the link gets that progress and play log; the id is a random UUID.
PLAYER_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
PROGRESS_KEY = re.compile(r"unblock-me:(v\d+:(seed|moved|history|goal|rooms|seen)|tries|walls|camera|rooms-made|detail|log)")


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        path, _, query = self.path.partition("?")
        if path != "/progress":
            return super().do_GET()
        device = urllib.parse.parse_qs(query).get("p", [""])[0]
        file = PLAY_DATA / f"device-{device}.json"
        if not PLAYER_ID.fullmatch(device) or not file.is_file():
            self.send_error(404)
            return
        try:
            stored = json.loads(file.read_bytes()).get("stored") or {}
        except (ValueError, AttributeError):
            self.send_error(503)  # unreadable: not "no such player", so the page doesn't take the id
            return
        body = json.dumps({"stored": {k: v for k, v in stored.items() if PROGRESS_KEY.fullmatch(k)}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        # The game's play data: automatic uploads name their device and replace its last
        # upload; the upload block's each get a new file; a trial's name the trial too.
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
        params = urllib.parse.parse_qs(query)
        device = params.get("device", [""])[0]
        trial = params.get("trial", [""])[0]
        session = params.get("session", [""])[0]
        ok = lambda v, n: re.fullmatch(r"[A-Za-z0-9-]{1,%d}" % n, v)
        if trial and ok(trial, 12) and ok(device, 40) and ok(session, 16):
            # A trial's play (?trial=), one file per page load, apart from the device's own.
            name = f"trial-{trial}-{device}-{session}.json"
        elif device and ok(device, 40):
            name = f"device-{device}.json"
        else:
            name = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ") + ".json"
        files = list(PLAY_DATA.iterdir())
        if not (PLAY_DATA / name).exists() and (len(files) >= MAX_FILES or sum(f.stat().st_size for f in files) + length > MAX_TOTAL):
            self.send_error(507)
            return
        # Written whole, then renamed into place: GET /progress never reads half an upload.
        part = PLAY_DATA / f".{name}.part"
        part.write_bytes(body)
        os.replace(part, PLAY_DATA / name)
        self.send_response(204)
        self.end_headers()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):  # type: ignore[override]
        # Byte ranges, which Safari needs to play a video (reports' films): one range, of a
        # file; everything else as the base class does.
        self.range_left = None
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        path = pathlib.Path(self.translate_path(self.path))
        if not match or not path.is_file() or match.group(0) == "bytes=-":
            return super().send_head()
        size = path.stat().st_size
        first, last = match.groups()
        start = int(first) if first else max(0, size - int(last))
        end = min(size - 1, int(last)) if first and last else size - 1
        if start >= size or start > end:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self.range_left = end - start + 1
        return f

    def copyfile(self, source, outputfile) -> None:  # type: ignore[override]
        left = self.range_left
        if left is None:
            return super().copyfile(source, outputfile)
        while left > 0:
            chunk = source.read(min(64 * 1024, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)


handler = functools.partial(Handler, directory=str(PUBLIC))
http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler).serve_forever()
