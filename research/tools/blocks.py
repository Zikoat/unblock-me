"""List text blocks (with bboxes in PDF points) and graphics on a page. Usage: blocks.py <pdf> <page(1-based)>"""
import sys, pymupdf
doc = pymupdf.open(sys.argv[1]); page = doc[int(sys.argv[2])-1]
print("page size", page.rect)
for b in page.get_text("dict")["blocks"]:
    r = [round(x) for x in b["bbox"]]
    if b["type"] == 0:
        t = " ".join(s["text"] for l in b["lines"] for s in l["spans"])[:90]
        print("T", r, t)
    else: print("I", r)
for i in page.get_image_info(): print("IMG", [round(x) for x in i["bbox"]])
ds = [d["rect"] for d in page.get_drawings() if d["rect"].width*d["rect"].height > 50]
print("drawings", len(ds), [tuple(round(x) for x in r) for r in ds[:30]])
