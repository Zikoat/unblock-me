"""Check cleaned/: front matter fields, image links resolve, unused images, leftovers. Usage: check.py <cleaned dir>"""
import sys, re, pathlib
root = pathlib.Path(sys.argv[1]).resolve(); need = ["title", "authors", "year", "venue", "source_url", "raw_path", "license", "relevance"]
for d in sorted(p for p in root.iterdir() if p.is_dir()):
    md = d / f"{d.name}.md"; probs = []
    if not md.exists(): print(f"{d.name}: NOT CLEANED YET ({', '.join(x.name for x in d.iterdir())[:80]})"); continue
    t = md.read_text(); fm = t.split("---")[1] if t.startswith("---") else ""
    probs += [f"missing {k}" for k in need if not re.search(rf"^{k}:", fm, re.M)]
    links = re.findall(r"!\[(?:[^\[\]]|\[[^\]]*\])*\]\(([^)\s]+)", t)
    probs += [f"broken img {l}" for l in links if not (d / l).exists()]
    imgs = {p.name for p in d.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".gif", ".svg")}
    unused = imgs - {pathlib.Path(l).name for l in links}
    if unused: probs.append(f"unused {sorted(unused)}")
    left = [p.name for p in d.iterdir() if p.name.endswith(".raw.md") or p.name == "figs.log"]
    if left: probs.append(f"leftover {left}")
    raw = re.search(r"^raw_path:\s*\"?([^\"\n]+)", fm, re.M)
    if raw and not (root.parent.parent / raw.group(1).strip()).exists(): probs.append(f"raw_path missing {raw.group(1)}")
    print(f"{d.name}: {len(t)//1000}k chars, {len(links)} imgs" + ("" if not probs else " | " + "; ".join(probs)))
