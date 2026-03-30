================================================================================
CITY-RPG: STATUS & BUG TRACKER
================================================================================

[ ACTIVE TASKS ]
--------------------------------------------------------------------------------
(none)

[ CURRENT BUGS: HIGH PRIORITY ]
--------------------------------------------------------------------------------
(none)

[ CURRENT BUGS: LOW PRIORITY / POLISH ]
--------------------------------------------------------------------------------
(none)


[ COMPLETED / FIXED ]
--------------------------------------------------------------------------------
FEAT-05: Added pizza ordering to the pizzeria. PizzeriaScene now opens a lobby
         screen with two choices — "ORDER FOOD" or "WORK A SHIFT". The food menu
         offers Slice ($8, +20 HP), Half Pizza ($15, +45 HP +15 Energy), and Full
         Pizza ($25, +80 HP +35 Energy). HP/Energy are capped at max, state is
         auto-saved after each purchase. The work flow is unchanged (supply →
         price → shift). Also fixed GameState.hp never reflecting in the HUD by
         migrating _refreshHUD to read GameState.hp/maxHp and adding addHp() /
         addEnergy() helpers that emit hpChanged / energyChanged events.

BUG-004: Two blackjack issues, same root cause: _makeBtn returned only the bg
         rectangle, leaving the text label as an orphan object never stored or
         hidden. So setVisible(false) hid the bg but left the text visible, causing
         "PLAY AGAIN" to overlay the DEAL button at scene start (jumbled look)
         and to remain after _reset() (making it seem like clicking did nothing).
         Fix: store txt reference in _makeBtn and return a proxy object with
         setVisible(v) that syncs both bg and txt. All existing callers work
         unchanged since they only call setVisible() on the returned handle.

BUG-003: Removed spiky male hair (deleted the alternating-pixel spike loops in
         all 4 directions). Moved eyes, nose, and mouth 2px higher (cy-16/cy-12/
         cy-9 instead of cy-14/cy-10/cy-7) in both sprites and CharacterCreator
         preview. Creator preview and in-game sprites now match.

BUG-002: "PLAY AGAIN" button text was jumbled — _makeBtn used label.length*10+20
         for button width, which was too narrow for 13px Courier New with stroke.
         Fixed by using label.length*13+24 and adding fixedWidth+align:'center'
         to the text style to prevent overflow/wrapping.

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
