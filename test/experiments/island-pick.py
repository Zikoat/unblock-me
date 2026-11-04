# Pick one board per fewest count so each differs most from those picked before it (in
# blocks, solution moves and exit row), from island-levels.ts output kept several per count:
#   python3 test/experiments/island-pick.py <levels.json> <picked.json> <from> <to>
import json, sys
L = json.load(open(sys.argv[1]))
def cells(l):
    s = set()
    for p, pos in zip(l['pieces'], l['pos']):
        x, y = (pos, p['lane']) if p['h'] else (p['lane'], pos)
        s |= {(x, y, p['h']), (x + 1, y, 1) if p['h'] else (x, y + 1, 0)}
    return s
def moves(l):
    out = []
    for m in l['solution']:
        p = l['pieces'][m['piece']]
        out.append((m['piece'] == 0, p['h'], p['lane'], 1 if m['to'] > m['from'] else -1))
    return set(out)
def jac(a, b): return len(a & b) / max(1, len(a | b))
def sim(a, b):
    return 0.45 * jac(cells(a), cells(b)) + 0.45 * jac(moves(a), moves(b)) + 0.3 * (a['pieces'][0]['lane'] == b['pieces'][0]['lane'])
picked = []
for f in range(int(sys.argv[3]), int(sys.argv[4]) + 1):
    cands = [l for l in L if l['fewest'] == f]
    best = min(cands, key=lambda l: (max([sim(l, p) for p in picked] or [0]), len(l['pieces'])))
    picked.append(best)
    print(f, 'row', best['pieces'][0]['lane'], 'blocks', len(best['pieces']), 'max sim', round(max([sim(best, p) for p in picked[:-1]] or [0]), 2), 'of', len(cands))
json.dump(picked, open(sys.argv[2], 'w'))
