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
ID: BUG-101
ISSUE:
STATUS: OPEN

[ COMPLETED / FIXED ]
--------------------------------------------------------------------------------
FEAT-01: Casino building tile now spells out "CASINO" in gold pixel text on a
         dark purple background with neon accent dots. Implemented via a 4x5
         pixel font (draw_text_px) added to generate_assets.py.

FEAT-01: Pizzeria building tile now spells out "PIZZA" in yellow pixel text on
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
