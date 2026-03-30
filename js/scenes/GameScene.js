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

    this.playerBody  = this.add.sprite(spawnX, spawnY, 'player_body_male', 0).setDepth(2);
    this.playerShirt = this.add.sprite(spawnX, spawnY, 'player_shirt',     0).setDepth(2).setTint(0x2855d4);
    this.playerPants = this.add.sprite(spawnX, spawnY, 'player_pants',     0).setDepth(2).setTint(0x1a1a1a);
    this.playerShoes = this.add.sprite(spawnX, spawnY, 'player_shoes',     0).setDepth(2).setTint(0x6a3010);

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

    // Prevent arrow keys from scrolling the browser page
    this.input.keyboard.on('keydown', e => {
      const blocked = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '];
      if (blocked.includes(e.key)) e.preventDefault();
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

    this.game.events.on('timeChanged', () => this._refreshTime(), this);

    // ── Multiplayer: wait for login_success ───────────────────────────────────
    // The login overlay emits this event after a successful socket handshake.
    this._otherPlayers = new Map();   // username → {sprite, nameTag, lastUpdate, facing}
    this._lastEmitMs   = 0;

    this.game.events.on('multiplayerLogin', data => this._initMultiplayer(data), this);

    // Player data (expandable later)
    this.playerData = { name: 'Hero', hp: 100, maxHp: 100 };
    this._refreshHUD();
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  update(time, delta) {
    // ── Clock tick ────────────────────────────────────────────────────────────
    GameState.tickClock(delta);

    const SPEED = 160;
    const k     = this.inputKeys;

    const goLeft  = k.left.isDown  || k.a.isDown;
    const goRight = k.right.isDown || k.d.isDown;
    const goUp    = k.up.isDown    || k.w.isDown;
    const goDown  = k.down.isDown  || k.s.isDown;

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

      // Switch other players to idle when they haven't moved recently
      this._otherPlayers.forEach(p => {
        if (Date.now() - p.lastUpdate > 150) {
          p.sprite.anims.play(`idle-${p.facing}`, true);
        }
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
    this._refreshHUD();

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
  }

  _addOtherPlayer(username, data) {
    if (this._otherPlayers.has(username)) return;

    const sprite = this.add.sprite(data.x, data.y, 'player', 0);
    sprite.setDepth(2).setTint(0xaaddff);  // blue tint distinguishes remote players
    sprite.anims.play(`idle-${data.facing || 'down'}`, true);

    const nameTag = this.add.text(data.x, data.y - 28, username, {
      fontFamily: 'Courier New', fontSize: '10px',
      color: '#88ccff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(3);

    // Hide name tags from the minimap
    this.minimapCam.ignore(nameTag);

    this._otherPlayers.set(username, {
      sprite, nameTag,
      facing: data.facing || 'down',
      lastUpdate: Date.now(),
    });
  }

  _moveOtherPlayer(username, x, y, facing) {
    const p = this._otherPlayers.get(username);
    if (!p) { this._addOtherPlayer(username, { x, y, facing }); return; }

    p.sprite.setPosition(x, y);
    p.nameTag.setPosition(x, y - 28);
    p.facing     = facing;
    p.lastUpdate = Date.now();
    p.sprite.anims.play(`walk-${facing}`, true);
  }

  _removeOtherPlayer(username) {
    const p = this._otherPlayers.get(username);
    if (!p) return;
    p.sprite.destroy();
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
    const { hp, maxHp, name } = this.playerData;
    if (this.hpBar)      this.hpBar.style.width      = (hp / maxHp * 100) + '%';
    if (this.hpVal)      this.hpVal.textContent       = `${hp}/${maxHp}`;
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
    if (this.dayEl)  this.dayEl.textContent  = `${GameState.dayName}${GameState.isWeekend ? ' ★' : ''}`;
    if (this.rankEl) this.rankEl.textContent = GameState.rankName;
  }
}
