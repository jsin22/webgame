# NYC_GAME_MASTER_SPEC.md

## I. SYSTEM BUGS & GLOBAL WORLD LOGIC
-------------------------------------------------------------------------------
[x] BUG-001: GLOBAL SERVER CLOCK SYNC
    - Server maintains world_time {hour, minute, day}. Background thread ticks
      1 real second = 1 game minute. Broadcasts `world_tick` to all clients.
    - Start state: Thursday July 6th (day=4), 08:00.
    - On login/register, server includes world_time in response; client calls
      GameState.syncWorldTime() — overrides any saved per-player time.
    - GameState.applyWorldTick() replaces tickClock(): updates h/m/d from server
      and applies energy decay each tick.
    - Time display is 12-hour AM/PM mode.

[x] FEAT-001: DYNAMIC DAY/NIGHT CYCLE
    - nightOverlay: fullscreen dark-blue rectangle (depth 1.5, between tiles and
      player). Alpha 0.3 when hour >= 20 or hour < 7, else 0.
    - Updated on every world_tick and on login sync.

## II. THE VITALITY SYSTEM (HP & ENERGY)
-------------------------------------------------------------------------------
[x] FEAT-002: ENERGY DEPLETION ENGINE
    - Passive decay: 0.066E per game-minute via applyWorldTick().
      Fractional accumulator prevents integer drift.
    - Active decay: -2E per completed pizzeria shift (_runShift).
    - Critical state: SPEED halved (80 instead of 160) when E <= 10.
    - Faint at E=0: _triggerFaint() teleports player to home entrance,
      sets HP to 50%, loses 10% cash. Brief on-screen message shown.
    - While GameState._restingAtHome=true, decay is replaced by +0.25E/min
      recovery (15E/hr spec).

[x] FEAT-003: HEALTH MECHANICS
    - HP reduction only on Faint (set to 50% of maxHp).
    - Recovery via Pizzeria food: Slice +20HP, Half +45HP, Full +80HP
      (implemented in FEAT-05, already live).
    - At HP=0 from future features, player loses all cash (hook ready
      via GameState.addHp / hpChanged event).

## III. WORLD BUILDINGS & CORE LOOP
-------------------------------------------------------------------------------
[x] LOC-001: THE HOME (PLAYER RESIDENCE)
    - HOME tile added (GID 23, row 2 col 2 in city_tiles.png).
    - HOME_BLOCK = (0,1). Entrance: home_entrance object at col 5, row 19.
    - HomeScene: launched like PizzeriaScene (pauses GameScene).
      Shows current HP/Energy/Money, cosy flavour text, Leave button.
    - Energy recovery: +0.25E per world_tick while _restingAtHome=true.
    - Faint penalty does not apply while inside home.

## IV. SOCIAL INTERACTION
-------------------------------------------------------------------------------
[x] SOC-001: PROXIMITY CHAT "HANDSHAKE"
    - Click another player sprite → socket emit `chat_request` → target sees
      "[Name] wants to talk. [Accept] [Decline]" overlay (15s timeout).
    - On Accept: server routes `chat_started` to both parties; chat panel opens.
    - Messages via `chat_message` socket event (relayed through server, max 200
      chars). Sender also sees own message locally.
    - Social fatigue: every 10 messages sent reduces E by 1.
    - Chat close: clicking ✕ emits `chat_close` to notify partner.
    - Server events added: chat_request, chat_accept, chat_message, chat_close.
