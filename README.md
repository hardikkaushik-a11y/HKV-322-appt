# HKV-322 - The flat

A flat in Hauz Khas, New Delhi. Layout: Ar. Shivangi Kaushik,
Studio Spindle (ALD-01 R1). A diorama of the whole flat in the browser, the same product as
B-34's `/diorama/` (and, behind that, Ryan Sael's *Set the Mood*): the flat cut open on a
plinth at door-head height, every room furnished, finishes you drag onto surfaces, a mood
meter, the sun through the day, furniture you can move, and a walk mode.

```bash
python3 serve.py 8747      # then http://127.0.0.1:8747/diorama/
```

## Where it comes from

- **Walls, windows, doors, rooms**: read out of the ALD-01 PDF by `build/make_flat.py`
  (`build/plan.py` does the reading). The PDF is a vector export that kept the drawing's
  CAD layers (RH-RCC BRICK, RH-DOOR WINDOW, RH-GLASS, the furniture and plumbing layers),
  so this reads the same sources B-34's DXF build read, not a trace of a picture. Door
  openings are closed exactly across each jamb (found from the swing arc), so the bay
  window, window seats, wardrobe niches and the kitchen's L keep their drawn shape.
- **Scale**: the sheet says 1:50 @ A3 but was plotted to fit. `make_flat.py` measures the
  factor from the printed dimensions (0.9131); `flats/hkv-322/flat.json` pins 0.9138, the
  value first set by hand, so the model does not shift. **For the architect**: Living's
  11'-4" reads 0.978 instead; worth confirming on site.
- **Furniture**: `flats/hkv-322/pieces.py` sets each piece from the drawing's furniture
  layers and the architect's labels, by hand. The drawing's layout is the flat as it is
  today (it matches the two site photos piece for piece). A few things only in the photos
  are added and marked `source: "site photo"` in `zone.json`: the Persian rug, sideboard and
  Tanjore painting, rocking chair, photo frames, brass vase, floor lamps and the fridge.
  (Without that file the kit furnishes from the drawing on its own; see NEW_FLAT.md.)
- **"Original"**: the flat as it stands today, dressed from the two site photos: beige
  vitrified tile, warm white walls, teak cupboards and show case, beige sofas, the rust daybed,
  dark wood chairs and tables, the red Persian rug. Cozy, Bright and Moody are concepts.
- **Not drawn, so not invented**: Bedroom 2 has only its wardrobe on ALD-01; the kitchen has
  only its counter; no branded products are specified yet (the Products tab stays hidden).
  The servant toilet opens off the service side on ALD-01, so walk mode cannot reach it
  from inside the flat.

## Files

- `diorama/` - the engine, B-34's, knowing no flat of its own: it reads the flat named by
  `?flat=<id>` or by the page's `<meta name="flat">` (this repo's page: `../flats/hkv-322/`).
- `flats/hkv-322/flat.json` - HKV-322's settings: titles, room names, the fixes the drawing
  leaves implicit (open-plan dividers, the varandah and its parapet, one door drawn without
  a swing), room order, Original finishes.
- `flats/hkv-322/zone.json` - built: walls, glass, rooms, spaces and pieces.
- `build/` - the kit: `make_flat.py` (plan PDF to zone.json, with a report and a check
  image), `plan.py`, `furnish_auto.py`, `pdf_layers.py`, `stage.py` (a publishable copy).

```bash
python3 build/make_flat.py hkv-322 --pdf /path/to/060726_HKV_322_LAYOUT_R1.pdf --write --check out/hkv-322.png
python3 build/stage.py hkv-322        # out/publish/hkv-322/, what the live link serves
```

**Another flat: NEW_FLAT.md.**

The PDF and the site photos are not in the repo: the drawing carries the client's name and
address and one photo shows a member of the family at home.

## Next

- 360 panoramas per room, as B-34's tour (V-Ray spherical panoramas from the architect once
  the redesign exists).
- The architect's redesign as a second set of finishes and furniture next to Original.
