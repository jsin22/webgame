================================================================================
CITY-RPG: STATUS & BUG TRACKER
================================================================================

[ ACTIVE TASKS ]
--------------------------------------------------------------------------------
(none)

[ CURRENT BUGS: HIGH PRIORITY ]
--------------------------------------------------------------------------------
ID: BUG-002
ISSUE:
STEPS:
STATUS: OPEN

[ CURRENT BUGS: LOW PRIORITY / POLISH ]
--------------------------------------------------------------------------------
(none)

[ COMPLETED / FIXED ]
--------------------------------------------------------------------------------
FEAT-04: Added mouth (pinkish 4px rect on front view, 1px on profiles) to all
         face-visible directions. Shrunk ear rects from 2×4 to 2×3. Added spiky
         male hair: 4 alternating dark pixels 1 row above the hair rect in all
         directions (skipped for female). Also updated CharacterCreator preview.

FEAT-03: Added ears (2×4 skin rect outside head circle), nose (2-px dark dot
         below eyes), and pupils to all sprite directions in _draw_body. Shifted
         hair rects/circles 1px higher (cy-23 / cy-20). Also added ears and nose
         to CharacterCreator preview canvas.

BUG-101: Shoe color bled onto top of player head.
         Root cause: lo=[0,3,0,-3] caused shoe rects to reach oy+49 (1-2px
         outside the 48px frame boundary), bleeding into the adjacent sprite
         sheet row at y=48-49 — which maps to the very top of those frames
         (above the character's head).
         Fix: capped animation to lo=[0,1,0,-1] so shoe bottom reaches at most
         oy+47 — exactly within frame bounds.

FEAT-01: Casino building tile now spells out "CASINO" in gold pixel text on a
         dark purple background with neon accent dots. Implemented via a 4x5
         pixel font (draw_text_px) added to generate_assets.py.

FEAT-02: Pizzeria building tile now spells out "PIZZA" in yellow pixel text on
         a brick-red background with cream accent dots. Added draw_pizzeria_tile
         (GID 22), PIZZERIA_BLOCK (1,2), and pizzeria_entrance object to
         generate_map.py. Regenerated city_tiles.png and city.json.

BUG-001: Shoe color bled into the pants region during walking animation.
         Root cause: shoes used lo=[0,3,0,-3] offsets, causing one shoe to
         move UP to cy+13 — 4px inside the pants region (cy+8-cy+17). The
         depth-sort fix (pants 2.3 > shoes 2.1) was not reliable at runtime.
         Fix: changed shoe base from cy+16 to cy+18 (one pixel below pants
         bottom) and made animation downward-only using max(0,lo)/max(0,-lo),
         so shoes can never enter the pants region regardless of frame.
         Regenerated player_shoes.png.

================================================================================
NOTES FOR CLAUDE:
- Always check the "ACTIVE TASKS" list before starting a new session.
- When a bug is fixed, move it to the "COMPLETED" section.
- Use the IDs (e.g., BUG-001) when explaining your code changes.
================================================================================
