"""A flat's plan, read out of the architect's layered PDF: walls, doors, windows, rooms,
and the scale that makes the printed dimensions come true.

Everything particular to one flat lives in its flats/<id>/flat.json (layer names if they
differ from Studio Spindle's, room names the defaults get wrong, and `fixes` for what a
drawing leaves implicit: a door drawn without a swing, an open-plan boundary, an outdoor
area). Coordinates in `fixes` are sheet metres: the frame `make_flat.py --report` prints
and the grid on its check image shows, before the scale correction.
"""
import json, math, re, statistics, sys
from collections import defaultdict
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree
from pdf_layers import load

CUT = 2.1                     # section cut, as B-34: door-head height
SILL = 0.9

# Studio Spindle's layer names (ALD-01); a flat.json `layers` block overrides any of them
LAYERS = {
    'walls': ['RH-RCC BRICK'],
    'hatch': ['RH-HATCH', 'HATCH'],
    'openings': ['RH-DOOR WINDOW', 'A_Door', 'RH-GLASS'],
    'glass': ['RH-GLASS'],
    'furniture': {'RH-LOW HT FURNITURE': 'low', 'RH-FULL HT FURNITURE': 'full', 'RH- PLUMBING FIX': 'plumb', 'RH- FURN HATCH': 'hatch'},
}

# What the plan's room names mean. First match wins; \1 is the room's number. A name
# not here becomes its own id and title (flat.json `rooms` can rename anything).
ROOM_NAMES = [
    (r'MASTER BED ?ROOM', 'master', 'Master bedroom'),
    (r'GUEST BED ?ROOM', 'guest', 'Guest bedroom'),
    (r'BED ?ROOM[ -]*(\d+)', r'bed\1', r'Bedroom \1'),
    (r'BED ?ROOM', 'bed', 'Bedroom'),
    (r'(?:TLT|TOILET|BATH ?ROOM|WASH ?ROOM)[ -]*(\d+)', r'tlt\1', r'Toilet \1'),
    (r'S\.? ?TLT|SERVANT(?:\'S)? (?:TLT|TOILET)', 'stlt', 'Servant toilet'),
    (r'P\.? ?(?:TLT|TOILET)|POWDER(?: ROOM)?', 'powder', 'Powder room'),
    (r'(?:TLT|TOILET|BATH ?ROOM)', 'tlt', 'Toilet'),
    (r'LIVING(?: ROOM| AREA)?|DRAWING(?: ROOM)?|LOUNGE', 'living', 'Living room'),
    (r'DINING(?: ROOM| AREA)?', 'dining', 'Dining'),
    (r'KITCHEN', 'kitchen', 'Kitchen'),
    (r'FOYER|ENTRANCE|ENTRY', 'foyer', 'Foyer'),
    (r'LOBBY|PASSAGE|CORRIDOR', 'lobby', 'Lobby'),
    (r'STUDY|OFFICE', 'study', 'Study'),
    (r'POOJA|MANDIR|PRAYER', 'pooja', 'Pooja room'),
    (r'STORE(?: ROOM)?', 'store', 'Store'),
    (r'UTILITY|WASH(?: AREA)?', 'utility', 'Utility'),
    (r'DRESS(?:ING)?(?: ROOM)?|WALK[- ]IN', 'dress', 'Dressing'),
    (r'SERVANT(?:\'S)? ROOM|STAFF ROOM', 'servant', 'Servant room'),
    (r'FAMILY(?: LOUNGE| ROOM)?', 'family', 'Family lounge'),
    (r'BALCONY', 'balcony', 'Balcony'),
    (r'VARANDAH|VERANDAH|VERANDA', 'varandah', 'Varandah'),
    (r'TERRACE', 'terrace', 'Terrace'),
]
# labels drawn at room-name size that name a fitting, not a room
NOT_ROOMS = re.compile(r'^(C\.? ?B\.?|W\.? ?M\.?|D\.? ?W\.?|REF\.?|FRIDGE|A\.? ?C\.?|OHT|SHAFT|DUCT|UP|DN|LIFT|N)$')


def room_for(text, overrides):
    k = ' '.join(text.upper().split())
    if k in overrides: return overrides[k]['id'], overrides[k]['name']
    for pat, rid, name in ROOM_NAMES:
        m = re.fullmatch(pat, k)
        if m: return m.expand(rid).lower(), m.expand(name)
    return re.sub(r'[^a-z0-9]+', '-', k.lower()).strip('-'), k.capitalize()


def geoms(g):
    if g.is_empty: return []
    return [x for x in (g.geoms if hasattr(g, 'geoms') else [g]) if x.geom_type == 'Polygon' and not x.is_empty]


def clean(p, tol=0.004):
    return p.simplify(tol, preserve_topology=True).buffer(0)


def circle_centre(a, b, c):
    ax, ay = a; bx, by = b; cx, cy = c
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-9: return None
    ux = ((ax*ax + ay*ay) * (by - cy) + (bx*bx + by*by) * (cy - ay) + (cx*cx + cy*cy) * (ay - by)) / d
    uy = ((ax*ax + ay*ay) * (cx - bx) + (bx*bx + by*by) * (ax - cx) + (cx*cx + cy*cy) * (bx - ax)) / d
    return (ux, uy)


def caps(segs, reach=0.4):
    """Close wall outlines left open at their ends (a dashed run or a window frame
    finishes them on the drawing): join each dangling end to the nearest other
    dangling end across the wall's thickness."""
    ends = [Point(g.coords[0]) for g in segs] + [Point(g.coords[-1]) for g in segs]
    tree = STRtree(segs)
    dang = []
    for p in ends:
        touching = [i for i in tree.query(p.buffer(0.004)) if segs[i].distance(p) < 0.004]
        if len(touching) <= 1: dang.append(p)
    out, used = [], set()
    for i, p in enumerate(dang):
        if i in used: continue
        best = None
        for j, q in enumerate(dang):
            if j == i or j in used: continue
            dd = p.distance(q)
            if 0.05 < dd < reach and (best is None or dd < best[0]): best = (dd, j)
        if best:
            used.update((i, best[1])); out.append(LineString([p, dang[best[1]]]))
    return out


FEET = re.compile(r"""^(\d+)'(?:\s*-\s*(\d+)(?:\s*(1/2|½|12))?")?$""")

def feet_metres(text):
    """5'-4½" (which a PDF may spell 5'-412"), 6', 10'-7" -> metres, or None"""
    m = FEET.match(text.strip())
    if not m: return None
    inch = int(m[2] or 0) + (0.5 if m[3] else 0)
    return (int(m[1]) * 12 + inch) * 0.0254


class Plan:
    def __init__(self, pdf, cfg):
        self.cfg = cfg
        plan = cfg.get('plan', {})
        self.L, self.T, self.info = load(pdf, ratio=plan.get('sheet_ratio'))
        lay = {**LAYERS, **cfg.get('layers', {})}
        self.lay = lay
        pick = lambda names: [pl for n in names for pl in self.L.get(n, [])]
        fx = cfg.get('fixes', {})
        self.fix_doors = [box(*d['box']) for d in fx.get('door_strips', [])]
        self.fix_dividers = [(d['between'], d['line']) for d in fx.get('dividers', [])]
        self.fix_outdoor = fx.get('outdoor', [])
        self.fix_parapet = [Polygon(p) for p in fx.get('parapet', [])]

        # ---------------------------------------------------------------- walls
        dw_all = pick(lay['openings'])
        self.straight = straight = [pl for pl in dw_all if len(pl) == 2 or (len(pl) == 5 and pl[0] == pl[-1])]
        brick = [LineString(pl) for pl in pick(lay['walls']) if len(pl) >= 2 and LineString(pl).length > 0.005]
        hatch = [LineString(pl).interpolate(0.5, normalized=True) for pl in pick(lay['hatch']) if len(pl) >= 2]
        htree = STRtree(hatch)
        lines = brick + caps(brick)
        # a closed outline is wall where the drawing hatches it
        self.wall_polys = [clean(p) for p in polygonize(unary_union(lines)) if len(htree.query(p, predicate='contains')) >= 2]
        self.walls_u = unary_union(self.wall_polys)
        self.frames_u = unary_union([LineString(pl).buffer(0.03, cap_style=2) for pl in straight])

        # ---------------------------------------------------------------- doors
        arcs = []
        for pl in [pl for pl in dw_all if len(pl) > 5]:
            for a in arcs:
                if math.dist(a[-1], pl[0]) < 0.01: a.extend(pl[1:]); break
                if math.dist(a[0], pl[-1]) < 0.01: a[:0] = pl[:-1]; break
            else:
                arcs.append(list(pl))
        self.doors = []
        for a in arcs:
            c = circle_centre(a[0], a[len(a) // 2], a[-1])
            if not c: continue
            r = math.dist(c, a[0])
            if not (0.45 < r < 1.3) or math.dist(a[0], a[-1]) < 0.5: continue
            # the closed leaf lies along the wall: running on from the hinge past that end
            # lands in the far jamb; running past the open leaf's tip lands in the room
            scored = []
            for e in (a[0], a[-1]):
                ux, uy = (e[0] - c[0]) / r, (e[1] - c[1]) / r
                probe = LineString([(e[0] + ux * 0.05, e[1] + uy * 0.05), (e[0] + ux * 0.25, e[1] + uy * 0.25)])
                scored.append((probe.intersection(self.walls_u).length + probe.intersection(self.frames_u).length, e))
            scored.sort(key=lambda t: -t[0])
            self.doors.append({'hinge': c, 'strike': scored[0][1], 'tip': scored[1][1], 'r': r})
        self.door_strips = [self.door_strip(d).buffer(0.03, join_style=2) for d in self.doors] + self.fix_doors

        # ---------------------------------------------------------------- windows
        leaf_zones = [LineString([d['hinge'], d['tip']]).buffer(0.07) for d in self.doors]
        frame_lines = [pl for pl in straight if not any(LineString(pl).within(z) for z in leaf_zones)]
        blobs = geoms(unary_union([LineString(pl).buffer(0.03, cap_style=2) for pl in frame_lines]))
        glass_pl = [LineString(pl) for pl in pick(lay['glass'])]
        self.windows = []
        for b in blobs:
            if b.distance(self.walls_u) > 0.25: continue                       # a gate, outside
            rr = b.minimum_rotated_rectangle.exterior.coords
            edges = sorted(math.dist(rr[i], rr[i + 1]) for i in range(2))
            if edges[1] < 0.3: continue                                      # jamb marks
            if edges[0] < 0.085: continue                                    # one line: a sliding panel or shelf mark
            if any(b.distance(Point(d['hinge'])) < 0.08 and b.distance(Point(d['tip'])) < 0.12 for d in self.doors): continue   # a leaf
            if any(ds.contains(b.centroid) for ds in self.fix_doors): continue
            wl = [pl for pl in frame_lines if LineString(pl).within(b.buffer(0.001))]
            full = any(g.within(b.buffer(0.01)) for g in glass_pl)        # glass layer: full-height glazing
            self.windows.append({'blob': clean(b), 'lines': wl, 'full': full})

        # ---------------------------------------------------------------- rooms
        dividers = [LineString(p).buffer(0.02, cap_style=3) for _, p in self.fix_dividers]
        self.closed = closed = unary_union(self.wall_polys + [w['blob'] for w in self.windows] + self.door_strips + dividers)
        holes = [clean(Polygon(h)) for p in geoms(closed) for h in p.interiors]
        self.holes = [h for h in holes if h.area > 0.5]
        self.building = unary_union([Polygon(p.exterior) for p in geoms(closed)])
        self.find_rooms()

    # ------------------------------------------------------------------ helpers
    def door_strip(self, d):
        """The opening, exactly: across the hinge line, the band of offsets where the
        jambs on both sides are solid (wall or window frame) is the wall's thickness here."""
        (hx, hy), (sx, sy) = d['hinge'], d['strike']
        n = math.dist(d['hinge'], d['strike'])
        ux, uy = (sx - hx) / n, (sy - hy) / n
        nx, ny = -uy, ux
        solid = unary_union([self.walls_u, self.frames_u])
        ok = []
        for k in range(-40, 41):
            o = k / 100
            a = Point(hx - ux * 0.07 + nx * o, hy - uy * 0.07 + ny * o)
            b = Point(sx + ux * 0.07 + nx * o, sy + uy * 0.07 + ny * o)
            ok.append((o, solid.contains(a) and solid.contains(b)))
        runs, cur = [], []
        for o, good in ok:
            if good: cur.append(o)
            elif cur: runs.append(cur); cur = []
        if cur: runs.append(cur)
        if not runs: lo, hi = -0.13, 0.13
        else:
            run = min(runs, key=lambda r: min(abs(v) for v in r))
            lo, hi = run[0] - 0.01, run[-1] + 0.01
        a = (hx - ux * 0.05, hy - uy * 0.05); b = (sx + ux * 0.05, sy + uy * 0.05)
        d['band'] = (lo, hi); d['u'] = (ux, uy); d['n'] = (nx, ny)
        return Polygon([(a[0] + nx * lo, a[1] + ny * lo), (b[0] + nx * lo, b[1] + ny * lo),
                        (b[0] + nx * hi, b[1] + ny * hi), (a[0] + nx * hi, a[1] + ny * hi)])

    def find_rooms(self):
        """Each closed region takes the room name written inside it. Room names are the
        sheet's most common large capitals inside the building; 'CH:' under a name is
        its ceiling height in inches."""
        overrides = {' '.join(k.upper().split()): v for k, v in self.cfg.get('rooms', {}).items()}
        inside = [t for t in self.T if self.building.buffer(0.3).contains(Point(t['xy']))]
        caps_ = [t for t in inside if t['text'] == t['text'].upper() and re.search(r'[A-Z]', t['text'])
                 and not t['text'].replace(' ', '').startswith('CH:') and "'" not in t['text'] and '"' not in t['text']]
        sizes = defaultdict(int)
        for t in caps_: sizes[round(t['size'], 1)] += 1
        big = [s for s, n in sizes.items() if n >= 3]
        self.label_size = max(big) if big else None
        names = [t for t in caps_ if self.label_size and abs(t['size'] - self.label_size) < 0.3 and not NOT_ROOMS.match(t['text'].strip())]
        self.labels = []
        for t in names:
            rid, name = room_for(t['text'], overrides)
            self.labels.append({'id': rid, 'name': name, 'text': t['text'], 'xy': t['xy']})
        # two labels the defaults map to one id (two BEDROOMs): number them
        seen = defaultdict(int)
        for l in self.labels:
            seen[l['id']] += 1
            if seen[l['id']] > 1: l['id'] += str(seen[l['id']])
        self.CH = {}
        for t in self.T:
            s = t['text'].replace(' ', '')
            if s.startswith('CH:') and self.labels:
                near = min(self.labels, key=lambda l: math.dist(l['xy'], t['xy']))
                if math.dist(near['xy'], t['xy']) < 0.35:
                    try: self.CH[near['id']] = float(s[3:].rstrip('"'))
                    except ValueError: pass
        self.rooms, self.room_meta, self.problems = {}, {}, []
        for h in self.holes:
            hit = [l for l in self.labels if h.contains(Point(l['xy']))]
            if len(hit) == 1:
                self.rooms[hit[0]['id']] = h; self.room_meta[hit[0]['id']] = hit[0]
            elif len(hit) > 1:
                self.problems.append(f"one region holds {[l['text'] for l in hit]}: add a divider between them in flat.json fixes")
        for o in self.fix_outdoor:
            vb = box(*o['box'])
            parts = geoms(vb.difference(self.building.buffer(0.001)))
            if not parts: self.problems.append(f"outdoor {o['id']}: its box lies inside the building"); continue
            self.rooms[o['id']] = clean(max(parts, key=lambda g: g.area))
            self.room_meta[o['id']] = {'id': o['id'], 'name': o['name'], 'text': None, 'xy': None}
        for l in self.labels:
            if l['id'] not in self.rooms:
                self.problems.append(f"label {l['text']!r} at {tuple(round(v, 2) for v in l['xy'])} is in no closed room"
                                     " (outdoors? add it to fixes.outdoor; a door without a swing? add fixes.door_strips)")

    # ------------------------------------------------------------------ scale
    def calibrate(self):
        """The factor that makes the printed dimensions true: each dimension text (5'-4½")
        read against the wall-face-to-wall-face distance through it. A sheet plotted to
        fit reads the same factor everywhere; furniture and partial dimensions scatter."""
        rows = []
        faces = self.walls_u.boundary
        for t in self.T:
            real = feet_metres(t['text'])
            if not real or real < 1.2: continue          # short ones are joinery, not rooms
            x, y = t['xy']
            for off in (-0.05, 0, 0.05):
                ray = LineString([(x + off, y - 12), (x + off, y + 12)]) if t['vertical'] else LineString([(x - 20, y + off), (x + 20, y + off)])
                pts = [(g.x, g.y) for g in geoms_points(ray.intersection(faces))]
                k = 1 if t['vertical'] else 0
                lo = [p[k] for p in pts if p[k] < t['xy'][k]]; hi = [p[k] for p in pts if p[k] > t['xy'][k]]
                if lo and hi:
                    rows.append({'text': t['text'], 'real': real, 'drawn': min(hi) - max(lo), 'xy': t['xy']})
                    break
        for r in rows: r['k'] = r['real'] / r['drawn']
        # the tightest cluster of factors is the sheet's; the rest are not wall to wall
        ks = sorted(r['k'] for r in rows)
        best = max(((i, j) for i in range(len(ks)) for j in range(i, len(ks)) if ks[j] - ks[i] <= 0.01 * ks[i]),
                   key=lambda ij: ij[1] - ij[0], default=None)
        if not best: return None, rows
        cluster = ks[best[0]:best[1] + 1]
        k = round(statistics.median(cluster), 4)
        for r in rows: r['fits'] = abs(r['k'] - k) <= 0.01 * k
        return (k if len(cluster) >= 3 else None), rows


def geoms_points(g):
    if g.is_empty: return []
    return [x for x in (g.geoms if hasattr(g, 'geoms') else [g]) if x.geom_type == 'Point']
