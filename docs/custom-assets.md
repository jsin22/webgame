# Custom Assets Guide

How to replace the generated tileset, player sprite, and city map with hand-drawn artwork.

---

## Recommended tools

| Tool | Cost | Best for |
|---|---|---|
| **[Aseprite](https://www.aseprite.org/)** | ~$20 (or free if you compile it) | Pixel art sprites & tilesets — purpose-built, best-in-class for this |
| **[Libresprite](https://libresprite.github.io/)** | Free | Fork of an older Aseprite — same workflow, no cost |
| **[Krita](https://krita.org/)** | Free | Full illustration; good if you want painterly tiles |
| **[GIMP](https://www.gimp.org/)** | Free | General image editing; works but clunkier for pixel art |
| **[Tiled](https://www.mapeditor.org/)** | Free | Map editor — reads/writes the exact JSON format the game uses |

For pixel art (which suits this game's 32 px tile size), **Aseprite or Libresprite** are the right choice.
For the map, **Tiled** is the standard and is what the JSON format is designed for.

---

## Player spritesheet

### Specs
| Property | Value |
|---|---|
| File | `assets/sprites/player.png` |
| Frame size | 32 × 48 px |
| Sheet layout | 4 columns × 4 rows (128 × 192 px total) |
| Format | PNG with transparency (RGBA) |

### Row layout
| Row | Frames | Direction |
|---|---|---|
| 0 | 0–3 | Walk **down** (toward camera) |
| 1 | 4–7 | Walk **left** |
| 2 | 8–11 | Walk **right** |
| 3 | 12–15 | Walk **up** (away from camera) |

### Drawing tips
- Keep the character's feet near the **bottom centre** of the frame — the physics body is anchored there (offset 6 px from left, 22 px from top, 20×24 px size).
- 4 frames per direction is the minimum for a smooth walk cycle. Frame 0 and frame 2 are typically the "neutral/stride" poses; frames 1 and 3 are the mid-steps.
- Leave transparent padding around the character — the frame edges won't clip during gameplay.

### Replacing it
1. Draw your sheet at exactly **128 × 192 px** (4 cols × 4 rows of 32×48 frames).
2. Export as PNG with transparency.
3. Save to `assets/sprites/player.png` — overwrite the generated file.
4. No code changes needed; `BootScene.js` loads it by path.

If you change the frame size, update `BootScene.js`:
```js
this.load.spritesheet('player', 'assets/sprites/player.png', {
  frameWidth:  32,   // ← change these
  frameHeight: 48,
});
```

---

## Tileset

### Specs
| Property | Value |
|---|---|
| File | `assets/tilesets/city_tiles.png` |
| Tile size | 32 × 32 px |
| Sheet layout | 10 columns × 4 rows (320 × 128 px total) |
| Format | PNG (transparency optional but useful) |

### Tile index map
Tiles are numbered left-to-right, top-to-bottom. GID = index + 1 (Tiled uses 1-based GIDs).

**Row 0 — terrain (GIDs 1–10)**

| GID | Index | Used for |
|---|---|---|
| 1 | 0 | Road (plain) |
| 2 | 1 | Road with horizontal centre dashes |
| 3 | 2 | Road with vertical centre dashes |
| 4 | 3 | Sidewalk |
| 5 | 4 | Intersection |
| 6 | 5 | Grass |
| 7 | 6 | Park / open green space |
| 8 | 7 | Water |
| 9–10 | 8–9 | Spare terrain slots |

**Rows 1–3 — buildings (GIDs 11–40)**

10 building colour variants per row (the generator uses rows 1–3 for the same 10 variants repeated). `generate_map.py` picks which variant via `11 + (blockCol * 5 + blockRow * 7) % 10`.

### Replacing it
1. Open/create a **320 × 128 px** canvas in your pixel art tool.
2. Divide it into a 10×4 grid of 32×32 cells — most tools have a grid overlay option.
3. Draw each tile in its cell, keeping the GID positions above.
4. Export as `assets/tilesets/city_tiles.png`.

> **Important**: keep the same tile positions. The map JSON references tiles by GID — if you move tiles around, the map will look wrong. You can change how tiles *look* freely, but don't reorder them unless you also update `generate_map.py` and re-run it.

---

## City map

### Using Tiled (recommended)

[Tiled](https://www.mapeditor.org/) can open and edit `assets/tilemaps/city.json` directly.

1. **Open Tiled** → File → Open → select `assets/tilemaps/city.json`.
2. Tiled will ask for the tileset image — point it to `assets/tilesets/city_tiles.png`.
3. Edit tiles on the `ground` and `buildings` layers using the tileset palette.
   - `ground` layer: terrain tiles (roads, sidewalks, grass, etc.) — **no collision**.
   - `buildings` layer: building tiles — **all non-empty tiles are solid** (collision is set automatically in code via `setCollisionByExclusion([-1])`).
4. Save as JSON (File → Save) — Tiled writes the same format the game expects.
5. Reload the browser — no other steps needed.

### Key Tiled settings to preserve
- Map size: 60 × 60 tiles
- Tile size: 32 × 32 px
- Layer names must stay `ground`, `buildings`, `objects` (the code references them by name)
- The `spawn` object in the `objects` layer sets the player's starting position — keep at least one object named `spawn`

### Changing the generated map layout

If you want to tweak the procedural layout instead of painting by hand, edit `generate_map.py`:

- **Add/remove park blocks**: edit `PARK_BLOCKS` — each `(blockCol, blockRow)` pair turns a building block into a park.
- **Change map size**: update `COLS` and `ROWS` (multiples of 10 keep the block grid clean).
- **Change road width**: update `ROAD_W` (currently 3 tiles).

Then re-run:
```bash
python3 generate_map.py
```

---

## Workflow summary

```
Draw sprites/tiles in Aseprite
        ↓
Export PNG → overwrite assets/
        ↓
Edit map in Tiled (optional)
        ↓
Save city.json → overwrite assets/tilemaps/
        ↓
Reload browser (no build step)
```
