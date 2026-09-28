"""Furniture read out of a plan's furniture layers, with no per-flat list.

Each connected drawing (a bed with its pillows, a sofa with its cushions) is one piece.
What it is comes from the words the architect wrote on or beside it ("Bed Side Table",
"4 Seater Sofa", "Godrej Almirah", "C.B."), else from its shape (a WC, a basin, a chair
by a table). Which way it faces: away from the wall it stands nearest. Anything it
cannot name is left out and listed, so the drawing is never guessed at. A flat that
needs more care names its own pieces script in flat.json (HKV-322 does).
"""
import math, re
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union, polygonize
from shapely.affinity import scale as sscale
from plan import geoms, NOT_ROOMS

# (words on the drawing, type, how deep a wall piece really is in metres or None)
RULES = [
    (r'bed ?side|side table|night ?stand', 'nightstand', None),
    (r'\bbed\b', 'bed', None),
    (r'\btv\b|t\.v\.', 'tv_unit', 0.40),
    (r'show ?case|crockery', 'showcase', 0.55),
    (r'almirah', 'almirah', 0.55),
    (r'wardrobe|^c\.? ?b\.?$', 'wardrobe', 0.61),
    (r'book|shel(f|ves)|dresser', 'bookshelf', 0.30),
    (r'mandir|pooja|temple', 'pooja', 0.30),
    (r'window (sitting|seat)|(sitting|seat) window|bay window|\bsitting\b', 'window_seat', None),
    (r'single seater|arm ?chair|lounge chair', 'armchair', None),
    (r'seater|sofa|couch', 'sofa', None),
    (r'daybed|diwan|divan', 'daybed', None),
    (r'cent(er|re) table', 'centre_table', None),
    (r'coffee table', 'coffee_table', None),
    (r'dining table', 'dining_table', None),
    (r'study|desk|work ?table', 'desk', 0.61),
    (r'shoe|console', 'shoe_cabinet', 0.40),
    (r'side ?board|buffet', 'sideboard', 0.45),
    (r'^w\.? ?m\.?$|washing', 'washer', None),
    (r'fridge|refrigerator|^ref\.?$', 'fridge', None),
]
FIXED = {'wardrobe', 'almirah', 'tv_unit', 'showcase', 'bookshelf', 'pooja', 'window_seat', 'washer', 'fridge', 'wc', 'basin'}
SKIP = re.compile(r'loft|above|beam|sunk|^ch\b', re.I)


def build(P, zone, S, report=None):
    report = report if report is not None else []
    sc = lambda g: sscale(g, S, S, origin=(0, 0))
    parts = []
    for lay, kind in P.lay['furniture'].items():
        for pl in P.L.get(lay, []):
            if len(pl) >= 2 and LineString(pl).length >= 0.02: parts.append((kind, LineString(pl)))

    def clusters(items, tol=0.004):
        blobs = geoms(unary_union([g.buffer(tol) for _, g in items]))
        return [(b, [(k, g) for k, g in items if g.intersects(b)]) for b in blobs]

    found = []
    for fam, items in (('furniture', [p for p in parts if p[0] != 'plumb']), ('plumbing', [p for p in parts if p[0] == 'plumb'])):
        for b, mine in clusters(items):
            hull = unary_union([g for _, g in mine]).convex_hull
            if hull.area >= 0.01: found.append({'family': fam, 'hull': hull, 'n': len(mine), 'lines': [g for _, g in mine]})
    found.sort(key=lambda f: -f['hull'].area)
    kept = []
    for f in found:        # a drawing inside a bigger one (pillows on a bed) is part of it
        host = next((k for k in kept if k['family'] == f['family'] and k['hull'].buffer(0.02).contains(f['hull'])), None)
        if host: host['n'] += f['n']; host['lines'] += f['lines']; continue
        kept.append(f)

    rooms = [(r['id'], Polygon(r['outline'])) for r in zone['rooms']]
    # every word on the plan except room names, dimensions and the title block's big type
    room_xy = {tuple(l['xy']) for l in P.labels}
    words = [(t['text'], Point(t['xy'])) for t in P.T
             if any(c.isalpha() for c in t['text']) and "'" not in t['text'] and not SKIP.search(t['text'])
             and tuple(t['xy']) not in room_xy and t['size'] <= (P.label_size or 10) * 1.2]

    def label(hull):
        on = [t for t, p in words if hull.buffer(0.05).contains(p)]
        if on: return ' '.join(on)
        near = sorted((p.distance(hull), t) for t, p in words if p.distance(hull) < 0.35)
        return ' '.join(t for _, t in near[:2])

    def obb(poly):
        r = poly.minimum_rotated_rectangle; c = list(r.exterior.coords)
        e0 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e1 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
        l0, l1 = math.hypot(*e0), math.hypot(*e1)
        ang = math.atan2(*(e0 if l0 >= l1 else e1)[::-1])
        snap = round(ang / (math.pi / 2)) * (math.pi / 2)
        if abs(ang - snap) < math.radians(4): ang = snap
        return {'cx': r.centroid.x, 'cy': r.centroid.y, 'w': max(l0, l1), 'd': min(l0, l1), 'angle': ang % math.pi}

    def back_wall(room, o, typ=None):
        """the unit vector toward the wall the piece stands closest to (of its four sides)"""
        rp = dict(rooms)[room].exterior
        best = None
        # a long piece stands with its long side to the wall
        # (a WC the other way: its cistern end)
        axes = ((o['angle'],) if typ == 'wc' else (o['angle'] + math.pi / 2,)) if o['w'] > 1.3 * o['d'] else (o['angle'], o['angle'] + math.pi / 2)
        for ax in axes:
            ext = (o['w'] if ax == o['angle'] else o['d']) / 2
            for s in (1, -1):
                v = (math.cos(ax) * s, math.sin(ax) * s)
                edge = Point(o['cx'] + v[0] * ext, o['cy'] + v[1] * ext)
                gap = edge.distance(rp)
                if best is None or gap < best[0]: best = (gap, v)
        return best[1]

    OUT = []

    def add(pid, typ, name, room, cx, cy, across, along, facing, fixed, extra=None):
        ang = math.atan2(facing[1], facing[0]) - math.pi / 2 if facing else 0.0
        c, s = math.cos(ang), math.sin(ang)
        pts = [(cx + u * c - v * s, cy + u * s + v * c) for u, v in ((-across / 2, -along / 2), (across / 2, -along / 2), (across / 2, along / 2), (-across / 2, along / 2), (-across / 2, -along / 2))]
        p = {'id': pid, 'type': typ, 'name': name, 'room': room, 'home': room,
             'obb': {'cx': round(cx, 4), 'cy': round(cy, 4), 'w': round(across, 4), 'd': round(along, 4), 'angle': round(ang, 4)},
             'footprint': [[round(x, 3), round(y, 3)] for x, y in pts],
             'facing': [round(facing[0], 4), round(facing[1], 4)] if facing else None, 'movable': not fixed, 'source': 'plan'}
        if extra: p.update(extra)
        OUT.append(p)

    count = {}

    def kind(text):
        low = text.lower()
        for pat, t, dep in RULES:
            if re.search(pat, low): return t, dep
        return None, None

    def phrases(hull):
        """the words written on a drawing, joined into phrases (a label may run over two
        lines), each with its type: [(type, text, point)]"""
        on = sorted([(p, t) for t, p in words if hull.buffer(0.05).contains(p)], key=lambda q: (-q[0].y, q[0].x))
        groups = []
        for p, t in on:
            g = next((g for g in groups if abs(g[-1][0].y - p.y) < 0.2 and abs(g[-1][0].x - p.x) < 0.5), None)
            (g.append((p, t)) if g else groups.append([(p, t)]))
        out = []
        for g in groups:
            text = ' '.join(t for _, t in g)
            out.append((kind(text)[0], text, Point(sum(p.x for p, _ in g) / len(g), sum(p.y for p, _ in g) / len(g))))
        return out

    def place(hull_sheet, text, family, room=None):
        """one drawing, one piece"""
        hull = sc(hull_sheet); o = obb(hull)
        room = room or next((rid for rid, rp in rooms if rp.contains(Point(o['cx'], o['cy']))), None)
        if not room: return
        typ, depth = kind(text)
        if not typ and family == 'plumbing':
            long_, short = o['w'], o['d']
            if long_ < 0.25: return
            typ = 'wc' if 0.45 <= long_ <= 0.85 and long_ / max(short, 0.01) > 1.4 else 'basin' if long_ < 0.75 else 'vanity'
        if not typ:
            report.append(f"unnamed drawing in {room}: {o['w']:.2f} x {o['d']:.2f} m at ({o['cx']:.2f}, {o['cy']:.2f}) {text!r}")
            return
        count[typ] = count.get(typ, 0) + 1
        pid = f"{room}-{typ}-{count[typ]}"
        name = text if text and typ not in ('wc', 'basin', 'vanity') else typ.replace('_', ' ')
        name = name[:1].upper() + name[1:]
        if typ in ('centre_table', 'coffee_table', 'round_table', 'dining_table'):
            OUT.append({'id': pid, 'type': typ, 'name': name, 'room': room, 'home': room,
                        'obb': {k: round(v, 4) for k, v in o.items()},
                        'footprint': [[round(x, 3), round(y, 3)] for x, y in hull.minimum_rotated_rectangle.exterior.coords],
                        'facing': None, 'movable': True, 'source': 'plan'})
            return
        back = back_wall(room, o, typ)
        facing = (-back[0], -back[1])
        along_long = abs(math.cos(o['angle']) * back[0] + math.sin(o['angle']) * back[1]) > 0.7
        across, along = (o['d'], o['w']) if along_long else (o['w'], o['d'])
        cx, cy = o['cx'], o['cy']
        if depth and along > depth + 0.05:       # the drawing includes clearance: keep the back face where drawn
            shift = (along - depth) / 2; cx += back[0] * shift; cy += back[1] * shift; along = depth
        extra = None
        if typ == 'sofa':
            m = re.search(r'(\d)\s*seater', text.lower()); extra = {'seats': int(m[1]) if m else max(1, round(across / 0.62))}
        add(pid, typ, name, room, cx, cy, across, along, facing, typ in FIXED, extra)

    def bed_set(f, ph):
        """a bed drawn touching its bedside tables: the tables sit where their labels are,
        the bed spans between them"""
        hull = sc(f['hull']); o = obb(hull)
        room = next((rid for rid, rp in rooms if rp.contains(Point(o['cx'], o['cy']))), None)
        if not room: return
        stands = [sc(p) for t, _, p in ph if t == 'nightstand']
        # the axis the tables line up along runs across the bed's head
        if len(stands) >= 2:
            dx, dy = stands[-1].x - stands[0].x, stands[-1].y - stands[0].y; l = math.hypot(dx, dy); ax = (dx / l, dy / l)
        else:
            ax = (math.cos(o['angle']), math.sin(o['angle']))
        ax = (round(ax[0]), round(ax[1])) if abs(abs(ax[0]) - 1) < 0.1 or abs(abs(ax[1]) - 1) < 0.1 else ax
        nrm = (-ax[1], ax[0])
        pts = list(hull.exterior.coords)
        proj = lambda q, v: (q[0] - o['cx']) * v[0] + (q[1] - o['cy']) * v[1]
        span_a = [proj(q, ax) for q in pts]; span_n = [proj(q, nrm) for q in pts]
        wide, long_ = max(span_a) - min(span_a), max(span_n) - min(span_n)
        ns_w, ns_d = 0.46, 0.41
        bed_w = wide - ns_w * len(stands) if len(stands) else wide
        # the head is the end the tables sit at
        side = sum(proj((p.x, p.y), nrm) for p in stands) / len(stands) if stands else 0
        head = (nrm[0] * (1 if side > 0 else -1), nrm[1] * (1 if side > 0 else -1))
        facing = (-head[0], -head[1])
        mid_a = (max(span_a) + min(span_a)) / 2; mid_n = (max(span_n) + min(span_n)) / 2
        bx, by = o['cx'] + ax[0] * mid_a + nrm[0] * mid_n, o['cy'] + ax[1] * mid_a + nrm[1] * mid_n
        count['bed'] = count.get('bed', 0) + 1
        add(f"{room}-bed-{count['bed']}", 'bed', 'Bed', room, bx, by, bed_w, long_, facing, False)
        for p in stands:
            count['nightstand'] = count.get('nightstand', 0) + 1
            hx = o['cx'] + nrm[0] * (mid_n + (long_ / 2 - ns_d / 2) * (1 if side > 0 else -1))
            hy = o['cy'] + nrm[1] * (mid_n + (long_ / 2 - ns_d / 2) * (1 if side > 0 else -1))
            t = proj((p.x, p.y), ax)
            add(f"{room}-nightstand-{count['nightstand']}", 'nightstand', 'Bedside table', room,
                hx + ax[0] * t, hy + ax[1] * t, ns_w, ns_d, facing, False)

    def dining_set(f, ph):
        """a table drawn with its chairs: the chairs are the small closed shapes round it,
        and how far out they sit gives the table's size"""
        hull = sc(f['hull']); o = obb(hull)
        room = next((rid for rid, rp in rooms if rp.contains(Point(o['cx'], o['cy']))), None)
        if not room: return
        faces = sorted([sc(g) for g in polygonize(unary_union(f['lines'])) if g.area > 0.01], key=lambda g: -g.area)
        chairs = []
        for g in faces:
            r = g.minimum_rotated_rectangle; c = list(r.exterior.coords)
            a, b = sorted((math.dist(c[0], c[1]), math.dist(c[1], c[2])))
            if 0.15 <= a <= 0.7 and 0.35 <= b <= 0.8 and not any(h.buffer(0.02).contains(g) for h in chairs):
                chairs.append(g)
        cx, cy = o['cx'], o['cy']
        rnd = f['hull'].area / max(f['hull'].minimum_rotated_rectangle.area, 1e-6) > 0.7 and o['w'] / max(o['d'], 0.01) < 1.2
        if len(chairs) >= 2:
            R = sum(math.hypot(g.centroid.x - cx, g.centroid.y - cy) for g in chairs) / len(chairs)
            dia = round(max(0.8, 2 * (R - 0.15)), 2)
        else:
            dia = max(0.9, o['d'] - 1.0)
        if rnd:
            OUT.append({'id': f'{room}-dining-table', 'type': 'round_table', 'name': 'Dining table', 'room': room, 'home': room,
                        'obb': {'cx': round(cx, 4), 'cy': round(cy, 4), 'w': dia, 'd': dia, 'angle': 0},
                        'footprint': [[round(cx + dia / 2 * math.cos(a), 3), round(cy + dia / 2 * math.sin(a), 3)] for a in [i * math.pi / 16 for i in range(33)]],
                        'facing': None, 'movable': True, 'source': 'plan'})
        else:
            place(f['hull'], 'dining table', 'furniture', room)
        for i, g in enumerate(chairs):
            vx, vy = g.centroid.x - cx, g.centroid.y - cy; l = math.hypot(vx, vy) or 1
            add(f'{room}-dining-chair-{i}', 'dining_chair', 'Dining chair', room, cx + vx / l * (l + 0.12), cy + vy / l * (l + 0.12),
                0.46, 0.5, (-vx / l, -vy / l), False)

    def split(f, ph):
        """two labelled pieces drawn as one (a TV unit running into a bookshelf): cut at
        the drawn line across it that lies between the two labels"""
        o = obb(f['hull']); ax = (math.cos(o['angle']), math.sin(o['angle']))
        proj = lambda q: (q[0] - o['cx']) * ax[0] + (q[1] - o['cy']) * ax[1]
        ph = sorted(ph, key=lambda q: proj((q[2].x, q[2].y)))
        cuts = []
        for g in f['lines']:
            c = list(g.coords)
            for a, b in zip(c, c[1:]):
                v = (b[0] - a[0], b[1] - a[1]); l = math.hypot(*v)
                if l > 0.6 * o['d'] and abs(v[0] * ax[0] + v[1] * ax[1]) / l < 0.1: cuts.append((proj(a) + proj(b)) / 2)
        pts = list(f['hull'].exterior.coords); lo, hi = min(map(proj, pts)), max(map(proj, pts))
        bounds = [lo]
        for (_, _, p0), (_, _, p1) in zip(ph, ph[1:]):
            a0, a1 = proj((p0.x, p0.y)), proj((p1.x, p1.y))
            inner = [c for c in cuts if a0 < c < a1]
            bounds.append(min(inner, key=lambda c: abs(c - (a0 + a1) / 2)) if inner else (a0 + a1) / 2)
        bounds.append(hi)
        nrm = (-ax[1], ax[0])
        for (t, text, _), a0, a1 in zip(ph, bounds, bounds[1:]):
            half = o['d'] / 2; cxp, cyp = o['cx'], o['cy']
            q = [(cxp + ax[0] * a + nrm[0] * s * half, cyp + ax[1] * a + nrm[1] * s * half) for a, s in ((a0, -1), (a1, -1), (a1, 1), (a0, 1))]
            place(Polygon(q), text, f['family'])

    for f in kept:
        ph = [q for q in phrases(f['hull']) if q[0]]
        types = {t for t, _, _ in ph}
        if 'dining_table' in types: dining_set(f, ph)
        elif 'bed' in types and 'nightstand' in types: bed_set(f, ph)
        elif len(types) >= 2 and f['family'] == 'furniture': split(f, ph)
        else: place(f['hull'], ' '.join(t for _, t, _ in ph) if ph else label(f['hull']), f['family'])
    # one fitting drawn as two outlines (a basin's rim and bowl) is one piece
    fp = [Polygon(p['footprint']) for p in OUT]
    drop = set()
    for i in range(len(OUT)):
        for j in range(len(OUT)):
            if i != j and j not in drop and OUT[i]['type'] == OUT[j]['type'] and fp[i].area <= fp[j].area and fp[i].intersection(fp[j]).area > 0.5 * fp[i].area:
                drop.add(i); break
    return [p for k, p in enumerate(OUT) if k not in drop]
