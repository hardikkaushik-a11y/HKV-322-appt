"""Make a flat's diorama data from the architect's plan PDF.

    python3 build/make_flat.py <id> --pdf path/to/plan.pdf [--write] [--check out/check.png]

reads flats/<id>/flat.json, and prints a report: the scale it measured from the printed
dimensions, every room with its area and ceiling height, and anything it could not
resolve (with the flat.json fix to add). With --write it writes flats/<id>/zone.json,
furniture included. --check draws what it read over the sheet with a metre grid, for
checking by eye and for reading `fixes` coordinates off. NEW_FLAT.md walks through it.
"""
import argparse, importlib.util, json, math, os, sys
from pathlib import Path
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).parent))
from plan import Plan, geoms, clean, CUT, SILL

ROOT = Path(__file__).resolve().parent.parent


def glass_paths(win):
    from collections import defaultdict
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


def zone_json(P, S, cfg):
    ring = lambda poly, nd=3: [[round(x * S, nd), round(y * S, nd)] for x, y in poly.exterior.coords]
    pt = lambda xy, nd=3: [round(xy[0] * S, nd), round(xy[1] * S, nd)]
    # each solid keeps its sheet-metre polygon ('_poly') so a room clips it in the same frame
    wall_list = [{'id': f'wall-{i}', 'kind': 'masonry', 'z0': 0, 'z1': CUT, 'outer': ring(p), 'holes': [ring(Polygon(h)) for h in p.interiors], '_poly': p}
                 for i, p in enumerate(P.wall_polys)]
    glass_list = []
    for i, w in enumerate(P.windows):
        if not w['full']:
            wall_list.append({'id': f'sill-{i}', 'kind': 'window_sill_assumption', 'z0': 0, 'z1': SILL, 'outer': ring(w['blob']), 'holes': [], '_poly': w['blob']})
        for gp in glass_paths(w):
            glass_list.append({'path': [pt(q) for q in gp], 'z0': 0.0 if w['full'] else SILL, 'z1': CUT,
                               'source': P.lay['glass'][0] if w['full'] else P.lay['openings'][0]})
    for i, p in enumerate(P.fix_parapet):
        wall_list.append({'id': f'parapet-{i}', 'kind': 'masonry_parapet', 'z0': 0, 'z1': 1.0, 'outer': ring(p), 'holes': [], '_poly': p})
    # door leaves where she drew them: open, from the hinge to the swing's tip
    for i, d in enumerate(P.doors + P.fix_leaves):
        (hx, hy), (tx, ty) = d['hinge'], d['tip']
        n = math.dist(d['hinge'], d['tip']); ux, uy = (tx - hx) / n, (ty - hy) / n
        leaf = Polygon([(hx - uy * 0.02, hy + ux * 0.02), (tx - uy * 0.02, ty + ux * 0.02), (tx + uy * 0.02, ty - ux * 0.02), (hx + uy * 0.02, hy - ux * 0.02)])
        wall_list.append({'id': f'door-{i}', 'kind': 'door_leaf_appearance', 'z0': 0, 'z1': CUT, 'outer': ring(leaf), 'holes': [], '_poly': leaf})
    solids = [(w, w['_poly']) for w in wall_list]
    outdoor = [P.rooms[o['id']] for o in P.fix_outdoor if o['id'] in P.rooms]
    footprint = unary_union([P.building] + outdoor + P.fix_parapet).buffer(0.001)
    outer = max(geoms(footprint), key=lambda g: g.area)
    shaft = [h for h in P.holes if not any(h.equals(r) for r in P.rooms.values())]

    room_list = []
    for rid, poly in P.rooms.items():
        meta = P.room_meta[rid]
        near = poly.buffer(0.34, join_style=2)
        mine = [w for w, p in solids if p.intersects(poly.buffer(0.06))]
        island = unary_union([poly] + [p.intersection(near) for w, p in solids if p.intersects(poly.buffer(0.06))])
        island = max(geoms(island.buffer(0.001).buffer(-0.001)), key=lambda g: g.area)
        clipped = []
        for w in mine:
            for piece in geoms(w['_poly'].intersection(near)):
                if piece.area < 0.002: continue
                clipped.append({**{k: v for k, v in w.items() if k != '_poly'}, 'outer': ring(clean(piece)), 'holes': []})
        gl = [g for g in glass_list if LineString([(x / S, y / S) for x, y in g['path']]).distance(poly) < 0.3]
        lp = meta['xy'] if meta['xy'] else [round(poly.representative_point().x, 3), round(poly.representative_point().y, 3)]
        room_list.append({
            'id': rid, 'name': meta['name'], 'designed': False, 'outline': ring(poly), 'label_xy': pt(lp),
            'ceiling_in': P.CH.get(rid), 'island': ring(island), 'floor': [{'outer': ring(poly), 'holes': []}],
            'walls': clipped, 'glass': gl,
        })

    # rooms open to each other focus as one space (flat.json `spaces`)
    by = {r['id']: r for r in room_list}
    spaces = []
    for sp in cfg.get('spaces', []):
        pub = [k for k in sp['members'] if k in by]
        if len(pub) < 2: continue
        pu = unary_union([P.rooms[k] for k in pub])
        pwalls, seen = [], set()
        for k in pub:
            for w in by[k]['walls']:
                key = json.dumps(w['outer'])
                if key not in seen: seen.add(key); pwalls.append(w)
        pisland = max(geoms(unary_union([Polygon(by[k]['island']) for k in pub]).buffer(0.001).buffer(-0.001)), key=lambda g: g.area)
        spaces.append({'id': sp['id'], 'name': sp['name'], 'members': pub, 'outline': ring(max(geoms(pu.buffer(0.02).buffer(-0.02)), key=lambda g: g.area)),
                       'island': ring(pisland), 'floor': [{'outer': ring(P.rooms[k]), 'holes': []} for k in pub],
                       'walls': pwalls, 'glass': [g for k in pub for g in by[k]['glass']]})
        for k in pub: by[k]['space'] = sp['id']

    c = outer.centroid
    return {
        'frame': f"metres; x = sheet right, y = sheet up (the plan at 1:{P.info['ratio']}, scaled by {S}). three.js: (x - cx, z, -(y - cy))",
        'centre': pt((c.x, c.y)),
        'cut_height': CUT,
        'counter': cfg.get('counter', {'carcass': 0.86, 'top': 0.03, 'why': 'conventional 900 mm worktop'}),
        'zone': ring(outer),
        'floor': [{'outer': ring(outer), 'holes': [ring(s) for s in shaft]}],
        'walls': [{k: v for k, v in w.items() if k != '_poly'} for w in wall_list],
        'glass': glass_list,
        'pieces': [],
        'rooms': room_list,
        'spaces': spaces,
        'north_sheet': cfg.get('north_sheet', [0, 1]),
        'north_note': cfg.get('north_note', 'north not given; plan up assumed'),
        'provenance': cfg.get('provenance', {}),
    }


def furnish(P, zone, S, cfg, flat_dir):
    """the flat's own pieces script when flat.json names one (a curated list), else the
    automatic reading of the furniture layers"""
    script = cfg.get('pieces')
    if script:
        spec = importlib.util.spec_from_file_location('pieces', flat_dir / script)
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        return mod.build(P, zone, S), f'{script} (curated)'
    import furnish_auto
    rep = []
    out = furnish_auto.build(P, zone, S, rep)
    for r in rep: print('  left out,', r)
    return out, 'furnish_auto (from the drawing)'


def check_image(pdf, P, S, zone, out):
    """what was read, drawn over the sheet, with a 1 m grid in sheet metres"""
    import pymupdf
    doc = pymupdf.open(pdf); pg = doc[0]
    K = 25.4 / 72 * P.info['ratio'] / 1000; H = pg.rect.height
    to_pt = lambda x, y: pymupdf.Point(x / K, H - y / K)
    sh = pg.new_shape()
    for gx in range(0, int(pg.rect.width * K) + 1):
        sh.draw_line(to_pt(gx, 0), to_pt(gx, H * K)); sh.finish(color=(0.55, 0.75, 1), width=0.25)
        sh.insert_text(to_pt(gx + 0.03, H * K - 0.25), str(gx), fontsize=6, color=(0.3, 0.5, 0.9))
    for gy in range(0, int(H * K) + 1):
        sh.draw_line(to_pt(0, gy), to_pt(pg.rect.width * K, gy)); sh.finish(color=(0.55, 0.75, 1), width=0.25)
        sh.insert_text(to_pt(0.05, gy + 0.03), str(gy), fontsize=6, color=(0.3, 0.5, 0.9))
    for p in P.wall_polys:
        sh.draw_polyline([to_pt(*c) for c in p.exterior.coords]); sh.finish(color=None, fill=(0.9, 0.1, 0.1), fill_opacity=0.45)
    for w in P.windows:
        sh.draw_polyline([to_pt(*c) for c in w['blob'].exterior.coords]); sh.finish(color=(0, 0.6, 0.9), fill=(0, 0.6, 0.9), fill_opacity=0.5)
    for d in P.door_strips:
        sh.draw_polyline([to_pt(*c) for c in d.exterior.coords]); sh.finish(color=(0.1, 0.6, 0.1), fill=(0.2, 0.8, 0.2), fill_opacity=0.6)
    for rid, poly in P.rooms.items():
        sh.draw_polyline([to_pt(*c) for c in poly.exterior.coords]); sh.finish(color=(0.85, 0.55, 0), width=1.2, dashes='[3 2] 0')
        c = poly.representative_point()
        sh.insert_text(to_pt(c.x - 0.3, c.y - 0.35), rid, fontsize=8, color=(0.8, 0.4, 0))
    for p in zone['pieces']:
        sh.draw_polyline([to_pt(x / S, y / S) for x, y in p['footprint']]); sh.finish(color=(0.5, 0, 0.7), width=0.8)
    sh.commit()
    pg.get_pixmap(dpi=130).save(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('flat'); ap.add_argument('--pdf', required=True)
    ap.add_argument('--write', action='store_true'); ap.add_argument('--check')
    a = ap.parse_args()
    flat_dir = ROOT / 'flats' / a.flat
    cfg = json.load(open(flat_dir / 'flat.json'))
    P = Plan(a.pdf, cfg)
    measured, rows = P.calibrate()
    S = cfg.get('plan', {}).get('scale') or measured
    print(f"sheet 1:{P.info['ratio']}, room names at {P.label_size} pt")
    print(f"scale measured {measured} from {sum(r.get('fits', False) for r in rows)} of {len(rows)} dimensions"
          + (f"; using flat.json's {S}" if cfg.get('plan', {}).get('scale') else ''))
    # a room dimension that nearly agrees is worth a second look; wild ones measured the wrong walls
    for r in rows:
        if not r['fits'] and r['real'] > 2 and 0.85 < r['k'] / (S or measured or 1) < 1.15:
            print(f"   check: {r['text']} reads {r['k']:.3f} at {tuple(round(v, 2) for v in r['xy'])}")
    if not S: sys.exit('no scale: fewer than 3 printed dimensions agree. Set plan.scale in flat.json.')
    print(f"walls {len(P.wall_polys)}, windows {len(P.windows)} (full height {sum(w['full'] for w in P.windows)}), doors {len(P.door_strips)}")
    for rid, h in sorted(P.rooms.items()):
        b = h.bounds
        print(f"  {rid:10s} {P.room_meta[rid]['name']:18s} {h.area * S * S:6.2f} m2  {(b[2]-b[0])*S:.2f} x {(b[3]-b[1])*S:.2f}  CH {P.CH.get(rid)}")
    unl = [h for h in P.holes if not any(h.equals(r) for r in P.rooms.values())]
    if unl: print('closed regions with no name (shafts, ducts; fine if so):', [f'{h.area * S * S:.1f} m2 at ({h.centroid.x:.1f}, {h.centroid.y:.1f})' for h in unl])
    for p in P.problems: print('FIX:', p)
    zone = zone_json(P, S, cfg)
    zone['pieces'], how = furnish(P, zone, S, cfg, flat_dir)
    from collections import Counter
    print(f"pieces: {len(zone['pieces'])} by {how}:", dict(Counter(p['type'] for p in zone['pieces'])))
    if a.write:
        json.dump(zone, open(flat_dir / 'zone.json', 'w'), indent=1)
        print('wrote', flat_dir / 'zone.json')
    if a.check:
        os.makedirs(os.path.dirname(os.path.abspath(a.check)), exist_ok=True)
        check_image(a.pdf, P, S, zone, a.check); print('check image', a.check)


if __name__ == '__main__':
    main()
