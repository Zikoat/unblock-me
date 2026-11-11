# research/tools

Scripts that turned the PDFs in `raw/papers/` into `cleaned/<slug>/`. They need PyMuPDF:
`uv venv ~/.venvs/research && VIRTUAL_ENV=~/.venvs/research uv pip install pymupdf pymupdf4llm`.
Run them with `~/.venvs/research/bin/python -I` from outside `raw/` (downloads are untrusted).

- `convert.py <pdf> <outdir>`: first pass. Writes `<slug>.raw.md` (pymupdf4llm text with
  `<!-- PDF page N -->` markers and picture placeholders) and runs `figs.py`.
- `figs.py <pdf> <outdir>`: guesses each "Figure N" region (graphics between the last paragraph and
  the caption, in the caption's column) and renders it to `fig-N.png` at 200 dpi; log in `figs.log`.
  Guesses can be cut short or too wide; check each one.
- `crop.py <pdf> <page> <x0> <y0> <x1> <y1> <out.png> [dpi]`: re-crop by hand (PDF points, origin
  top-left); `crop.py <pdf> <page> full <out.png> [dpi]` renders a whole page.
- `blocks.py <pdf> <page>`: text blocks, images and drawings with their boxes, to find crop coordinates.
- `peek.py <pdf>...`: title page text, to identify files.
- `check.py <cleaned dir>`: checks every cleaned paper (front matter fields, image links, unused images, leftovers, raw_path).

## Cleaning a paper (the standard every `cleaned/<slug>/<slug>.md` follows)

1. YAML front matter:
   ```yaml
   ---
   title: "..."
   authors: ["First Last", ...]
   year: 2024
   venue: "AIIDE 2024 (Proc. AAAI Conf. on AI and Interactive Digital Entertainment 20)"
   doi: "10.xxxx/..."        # if any
   source_url: "https://..."  # where the PDF came from / landing page
   raw_path: "research/raw/papers/<slug>.pdf"
   license: "CC BY 4.0 | arXiv non-exclusive | publisher copyright (author copy) | ..."
   relevance: |
     3-5 lines: what this paper gives Infinite Unblock Me (endless-board Rush Hour-like game that
     generates levels and cares about difficulty, solution shape and fast search).
   ---
   ```
2. The paper's full text in reading order, semantics kept (no summarising of the body): headings as
   `#`/`##`, fixed two-column interleaving, de-hyphenated words, no running headers, page numbers or
   publisher boilerplate. Footnotes at the end of their section or as a "Notes" list.
3. Math as MathJax: inline `$...$`, display `$$...$$`. Rebuild every formula from the PDF (the first
   pass turns math into broken Unicode/italics). Algorithms as fenced code blocks with the pseudocode.
4. Tables as markdown tables, checked cell by cell against the PDF.
5. Figures: `![alt](fig-N.png)` where the figure sits, then the caption as `*Figure N: ...*`.
   Look at each image; re-crop with `crop.py` if `figs.py` cut it wrong (whole figure incl. axis labels
   and legend, without caption or body text). The alt text describes what the figure shows; when a plot
   or diagram carries data useful to us (values, a puzzle board, a tree), add it under the caption
   (a small table, or a board as a text grid).
6. References kept as a numbered/alphabetic list at the end.
7. Delete `<slug>.raw.md` and `figs.log` and any unused `fig-*.png` when done.
