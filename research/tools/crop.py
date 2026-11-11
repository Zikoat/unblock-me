"""Crop a region of a PDF page to PNG. Usage: crop.py <pdf> <page(1-based)> <x0> <y0> <x1> <y1> <out.png> [dpi=200]
Coordinates in PDF points (origin top-left), as printed by figs.py / blocks.py. Use 'full' instead of coords for the whole page."""
import sys, pymupdf
a = sys.argv; doc = pymupdf.open(a[1]); page = doc[int(a[2])-1]
if a[3] == "full": clip, out, dpi = page.rect, a[4], int(a[5]) if len(a) > 5 else 100
else: clip, out, dpi = pymupdf.Rect(*map(float, a[3:7])), a[7], int(a[8]) if len(a) > 8 else 200
page.get_pixmap(clip=clip, dpi=dpi).save(out); print(out, clip)
