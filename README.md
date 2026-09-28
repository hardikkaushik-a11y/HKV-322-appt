# HKV-322 - The flat

Residence for Mr. Jnaneswar Sen, 322 Hauz Khas Apartments, New Delhi. Architect: Ar. Shivangi
Kaushik, Studio Spindle. This is the same kind of thing as `b34-presentation`'s `/diorama/` -
the flat as a 3D model built straight from the plan, not from any render or SketchUp pipeline -
at a much earlier stage: there is no approved design for this flat yet, only the ALD-01 layout
drawing.

Serve the folder locally, because the model loads JSON with a browser request:

```bash
python3 serve.py 8747      # then http://127.0.0.1:8747
```

## What this is

A neutral spatial shell: every room from ALD-01, at its real footprint and ceiling height,
shown as a whole-flat cutaway on a plinth. Drag to orbit, scroll to zoom, click a room to fly
to it. A walk button drops you inside at eye height with drag-to-look and WASD.

There is no furniture and no finish in this build, because nothing has been designed for this
flat yet - see `GOAL.md`-style reasoning in `b34-presentation`: an unfinished space stays a
neutral shell rather than inventing an approved look for it. Doors and windows are not modelled
either, so walk mode currently shows closed boxes with no opening between rooms; it walks and
collides correctly but doesn't yet let you see room to room. Digitizing door and window
positions from the drawing is the natural next pass if the walk view needs to carry more than
the orbit view already does.

## Where the geometry comes from

`assets/layout/rooms.json`. There is no DXF or CAD export for this project (unlike B-34's
`assets/cad-draft/`), only the ALD-01 PDF, so the room list was built by:

1. Rendering the PDF page to a raster image and calibrating pixels to real-world metres from
   the sheet's own title block (A3 page, scale 1:50 - so 1 mm on the page is 50 mm real).
2. Reading each room's printed width x depth and ceiling height off the sheet where ALD-01
   dimensions it.
3. Placing rooms next to each other by the drawing's own adjacency (what borders what), snapped
   to a shared grid so neighbouring walls line up.

Every room in the JSON carries `"labeled": true` when its width and depth come from ALD-01's
own printed dimension text, and `"labeled": false` when the sheet doesn't dimension that space
and the size shown is an eyeballed estimate from the drawing's proportions instead: the Foyer,
the Servant Toilet, Toilet 1, and the Varandah's depth. Those four are flagged with a dashed
"estimated" tag on their label in the viewer and should be corrected against a DXF or an updated
dimension set before anyone treats them as exact. Bay windows, window seats and the kitchen's
L-shaped notch are simplified to plain rectangles for this pass; wall thickness is a flat 12 cm
guess, not read off the drawing (ALD-01 gives no wall thickness).

Total footprint as digitized: about 146 m² / 1,570 sq ft. That is a sum of the individual room
boxes above, not a surveyed number, and will move once the estimated rooms and the simplified
alcoves are corrected.

## Files

- `index.html` / `app.js` - the whole app: fetches `assets/layout/rooms.json`, extrudes each
  room's floor and walls to its own ceiling height with a dark section-cut cap (same cutaway
  trick as B-34's diorama), places floating name + area labels, and drives orbit and walk mode.
- `assets/layout/rooms.json` - the digitized room list; see above.
- `lib/` - three.js and OrbitControls, vendored (not from a CDN) for the same reason B-34 does
  it: served over `file://` a page can still load a `<script>`, but not a module's own
  `XMLHttpRequest`import, and `serve.py` exists for browsers that block local files outright.

## Next, if this flat gets a design pass

Follow B-34's own pattern once real design material exists: keep this shell as the neutral
baseline for undesigned rooms, and only add colour, furniture or a photoreal tour to a room once
there is an approved render or V-Ray output to source it from. Don't invent finishes here.
