# A new flat

From the architect's plan to a diorama like HKV-322's: the flat cut open on a plinth,
furnished as drawn, finishes, moods, the sun through the day, walk mode, a phone layout.
The engine (`diorama/`) is shared; a flat is two files in `flats/<id>/`.

## What you need

The plan as a **PDF exported from CAD with its layers** (AutoCAD: plot to PDF with
layer information kept; Studio Spindle's ALD sheets already are), or a DXF converted to
such a PDF. A scan or a flattened image will not do: the build reads walls, doors,
windows, furniture and text as vectors.

Keep the PDF out of the repo. It carries the client's name and address.

## Steps

1. **Make the flat's folder and settings.** `flats/<id>/flat.json`, at its smallest:

   ```json
   {
     "id": "abc-12",
     "title": { "kicker": "ABC-12 · Vasant Vihar", "name": "The flat", "page": "ABC-12 · The flat" },
     "provenance": { "layout": "Ar. Shivangi Kaushik / Studio Spindle, ALD-01 R0, vector PDF" }
   }
   ```

2. **Read the plan.**

   ```bash
   pip install pymupdf shapely
   python3 build/make_flat.py abc-12 --pdf ~/Downloads/ABC_12_LAYOUT.pdf --check out/abc-12.png
   ```

   It prints:
   - the **scale** it measured from the printed dimensions (a sheet "plotted to fit" is a
     few per cent off 1:50; the printed dimensions govern). Lines marked `check:` are
     room dimensions that disagree with the rest: worth asking the architect about;
   - every **room** with its area, size and ceiling height (from the `CH:` labels);
   - the **furniture** it recognised, and each drawing it could not name (`left out`);
   - `FIX:` lines for what the drawing leaves implicit, each saying what to add.

   `out/abc-12.png` draws what it read over the sheet, with a 1 m grid in sheet metres:
   red walls, blue windows, green door openings, orange room outlines, purple furniture.

3. **Fix what it asks for** in `flat.json` (coordinates are sheet metres; read them off
   the grid on the check image):

   | It says | Add to `fixes` |
   | --- | --- |
   | one region holds two room names (an open plan) | `"dividers": [{"between": "dining\|living", "line": [[x0, y0], [x1, y1]]}]` along the beam or the line where they meet |
   | a room name is in no closed room, and the room is outdoors (a balcony, a varandah) | `"outdoor": [{"id": "balcony", "name": "Balcony", "box": [x0, y0, x1, y1]}]`, and `"parapet"` polygons for its low wall |
   | a room name is in no closed room, and there is a door without a drawn swing | `"door_strips": [{"box": [x0, y0, x1, y1]}]` across the opening |

   Other settings, all optional:
   - `"rooms"`: rename what the sheet calls a room, e.g. `{"DINING AREA": {"id": "dining", "name": "Dining"}}`
   - `"spaces"`: rooms open to each other that should open as one, e.g. foyer, dining and living
   - `"chips"`: the order of the room buttons on phones; `"minor"`: rooms whose label shows only on hover
   - `"original"` and `"samples"`: the finishes the Original preset shows (her specification, or the flat as it is today)
   - `"walk": {"start": "foyer"}`: where walk mode starts
   - `"north_sheet"`: which way north points on the sheet, as a vector
   - `"plan": {"scale": 0.9138}`: pin the scale once agreed, so later rebuilds cannot shift it
   - `"layers"`: only if the drawing uses other layer names than Studio Spindle's (see `LAYERS` in `build/plan.py`)
   - `"pieces": "pieces.py"`: a hand-curated furniture list instead of the automatic one (HKV-322 has one; a new flat usually does not need it)

   Run step 2 again until it prints no `FIX:` and the check image matches the sheet.

4. **Write it and look.**

   ```bash
   python3 build/make_flat.py abc-12 --pdf ~/Downloads/ABC_12_LAYOUT.pdf --write
   python3 serve.py 8747     # then http://127.0.0.1:8747/diorama/?flat=abc-12
   ```

   Open each room, walk through the doors, try it on a phone.

5. **Publish.** `python3 build/stage.py abc-12` puts a self-contained copy in
   `out/publish/abc-12/` (the engine with the flat's files beside it). Publish that
   folder: as a claude.ai Artifact, or to any static host.

## What is read, and what is not

- **Read from the drawing:** walls (hatched outlines), door openings (from each door's
  swing), windows and full-height glass, room names and ceiling heights, furniture and
  sanitary fittings with the architect's own labels, and which way each piece faces (away
  from the wall it stands against). Beds drawn with their bedside tables, dining tables
  drawn with chairs, and pieces drawn touching (a TV unit running into a bookshelf) are
  separated.
- **Assumed:** section cut at 2.1 m (door head), window sills at 0.9 m, a 900 mm kitchen
  counter, standard depths for wall pieces (wardrobe 61 cm, TV unit 40 cm, bookshelf 30 cm).
- **Not invented:** a drawing with no label and no recognisable shape is left out and
  listed. Finishes other than `original` are concept options, marked as such in the app.
