"""
generate_player_layers.py
Generates layered player sprite sheets for dynamic character coloring.

Output (128×192 px each — 32×48 per frame, 4 cols × 4 rows):
  assets/sprites/player_body_male.png    — skin, hair, arms; no clothes
  assets/sprites/player_body_female.png  — darker skin, long hair
  assets/sprites/player_shirt.png        — shirt mask (white = tintable)
  assets/sprites/player_pants.png        — pants mask (white = tintable)
  assets/sprites/player_shoes.png        — shoes mask (white = tintable)

Tinting: Phaser multiplies each pixel by the tint colour. White pixels
become the tint colour, dark-grey outlines become a darker shade of it.
"""

import struct, zlib, os

# ── PNG writer ────────────────────────────────────────────────────────────────
def _chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xffffffff
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

def write_png(path, pixels, w, h):
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += bytes(pixels[y * w + x])
    sig  = b'\x89PNG\r\n\x1a\n'
    ihdr = _chunk(b'IHDR', struct.pack('>II', w, h) + bytes([8, 6, 0, 0, 0]))
    idat = _chunk(b'IDAT', zlib.compress(raw, 9))
    iend = _chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(sig + ihdr + idat + iend)

# ── Drawing helpers ───────────────────────────────────────────────────────────
def canvas(w, h):
    return [[0, 0, 0, 0] for _ in range(w * h)]

def px(buf, bw, x, y, c):
    if 0 <= x < bw and 0 <= y < len(buf) // bw:
        buf[y * bw + x] = list(c)

def rect(buf, bw, x, y, w, h, c):
    for dy in range(h):
        for dx in range(w):
            px(buf, bw, x + dx, y + dy, c)

def circle(buf, bw, cx, cy, r, c):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                px(buf, bw, cx + dx, cy + dy, c)

def shadow(buf, bw, cx, base_y):
    S = (0, 0, 0, 55)
    for dx in range(-10, 11):
        for dy in range(-4, 5):
            if dx*dx/100 + dy*dy/16 <= 1:
                px(buf, bw, cx + dx, base_y + dy, S)

# ── Colour constants ──────────────────────────────────────────────────────────
T     = (0, 0, 0, 0)          # transparent
W     = (255, 255, 255, 255)   # white  (tintable layer fill)
DK    = (55,  55,  55,  255)   # dark outline on tintable layers

SKIN_M = (205, 160, 115, 255)  # male   — light brown
SKIN_F = (160, 110,  70, 255)  # female — richer/darker brown
HAIR_M = ( 50,  30,  10, 255)  # male   — dark brown
HAIR_F = ( 40,  22,   8, 255)  # female — slightly darker
EYE    = (255, 255, 255, 255)  # eye whites
PUPIL  = ( 30,  30,  60, 255)  # dark pupils
MOUTH  = (190,  90,  80, 255)  # lip colour

FW, FH = 32, 48
COLS, ROWS = 4, 4

# ── Body layers ───────────────────────────────────────────────────────────────

def _draw_body(buf, bw, ox, oy, direction, frame, skin, hair, female=False):
    """Full character minus clothes — draws skin/hair."""
    lo  = [0, 3, 0, -3][frame]        # leg animation offset
    cx  = ox + FW // 2
    cy  = oy + FH // 2
    shadow(buf, bw, cx, oy + FH - 6)

    if direction == 0:  # ── DOWN ──────────────────────────────────────────────
        # Legs (skin — will be covered by pants/shoes layers)
        rect(buf, bw, cx-8, cy+8,  7, 14, skin)
        rect(buf, bw, cx+1, cy+8,  7, 14, skin)
        # Shirt area (skin — covered by shirt layer)
        rect(buf, bw, cx-9, cy-2, 18, 12, skin)
        # Arms visible
        rect(buf, bw, cx-13, cy,   5,  8, skin)
        rect(buf, bw, cx+8,  cy,   5,  8, skin)
        # Neck
        rect(buf, bw, cx-3,  cy-7, 6,  6, skin)
        # Head
        circle(buf, bw, cx, cy-13, 9, skin)
        # Ears (small — 2×3)
        rect(buf, bw, cx-12, cy-16, 2, 3, skin)
        rect(buf, bw, cx+10, cy-16, 2, 3, skin)
        # Hair — male: smooth cap   female: longer with side curtains
        rect(buf, bw, cx-9, cy-23, 18, 9, hair)
        circle(buf, bw, cx, cy-20, 8, hair)
        if female:
            rect(buf, bw, cx-11, cy-21, 4, 14, hair)   # left side curtain
            rect(buf, bw, cx+7,  cy-21, 4, 14, hair)   # right side curtain
        # Eyes + pupils (moved 2px higher)
        rect(buf, bw, cx-5, cy-16, 3, 3, EYE)
        rect(buf, bw, cx+2, cy-16, 3, 3, EYE)
        px(buf, bw, cx-4, cy-15, PUPIL)
        px(buf, bw, cx+3, cy-15, PUPIL)
        # Nose (moved 2px higher)
        px(buf, bw, cx-1, cy-12, PUPIL)
        px(buf, bw, cx,   cy-12, PUPIL)
        # Mouth (moved 2px higher)
        rect(buf, bw, cx-2, cy-9, 4, 1, MOUTH)

    elif direction == 1:  # ── LEFT ──────────────────────────────────────────
        # Back leg
        rect(buf, bw, cx-2,  cy+8, 6, 14, skin)
        # Shirt area (covered)
        rect(buf, bw, cx-8,  cy-2, 12, 12, skin)
        # Front leg
        rect(buf, bw, cx-8,  cy+8, 6, 14, skin)
        # Arm (visible)
        rect(buf, bw, cx-10, cy,   4,  8, skin)
        # Neck
        rect(buf, bw, cx-5,  cy-7, 6,  6, skin)
        # Head
        circle(buf, bw, cx-2, cy-13, 9, skin)
        # Ear (right ear visible on left profile — 2×3)
        rect(buf, bw, cx+7, cy-16, 2, 3, skin)
        # Hair (width 19 to cover full head extent cx-11..cx+7)
        rect(buf, bw, cx-11, cy-23, 19, 9, hair)
        circle(buf, bw, cx-2, cy-20, 8, hair)
        if female:
            rect(buf, bw, cx-11, cy-20, 3, 12, hair)   # side curtain
        # Eye (moved 2px higher)
        rect(buf, bw, cx-7, cy-16, 3, 3, EYE)
        px(buf, bw, cx-6, cy-15, PUPIL)
        # Nose (profile — sticks out left, moved 2px higher)
        px(buf, bw, cx-11, cy-13, PUPIL)
        # Mouth (moved 2px higher)
        px(buf, bw, cx-10, cy-10, MOUTH)

    elif direction == 2:  # ── RIGHT ─────────────────────────────────────────
        # Back leg
        rect(buf, bw, cx-4,  cy+8, 6, 14, skin)
        # Shirt area (covered)
        rect(buf, bw, cx-4,  cy-2, 12, 12, skin)
        # Front leg
        rect(buf, bw, cx+2,  cy+8, 6, 14, skin)
        # Arm visible
        rect(buf, bw, cx+6,  cy,   4,  8, skin)
        # Neck
        rect(buf, bw, cx-1,  cy-7, 6,  6, skin)
        # Head
        circle(buf, bw, cx+2, cy-13, 9, skin)
        # Ear (left ear visible on right profile — 2×3)
        rect(buf, bw, cx-9, cy-16, 2, 3, skin)
        # Hair (start at cx-7 to cover full head extent cx-7..cx+11)
        rect(buf, bw, cx-7, cy-23, 19, 9, hair)
        circle(buf, bw, cx+2, cy-20, 8, hair)
        if female:
            rect(buf, bw, cx+7, cy-20, 3, 12, hair)    # side curtain
        # Eye (moved 2px higher)
        rect(buf, bw, cx+4, cy-16, 3, 3, EYE)
        px(buf, bw, cx+5, cy-15, PUPIL)
        # Nose (profile — sticks out right, moved 2px higher)
        px(buf, bw, cx+11, cy-13, PUPIL)
        # Mouth (moved 2px higher)
        px(buf, bw, cx+10, cy-10, MOUTH)

    elif direction == 3:  # ── UP ────────────────────────────────────────────
        # Legs + shirt (all skin — covered by layers)
        rect(buf, bw, cx-8, cy+8,  7, 14, skin)
        rect(buf, bw, cx+1, cy+8,  7, 14, skin)
        rect(buf, bw, cx-9, cy-2, 18, 12, skin)
        rect(buf, bw, cx-13, cy,   5,  8, skin)
        rect(buf, bw, cx+8,  cy,   5,  8, skin)
        rect(buf, bw, cx-3,  cy-7, 6,  6, skin)
        # Head (back — all hair)
        circle(buf, bw, cx, cy-13, 9, skin)
        # Ears visible from back (2×3)
        rect(buf, bw, cx-12, cy-16, 2, 3, skin)
        rect(buf, bw, cx+10, cy-16, 2, 3, skin)
        circle(buf, bw, cx, cy-13, 9, hair)
        rect(buf, bw, cx-9, cy-23, 18, 11, hair)
        if female:
            # Longer hair visible on sides even from back
            rect(buf, bw, cx-11, cy-21, 3, 18, hair)
            rect(buf, bw, cx+8,  cy-21, 3, 18, hair)
        else:
            for sx in [cx-7, cx-3, cx+1, cx+5]:
                px(buf, bw, sx, cy-24, hair)


def draw_body_male(buf, bw, ox, oy, d, f):
    _draw_body(buf, bw, ox, oy, d, f, SKIN_M, HAIR_M, female=False)

def draw_body_female(buf, bw, ox, oy, d, f):
    _draw_body(buf, bw, ox, oy, d, f, SKIN_F, HAIR_F, female=True)

# ── Tintable clothing layers ──────────────────────────────────────────────────

def draw_shirt(buf, bw, ox, oy, direction, frame):
    cx = ox + FW // 2
    cy = oy + FH // 2
    if direction == 0:   rect(buf, bw, cx-9, cy-2, 18, 12, W)
    elif direction == 1: rect(buf, bw, cx-8, cy-2, 12, 12, W)
    elif direction == 2: rect(buf, bw, cx-4, cy-2, 12, 12, W)
    elif direction == 3: rect(buf, bw, cx-9, cy-2, 18, 12, W)


def draw_pants(buf, bw, ox, oy, direction, frame):
    cx = ox + FW // 2
    cy = oy + FH // 2
    if direction == 0:
        rect(buf, bw, cx-8, cy+8, 7, 10, W)
        rect(buf, bw, cx+1, cy+8, 7, 10, W)
    elif direction == 1:
        rect(buf, bw, cx-8, cy+8, 6, 10, W)   # front
        rect(buf, bw, cx-2, cy+8, 6, 10, W)   # back
    elif direction == 2:
        rect(buf, bw, cx-4, cy+8, 6, 10, W)   # back
        rect(buf, bw, cx+2, cy+8, 6, 10, W)   # front
    elif direction == 3:
        rect(buf, bw, cx-8, cy+8, 7, 10, W)
        rect(buf, bw, cx+1, cy+8, 7, 10, W)


def draw_shoes(buf, bw, ox, oy, direction, frame):
    lo  = [0, 1, 0, -1][frame]
    cx  = ox + FW // 2
    cy  = oy + FH // 2
    # Shoes base at cy+18 (one pixel below pants bottom at cy+17).
    # lo capped at ±1 so max shoe bottom is cy+24=oy+48-1=oy+47 — within frame.
    d1 = max(0,  lo)
    d2 = max(0, -lo)
    if direction == 0:
        rect(buf, bw, cx-8, cy+18+d1, 7, 5, W)
        rect(buf, bw, cx+1, cy+18+d2, 7, 5, W)
    elif direction == 1:
        rect(buf, bw, cx-9, cy+18+d1, 7, 5, W)
        rect(buf, bw, cx-2, cy+18+d2, 7, 5, W)
    elif direction == 2:
        rect(buf, bw, cx+2, cy+18+d1, 7, 5, W)
        rect(buf, bw, cx-5, cy+18+d2, 7, 5, W)
    elif direction == 3:
        rect(buf, bw, cx-8, cy+18+d1, 7, 5, W)
        rect(buf, bw, cx+1, cy+18+d2, 7, 5, W)

# ── Build sprite sheets ───────────────────────────────────────────────────────

def build_sheet(draw_fn):
    """Build a 128×192 sheet calling draw_fn for each of the 16 frames."""
    W_px = FW * COLS
    H_px = FH * ROWS
    buf = canvas(W_px, H_px)
    dirs = [0, 1, 2, 3]
    for row, direction in enumerate(dirs):
        for col in range(COLS):
            draw_fn(buf, W_px, col * FW, row * FH, direction, col)
    return buf, W_px, H_px


os.makedirs('assets/sprites', exist_ok=True)

layers = [
    ('player_body_male.png',   lambda b, bw, ox, oy, d, f: draw_body_male(b, bw, ox, oy, d, f)),
    ('player_body_female.png', lambda b, bw, ox, oy, d, f: draw_body_female(b, bw, ox, oy, d, f)),
    ('player_shirt.png',       draw_shirt),
    ('player_pants.png',       draw_pants),
    ('player_shoes.png',       draw_shoes),
]

for filename, fn in layers:
    buf, w, h = build_sheet(fn)
    path = f'assets/sprites/{filename}'
    write_png(path, [tuple(p) for p in buf], w, h)
    print(f'Wrote {path}  ({w}×{h})')

print('Done.')
