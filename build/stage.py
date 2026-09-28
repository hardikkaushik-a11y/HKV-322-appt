"""Stage one flat for publishing: the engine with the flat's files beside it.

    python3 build/stage.py <id>          -> out/publish/<id>/

The folder is self-contained (index.html, the engine, lib/, and flat/zone.json +
flat/flat.json), so it can be published as it is: as an Artifact, or to any static host.
"""
import json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def stage(fid):
    src, flat = ROOT / 'diorama', ROOT / 'flats' / fid
    cfg = json.load(open(flat / 'flat.json'))
    out = ROOT / 'out' / 'publish' / fid
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(src, out, ignore=shutil.ignore_patterns('flat', '*.map'))
    (out / 'flat').mkdir()
    for f in ('zone.json', 'flat.json'): shutil.copy(flat / f, out / 'flat' / f)
    page = (out / 'index.html').read_text()
    page, n = re.subn(r'<meta name="flat" content="[^"]*">', '<meta name="flat" content="./flat/">', page)
    assert n == 1, 'index.html has no <meta name="flat">'
    page = re.sub(r'<title>[^<]*</title>', f"<title>{cfg.get('title', {}).get('page', 'The flat')}</title>", page, count=1)
    (out / 'index.html').write_text(page)
    return out


if __name__ == '__main__':
    print(stage(sys.argv[1]))
