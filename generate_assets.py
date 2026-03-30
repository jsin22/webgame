"""
Generates placeholder PNG assets for City RPG:
  assets/tilesets/city_tiles.png   — 10x4 tileset, 32x32 px per tile
  assets/sprites/player.png        — 4x9 spritesheet, 48x64 px per frame
"""
import struct, zlib, os

# ─── Minimal PNG writer ───────────────────────────────────────────────────────
def png_chunk(tag, data):
    c = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)

def write_png(path, pixels, w, h):
    """pixels: flat list of (R,G,B,A) tuples, row-major."""
    raw = b''
    for y in range(h):
        raw += b'\x00'  # filter byte
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            raw += bytes([r, g, b, a])
    compressed = zlib.compress(raw, 9)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(png_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
                          .replace(struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0),
                                   struct.pack('>II', w, h) + bytes([8, 6, 0, 0, 0]))))
        f.write(png_chunk(b'IDAT', compressed))
        f.write(png_chunk(b'IEND', b''))

def write_png_rgba(path, pixels, w, h):
    """pixels: list of (R,G,B,A)."""
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += bytes(pixels[y * w + x])
    compressed = zlib.compress(raw, 9)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = png_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
                     .replace(struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0),
                              struct.pack('>II', w, h) + bytes([8, 6, 0, 0, 0])))
    idat = png_chunk(b'IDAT', compressed)
    iend = png_chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(sig + ihdr + idat + iend)

# ─── Drawing helpers ──────────────────────────────────────────────────────────
def make_canvas(w, h, fill=(0, 0, 0, 0)):
    return [list(fill)] * (w * h)

def make_canvas_mut(w, h, fill=(0, 0, 0, 0)):
    return [list(fill) for _ in range(w * h)]

def set_px(buf, w, x, y, color):
    if 0 <= x < w and 0 <= y < len(buf) // w:
        buf[y * w + x] = list(color)

def fill_rect(buf, bw, x, y, rw, rh, color):
    for dy in range(rh):
        for dx in range(rw):
            set_px(buf, bw, x + dx, y + dy, color)

def draw_line_h(buf, bw, x, y, length, color):
    for i in range(length):
        set_px(buf, bw, x + i, y, color)

def draw_line_v(buf, bw, x, y, length, color):
    for i in range(length):
        set_px(buf, bw, x, y + i, color)

def fill_circle(buf, bw, cx, cy, r, color):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                set_px(buf, bw, cx + dx, cy + dy, color)

def outline_rect(buf, bw, x, y, rw, rh, color):
    draw_line_h(buf, bw, x, y, rw, color)
    draw_line_h(buf, bw, x, y + rh - 1, rw, color)
    draw_line_v(buf, bw, x, y, rh, color)
    draw_line_v(buf, bw, x + rw - 1, y, rh, color)

# ─── Tile definitions ─────────────────────────────────────────────────────────
TS = 32  # tile size

# Tile index → drawing function
# Tileset layout (10 wide × 4 tall):
# Row 0: road, road_h, road_v, sidewalk, intersection, grass, park, water, dirt, corner
# Row 1: bldg0..bldg9
# Row 2: bldg10..bldg19 (more building variants)
# Row 3: reserved / extras

ROAD_COLOR       = (72, 72, 72, 255)
ROAD_DARK        = (55, 55, 55, 255)
ROAD_DASH        = (230, 195, 50, 255)
SIDEWALK_COLOR   = (185, 165, 130, 255)
SIDEWALK_DARK    = (165, 145, 110, 255)
INTERSECTION_CLR = (58, 58, 58, 255)
CROSS_WHITE      = (240, 240, 240, 100)
GRASS_COLOR      = (62, 140, 74, 255)
GRASS_DARK       = (48, 110, 58, 255)
PARK_COLOR       = (45, 130, 60, 255)
TREE_DARK        = (28, 90, 40, 255)
TREE_LIGHT       = (55, 160, 70, 255)
WATER_COLOR      = (50, 130, 200, 255)
WATER_LIGHT      = (80, 160, 220, 255)

# ─── Pixel font (4×5, except I which is 3×5) ─────────────────────────────────
FONT = {
    'C': [[0,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,0]],
    'A': [[0,1,1,0],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    'S': [[0,1,1,1],[1,0,0,0],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
    'I': [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
    'N': [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
    'O': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    'P': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    'Z': [[1,1,1,1],[0,0,1,0],[0,1,0,0],[1,0,0,0],[1,1,1,1]],
}

def _text_width(text):
    total = 0
    for i, ch in enumerate(text.upper()):
        g = FONT.get(ch)
        if g:
            total += len(g[0]) + (1 if i < len(text) - 1 else 0)
    return total

def draw_text_px(buf, bw, x, y, text, color):
    cx = x
    for ch in text.upper():
        g = FONT.get(ch)
        if g is None:
            cx += 4; continue
        for ri, row in enumerate(g):
            for ci, bit in enumerate(row):
                if bit:
                    set_px(buf, bw, cx + ci, y + ri, color)
        cx += len(g[0]) + 1

BUILDING_COLORS = [
    ((140, 50, 50, 255),   (100, 35, 35, 255)),   # red
    ((50, 80, 150, 255),   (35, 60, 120, 255)),   # blue
    ((50, 130, 80, 255),   (35, 100, 60, 255)),   # green
    ((120, 55, 160, 255),  (90, 40, 120, 255)),   # purple
    ((180, 100, 40, 255),  (140, 75, 30, 255)),   # orange
    ((40, 130, 140, 255),  (30, 100, 110, 255)),  # teal
    ((90, 90, 100, 255),   (65, 65, 75, 255)),    # gray
    ((130, 90, 50, 255),   (100, 65, 35, 255)),   # brown
    ((160, 50, 100, 255),  (120, 35, 75, 255)),   # pink
    ((50, 100, 140, 255),  (35, 75, 110, 255)),   # steel blue
]
WINDOW_COLOR = (255, 255, 180, 100)
WINDOW_LIT   = (255, 255, 180, 210)

def draw_road_tile(buf, bw, ox, oy):
    fill_rect(buf, bw, ox, oy, TS, TS, ROAD_COLOR)
    # subtle noise
    for i in range(0, TS, 8):
        set_px(buf, bw, ox + i, oy + TS // 2, ROAD_DARK)

def draw_road_h_tile(buf, bw, ox, oy):
    """Road with horizontal centre dashes."""
    fill_rect(buf, bw, ox, oy, TS, TS, ROAD_COLOR)
    for i in range(0, TS, 8):
        if (i // 8) % 2 == 0:
            set_px(buf, bw, ox + i, oy + TS // 2, ROAD_DASH)
            if i + 1 < TS:
                set_px(buf, bw, ox + i + 1, oy + TS // 2, ROAD_DASH)

def draw_road_v_tile(buf, bw, ox, oy):
    """Road with vertical centre dashes."""
    fill_rect(buf, bw, ox, oy, TS, TS, ROAD_COLOR)
    for i in range(0, TS, 8):
        if (i // 8) % 2 == 0:
            set_px(buf, bw, ox + TS // 2, oy + i, ROAD_DASH)
            if i + 1 < TS:
                set_px(buf, bw, ox + TS // 2, oy + i + 1, ROAD_DASH)

def draw_sidewalk_tile(buf, bw, ox, oy):
    fill_rect(buf, bw, ox, oy, TS, TS, SIDEWALK_COLOR)
    outline_rect(buf, bw, ox + 1, oy + 1, TS - 2, TS - 2, SIDEWALK_DARK)

def draw_intersection_tile(buf, bw, ox, oy):
    fill_rect(buf, bw, ox, oy, TS, TS, INTERSECTION_CLR)
    # crosswalk stripes
    for i in range(0, TS, 6):
        if (i // 6) % 2 == 0:
            for dx in range(4):
                set_px(buf, bw, ox + i + dx, oy + 2, CROSS_WHITE)
                set_px(buf, bw, ox + i + dx, oy + TS - 3, CROSS_WHITE)
                set_px(buf, bw, ox + 2, oy + i + dx, CROSS_WHITE)
                set_px(buf, bw, ox + TS - 3, oy + i + dx, CROSS_WHITE)

def draw_grass_tile(buf, bw, ox, oy):
    fill_rect(buf, bw, ox, oy, TS, TS, GRASS_COLOR)
    # blade pattern
    for i in range(0, TS, 4):
        for j in range(0, TS, 4):
            if (i + j) % 8 == 0:
                set_px(buf, bw, ox + i, oy + j, GRASS_DARK)

def draw_park_tile(buf, bw, ox, oy):
    fill_rect(buf, bw, ox, oy, TS, TS, PARK_COLOR)
    # small tree in corner
    fill_circle(buf, bw, ox + 10, oy + 10, 6, TREE_DARK)
    fill_circle(buf, bw, ox + 9, oy + 9, 4, TREE_LIGHT)

def draw_water_tile(buf, bw, ox, oy):
    fill_rect(buf, bw, ox, oy, TS, TS, WATER_COLOR)
    for i in range(4, TS, 8):
        draw_line_h(buf, bw, ox, oy + i, TS, WATER_LIGHT)

def draw_casino_tile(buf, bw, ox, oy):
    """Casino building tile — dark with gold trim and 'CASINO' spelled out."""
    base   = (18, 12, 35, 255)
    gold   = (255, 200, 50, 255)
    neon_p = (255, 50, 180, 255)
    neon_b = (50, 200, 255, 255)

    fill_rect(buf, bw, ox, oy, TS, TS, base)
    # Gold border
    draw_line_h(buf, bw, ox, oy,          TS, gold)
    draw_line_h(buf, bw, ox, oy + TS - 1, TS, gold)
    draw_line_v(buf, bw, ox, oy,          TS, gold)
    draw_line_v(buf, bw, ox + TS - 1, oy, TS, gold)
    # Neon dots along top and bottom edges
    for i in range(3, TS - 3, 5):
        c = neon_p if (i // 5) % 2 == 0 else neon_b
        set_px(buf, bw, ox + i, oy + 2,        c)
        set_px(buf, bw, ox + i, oy + TS - 3,   c)
    # "CASINO" spelled out in gold, centered
    tw = _text_width('CASINO')
    tx = ox + (TS - tw) // 2
    ty = oy + (TS - 5) // 2
    draw_text_px(buf, bw, tx, ty, 'CASINO', gold)

def draw_pizzeria_tile(buf, bw, ox, oy):
    """Pizzeria building tile — warm brick red with 'PIZZA' spelled out."""
    base   = (170, 50, 20, 255)
    dark   = (110, 28, 10, 255)
    cream  = (255, 220, 160, 255)
    yellow = (255, 220, 30,  255)

    fill_rect(buf, bw, ox, oy, TS, TS, base)
    # Dark border
    draw_line_h(buf, bw, ox, oy,          TS, dark)
    draw_line_h(buf, bw, ox, oy + TS - 1, TS, dark)
    draw_line_v(buf, bw, ox, oy,          TS, dark)
    draw_line_v(buf, bw, ox + TS - 1, oy, TS, dark)
    # Cream dots along top and bottom edges
    for i in range(3, TS - 3, 5):
        set_px(buf, bw, ox + i, oy + 2,      cream)
        set_px(buf, bw, ox + i, oy + TS - 3, cream)
    # "PIZZA" spelled out in yellow, centered
    tw = _text_width('PIZZA')
    tx = ox + (TS - tw) // 2
    ty = oy + (TS - 5) // 2
    draw_text_px(buf, bw, tx, ty, 'PIZZA', yellow)

def draw_building_tile(buf, bw, ox, oy, idx):
    base, dark = BUILDING_COLORS[idx % len(BUILDING_COLORS)]
    fill_rect(buf, bw, ox, oy, TS, TS, base)
    # window grid
    for wy in range(4, TS - 4, 10):
        for wx in range(4, TS - 4, 10):
            lit = WINDOW_LIT if (wx + wy + idx) % 3 != 0 else WINDOW_COLOR
            fill_rect(buf, bw, ox + wx, oy + wy, 6, 6, lit)
    outline_rect(buf, bw, ox, oy, TS, TS, dark)

# ─── Build tileset image ──────────────────────────────────────────────────────
TILE_COLS = 10
TILE_ROWS = 4
IMG_W = TILE_COLS * TS   # 320
IMG_H = TILE_ROWS * TS   # 128

buf = make_canvas_mut(IMG_W, IMG_H, (0, 0, 0, 255))

# Row 0: terrain tiles
draw_road_tile        (buf, IMG_W,  0,  0)
draw_road_h_tile      (buf, IMG_W, 32,  0)
draw_road_v_tile      (buf, IMG_W, 64,  0)
draw_sidewalk_tile    (buf, IMG_W, 96,  0)
draw_intersection_tile(buf, IMG_W,128,  0)
draw_grass_tile       (buf, IMG_W,160,  0)
draw_park_tile        (buf, IMG_W,192,  0)
draw_water_tile       (buf, IMG_W,224,  0)
# tiles 8,9 in row 0: extras (copy of road for now)
draw_road_tile        (buf, IMG_W,256,  0)
draw_sidewalk_tile    (buf, IMG_W,288,  0)

# Row 1: building variants 0-9
for i in range(10):
    draw_building_tile(buf, IMG_W, i * TS, TS, i)

# Row 2: named building tiles then remaining variants
draw_casino_tile   (buf, IMG_W,  0,      TS * 2)   # GID 21 — casino
draw_pizzeria_tile (buf, IMG_W,  TS,     TS * 2)   # GID 22 — pizzeria
for i in range(2, 10):
    draw_building_tile(buf, IMG_W, i * TS, TS * 2, i)

# Row 3: building variants repeated
for i in range(10):
    draw_building_tile(buf, IMG_W, i * TS, TS * 3, i)

os.makedirs('assets/tilesets', exist_ok=True)
write_png_rgba('assets/tilesets/city_tiles.png', [tuple(p) for p in buf], IMG_W, IMG_H)
print(f'Wrote assets/tilesets/city_tiles.png  ({IMG_W}x{IMG_H})')

# ─── Player spritesheet ───────────────────────────────────────────────────────
# Layout: 4 columns (frames 0-3), 4 rows (down, left, right, up)
# Frame size: 32 wide × 48 tall

FW = 32   # frame width
FH = 48   # frame height
ANIM_COLS = 4   # walk frames per direction
ANIM_ROWS = 4   # directions: down, left, right, up

SP_W = FW * ANIM_COLS
SP_H = FH * ANIM_ROWS

# Requested Colors
SKIN   = (115, 75, 45, 255)   # Brown skin
HAIR   = (20, 20, 20, 255)    # Black hair
SHIRT  = (255, 120, 30, 255)  # Orange top
PANTS  = (30, 70, 150, 255)   # Blue pants
SHOE   = (240, 240, 240, 255) # White sneakers
SHADOW = (0, 0, 0, 60)
WHITE  = (255, 255, 255, 255)
EYE    = (255, 255, 255, 255) # White eyes for visibility

def draw_player_frame(buf, bw, ox, oy, direction, frame):
    """Draw one player frame at pixel offset (ox, oy)."""
    # frame: 0-3 walk cycle
    leg_offset = [0, 3, 0, -3][frame]

    cx = ox + FW // 2
    cy = oy + FH // 2 

    # 1. Draw Shadow first (bottom layer)
    for dx in range(-10, 11):
        for dy in range(-4, 5):
            if dx*dx/100 + dy*dy/16 <= 1:
                set_px(buf, bw, cx + dx, oy + FH - 6 + dy, SHADOW)

    if direction == 0:  # DOWN
        # Legs/Pants
        fill_rect(buf, bw, cx - 8, cy + 8, 7, 10, PANTS)
        fill_rect(buf, bw, cx + 1, cy + 8, 7, 10, PANTS)
        # Shoes (Drawn AFTER pants to be on top)
        fill_rect(buf, bw, cx - 8, cy + 16 + leg_offset, 7, 5, SHOE)
        fill_rect(buf, bw, cx + 1, cy + 16 - leg_offset, 7, 5, SHOE)
        # Upper Body
        fill_rect(buf, bw, cx - 9, cy - 2, 18, 12, SHIRT)
        fill_rect(buf, bw, cx - 13, cy, 5, 8, SKIN)
        fill_rect(buf, bw, cx + 8, cy, 5, 8, SKIN)
        fill_rect(buf, bw, cx - 3, cy - 7, 6, 6, SKIN)
        fill_circle(buf, bw, cx, cy - 13, 9, SKIN)
        fill_rect(buf, bw, cx - 9, cy - 22, 18, 8, HAIR)
        fill_circle(buf, bw, cx, cy - 19, 8, HAIR)
        fill_rect(buf, bw, cx - 5, cy - 14, 3, 3, EYE)
        fill_rect(buf, bw, cx + 2, cy - 14, 3, 3, EYE)

    elif direction == 1:  # LEFT
        # Back Leg (Right leg)
        fill_rect(buf, bw, cx - 2, cy + 8, 6, 10, PANTS)
        fill_rect(buf, bw, cx - 2, cy + 16 - leg_offset, 7, 5, SHOE)
        # Body
        fill_rect(buf, bw, cx - 8, cy - 2, 12, 12, SHIRT)
        # Front Leg (Left leg)
        fill_rect(buf, bw, cx - 8, cy + 8, 6, 10, PANTS)
        fill_rect(buf, bw, cx - 9, cy + 16 + leg_offset, 7, 5, SHOE)
        # Head & Arm
        fill_rect(buf, bw, cx - 10, cy, 4, 8, SKIN)
        fill_rect(buf, bw, cx - 5, cy - 7, 6, 6, SKIN)
        fill_circle(buf, bw, cx - 2, cy - 13, 9, SKIN)
        fill_rect(buf, bw, cx - 11, cy - 22, 16, 8, HAIR)
        fill_circle(buf, bw, cx - 2, cy - 19, 8, HAIR)
        fill_rect(buf, bw, cx - 7, cy - 14, 3, 3, EYE)

    elif direction == 2:  # RIGHT
        # Back Leg (Left leg)
        fill_rect(buf, bw, cx - 4, cy + 8, 6, 10, PANTS)
        fill_rect(buf, bw, cx - 5, cy + 16 - leg_offset, 7, 5, SHOE)
        # Body
        fill_rect(buf, bw, cx - 4, cy - 2, 12, 12, SHIRT)
        # Front Leg (Right leg)
        fill_rect(buf, bw, cx + 2, cy + 8, 6, 10, PANTS)
        fill_rect(buf, bw, cx + 2, cy + 16 + leg_offset, 7, 5, SHOE)
        # Head & Arm
        fill_rect(buf, bw, cx + 6, cy, 4, 8, SKIN)
        fill_rect(buf, bw, cx - 1, cy - 7, 6, 6, SKIN)
        fill_circle(buf, bw, cx + 2, cy - 13, 9, SKIN)
        # Hair/Eyes
        fill_rect(buf, bw, cx - 5, cy - 22, 16, 8, HAIR)
        fill_circle(buf, bw, cx + 2, cy - 19, 8, HAIR)
        fill_rect(buf, bw, cx + 4, cy - 14, 3, 3, EYE)

    elif direction == 3:  # UP
        fill_rect(buf, bw, cx - 8, cy + 8, 7, 10, PANTS)
        fill_rect(buf, bw, cx + 1, cy + 8, 7, 10, PANTS)
        fill_rect(buf, bw, cx - 8, cy + 16 + leg_offset, 7, 5, SHOE)
        fill_rect(buf, bw, cx + 1, cy + 16 - leg_offset, 7, 5, SHOE)
        fill_rect(buf, bw, cx - 9, cy - 2, 18, 12, SHIRT)
        fill_rect(buf, bw, cx - 13, cy, 5, 8, SKIN)
        fill_rect(buf, bw, cx + 8, cy, 5, 8, SKIN)
        fill_rect(buf, bw, cx - 3, cy - 7, 6, 6, SKIN)
        fill_circle(buf, bw, cx, cy - 13, 9, SKIN)
        fill_circle(buf, bw, cx, cy - 13, 9, HAIR)
        fill_rect(buf, bw, cx - 9, cy - 22, 18, 10, HAIR)


sp_buf = make_canvas_mut(SP_W, SP_H, (0, 0, 0, 0))
DIRS = [0, 1, 2, 3]  # down, left, right, up

for row, direction in enumerate(DIRS):
    for col in range(ANIM_COLS):
        draw_player_frame(sp_buf, SP_W, col * FW, row * FH, direction, col)

os.makedirs('assets/sprites', exist_ok=True)
write_png_rgba('assets/sprites/player.png', [tuple(p) for p in sp_buf], SP_W, SP_H)

print(f'Wrote assets/sprites/player.png  ({SP_W}x{SP_H})')
print('Done.')
