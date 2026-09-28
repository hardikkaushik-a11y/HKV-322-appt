"""HKV-322's furniture, read out of ALD-01's furniture layers and set piece by piece.

Each connected drawing (a bed with its pillows, a chair, a WC) becomes one piece with
its drawn footprint, oriented box and room. What each piece IS is set below by hand,
from the text the architect wrote beside it and the two site photos (pieces only in the
photos are marked source: 'site photo'). A new flat does not need a file like this:
without one, make_flat.py reads the furniture layers itself (build/furnish_auto.py).
flat.json names this file (`"pieces": "pieces.py"`), so the curated list wins here.
"""
import math
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.affinity import scale as sscale
from plan import geoms


def build(P, zone, S):
    L, T = P.L, P.T

    def sc(g): return sscale(g, S, S, origin=(0, 0))

    LAYERS = P.lay['furniture']
    parts = []
    for lay, kind in LAYERS.items():
        for pl in L[lay]:
            if len(pl) < 2: continue
            g = LineString(pl)
            if g.length < 0.02: continue
            parts.append((kind, g))

    # connected drawings, per layer family (hatch joins the low furniture it fills)
    def clusters(items, tol=0.015):
        blobs = geoms(unary_union([g.buffer(tol) for _, g in items]))
        out = []
        for b in blobs:
            mine = [(k, g) for k, g in items if g.intersects(b)]
            out.append((b, mine))
        return out

    low = [(k, g) for k, g in parts if k in ('low', 'hatch', 'full')]
    plumb = [(k, g) for k, g in parts if k == 'plumb']
    found = []
    for fam, items in (('furniture', low), ('plumbing', plumb)):
        for b, mine in clusters(items):
            hull = unary_union([g for _, g in mine]).convex_hull
            if hull.area < 0.01: continue
            found.append({'family': fam, 'hull': hull, 'kinds': sorted(set(k for k, _ in mine)), 'n': len(mine)})

    # a drawing wholly inside a bigger one (pillows on a bed, a cushion on a seat) is part of it
    found.sort(key=lambda f: -f['hull'].area)
    kept = []
    for f in found:
        host = next((k for k in kept if k['family'] == f['family'] and k['hull'].buffer(0.02).contains(f['hull'])), None)
        if host: host['n'] += f['n']; continue
        kept.append(f)

    rooms = [(r['id'], Polygon(r['outline'])) for r in zone['rooms']]
    words = [(t['text'], Point(t['xy'])) for t in T if t['size'] < 7 and any(c.isalpha() for c in t['text'])]

    def obb(poly):
        r = poly.minimum_rotated_rectangle
        c = list(r.exterior.coords)
        e0 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e1 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
        l0, l1 = math.hypot(*e0), math.hypot(*e1)
        long_e = e0 if l0 >= l1 else e1
        ang = math.atan2(long_e[1], long_e[0])
        # square to the walls: the flat is orthogonal; keep within 0-180
        snap = round(ang / (math.pi / 2)) * (math.pi / 2)
        if abs(ang - snap) < math.radians(4): ang = snap
        ang = (ang + math.pi) % math.pi
        if ang > math.pi - 1e-6: ang = 0.0
        return {'cx': round(r.centroid.x, 3), 'cy': round(r.centroid.y, 3), 'w': round(max(l0, l1), 3), 'd': round(min(l0, l1), 3), 'angle': round(ang, 4)}

    pieces = []
    for i, f in enumerate(kept):
        hull_m = sc(f['hull'])
        o = obb(hull_m)
        room = next((rid for rid, rp in rooms if rp.contains(Point(o['cx'], o['cy']))), None)
        near = sorted(((p.distance(f['hull']), t) for t, p in words if p.distance(f['hull']) < 0.35 / S), key=lambda x: x[0])
        label = ' '.join(t for _, t in near[:3])
        pieces.append({'i': i, 'family': f['family'], 'kinds': f['kinds'], 'n': f['n'], 'room': room, 'obb': o,
                       'footprint': [[round(x, 3), round(y, 3)] for x, y in hull_m.exterior.coords], 'label': label})

    def split(f, tol=0.002):
        """a merged drawing's own parts, finer: returns oriented boxes (metres)"""
        items = [(k, g) for k, g in low + plumb if g.intersects(f['hull'].buffer(0.01)) and f['hull'].buffer(0.02).contains(g)]
        subs = []
        for b, mine in clusters(items, tol):
            h = unary_union([g for _, g in mine]).convex_hull
            if h.area < 0.002: continue
            subs.append((h, len(mine)))
        subs.sort(key=lambda s: -s[0].area)
        out = []
        for h, n in subs:
            if any(o[0].buffer(0.01).contains(h) for o in out): continue
            out.append((h, n))
        return [(obb(sc(h)), n) for h, n in out]

    # ------------------------------------------------------------------ the pieces
    room_poly = dict(rooms)

    def at(room, x, y):
        """the drawn piece nearest a point in a room (so this list survives re-runs)"""
        c = [p for p in pieces if p['room'] == room]
        return min(c, key=lambda p: math.hypot(p['obb']['cx'] - x, p['obb']['cy'] - y))

    def rect(cx, cy, w, d, angle=0.0):
        c, s = math.cos(angle), math.sin(angle)
        pts = [(cx + u * c - v * s, cy + u * s + v * c) for u, v in ((-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2), (-w/2, -d/2))]
        return [[round(x, 3), round(y, 3)] for x, y in pts]

    def wall_side(room, o):
        """unit plan vector from the piece to the wall it stands against (short axis)"""
        rp = room_poly[room]
        n = (-math.sin(o['angle']), math.cos(o['angle']))
        best = None
        for s in (1, -1):
            for k in (0.05, 0.12, 0.2, 0.3):
                q = Point(o['cx'] + n[0] * s * (o['d'] / 2 + k), o['cy'] + n[1] * s * (o['d'] / 2 + k))
                if not rp.contains(q):
                    if best is None or k < best[0]: best = (k, s)
                    break
        s = best[1] if best else 1
        return (n[0] * s, n[1] * s)

    OUT = []
    def add(pid, typ, name, room, o, *, facing=None, movable=True, src='ALD-01', extra=None, footprint=None):
        o = {k: round(v, 4) for k, v in o.items()}
        p = {'id': pid, 'type': typ, 'name': name, 'room': room, 'home': room, 'obb': o,
             'footprint': footprint or rect(o['cx'], o['cy'], o['w'], o['d'], o['angle']),
             'facing': [round(facing[0], 4), round(facing[1], 4)] if facing else None, 'movable': movable, 'source': src}
        if extra: p.update(extra)
        OUT.append(p)

    def against(room, o, depth, typ, pid, name, **kw):
        """a wall-standing piece: `depth` deep, pushed flush to its wall, facing the room"""
        back = wall_side(room, o)
        # keep the back face where the drawing has it, bring the front in to `depth`
        o = dict(o); shift = (o['d'] - depth) / 2
        o['cx'] += back[0] * shift; o['cy'] += back[1] * shift
        o['d'] = depth
        add(pid, typ, name, room, o, facing=(-back[0], -back[1]), **kw)

    R90 = math.pi / 2
    def bed_set(room, pid):
        b = max((p for p in pieces if p['room'] == room), key=lambda p: p['n'])
        o = b['obb']; head_x = o['cx'] - 0.915          # both beds' heads are on the west wall
        bed = {'cx': head_x + 0.915, 'cy': o['cy'], 'w': 1.829, 'd': 1.829, 'angle': R90}
        add(f'{pid}-bed', 'bed', 'Bed, 6\' x 6\'', room, bed, facing=(1, 0), movable=True)
        for i, s in enumerate((-1, 1)):
            add(f'{pid}-nightstand-{i}', 'nightstand', 'Bedside table', room,
                {'cx': head_x + 0.203, 'cy': o['cy'] + s * (0.915 + 0.229), 'w': 0.457, 'd': 0.406, 'angle': R90}, facing=(1, 0))

    # master bedroom
    bed_set('master', 'master')
    against('master', at('master', 5.87, 6.11)['obb'], 0.61, 'wardrobe', 'master-cb', 'Wardrobe (C.B.)', movable=False)
    against('master', at('master', 7.60, 8.83)['obb'], 0.40, 'tv_unit', 'master-tv', 'TV unit', movable=False)
    against('master', at('master', 4.76, 10.64)['obb'], 0.29, 'pooja', 'master-mandir', 'Mandir', movable=False)
    against('master', at('master', 7.26, 10.71)['obb'], 0.30, 'bookshelf', 'master-shelf', 'Book shelf & dresser', movable=False)
    add('master-bay', 'window_seat', 'Bay window sitting', 'master', {'cx': 5.2205, 'cy': 11.489, 'w': 1.279, 'd': 0.51, 'angle': 0},
        facing=(0, -1), movable=False, footprint=rect(5.2205, 11.489, 1.279, 0.51))
    # bedroom 1
    bed_set('bed1', 'bed1')
    against('bed1', at('bed1', 9.14, 7.08)['obb'], 0.61, 'wardrobe', 'bed1-cb', 'Wardrobe (C.B.)', movable=False)
    tvbs = at('bed1', 11.06, 9.85)['obb']; top = tvbs['cy'] + tvbs['w'] / 2
    against('bed1', {**tvbs, 'cy': top - 0.42, 'w': 0.84}, 0.30, 'bookshelf', 'bed1-shelf', 'Book shelf', movable=False)
    against('bed1', {**tvbs, 'cy': top - 0.84 - 0.915, 'w': 1.83}, 0.40, 'tv_unit', 'bed1-tv', 'TV unit', movable=False)
    add('bed1-seat', 'window_seat', 'Window sitting', 'bed1', {'cx': 8.835, 'cy': 11.084, 'w': 1.649, 'd': 0.381, 'angle': 0},
        facing=(0, -1), movable=False, footprint=rect(8.835, 11.084, 1.649, 0.381))
    # bedroom 2: only its wardrobe is drawn
    against('bed2', at('bed2', 6.75, 2.55)['obb'], 0.61, 'wardrobe', 'bed2-cb', 'Wardrobe (C.B.)', movable=False)
    # study
    desk = at('study', 3.81, 4.63)['obb']
    against('study', desk, 0.61, 'desk', 'study-desk', 'Study table with storage', movable=True)
    back = wall_side('study', desk)
    add('study-chair', 'desk_chair', 'Study chair', 'study',
        {'cx': desk['cx'] + back[0] * (desk['d'] / 2) - back[0] * 0.95, 'cy': desk['cy'], 'w': 0.55, 'd': 0.55, 'angle': 0}, facing=back)
    sofa2 = at('study', 1.70, 5.03)['obb']
    add('study-sofa', 'sofa', '2 seater sofa', 'study', sofa2, facing=tuple(-v for v in wall_side('study', sofa2)), extra={'seats': 2})
    alm = at('study', 2.21, 7.11)['obb']
    for i, s in enumerate((-1, 1)):
        against('study', {**alm, 'cx': alm['cx'] + s * alm['w'] / 4, 'w': alm['w'] / 2 - 0.02}, 0.55, 'almirah', f'study-almirah-{i}', 'Godrej almirah', movable=False)
    # dining
    dt = max((p for p in pieces if p['room'] == 'dining'), key=lambda p: p['n'])['obb']
    add('dining-table', 'round_table', 'Dining table (round, glass top)', 'dining', {'cx': dt['cx'], 'cy': dt['cy'], 'w': 1.22, 'd': 1.22, 'angle': 0},
        footprint=[[round(dt['cx'] + 0.61 * math.cos(a), 3), round(dt['cy'] + 0.61 * math.sin(a), 3)] for a in [i * math.pi / 16 for i in range(33)]])
    for i in range(6):
        a = math.radians(105 + 60 * i); cx, cy = dt['cx'] + 0.88 * math.cos(a), dt['cy'] + 0.88 * math.sin(a)
        f = (-math.cos(a), -math.sin(a))
        add(f'dining-chair-{i}', 'dining_chair', 'Dining chair', 'dining', {'cx': cx, 'cy': cy, 'w': 0.46, 'd': 0.5, 'angle': math.atan2(f[1], f[0]) - R90}, facing=f)
    for i, (x, y) in enumerate(((11.84, 9.97), (11.84, 11.45))):
        o = at('dining', x, y)['obb']
        add(f'dining-armchair-{i}', 'armchair', 'Single seater sofa', 'dining', o, facing=tuple(-v for v in wall_side('dining', o)))
    add('dining-coffee', 'coffee_table', 'Coffee table', 'dining', at('dining', 11.80, 10.71)['obb'])
    against('dining', at('dining', 14.49, 10.72)['obb'], 0.40, 'tv_unit', 'dining-tv', 'TV unit', movable=False)
    # living
    sc_ = at('living', 16.53, 11.33)['obb']
    against('living', {**sc_, 'cy': 11.33, 'w': 3.23, 'd': 0.55}, 0.55, 'showcase', 'living-showcase', 'Show case', movable=False)
    def part(room, x, y):
        """the nearest individually drawn part, looking inside merged drawings too"""
        cands = []
        for p in pieces:
            if p['room'] != room: continue
            subs = split(kept[p['i']]) if p['n'] > 15 else [(p['obb'], p['n'])]
            cands += [o for o, _ in subs]
        return min(cands, key=lambda o: math.hypot(o['cx'] - x, o['cy'] - y))

    for i, (x, y) in enumerate(((15.69, 10.65), (17.39, 10.65))):
        o = dict(part('living', x, y))
        # the drawing sets each chair 10.5 degrees in, toward the other
        ang = math.radians(10.5) * (1 if i == 0 else -1)
        add(f'living-armchair-{i}', 'armchair', 'Single seater sofa', 'living', {**o, 'angle': ang}, facing=(math.sin(ang), -math.cos(ang)))
    add('living-coffee', 'coffee_table', 'Coffee table', 'living', part('living', 16.47, 10.72))
    s4 = at('living', 17.78, 8.70)['obb']
    add('living-sofa4', 'sofa', '4 seater sofa', 'living', s4, facing=tuple(-v for v in wall_side('living', s4)), extra={'seats': 4})
    add('living-centre', 'centre_table', 'Center table', 'living', at('living', 16.47, 8.83)['obb'])
    db = at('living', 16.01, 6.26)['obb']
    add('living-daybed', 'daybed', 'Daybed (drawn as 2 seater sofa)', 'living', db, facing=tuple(-v for v in wall_side('living', db)))
    # from the site photos, not the drawing
    add('living-rug', 'rug', 'Persian rug', 'living', {'cx': 16.75, 'cy': 8.8, 'w': 2.7, 'd': 1.8, 'angle': R90}, src='site photo')
    add('living-vase', 'floor_vase', 'Brass vase', 'dining', {'cx': 14.45, 'cy': 9.3, 'w': 0.3, 'd': 0.3, 'angle': 0}, src='site photo')
    add('living-lamp', 'floor_lamp', 'Floor lamp', 'living', {'cx': 18.05, 'cy': 10.75, 'w': 0.45, 'd': 0.45, 'angle': 0}, src='site photo')
    add('dining-lamp', 'floor_lamp', 'Floor lamp', 'dining', {'cx': 11.62, 'cy': 12.0, 'w': 0.45, 'd': 0.45, 'angle': 0}, src='site photo')
    add('living-rocker', 'rocking_chair', 'Rocking chair', 'living', {'cx': 14.98, 'cy': 6.2, 'w': 0.55, 'd': 0.75, 'angle': 0}, facing=(0, 1), src='site photo')
    add('dining-sideboard', 'sideboard', 'Sideboard', 'dining', {'cx': 12.75, 'cy': 6.07, 'w': 1.22, 'd': 0.45, 'angle': 0}, facing=(0, 1), src='site photo', movable=True)
    add('dining-painting', 'painting', 'Tanjore painting', 'dining', {'cx': 12.75, 'cy': 5.86, 'w': 0.5, 'd': 0.04, 'angle': 0}, facing=(0, 1), movable=False, src='site photo', extra={'z': 1.35, 'h': 0.62, 'art': 'tanjore'})
    add('living-photos', 'painting', 'Photo frames', 'living', {'cx': 15.9, 'cy': 5.86, 'w': 0.72, 'd': 0.03, 'angle': 0}, facing=(0, 1), movable=False, src='site photo', extra={'z': 1.3, 'h': 0.72, 'art': 'grid'})
    add('kitchen-curtain', 'curtain', 'Kitchen doorway curtain', 'dining', {'cx': 13.99, 'cy': 5.89, 'w': 0.86, 'd': 0.06, 'angle': 0},
        facing=(0, 1), movable=False, src='site photo')
    # foyer
    against('foyer', {**at('foyer', 10.27, 4.79)['obb'], 'angle': 0.0}, 0.40, 'shoe_cabinet', 'foyer-console', 'Console', movable=True)
    # kitchen: the counter line on the sheet, 2' off the east wall; the fridge is in the photo
    add('kitchen-counter', 'counter', 'Kitchen counter', 'kitchen', {'cx': 15.4235, 'cy': 3.684, 'w': 3.878, 'd': 0.611, 'angle': R90},
        facing=(-1, 0), movable=False, footprint=rect(15.4235, 3.684, 3.878, 0.611, R90))
    add('kitchen-fridge', 'fridge', 'Refrigerator', 'kitchen', {'cx': 13.05, 'cy': 5.2, 'w': 0.7, 'd': 0.68, 'angle': 0}, facing=(0, -1), movable=False, src='site photo')
    # wet rooms
    for pid, room, xy, typ, nm in [('tlt1-wc', 'tlt1', (13.07, 4.63), 'wc', 'WC'), ('tlt1-basin', 'tlt1', (13.18, 5.32), 'basin', 'Basin'),
                                   ('tlt2-wc', 'tlt2', (10.22, 3.92), 'wc', 'WC'), ('tlt2-basin', 'tlt2', (10.35, 3.24), 'basin', 'Basin'),
                                   ('tlt3-wc', 'tlt3', (2.60, 8.81), 'wc', 'WC'), ('tlt3-basin', 'tlt3', (3.33, 8.93), 'basin', 'Basin')]:
        o = at(room, *xy)['obb']
        add(pid, typ, nm, room, o, facing=tuple(-v for v in wall_side(room, o)), movable=False)
    add('tlt3-wm', 'washer', 'Washing machine (IFB front load, 60 x 60 x 90 cm)', 'tlt3', {'cx': 4.0, 'cy': 8.88, 'w': 0.6, 'd': 0.6, 'angle': 0}, facing=(0, -1), movable=False)
    return OUT
