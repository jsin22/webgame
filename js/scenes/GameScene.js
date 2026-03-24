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
    // so the player can "overlap" visually with awning-like overhangs in future
    this.player.body.setSize(20, 24);
    this.player.body.setOffset(6, 22);

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
    // Merge arrow keys + WASD into a single set of logical keys
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
      this.scale.width - mSize - pad,  // x (right side)
      this.scale.height - mSize - pad, // y (bottom)
      mSize, mSize
    );
    this.minimapCam.setZoom(zoom);
    this.minimapCam.setBounds(0, 0, mapW, mapH);
    this.minimapCam.setBackgroundColor(0x050514);
    this.minimapCam.ignore(this.nameTag);

    // Player dot on minimap (use a small separate graphics object)
    this.minimapDot = this.add.graphics();
    this.minimapDot.setDepth(10);
    this.cameras.main.ignore(this.minimapDot);   // hide dot from main cam
    // minimapCam will show it automatically (it shows everything not ignored)

    // ── HUD DOM refs ─────────────────────────────────────────────────────────
    this.hpBar  = document.getElementById('hp-bar');
    this.hpVal  = document.getElementById('hp-val');
    this.charNameEl = document.getElementById('char-name');

    // Player data (expandable later)
    this.playerData = { name: 'Hero', hp: 100, maxHp: 100 };
    this._refreshHUD();
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  update() {
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
      // Prefer horizontal direction when both axes are pressed
      if      (vx < 0) { this.facing = 'left';  this.player.anims.play('walk-left',  true); }
      else if (vx > 0) { this.facing = 'right'; this.player.anims.play('walk-right', true); }
      else if (vy < 0) { this.facing = 'up';    this.player.anims.play('walk-up',    true); }
      else             { this.facing = 'down';  this.player.anims.play('walk-down',  true); }
    } else {
      this.player.anims.play(`idle-${this.facing}`, true);
    }

    // ── Name tag follows player ───────────────────────────────────────────────
    this.nameTag.setPosition(this.player.x, this.player.y - 28);

    // ── Minimap player dot ────────────────────────────────────────────────────
    this.minimapDot.clear();
    this.minimapDot.fillStyle(0xf0e060, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 12); // large — minimap zoom shrinks it
  }

  // ── Private helpers ─────────────────────────────────────────────────────────
  _refreshHUD() {
    const { hp, maxHp, name } = this.playerData;
    if (this.hpBar)  this.hpBar.style.width = (hp / maxHp * 100) + '%';
    if (this.hpVal)  this.hpVal.textContent  = `${hp}/${maxHp}`;
    if (this.charNameEl) this.charNameEl.textContent = name;
  }
}
