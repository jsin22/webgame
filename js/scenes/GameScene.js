/**
 * GameScene — main gameplay scene.
 *
 * Map layers (from city.json / Tiled):
 *   "ground"    — roads, sidewalks, parks, intersections  (no collision)
 *   "buildings" — building tiles                          (solid, collide)
 *   "objects"   — spawn point and future objects
 *
 * Player spritesheet rows (32×48 px per frame, 4 frames per row):
 *   Row 0  (frames  0-3)  walk down
 *   Row 1  (frames  4-7)  walk left
 *   Row 2  (frames  8-11) walk right
 *   Row 3  (frames 12-15) walk up
 */
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {

    // ── Tilemap ──────────────────────────────────────────────────────────────
    const map = this.make.tilemap({ key: 'city_map' });

    // First arg = tileset name in the Tiled JSON; second arg = preloaded image key
    const tileset = map.addTilesetImage('city_tiles', 'city_tiles');

    const groundLayer   = map.createLayer('ground',    tileset, 0, 0);
    const buildingLayer = map.createLayer('buildings', tileset, 0, 0);

    // All non-empty tiles in the buildings layer block movement
    buildingLayer.setCollisionByExclusion([-1]);

    // Depth: ground → buildings → player (→ UI on top via DOM)
    groundLayer.setDepth(0);
    buildingLayer.setDepth(1);

    // ── Player ───────────────────────────────────────────────────────────────
    const spawnObj = map.findObject('objects', o => o.name === 'spawn');
    const spawnX   = spawnObj ? spawnObj.x + spawnObj.width  / 2 : map.widthInPixels  / 2;
    const spawnY   = spawnObj ? spawnObj.y + spawnObj.height / 2 : map.heightInPixels / 2;

    // Expand physics world bounds to match the full map (default is canvas size)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player', 0);
    this.player.setDepth(2);
    this.player.setCollideWorldBounds(true);

    // Shrink the physics body to the character's lower half (feet area)
    this.player.body.setSize(20, 24);
    this.player.body.setOffset(6, 22);

    // ── Visual player layers (body + clothing) ──────────────────────────────
    // Physics sprite drives movement/animation logic; these visual sprites
    // mirror its frame each update so clothing can be tinted independently.
    this.player.setAlpha(0);   // invisible — visual layers take over

    // Depth order matters at the pants/shoe overlap: shoes(2.1) render below pants(2.3)
    // so the bottom of the pants always covers the top edge of the shoes.
    this.playerBody  = this.add.sprite(spawnX, spawnY, 'player_body_male', 0).setDepth(2.0);
    this.playerShirt = this.add.sprite(spawnX, spawnY, 'player_shirt',     0).setDepth(2.2).setTint(0x2855d4);
    this.playerShoes = this.add.sprite(spawnX, spawnY, 'player_shoes',     0).setDepth(2.1).setTint(0x6a3010);
    this.playerPants = this.add.sprite(spawnX, spawnY, 'player_pants',     0).setDepth(2.3).setTint(0x1a1a1a);

    // ── Animations ───────────────────────────────────────────────────────────
    const anims = this.anims;

    anims.create({ key: 'walk-down',  frames: anims.generateFrameNumbers('player', { start:  0, end:  3 }), frameRate: 8, repeat: -1 });
    anims.create({ key: 'walk-left',  frames: anims.generateFrameNumbers('player', { start:  4, end:  7 }), frameRate: 8, repeat: -1 });
    anims.create({ key: 'walk-right', frames: anims.generateFrameNumbers('player', { start:  8, end: 11 }), frameRate: 8, repeat: -1 });
    anims.create({ key: 'walk-up',    frames: anims.generateFrameNumbers('player', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

    // Static idle frames (just the first frame of each walk direction)
    anims.create({ key: 'idle-down',  frames: [{ key: 'player', frame:  0 }], frameRate: 1 });
    anims.create({ key: 'idle-left',  frames: [{ key: 'player', frame:  4 }], frameRate: 1 });
    anims.create({ key: 'idle-right', frames: [{ key: 'player', frame:  8 }], frameRate: 1 });
    anims.create({ key: 'idle-up',    frames: [{ key: 'player', frame: 12 }], frameRate: 1 });

    this.facing = 'down'; // tracks last direction for idle frame
    this.player.anims.play('idle-down');

    // ── Player name tag (Phaser text object, follows player) ─────────────────
    this.nameTag = this.add.text(0, 0, 'Hero', {
      fontFamily: 'Courier New',
      fontSize:   '10px',
      color:      '#e8d090',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(3);

    // ── Collider ─────────────────────────────────────────────────────────────
    this.physics.add.collider(this.player, buildingLayer);

    // ── Camera ───────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);

    // ── Input ─────────────────────────────────────────────────────────────────
    this.inputKeys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      a:     Phaser.Input.Keyboard.KeyCodes.A,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Prevent arrow keys / space from scrolling the browser page,
    // but only when no text input is focused.
    this.input.keyboard.on('keydown', e => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const blocked = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '];
      if (blocked.includes(e.key)) e.preventDefault();
    });

    // Disable Phaser keyboard input while any DOM text input is focused
    this.input.keyboard.enableGlobalCapture();
    document.addEventListener('focusin',  e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        this.input.keyboard.disableGlobalCapture();
      }
    });
    document.addEventListener('focusout', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        this.input.keyboard.enableGlobalCapture();
      }
    });

    // ── Minimap (second camera) ───────────────────────────────────────────────
    const mSize = 120;
    const pad   = 12;
    const mapW  = map.widthInPixels;
    const mapH  = map.heightInPixels;
    const zoom  = mSize / Math.max(mapW, mapH);

    this.minimapCam = this.cameras.add(
      this.scale.width - mSize - pad,
      this.scale.height - mSize - pad,
      mSize, mSize
    );
    this.minimapCam.setZoom(zoom);
    this.minimapCam.setBounds(0, 0, mapW, mapH);
    this.minimapCam.setBackgroundColor(0x050514);
    this.minimapCam.ignore(this.nameTag);

    // Player dot on minimap
    this.minimapDot = this.add.graphics();
    this.minimapDot.setDepth(10);
    this.cameras.main.ignore(this.minimapDot);

    // ── Casino entrance ──────────────────────────────────────────────────────
    const casinoObj = map.findObject('objects', o => o.name === 'casino_entrance');
    if (casinoObj) {
      this.casinoEntrancePos = {
        x: casinoObj.x + casinoObj.width  / 2,
        y: casinoObj.y + casinoObj.height / 2,
      };
    }
    this.casinoActive = false;

    this.casinoPrompt = this.add.text(0, 0, 'Press E to enter Casino', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000066', padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 1).setDepth(5).setVisible(false);

    this.inputKeys.e = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.game.events.on('casinoExit', () => {
      this.casinoActive = false;
      document.getElementById('hud').style.display = '';
      if (this.player) this.player.y += 96;
    }, this);

    // ── Pizzeria entrance ─────────────────────────────────────────────────────
    const pizzeriaObj = map.findObject('objects', o => o.name === 'pizzeria_entrance');
    if (pizzeriaObj) {
      this.pizzeriaEntrancePos = {
        x: pizzeriaObj.x + pizzeriaObj.width  / 2,
        y: pizzeriaObj.y + pizzeriaObj.height / 2,
      };
    }
    this.pizzeriaActive = false;

    this.pizzeriaPrompt = this.add.text(0, 0, 'Press E to enter Pizzeria', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#ff9900',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000066', padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 1).setDepth(5).setVisible(false);

    this.game.events.on('pizzeriaExit', () => {
      this.pizzeriaActive = false;
      document.getElementById('hud').style.display = '';
      if (this.player) this.player.y += 80;
      this._refreshHUD();
    }, this);

    // Refresh HUD whenever this scene resumes (e.g. returning from casino)
    this.events.on('resume', () => this._refreshHUD(), this);

    // ── HUD DOM refs ─────────────────────────────────────────────────────────
    this.hpBar      = document.getElementById('hp-bar');
    this.hpVal      = document.getElementById('hp-val');
    this.charNameEl = document.getElementById('char-name');
    this.moneyEl    = document.getElementById('money-val');
    this.energyBar  = document.getElementById('energy-bar');
    this.energyVal  = document.getElementById('energy-val');
    this.timeEl     = document.getElementById('time-val');
    this.dayEl      = document.getElementById('day-val');
    this.rankEl     = document.getElementById('rank-val');

    // Keep HUD in sync with GameState events
    this.game.events.on('moneyChanged', v => {
      if (this.moneyEl) this.moneyEl.textContent = `$${v}`;
      SaveManager.save();
    }, this);

    this.game.events.on('hpChanged', () => {
      if (this.hpBar) this.hpBar.style.width = (GameState.hp / GameState.maxHp * 100) + '%';
      if (this.hpVal) this.hpVal.textContent = `${GameState.hp}/${GameState.maxHp}`;
    }, this);

    this.game.events.on('energyChanged', () => {
      if (this.energyBar) this.energyBar.style.width = (GameState.energy / GameState.maxEnergy * 100) + '%';
      if (this.energyVal) this.energyVal.textContent = `${GameState.energy}/${GameState.maxEnergy}`;
    }, this);

    this.game.events.on('timeChanged', () => this._refreshTime(), this);

    // ── Multiplayer: wait for login_success ───────────────────────────────────
    // The login overlay emits this event after a successful socket handshake.
    this._otherPlayers = new Map();   // username → {sprite, nameTag, lastUpdate, facing}
    this._lastEmitMs   = 0;

    this.game.events.on('multiplayerLogin', data => this._initMultiplayer(data), this);

    // ── Night overlay (FEAT-001) ──────────────────────────────────────────────
    // Fullscreen dark rectangle placed between tiles (depth 1.5) and player (2).
    this.nightOverlay = this.add.rectangle(
      map.widthInPixels / 2, map.heightInPixels / 2,
      map.widthInPixels, map.heightInPixels,
      0x000033, 0
    ).setDepth(1.5);
    this._updateDayNight();

    // ── Home entrance ─────────────────────────────────────────────────────────
    const homeObj = map.findObject('objects', o => o.name === 'home_entrance');
    if (homeObj) {
      this.homeEntrancePos = {
        x: homeObj.x + homeObj.width  / 2,
        y: homeObj.y + homeObj.height / 2,
      };
    }
    this.homeActive = false;

    this.homePrompt = this.add.text(0, 0, 'Press E to enter Home', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#a0d0ff',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000066', padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 1).setDepth(5).setVisible(false);

    this.game.events.on('homeExit', () => {
      this.homeActive = false;
      GameState._restingAtHome = false;
      document.getElementById('hud').style.display = '';
      if (this.player) this.player.y += 80;
      this._refreshHUD();
    }, this);

    // ── World clock (BUG-001) ─────────────────────────────────────────────────
    // Time is now server-authoritative. world_tick fires every real second.
    if (window.socket) {
      window.socket.on('world_tick', tick => {
        GameState.applyWorldTick(tick);
        this._updateDayNight();
        // Check faint (only outside home — faint penalties don't apply while resting)
        if (GameState.energy <= 0 && !this.homeActive) this._triggerFaint();
        // Periodic autosave every 60 ticks (~1 real minute) to persist energy/HP
        this._saveTickCounter = (this._saveTickCounter || 0) + 1;
        if (this._saveTickCounter >= 60) {
          this._saveTickCounter = 0;
          SaveManager.save();
        }
      });
    }

    // Player data (expandable later)
    this.playerData = { name: 'Hero', hp: 100, maxHp: 100 };
    this._refreshHUD();
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  update(time, delta) {
    // Time is now driven by server world_tick — no local tick needed.
    // Speed is halved when energy is critically low (≤10).
    const SPEED = GameState.energy <= 10 ? 80 : 160;
    const k     = this.inputKeys;

    // Don't read game keys while a DOM text input has focus
    const _ae = document.activeElement;
    const inputFocused = _ae && (_ae.tagName === 'INPUT' || _ae.tagName === 'TEXTAREA');

    const goLeft  = !inputFocused && (k.left.isDown  || k.a.isDown);
    const goRight = !inputFocused && (k.right.isDown || k.d.isDown);
    const goUp    = !inputFocused && (k.up.isDown    || k.w.isDown);
    const goDown  = !inputFocused && (k.down.isDown  || k.s.isDown);

    let vx = 0, vy = 0;
    if (goLeft)  vx -= SPEED;
    if (goRight) vx += SPEED;
    if (goUp)    vy -= SPEED;
    if (goDown)  vy += SPEED;

    // Normalise diagonal
    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }

    this.player.setVelocity(vx, vy);

    // ── Animation ────────────────────────────────────────────────────────────
    const moving = vx !== 0 || vy !== 0;

    if (moving) {
      if      (vx < 0) { this.facing = 'left';  this.player.anims.play('walk-left',  true); }
      else if (vx > 0) { this.facing = 'right'; this.player.anims.play('walk-right', true); }
      else if (vy < 0) { this.facing = 'up';    this.player.anims.play('walk-up',    true); }
      else             { this.facing = 'down';  this.player.anims.play('walk-down',  true); }
    } else {
      this.player.anims.play(`idle-${this.facing}`, true);
    }

    // ── Sync visual layers with physics sprite ────────────────────────────────
    const fi = this.player.frame.name;
    const px = this.player.x, py = this.player.y;
    this.playerBody.setFrame(fi).setPosition(px, py);
    this.playerShirt.setFrame(fi).setPosition(px, py);
    this.playerPants.setFrame(fi).setPosition(px, py);
    this.playerShoes.setFrame(fi).setPosition(px, py);

    // ── Name tag follows player ───────────────────────────────────────────────
    this.nameTag.setPosition(this.player.x, this.player.y - 28);

    // ── Minimap player dot ────────────────────────────────────────────────────
    this.minimapDot.clear();
    this.minimapDot.fillStyle(0xf0e060, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 12);

    // ── Casino entrance proximity ─────────────────────────────────────────────
    if (this.casinoEntrancePos && !this.casinoActive) {
      const dx   = this.player.x - this.casinoEntrancePos.x;
      const dy   = this.player.y - this.casinoEntrancePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const near = dist < 80;

      this.casinoPrompt
        .setVisible(near)
        .setPosition(this.player.x, this.player.y - 44);

      if (near && Phaser.Input.Keyboard.JustDown(this.inputKeys.e)) {
        this._enterCasino();
      }
    }

    // ── Pizzeria entrance proximity ───────────────────────────────────────────
    if (this.pizzeriaEntrancePos && !this.pizzeriaActive && !this.casinoActive) {
      const dx   = this.player.x - this.pizzeriaEntrancePos.x;
      const dy   = this.player.y - this.pizzeriaEntrancePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const near = dist < 80;

      this.pizzeriaPrompt
        .setVisible(near)
        .setPosition(this.player.x, this.player.y - 44);

      if (near && Phaser.Input.Keyboard.JustDown(this.inputKeys.e)) {
        this._enterPizzeria();
      }
    }

    // ── Home entrance proximity ───────────────────────────────────────────────
    if (this.homeEntrancePos && !this.homeActive && !this.casinoActive && !this.pizzeriaActive) {
      const dx   = this.player.x - this.homeEntrancePos.x;
      const dy   = this.player.y - this.homeEntrancePos.y;
      const near = Math.sqrt(dx * dx + dy * dy) < 80;

      this.homePrompt
        .setVisible(near)
        .setPosition(this.player.x, this.player.y - 44);

      if (near && Phaser.Input.Keyboard.JustDown(this.inputKeys.e)) {
        this._enterHome();
      }
    }

    // ── Multiplayer: emit position + animate other players ────────────────────
    if (window.socket) {
      const now = Date.now();
      if (now - this._lastEmitMs >= 100) {  // ~10 Hz
        this._lastEmitMs = now;
        window.socket.emit('move', {
          x:      Math.round(this.player.x),
          y:      Math.round(this.player.y),
          facing: this.facing,
        });
      }

      // Sync remote player visual layers to their driver animation each frame
      this._otherPlayers.forEach(p => {
        if (Date.now() - p.lastUpdate > 150) {
          p.driver.anims.play(`idle-${p.facing}`, true);
        }
        const fi = p.driver.frame.name;
        p.body.setFrame(fi);
        p.shirt.setFrame(fi);
        p.pants.setFrame(fi);
        p.shoes.setFrame(fi);
      });
    }
  }

  // ── Multiplayer helpers ─────────────────────────────────────────────────────

  /**
   * Called once after the login overlay receives login_success from the server.
   * Repositions the local player to their saved coordinates, restores money,
   * and wires up socket events for other players.
   */
  _initMultiplayer(data) {
    const { username, player, others } = data;

    // Restore saved position and all game state from server
    this.player.setPosition(player.x, player.y);
    this.nameTag.setText(username);
    this.playerData.name = username;
    if (this.charNameEl) this.charNameEl.textContent = username;

    SaveManager.loadFromServer(player);
    this._applyCharacterLayers(player);
    // Sync world time from server (overrides any saved per-player time)
    if (data.world_time) GameState.syncWorldTime(data.world_time);
    this._updateDayNight();
    this._refreshHUD();

    this._chatHistory = {};  // partnerUsername → [{from, text}, ...]

    // Render players already online
    Object.entries(others || {}).forEach(([uname, pdata]) => {
      this._addOtherPlayer(uname, pdata);
    });

    // Wire up ongoing socket events
    const socket = window.socket;

    socket.on('player_joined', ({ username: uname, player: pdata }) => {
      this._addOtherPlayer(uname, pdata);
    });

    socket.on('player_moved', ({ username: uname, x, y, facing }) => {
      this._moveOtherPlayer(uname, x, y, facing);
    });

    socket.on('player_left', ({ username: uname }) => {
      this._removeOtherPlayer(uname);
    });

    // ── SOC-001: Proximity chat ───────────────────────────────────────────────
    socket.on('chat_incoming', ({ from }) => {
      this._showChatRequest(from);
    });
    socket.on('chat_started', ({ with: partner }) => {
      this._openChat(partner);
    });
    socket.on('chat_message', ({ from, text }) => {
      this._appendChatMessage(from, text);
    });
    socket.on('chat_closed', () => {
      this._closeChat(true);
    });
  }

  _addOtherPlayer(username, data) {
    if (this._otherPlayers.has(username)) return;

    const x = data.x || 0, y = data.y || 0;
    const facing = data.facing || 'down';
    const t = hex => parseInt((hex || '#ffffff').replace('#', ''), 16);
    const colors = data.colors || {};
    const bodyKey = data.gender === 'female' ? 'player_body_female' : 'player_body_male';

    // Invisible driver sprite — owns the animation state
    const driver = this.add.sprite(x, y, 'player', 0).setAlpha(0);
    driver.anims.play(`idle-${facing}`, true);

    // Visual layers (same depth order as local player)
    const body  = this.add.sprite(x, y, bodyKey,        0).setDepth(2.0);
    const shirt = this.add.sprite(x, y, 'player_shirt', 0).setDepth(2.2).setTint(t(colors.shirt || '#2855d4'));
    const shoes = this.add.sprite(x, y, 'player_shoes', 0).setDepth(2.1).setTint(t(colors.shoes || '#6a3010'));
    const pants = this.add.sprite(x, y, 'player_pants', 0).setDepth(2.3).setTint(t(colors.pants || '#1a1a1a'));

    // Clickable hit area on the body sprite for chat requests
    body.setInteractive({ useHandCursor: true });
    body.on('pointerup', () => {
      if (!this._chatOpen) this._sendChatRequest(username);
    });

    const displayName = data.username || username;
    const nameTag = this.add.text(x, y - 28, displayName, {
      fontFamily: 'Courier New', fontSize: '10px',
      color: '#88ccff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(3);

    this.minimapCam.ignore([driver, body, shirt, shoes, pants, nameTag]);

    this._otherPlayers.set(username, {
      driver, body, shirt, shoes, pants, nameTag,
      facing,
      lastUpdate: Date.now(),
    });
  }

  // ── SOC-001 Chat helpers ──────────────────────────────────────────────────

  _sendChatRequest(toUsername) {
    window.socket.emit('chat_request', { to: toUsername });
    const note = document.createElement('div');
    note.id = 'chat-request-sent';
    note.textContent = `Chat request sent to ${toUsername}…`;
    Object.assign(note.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      background: '#111a', color: '#ffd700',
      fontFamily: 'Courier New', fontSize: '14px',
      padding: '12px 20px', borderRadius: '6px',
      border: '1px solid #ffd70088', zIndex: 1000,
    });
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 2500);
  }

  _showChatRequest(fromUsername) {
    const el = document.createElement('div');
    el.id = 'chat-incoming';
    el.innerHTML = `<b>${fromUsername}</b> wants to talk.
      <button id="chat-accept">Accept</button>
      <button id="chat-decline">Decline</button>`;
    Object.assign(el.style, {
      position: 'fixed', top: '40%', left: '50%',
      transform: 'translate(-50%,-50%)',
      background: '#112', color: '#cce', padding: '16px 24px',
      fontFamily: 'Courier New', fontSize: '14px',
      border: '2px solid #5566aa', borderRadius: '8px', zIndex: 1010,
      textAlign: 'center',
    });
    document.body.appendChild(el);

    document.getElementById('chat-accept').onclick = () => {
      el.remove();
      window.socket.emit('chat_accept', { with: fromUsername });
      // chat_started will fire for both parties
    };
    document.getElementById('chat-decline').onclick = () => el.remove();
    setTimeout(() => { if (el.parentNode) el.remove(); }, 15000);
  }

  _openChat(partnerUsername) {
    if (this._chatOpen) return;
    this._chatOpen    = true;
    this._chatPartner = partnerUsername;
    this._chatMsgCount = 0;

    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.innerHTML = `
      <div id="chat-title">💬 ${partnerUsername}</div>
      <div id="chat-log"></div>
      <div id="chat-input-row">
        <input id="chat-input" type="text" maxlength="200" placeholder="Type a message…"/>
        <button id="chat-send">Send</button>
        <button id="chat-x">✕</button>
      </div>`;
    Object.assign(panel.style, {
      position: 'fixed', bottom: '80px', right: '20px',
      width: '300px', background: '#0d0d20',
      border: '2px solid #3a3a6a', borderRadius: '8px',
      fontFamily: 'Courier New', fontSize: '13px',
      color: '#ccc', zIndex: 1020, display: 'flex', flexDirection: 'column',
    });
    document.body.appendChild(panel);

    // Restore previous messages with this partner
    const history = this._chatHistory[partnerUsername] || [];
    history.forEach(m => this._appendChatMessage(m.from, m.text, true));

    const sendMsg = () => {
      const inp = document.getElementById('chat-input');
      const txt = inp.value.trim();
      if (!txt) return;
      inp.value = '';
      window.socket.emit('chat_message', { to: partnerUsername, text: txt });
      this._appendChatMessage('You', txt);
      // Social fatigue: -1E per 10 messages sent
      this._chatMsgCount++;
      if (this._chatMsgCount % 10 === 0) GameState.addEnergy(-1);
    };

    document.getElementById('chat-send').onclick = sendMsg;
    document.getElementById('chat-input').onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); sendMsg(); }
    };
    document.getElementById('chat-x').onclick = () => this._closeChat(false);
  }

  _appendChatMessage(from, text, fromHistory = false) {
    if (!fromHistory && this._chatPartner) {
      if (!this._chatHistory[this._chatPartner]) this._chatHistory[this._chatPartner] = [];
      this._chatHistory[this._chatPartner].push({ from, text });
    }
    const log = document.getElementById('chat-log');
    if (!log) return;
    const line = document.createElement('div');
    line.innerHTML = `<span style="color:#88ccff">${from}:</span> ${text}`;
    line.style.padding = '2px 0';
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  _closeChat(remote) {
    if (!this._chatOpen) return;
    if (!remote && this._chatPartner && window.socket) {
      window.socket.emit('chat_close', { to: this._chatPartner });
    }
    this._chatOpen    = false;
    this._chatPartner = null;
    const panel = document.getElementById('chat-panel');
    if (panel) panel.remove();
  }

  _moveOtherPlayer(username, x, y, facing) {
    const p = this._otherPlayers.get(username);
    if (!p) { this._addOtherPlayer(username, { x, y, facing }); return; }

    p.driver.setPosition(x, y).anims.play(`walk-${facing}`, true);
    p.body.setPosition(x, y);
    p.shirt.setPosition(x, y);
    p.shoes.setPosition(x, y);
    p.pants.setPosition(x, y);
    p.nameTag.setPosition(x, y - 28);
    p.facing     = facing;
    p.lastUpdate = Date.now();
  }

  _removeOtherPlayer(username) {
    const p = this._otherPlayers.get(username);
    if (!p) return;
    p.driver.destroy();
    p.body.destroy();
    p.shirt.destroy();
    p.shoes.destroy();
    p.pants.destroy();
    p.nameTag.destroy();
    this._otherPlayers.delete(username);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _applyCharacterLayers(cd) {
    const bodyKey = cd.gender === 'female' ? 'player_body_female' : 'player_body_male';
    this.playerBody.setTexture(bodyKey);
    if (cd.colors) {
      const t = hex => parseInt(hex.replace('#', ''), 16);
      this.playerShirt.setTint(t(cd.colors.shirt));
      this.playerPants.setTint(t(cd.colors.pants));
      this.playerShoes.setTint(t(cd.colors.shoes));
    }
  }

  _enterHome() {
    this.homeActive = true;
    this.homePrompt.setVisible(false);
    this.player.setVelocity(0, 0);
    GameState._restingAtHome = true;
    document.getElementById('hud').style.display = 'none';
    this.scene.pause();
    this.scene.launch('HomeScene');
  }

  _triggerFaint() {
    // Prevent re-trigger while already at 0
    GameState.energy = 1;
    // Penalty: HP to 50%, lose 10% cash
    GameState.hp = Math.floor(GameState.maxHp * 0.5);
    const cashLost = Math.floor(GameState.money * 0.1);
    GameState.addMoney(-cashLost);
    GameState.addHp(0);   // emit hpChanged
    // Teleport to home entrance (or spawn if home not yet placed)
    const dest = this.homeEntrancePos || { x: 976, y: 976 };
    this.player.setPosition(dest.x, dest.y);
    // Show faint message briefly
    const msg = this.add.text(this.scale.width / 2, this.scale.height / 2,
      `You passed out!\n−$${cashLost} | HP → ${GameState.hp}`,
      { fontFamily: 'Courier New', fontSize: '18px', color: '#ff4444',
        stroke: '#000', strokeThickness: 3, align: 'center' }
    ).setOrigin(0.5).setDepth(20).setScrollFactor(0);
    this.time.delayedCall(2500, () => msg.destroy());
    SaveManager.save();
  }

  _updateDayNight() {
    if (!this.nightOverlay) return;
    const isNight = GameState.hour >= 20 || GameState.hour < 7;
    this.nightOverlay.setAlpha(isNight ? 0.3 : 0);
  }

  _enterPizzeria() {
    this.pizzeriaActive = true;
    this.pizzeriaPrompt.setVisible(false);
    this.player.setVelocity(0, 0);
    document.getElementById('hud').style.display = 'none';
    this.scene.pause();
    this.scene.launch('PizzeriaScene');
  }

  _enterCasino() {
    this.casinoActive = true;
    this.casinoPrompt.setVisible(false);
    this.player.setVelocity(0, 0);
    document.getElementById('hud').style.display = 'none';
    this.scene.pause();
    this.scene.launch('CasinoLobbyScene');
  }

  _refreshHUD() {
    const name = this.playerData ? this.playerData.name : 'Hero';
    if (this.hpBar)      this.hpBar.style.width      = (GameState.hp / GameState.maxHp * 100) + '%';
    if (this.hpVal)      this.hpVal.textContent       = `${GameState.hp}/${GameState.maxHp}`;
    if (this.charNameEl) this.charNameEl.textContent  = name;
    if (this.moneyEl)    this.moneyEl.textContent     = `$${GameState.money}`;

    if (this.energyBar) this.energyBar.style.width = (GameState.energy / GameState.maxEnergy * 100) + '%';
    if (this.energyVal) this.energyVal.textContent  = `${GameState.energy}/${GameState.maxEnergy}`;

    this._refreshTime();
  }

  _refreshTime() {
    if (!this.timeEl && !this.dayEl) return;
    const h   = GameState.hour;
    const m   = GameState.minute;
    const ap  = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    if (this.timeEl) this.timeEl.textContent = `${h12}:${String(m).padStart(2,'0')} ${ap}`;
    if (this.dayEl)  this.dayEl.textContent  = `${GameState.dayName}, ${GameState.dateStr}${GameState.isWeekend ? ' ★' : ''}`;
    if (this.rankEl) this.rankEl.textContent = GameState.rankName;
  }
}
