"""Read the ALD-01 PDF's CAD layers (it is a vector export with the drawing's own
layer names) into plan metres. 1:50 on an A3 sheet: 1 pt = 0.3528 mm x 50."""
import pymupdf
from collections import defaultdict

import os
# the architect's ALD-01 PDF; not kept in the repo (it carries the client's name and address)
PDF = os.environ.get('ALD01_PDF', '/root/.claude/uploads/943923d8-2b5d-5b29-8f8e-fabb7d0a89a3/dc6a1c61-060726_HKV_322_LAYOUT_R1.pdf')
K = 25.4 / 72 * 50 / 1000          # metres per PDF point at the sheet's nominal 1:50 (build_zone.SCALE corrects it)
SHEET_H = 842.0

def to_m(x, y):
    return (round(x * K, 4), round((SHEET_H - y) * K, 4))   # y up the sheet

def bezier(p0, p1, p2, p3, n=10):
    out = []
    for k in range(n + 1):
        t = k / n; u = 1 - t
        out.append((u**3*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t**3*p3.x,
                    u**3*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t**3*p3.y))
    return out

def load(pdf=PDF):
    page = pymupdf.open(pdf)[0]
    layers = defaultdict(list)          # layer -> list of polylines (each a list of (x, y) metres)
    for d in page.get_drawings():
        L = d.get('layer') or ''
        for it in d['items']:
            op = it[0]
            if op == 'l': pl = [(it[1].x, it[1].y), (it[2].x, it[2].y)]
            elif op == 'c': pl = bezier(*it[1:5])
            elif op == 're':
                r = it[1]; pl = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]
            elif op == 'qu':
                q = it[1]; pl = [(p.x, p.y) for p in (q.ul, q.ur, q.lr, q.ll, q.ul)]
            else: continue
            layers[L].append([to_m(x, y) for x, y in pl])
    texts = []
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines', []):
            s = ''.join(sp['text'] for sp in line['spans']).strip()
            if not s: continue
            x0, y0, x1, y1 = line['bbox']
            texts.append({'text': s, 'xy': to_m((x0 + x1) / 2, (y0 + y1) / 2), 'size': line['spans'][0]['size']})
    return layers, texts
