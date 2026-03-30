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
         dark purple background with neon accent dots. Implemented via a 4×5
         pixel font (draw_text_px) added to generate_assets.py.

FEAT-01: Pizzeria building tile now spells out "PIZZA" in yellow pixel text on
         a brick-red background with cream accent dots. Added draw_pizzeria_tile
         (GID 22), PIZZERIA_BLOCK (1,2), and pizzeria_entrance object to
         generate_map.py. Regenerated city_tiles.png and city.json.

BUG-001: Shoes rendered above legs due to all layer sprites sharing depth=2
         (creation order puts shoes on top). Fixed by assigning fractional
         depths: body(2.0) → shoes(2.1) → shirt(2.2) → pants(2.3), so pants
         always render on top at the ankle overlap region.

================================================================================
NOTES FOR CLAUDE:
- Always check the "ACTIVE TASKS" list before starting a new session.
- When a bug is fixed, move it to the "COMPLETED" section.
- Use the IDs (e.g., BUG-001) when explaining your code changes.
================================================================================
