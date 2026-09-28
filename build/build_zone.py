"""Build assets/diorama/zone.json for HKV-322 from the ALD-01 PDF.

The PDF is a vector export that kept the drawing's CAD layers, so this reads the same
sources B-34's DXF build read: walls from RH-RCC BRICK (hatched solids), windows and
doors from RH-DOOR WINDOW / A_Door / RH-GLASS, the varandah parapet from RH-ELEVATION
LIGHT, room names from the text. Furniture is added by build_pieces.py.

Hand-set items are few and listed in MANUAL below, each with the reason.
"""
import json, math, sys
from collections import defaultdict
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, box
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree
from pdf_layers import load

CUT = 2.1                     # section cut, as B-34: door-head height
# The sheet says 1:50 @ A3 but was plotted to fit: every printed dimension reads 0.914
# of its drawn length measured wall face to face (Bedroom 1 10'-7", Kitchen 9'-10",
# Living 18'-6", Bedroom 2 14'-5 1/2"). The printed dimensions govern ("to be read and
# not measured"), so the whole plan is scaled by that factor on output. Living's 11'-4"
# reads 0.978 instead and is left for the architect to confirm.
SCALE = 0.9138
SILL = 0.9
L, T = load()

def geoms(g):
    if g.is_empty: return []
    return [x for x in (g.geoms if hasattr(g, 'geoms') else [g]) if x.geom_type == 'Polygon' and not x.is_empty]

def ring(poly, nd=3):
    return [[round(x * SCALE, nd), round(y * SCALE, nd)] for x, y in poly.exterior.coords]

def pt(xy, nd=3):
    return [round(xy[0] * SCALE, nd), round(xy[1] * SCALE, nd)]

def clean(p, tol=0.004):
    return p.simplify(tol, preserve_topology=True).buffer(0)

MANUAL = {
    # The living room's east door is drawn with straight segments, not an arc: its
    # opening runs from the wall's end (y 7.50) down to the room's south wall.
    'door_strips': [box(19.82, 6.36, 20.15, 7.52)],
    'leaves': [{'hinge': (19.86, 6.47), 'tip': (18.96, 6.47)}],
    # Open-plan boundaries the drawing marks with beams, not walls (as B-34's
    # "inferred" rooms): foyer | dining, dining | living, and the master bedroom's open
    # passage into the study.
    'dividers': [
        ('foyer|dining', [(12.393, 6.403), (12.393, 7.294)]),      # on bed1's east wall line
        ('dining|living', [(16.174, 6.403), (16.174, 10.441)]),   # on the TV wall's line
        ('master|study', [(4.844, 7.154), (4.844, 8.128)]),       # across the open passage
    ],
    # inside the varandah parapet (RH-ELEVATION LIGHT), either side of the x 16 wall
    'varandah': [box(4.83, 11.0, 16.021, 14.457), box(16.326, 11.0, 19.983, 14.457)],
    # the parapet itself, 125 mm, with the gate gap between x 14.645 and 15.979
    'parapet': [
        Polygon([(4.705, 12.076), (4.83, 12.076), (4.83, 14.457), (14.645, 14.457), (14.645, 14.582), (4.705, 14.582)]),
        Polygon([(15.979, 14.457), (19.983, 14.457), (19.983, 12.827), (20.108, 12.827), (20.108, 14.582), (15.979, 14.582)]),
    ],
}

# ------------------------------------------------------------------ walls
dw_all = L['RH-DOOR WINDOW'] + L['A_Door'] + L['RH-GLASS']
straight = [pl for pl in dw_all if len(pl) == 2 or (len(pl) == 5 and pl[0] == pl[-1])]
brick = [LineString(pl) for pl in L['RH-RCC BRICK'] if len(pl) >= 2 and LineString(pl).length > 0.005]

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

hatch = [LineString(pl).interpolate(0.5, normalized=True) for pl in L['RH-HATCH'] + L['HATCH'] if len(pl) >= 2]
htree = STRtree(hatch)
lines = brick + caps(brick)
wall_polys = [clean(p) for p in polygonize(unary_union(lines)) if len(htree.query(p, predicate='contains')) >= 2]
walls_u = unary_union(wall_polys)
frames_u = unary_union([LineString(pl).buffer(0.03, cap_style=2) for pl in straight])

# ------------------------------------------------------------------ doors
arcs = []
for pl in [pl for pl in dw_all if len(pl) > 5]:
    for a in arcs:
        if math.dist(a[-1], pl[0]) < 0.01: a.extend(pl[1:]); break
        if math.dist(a[0], pl[-1]) < 0.01: a[:0] = pl[:-1]; break
    else:
        arcs.append(list(pl))

def circle_centre(a, b, c):
    ax, ay = a; bx, by = b; cx, cy = c
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-9: return None
    ux = ((ax*ax + ay*ay) * (by - cy) + (bx*bx + by*by) * (cy - ay) + (cx*cx + cy*cy) * (ay - by)) / d
    uy = ((ax*ax + ay*ay) * (cx - bx) + (bx*bx + by*by) * (ax - cx) + (cx*cx + cy*cy) * (bx - ax)) / d
    return (ux, uy)

doors = []
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
        scored.append((probe.intersection(walls_u).length + probe.intersection(frames_u).length, e))
    scored.sort(key=lambda t: -t[0])
    doors.append({'hinge': c, 'strike': scored[0][1], 'tip': scored[1][1], 'r': r})

def door_strip(d):
    """The opening, exactly: across the hinge line, the band of offsets where the
    jambs on both sides are solid (wall or window frame) is the wall's thickness here."""
    (hx, hy), (sx, sy) = d['hinge'], d['strike']
    n = math.dist(d['hinge'], d['strike'])
    ux, uy = (sx - hx) / n, (sy - hy) / n
    nx, ny = -uy, ux
    solid = unary_union([walls_u, frames_u])
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

door_strips = [door_strip(d).buffer(0.03, join_style=2) for d in doors] + MANUAL['door_strips']

# ------------------------------------------------------------------ windows
leaf_zones = [LineString([d['hinge'], d['tip']]).buffer(0.07) for d in doors]
frame_lines = [pl for pl in straight if not any(LineString(pl).within(z) for z in leaf_zones)]
blobs = geoms(unary_union([LineString(pl).buffer(0.03, cap_style=2) for pl in frame_lines]))
glass_pl = [LineString(pl) for pl in L['RH-GLASS']]
windows = []
for b in blobs:
    if b.distance(walls_u) > 0.25: continue                        # the varandah gate, outside
    rr = b.minimum_rotated_rectangle.exterior.coords
    edges = sorted(math.dist(rr[i], rr[i + 1]) for i in range(2))
    if edges[1] < 0.3: continue                                      # jamb marks
    if edges[0] < 0.085: continue                                    # a single line: a sliding panel or shelf mark
    if any(b.distance(Point(d['hinge'])) < 0.08 and b.distance(Point(d['tip'])) < 0.12 for d in doors): continue   # a leaf
    if any(ds.buffer(0.1).intersects(b) for ds in MANUAL['door_strips']): continue   # that door's swing, drawn in segments
    wl = [pl for pl in frame_lines if LineString(pl).within(b.buffer(0.001))]
    full = any(g.within(b.buffer(0.01)) for g in glass_pl)        # RH-GLASS: full-height glazing
    windows.append({'blob': clean(b), 'lines': wl, 'full': full})

def glass_paths(win):
    runs = defaultdict(list)
    for pl in win['lines']:
        for p, q in zip(pl[:-1], pl[1:]):
            if math.dist(p, q) < 0.25: continue
            if abs(p[1] - q[1]) < 0.01: runs['h'].append((round((p[1] + q[1]) / 2, 3), min(p[0], q[0]), max(p[0], q[0])))
            elif abs(p[0] - q[0]) < 0.01: runs['v'].append((round((p[0] + q[0]) / 2, 3), min(p[1], q[1]), max(p[1], q[1])))
    out = []
    for o, items in runs.items():
        items.sort()
        bands, cur = [], [items[0]]
        for it in items[1:]:
            if it[0] - cur[-1][0] > 0.25: bands.append(cur); cur = [it]
            else: cur.append(it)
        bands.append(cur)
        for band in bands:
            offs = sorted(set(i[0] for i in band)); mid = offs[len(offs) // 2]
            lo = min(i[1] for i in band); hi = max(i[2] for i in band)
            if hi - lo < 0.3: continue
            out.append([[round(lo, 3), mid], [round(hi, 3), mid]] if o == 'h' else [[mid, round(lo, 3)], [mid, round(hi, 3)]])
    return out

# ------------------------------------------------------------------ rooms
dividers = [LineString(p).buffer(0.02, cap_style=3) for _, p in MANUAL['dividers']]
closed = unary_union(wall_polys + [w['blob'] for w in windows] + door_strips + dividers)
holes = [clean(Polygon(h)) for p in geoms(closed) for h in p.interiors]
holes = [h for h in holes if h.area > 0.5]

ROOM_TEXT = {
    'MASTER BEDROOM': ('master', 'Master bedroom'), 'BEDROOM 1': ('bed1', 'Bedroom 1'), 'BEDROOM 2': ('bed2', 'Bedroom 2'),
    'STUDY': ('study', 'Study'), 'TLT 1': ('tlt1', 'Toilet 1'), 'TLT 2': ('tlt2', 'Toilet 2'), 'TLT 3': ('tlt3', 'Toilet 3'),
    'S.TLT': ('stlt', 'Servant toilet'), 'KITCHEN': ('kitchen', 'Kitchen'), 'FOYER': ('foyer', 'Foyer'),
    'DINING AREA': ('dining', 'Dining'), 'LIVING ROOM': ('living', 'Living room'),
}
CH = {}          # ceiling heights printed under the names, inches
label_pts = {}
for t in T:
    k = t['text'].strip().upper()
    if k in ROOM_TEXT: label_pts[ROOM_TEXT[k][0]] = (ROOM_TEXT[k][1], t['xy'])
for t in T:
    s = t['text'].replace(' ', '')
    if s.startswith('CH:'):
        near = min(label_pts.items(), key=lambda kv: math.dist(kv[1][1], t['xy']))
        if math.dist(near[1][1], t['xy']) < 0.35: CH[near[0]] = float(s[3:].rstrip('"'))

rooms = {}
for h in holes:
    hit = [rid for rid, (_, xy) in label_pts.items() if h.contains(Point(xy))]
    if len(hit) == 1: rooms[hit[0]] = h
    elif len(hit) > 1: print('WARNING region holds', hit, file=sys.stderr)

building = unary_union([Polygon(p.exterior) for p in geoms(closed)])
for i, vb in enumerate(MANUAL['varandah']):
    v = max(geoms(vb.difference(building.buffer(0.001))), key=lambda g: g.area)
    rooms['varandah' if i == 0 else 'varandah2'] = clean(v)
label_pts['varandah'] = ('Varandah', None); label_pts['varandah2'] = ('Varandah', None)

if __name__ == '__main__' and '--report' in sys.argv:
    print('walls', len(wall_polys), 'windows', len(windows), '(full-height', sum(w['full'] for w in windows), ') doors', len(doors) + len(MANUAL['door_strips']))
    for rid, h in sorted(rooms.items()): print(f'{rid:10s} {h.area * SCALE**2:6.2f} m2  CH={CH.get(rid)}  {h.bounds[2]*SCALE-h.bounds[0]*SCALE:.2f} x {h.bounds[3]*SCALE-h.bounds[1]*SCALE:.2f}')
    print('missing:', sorted(set(label_pts) - set(rooms)))
    print('unlabelled regions:', [round(h.area, 2) for h in holes if not any(h.equals(r) for r in rooms.values())])

# ------------------------------------------------------------------ zone.json
if __name__ == '__main__' and '--write' in sys.argv:
    out_path = sys.argv[sys.argv.index('--write') + 1]
    wall_list = []
    for i, p in enumerate(wall_polys):
        wall_list.append({'id': f'wall-{i}', 'kind': 'masonry', 'z0': 0, 'z1': CUT, 'outer': ring(p), 'holes': [ring(Polygon(h)) for h in p.interiors], '_poly': p})
    glass_list = []
    for i, w in enumerate(windows):
        if not w['full']:
            wall_list.append({'id': f'sill-{i}', 'kind': 'window_sill_assumption', 'z0': 0, 'z1': SILL, 'outer': ring(w['blob']), 'holes': [], '_poly': w['blob']})
        for gp in glass_paths(w):
            glass_list.append({'path': [pt(q) for q in gp], 'z0': 0.0 if w['full'] else SILL, 'z1': CUT, 'source': 'RH-GLASS' if w['full'] else 'RH-DOOR WINDOW'})

    for i, p in enumerate(MANUAL['parapet']):
        wall_list.append({'id': f'parapet-{i}', 'kind': 'masonry_parapet', 'z0': 0, 'z1': 1.0, 'outer': ring(p), 'holes': [], '_poly': p})
    # door leaves where she drew them: open, from the hinge to the swing's tip
    for i, d in enumerate(doors + MANUAL['leaves']):
        (hx, hy), (tx, ty) = d['hinge'], d['tip']
        n = math.dist(d['hinge'], d['tip']); ux, uy = (tx - hx) / n, (ty - hy) / n
        leaf = Polygon([(hx - uy * 0.02, hy + ux * 0.02), (tx - uy * 0.02, ty + ux * 0.02), (tx + uy * 0.02, ty - ux * 0.02), (hx + uy * 0.02, hy - ux * 0.02)])
        wall_list.append({'id': f'door-{i}', 'kind': 'door_leaf_appearance', 'z0': 0, 'z1': CUT, 'outer': ring(leaf), 'holes': [], '_poly': leaf})
    solids = [(w, w['_poly']) for w in wall_list]
    footprint = unary_union([building] + [rooms[k] for k in ('varandah', 'varandah2')] + MANUAL['parapet']).buffer(0.001)
    outer = max(geoms(footprint), key=lambda g: g.area)
    shaft = [h for h in holes if not any(h.equals(r) for r in rooms.values())]

    room_list = []
    for rid, poly in rooms.items():
        name, xy = label_pts[rid]
        near = poly.buffer(0.34, join_style=2)
        mine = [w for w, p in solids if p.intersects(poly.buffer(0.06))]
        island = unary_union([poly] + [p.intersection(near) for w, p in solids if p.intersects(poly.buffer(0.06))])
        island = max(geoms(island.buffer(0.001).buffer(-0.001)), key=lambda g: g.area)
        clipped = []
        for w in mine:
            for piece in geoms(w['_poly'].intersection(near)):
                if piece.area < 0.002: continue
                clipped.append({**{k: v for k, v in w.items() if k != '_poly'}, 'outer': ring(clean(piece)), 'holes': []})
        gl = [g for g in glass_list if LineString([(x / SCALE, y / SCALE) for x, y in g['path']]).distance(poly) < 0.3]
        lp = xy if xy else [round(poly.representative_point().x, 3), round(poly.representative_point().y, 3)]
        room_list.append({
            'id': rid, 'name': name, 'designed': False, 'outline': ring(poly), 'label_xy': pt(lp),
            'ceiling_in': CH.get(rid), 'island': ring(island), 'floor': [{'outer': ring(poly), 'holes': []}],
            'walls': clipped, 'glass': gl,
        })

    # foyer, dining and living open into each other: they focus as one space
    pub = ['foyer', 'dining', 'living']
    by = {r['id']: r for r in room_list}
    pu = unary_union([rooms[k] for k in pub])
    pnear = pu.buffer(0.34, join_style=2)
    pwalls, seen = [], set()
    for k in pub:
        for w in by[k]['walls']:
            key = json.dumps(w['outer'])
            if key not in seen: seen.add(key); pwalls.append(w)
    pisland = max(geoms(unary_union([by[k] and Polygon(by[k]['island']) for k in pub]).buffer(0.001).buffer(-0.001)), key=lambda g: g.area)
    space = {'id': 'public', 'name': 'Foyer, dining and living', 'members': pub, 'outline': ring(max(geoms(pu.buffer(0.02).buffer(-0.02)), key=lambda g: g.area)),
             'island': ring(pisland), 'floor': [{'outer': ring(rooms[k]), 'holes': []} for k in pub],
             'walls': pwalls, 'glass': [g for k in pub for g in by[k]['glass']]}
    for k in pub: by[k]['space'] = 'public'
    by['varandah2']['space'] = None

    c = outer.centroid
    zone = {
        'frame': 'metres; x = sheet right, y = sheet up (ALD-01 PDF at 1:50). three.js: (x - cx, z, -(y - cy))',
        'centre': pt((c.x, c.y)),
        'cut_height': CUT,
        'counter': {'carcass': 0.86, 'top': 0.03, 'why': 'conventional 900 mm worktop; no appliance heights on ALD-01'},
        'zone': ring(outer),
        'floor': [{'outer': ring(outer), 'holes': [ring(s) for s in shaft]}],
        'walls': [{k: v for k, v in w.items() if k != '_poly'} for w in wall_list],
        'glass': glass_list,
        'pieces': [],
        'rooms': room_list,
        'spaces': [space],
        'north_sheet': [-0.34, 0.94],
        'north_note': 'approximate, read off the north arrow in the ALD-01 title block',
        'provenance': {
            'layout': 'Ar. Shivangi Kaushik / Studio Spindle, ALD-01 R1 (04-08-2026), vector PDF with its CAD layers',
            'finishes': 'Original = the flat as it stands today, from two site photos; other options are concept finishes',
            'heights': 'ceiling heights from her CH labels; section cut at 2.1 m; sills 0.9 m assumed',
        },
    }
    for r in room_list: r.pop('space', None) if r.get('space') is None else None
    json.dump(zone, open(out_path, 'w'), indent=1)
    print('wrote', out_path, len(wall_list), 'walls', len(glass_list), 'glass', len(room_list), 'rooms')
