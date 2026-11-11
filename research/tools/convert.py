"""First pass of a paper: PDF -> <outdir>/<slug>.raw.md (pymupdf4llm text, picture placeholders kept as
position markers) and whole-figure crops <outdir>/fig-N.png (figs.py). The .raw.md is hand-cleaned into
<slug>.md and then deleted. Usage: convert.py <pdf> <outdir>"""
import sys, os, pathlib, subprocess
import pymupdf4llm
pdf, out = os.path.abspath(sys.argv[1]), pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
slug = pathlib.Path(pdf).stem
md = pymupdf4llm.to_markdown(pdf, write_images=False, page_chunks=True, show_progress=False)
text = "".join(f"\n\n<!-- PDF page {i+1} -->\n\n" + c["text"] for i, c in enumerate(md))
(out / f"{slug}.raw.md").write_text(text)
r = subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(os.path.abspath(__file__)), "figs.py"), pdf, str(out)], capture_output=True, text=True)
(out / "figs.log").write_text(r.stdout + r.stderr)
print(slug, len(text), "chars;", r.stdout.count("->"), "figures cropped")
