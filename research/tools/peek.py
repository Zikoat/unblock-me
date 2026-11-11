import sys, pymupdf
for p in sys.argv[1:]:
    d = pymupdf.open(p)
    t = d[0].get_text()[:300].replace("\n"," | ")
    print(f"== {p.split('/')[-1]} pages={len(d)} meta={d.metadata.get('title')!r}\n   {t}\n")
