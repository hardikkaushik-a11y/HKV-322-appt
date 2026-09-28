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

- **Walls, windows, doors, rooms**: read out of the ALD-01 PDF by `build/build_zone.py`. The
  PDF is a vector export that kept the drawing's CAD layers (RH-RCC BRICK, RH-DOOR WINDOW,
  RH-GLASS, the furniture and plumbing layers), so this reads the same sources B-34's DXF build
  read, not a trace of a picture. Door openings are closed exactly across each jamb (found from
  the swing arc), not with a blanket fill, so the bay window, window seats, wardrobe niches and
  the kitchen's L keep their drawn shape.
- **Scale**: the sheet says 1:50 @ A3 but was plotted to fit. Every printed dimension reads
  0.914 of its drawn length wall face to face (Bedroom 1 10'-7", Kitchen 9'-10", Living 18'-6",
  Bedroom 2 14'-5 1/2"), so the plan is scaled by that factor. **For the architect**: Living's
  11'-4" reads 0.978 instead; worth confirming on site.
- **Furniture**: `build/build_pieces.py` reads each drawn piece's footprint, size and room from
  the same PDF and names it from the architect's labels. The drawing's layout is the flat as it
  is today (it matches the two site photos piece for piece). A few things only in the photos
  are added and marked `source: "site photo"` in `zone.json`: the Persian rug, sideboard and
  Tanjore painting, rocking chair, photo frames, brass vase, floor lamps and the fridge.
- **"Original"**: the flat as it stands today, dressed from the two site photos: beige
  vitrified tile, warm white walls, teak cupboards and show case, beige sofas, the rust daybed,
  dark wood chairs and tables, the red Persian rug. Cozy, Bright and Moody are concepts.
- **Not drawn, so not invented**: Bedroom 2 has only its wardrobe on ALD-01; the kitchen has
  only its counter; no branded products are specified yet (the Products tab stays hidden).

## Files

- `diorama/` - the app. The engine (`diorama.js`, `configurator.js`, `walk.js`,
  `textures.js`) is B-34's, with HKV-322's rooms, titles and a cutaway for tall joinery
  (a wardrobe or show case on a wall facing you trims to knee height like the walls do).
  `furnish.js` gives each HKV-322 piece its shape; `products.js` is an empty stand-in.
- `assets/diorama/zone.json` - the flat: walls, glass, rooms, spaces and pieces.
- `build/` - rebuilds `zone.json` from the PDF:

```bash
cd build
ALD01_PDF=/path/to/HKV_322_LAYOUT_R1.pdf python3 build_zone.py --report --write ../assets/diorama/zone.json
ALD01_PDF=/path/to/HKV_322_LAYOUT_R1.pdf python3 build_pieces.py --write
```

The PDF and the site photos are not in the repo: the drawing carries the client's name and
address and one photo shows a member of the family at home.

## Next

- 360 panoramas per room, as B-34's tour (V-Ray spherical panoramas from the architect once
  the redesign exists).
- The architect's redesign as a second set of finishes and furniture next to Original.
