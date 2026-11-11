"""Propose and crop whole figures from a PDF (heuristic). Usage:
  figs.py <pdf> <outdir> [--dpi 200]
For every caption starting 'Figure N' / 'Fig. N', takes the graphics (images + vector drawings)
in the caption's column between the previous paragraph and the caption, plus text labels inside,
and renders that clip to <outdir>/fig-<N>.png. Prints page, bbox (PDF points) so a human/agent
can re-crop with crop.py when the guess is wrong. Pages with graphics but no caption are listed."""
import sys, re, pathlib, pymupdf
pdf = sys.argv[1]; out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
dpi = int(sys.argv[sys.argv.index("--dpi")+1]) if "--dpi" in sys.argv else 200
CAP = re.compile(r"^\s*(Figure|Fig\.?)\s*(\d+)\s*[:.|]?", re.I)
doc = pymupdf.open(pdf)
seen = set()
def graphics(page):
    rs = [pymupdf.Rect(i["bbox"]) for i in page.get_image_info()]
    for d in page.get_drawings():
        r = d["rect"]
        if r.width < 2 and r.height < 2: continue
        if r.width > page.rect.width*0.95 and r.height > page.rect.height*0.95: continue
        rs.append(pymupdf.Rect(r))
    return [r for r in rs if not r.is_empty or r.width>0 or r.height>0]
for pno, page in enumerate(doc):
    W, H = page.rect.width, page.rect.height
    blocks = [b for b in page.get_text("dict")["blocks"] if b["type"] == 0]
    def btext(b): return " ".join(s["text"] for l in b["lines"] for s in l["spans"]).strip()
    gr = graphics(page)
    caps = [(b, CAP.match(btext(b))) for b in blocks]
    caps = [(pymupdf.Rect(b["bbox"]), m.group(2), b) for b, m in caps if m]
    used = False
    for crect, num, cb in caps:
        if num in seen: continue
        full = crect.width > 0.55*W or (crect.x0 < 0.4*W and crect.x1 > 0.6*W)
        col = pymupdf.Rect(0, 0, W, H) if full else (pymupdf.Rect(0,0,W/2+5,H) if crect.x1 <= W/2+20 else pymupdf.Rect(W/2-5,0,W,H))
        # paragraph-like text blocks above the caption in this column bound the figure from above
        def para(b):
            t = btext(b); r = pymupdf.Rect(b["bbox"])
            return len(b["lines"]) >= 2 and len(t) > 120 and r.width > 0.6*col.width*(0.5 if full else 1)
        ylo = 0
        for b in blocks:
            r = pymupdf.Rect(b["bbox"])
            if r.y1 <= crect.y0 + 1 and r.intersects(col) and para(b) and b is not cb:
                if not any(g.intersects(r) for g in gr if g.height > 5): ylo = max(ylo, r.y1)
        cand = [g for g in gr if g.y0 >= ylo - 2 and g.y1 <= crect.y0 + 2 and g.intersects(col)]
        where = "above"
        if not cand:  # caption above figure?
            nxt = min([pymupdf.Rect(b["bbox"]).y0 for b in blocks if pymupdf.Rect(b["bbox"]).y0 > crect.y1 and pymupdf.Rect(b["bbox"]).intersects(col) and para(b)] + [H])
            cand = [g for g in gr if g.y0 >= crect.y1 - 2 and g.y1 <= nxt + 2 and g.intersects(col)]
            where = "below"
        if not cand:
            print(f"fig {num}: p{pno+1} caption at {tuple(round(x) for x in crect)} -- NO graphics found (maybe text/table figure); crop by hand"); continue
        u = pymupdf.Rect(cand[0])
        for g in cand[1:]: u |= g
        for b in blocks:  # labels inside the figure
            r = pymupdf.Rect(b["bbox"])
            if b is not cb and r.intersects(u) and not para(b): u |= r
        u = (u + (-4, -4, 4, 4)) & page.rect
        fn = out / f"fig-{num}.png"
        page.get_pixmap(clip=u, dpi=dpi).save(fn)
        seen.add(num); used = True
        print(f"fig {num}: p{pno+1} bbox=({u.x0:.0f},{u.y0:.0f},{u.x1:.0f},{u.y1:.0f}) graphics={len(cand)} figure-{where}-caption -> {fn.name}")
    if not caps and len([g for g in gr if g.width*g.height > 2000]) > 0:
        big = [g for g in gr if g.width*g.height > 2000]
        u = pymupdf.Rect(big[0])
        for g in big[1:]: u |= g
        print(f"p{pno+1}: {len(big)} graphics, no Figure caption on page; union bbox=({u.x0:.0f},{u.y0:.0f},{u.x1:.0f},{u.y1:.0f}) (table rules? logo? uncaptioned figure?)")
