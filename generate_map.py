"""
Generates assets/tilemaps/city.json  — a Tiled-compatible tilemap for City RPG.

Map layout (60×60 tiles, 32 px each):
  Repeating 10-tile block:
    local 0-2  → road   (3 tiles wide)
    local 3    → sidewalk
    local 4-8  → building interior  (5 tiles) — or park for PARK_BLOCKS
    local 9    → sidewalk

Tileset GID reference (city_tiles.png, 10 cols × 4 rows):
  Row 0  (terrain)
    GID 1  = road plain
    GID 2  = road horizontal-dash  (middle tile of H-road, ly==1)
    GID 3  = road vertical-dash    (middle tile of V-road, lx==1)
    GID 4  = sidewalk
    GID 5  = intersection
    GID 6  = grass
    GID 7  = park
    GID 8  = water
  Row 1  (buildings 0-9)
    GID 11-20 = building variants
"""
import json, os

COLS  = 60
ROWS  = 60
TS    = 32   # tile size in pixels
BLOCK = 10
ROAD_W = 3

# Blocks (blockCol, blockRow) that become parks instead of buildings
PARK_BLOCKS = {(1,1),(2,4),(4,2),(3,3),(5,1),(0,4),(4,5)}

GID_ROAD         = 1
GID_ROAD_H       = 2
GID_ROAD_V       = 3
GID_SIDEWALK     = 4
GID_INTERSECTION = 5
GID_GRASS        = 6
GID_PARK         = 7
GID_CASINO       = 21   # row 2 col 0 in tileset — casino tile
GID_PIZZERIA     = 22   # row 2 col 1 in tileset — pizzeria tile
GID_HOME         = 23   # row 2 col 2 in tileset — home tile
GID_GYM          = 24   # row 2 col 3 in tileset — gym tile

# Blocks reserved for named venues
CASINO_BLOCK   = (3, 2)
PIZZERIA_BLOCK = (1, 2)
HOME_BLOCK     = (0, 1)
GYM_BLOCK      = (2, 0)

def building_gid(bc, br):
    """Returns GID 11-20 based on block position."""
    return 11 + (bc * 5 + br * 7) % 10

def tile_gids(col, row):
    """Returns (ground_gid, building_gid) for a map tile."""
    lx = col % BLOCK
    ly = row % BLOCK
    bc = col // BLOCK
    br = row // BLOCK

    road_x = lx < ROAD_W
    road_y = ly < ROAD_W
    sw_x   = lx == ROAD_W or lx == BLOCK - 1
    sw_y   = ly == ROAD_W or ly == BLOCK - 1

    # Intersection
    if road_x and road_y:
        return GID_INTERSECTION, 0

    # Road – choose dashed variant for the centre lane tile
    if road_x and not road_y:
        g = GID_ROAD_V if lx == 1 else GID_ROAD
        return g, 0
    if road_y and not road_x:
        g = GID_ROAD_H if ly == 1 else GID_ROAD
        return g, 0

    # Sidewalk
    if sw_x or sw_y:
        return GID_SIDEWALK, 0

    # Building / park / named venues
    if (bc, br) in PARK_BLOCKS:
        return GID_PARK, 0
    elif (bc, br) == CASINO_BLOCK:
        return GID_SIDEWALK, GID_CASINO
    elif (bc, br) == PIZZERIA_BLOCK:
        return GID_SIDEWALK, GID_PIZZERIA
    elif (bc, br) == HOME_BLOCK:
        return GID_SIDEWALK, GID_HOME
    elif (bc, br) == GYM_BLOCK:
        return GID_SIDEWALK, GID_GYM
    else:
        return GID_SIDEWALK, building_gid(bc, br)

# Build layer data arrays
ground_data   = []
building_data = []

for r in range(ROWS):
    for c in range(COLS):
        g, b = tile_gids(c, r)
        ground_data.append(g)
        building_data.append(b)

# Spawn point: centre of tile (30,30) — guaranteed intersection
spawn_x = 30 * TS + TS / 2
spawn_y = 30 * TS + TS / 2

tiled_map = {
    "compressionlevel": -1,
    "height":  ROWS,
    "width":   COLS,
    "infinite": False,
    "orientation": "orthogonal",
    "renderorder":  "right-down",
    "tileheight": TS,
    "tilewidth":  TS,
    "type": "map",
    "version": "1.10",
    "tiledversion": "1.10.0",
    "nextlayerid": 4,
    "nextobjectid": 6,
    "layers": [
        {
            "id": 1,
            "name": "ground",
            "type": "tilelayer",
            "data": ground_data,
            "width":  COLS,
            "height": ROWS,
            "x": 0,
            "y": 0,
            "opacity": 1,
            "visible": True,
        },
        {
            "id": 2,
            "name": "buildings",
            "type": "tilelayer",
            "data": building_data,
            "width":  COLS,
            "height": ROWS,
            "x": 0,
            "y": 0,
            "opacity": 1,
            "visible": True,
        },
        {
            "id": 3,
            "name": "objects",
            "type": "objectgroup",
            "draworder": "topdown",
            "objects": [
                {
                    "id": 1,
                    "name": "spawn",
                    "type": "spawn",
                    "x": spawn_x,
                    "y": spawn_y,
                    "width": TS,
                    "height": TS,
                    "rotation": 0,
                    "visible": True,
                },
                {
                    # South-face entrance of the casino block (3,2).
                    # Interior cols 34-38, south sidewalk row 29.
                    "id": 2,
                    "name": "casino_entrance",
                    "type": "casino_entrance",
                    "x": 35 * TS,
                    "y": 29 * TS,
                    "width":  3 * TS,
                    "height": TS,
                    "rotation": 0,
                    "visible": True,
                },
                {
                    # South-face entrance of the pizzeria block (1,2).
                    # Interior cols 14-18, south sidewalk row 29.
                    "id": 3,
                    "name": "pizzeria_entrance",
                    "type": "pizzeria_entrance",
                    "x": 15 * TS,
                    "y": 29 * TS,
                    "width":  3 * TS,
                    "height": TS,
                    "rotation": 0,
                    "visible": True,
                },
                {
                    # South-face entrance of the home block (0,1).
                    # Interior cols 4-8, south sidewalk row 19.
                    "id": 4,
                    "name": "home_entrance",
                    "type": "home_entrance",
                    "x": 5 * TS,
                    "y": 19 * TS,
                    "width":  3 * TS,
                    "height": TS,
                    "rotation": 0,
                    "visible": True,
                },
                {
                    # South-face entrance of the gym block (2,0).
                    # Interior cols 24-28, south sidewalk row 9.
                    "id": 5,
                    "name": "gym_entrance",
                    "type": "gym_entrance",
                    "x": 25 * TS,
                    "y": 9 * TS,
                    "width":  3 * TS,
                    "height": TS,
                    "rotation": 0,
                    "visible": True,
                }
            ],
            "x": 0,
            "y": 0,
            "opacity": 1,
            "visible": True,
        }
    ],
    "tilesets": [
        {
            "firstgid": 1,
            "name": "city_tiles",
            "image": "../tilesets/city_tiles.png",
            "imagewidth":  320,
            "imageheight": 128,
            "tilewidth":  TS,
            "tileheight": TS,
            "tilecount": 40,
            "columns": 10,
            "margin":  0,
            "spacing": 0,
        }
    ]
}

os.makedirs('assets/tilemaps', exist_ok=True)
out = 'assets/tilemaps/city.json'
with open(out, 'w') as f:
    json.dump(tiled_map, f, separators=(',', ':'))

print(f'Wrote {out}  ({COLS}×{ROWS} tiles)')
print(f'  Ground layer:   {len(ground_data)} entries')
print(f'  Building layer: {sum(1 for x in building_data if x)} non-empty building tiles')
print(f'  Spawn point:    ({spawn_x}, {spawn_y})')
