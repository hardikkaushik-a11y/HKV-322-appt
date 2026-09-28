"""Read an architect's plan PDF that kept its CAD layers (a vector export, as ALD-01)
into plan metres. Every stroke keeps its CAD layer name; text keeps its size.

The sheet's own scale ("1:50 @ A3") sets the nominal metres per point; make_flat.py
then corrects it against the printed dimensions (a sheet plotted to fit is off by a
few per cent)."""
import re
from collections import defaultdict
import pymupdf


def sheet_scale(page):
    """the '1:NN' the title block prints, or 50"""
    m = re.search(r'\b1\s*:\s*(\d{2,3})\b', page.get_text())
    return int(m[1]) if m else 50


def bezier(p0, p1, p2, p3, n=10):
    out = []
    for k in range(n + 1):
        t = k / n; u = 1 - t
        out.append((u**3*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t**3*p3.x,
                    u**3*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t**3*p3.y))
    return out


def load(pdf, page_no=0, ratio=None):
    """(layers, texts, info): layers maps a CAD layer to its polylines, in metres with
    y up the sheet; texts are {'text', 'xy', 'size'}."""
    page = pymupdf.open(pdf)[page_no]
    ratio = ratio or sheet_scale(page)
    K = 25.4 / 72 * ratio / 1000          # metres per PDF point at the sheet's nominal scale
    H = page.rect.height
    to_m = lambda x, y: (round(x * K, 4), round((H - y) * K, 4))
    layers = defaultdict(list)
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
            texts.append({'text': s, 'xy': to_m((x0 + x1) / 2, (y0 + y1) / 2), 'size': line['spans'][0]['size'],
                          'vertical': abs(line['dir'][1]) > 0.7})
    return layers, texts, {'ratio': ratio, 'layers': sorted(layers)}
