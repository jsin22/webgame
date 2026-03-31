/**
 * BasketballScene — "Buzzer Beater Gauntlet"
 *
 * Side-scrolling auto-runner. Navigate obstacles → enter Shot Zone →
 * execute Double-Apex meter shot → push back the Crush Wall.
 *
 * Controls:
 *   W / Up    — Jump  (clear LOW obstacles)
 *   Shift / D — Crossover dash (pass under HIGH obstacles)
 *   S / Down  — Spin move (30 frames i-frames, pass through DEFENDERS)
 *   Space     — Hold → lock Power, Release → lock Aim (in shot zone)
 *   ESC       — Leave
 */
class BasketballScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BasketballScene' });
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  create() {
    this.W = this.scale.width;   // 800
    this.H = this.scale.height;  // 560

    this.GROUND_Y      = this.H - 70;   // 490 — where player feet land
    this.PLAYER_SPEED  = 220;
    this.SECTION_LEN   = 1500;
    this.WORLD_W       = 500000;

    this.physics.world.gravity.y = 800;
    this.physics.world.setBounds(0, 0, this.WORLD_W, this.H);

    // ── State machine ────────────────────────────────────────────────────────
    this.ST_RUNNING = 'running';
    this.ST_LOCKED  = 'locked';
    this.ST_REBOUND = 'rebound';
    this.state      = this.ST_RUNNING;

    // ── Game vars ────────────────────────────────────────────────────────────
    this.hoopsScored       = 0;
    this.consecutiveGreens = 0;
    this.heatCheck         = false;
    this.wallScaleFactor   = 1.0;
    this.wallSpeed         = this.PLAYER_SPEED * 0.85;

    this._stunTimer      = 0;
    this._reboundTimer   = 0;
    this._spinFrames     = 0;
    this._crossover      = false;
    this._isOnGround     = false;

    this._meterPhase = 0;   // 0=off, 1=power, 2=aim
    this._meterTime  = 0;
    this._powerVal   = 0;
    this._aimVal     = 0;

    this._obstacles    = [];    // { x, type, hit }
    this._shotZones    = [];    // { x, hoopX, hoopY, triggered }
    this._activeHoop   = null;
    this._nextSectionX = 0;    // world-x where next section begins
    this._savedWallSpeed = 0;

    this._buildTextures();
    this._buildBackground();
    this._buildGround();
    this._buildPlayer();
    this._buildWall();
    this._buildHUD();
    this._buildMeterUI();
    this._setupInput();

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, this.WORLD_W, this.H);

    this._spawnSection(0);

    this.input.keyboard.once('keydown-ESC', () => this._exit());
  }

  // ── Textures ───────────────────────────────────────────────────────────────

  _buildTextures() {
    const make = (key, w, h, fn) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ add: false });
      fn(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    make('bball_px', 1, 1, g => { g.fillStyle(0xffffff); g.fillRect(0, 0, 1, 1); });

    make('bball_ball', 26, 26, g => {
      g.fillStyle(0xe86010);
      g.fillCircle(13, 13, 13);
      g.lineStyle(1.5, 0x992200);
      g.strokeCircle(13, 13, 13);
      g.lineBetween(13, 0, 13, 26);
      g.lineBetween(0, 13, 26, 13);
      g.beginPath(); g.arc(13, 13, 8, 0.2 * Math.PI, 0.8 * Math.PI); g.strokePath();
      g.beginPath(); g.arc(13, 13, 8, 1.2 * Math.PI, 1.8 * Math.PI); g.strokePath();
    });

    make('bball_fire', 26, 26, g => {
      g.fillStyle(0xff2200); g.fillCircle(13, 13, 13);
      g.lineStyle(2, 0xffff00); g.strokeCircle(13, 13, 13);
      g.lineStyle(2, 0xff8800);
      g.lineBetween(13, 0, 13, 26); g.lineBetween(0, 13, 26, 13);
    });

    make('bball_player', 24, 42, g => {
      g.fillStyle(0x4488ff); g.fillRect(4, 16, 16, 20);   // jersey
      g.fillStyle(0xf0c090); g.fillCircle(12, 10, 10);    // head
      g.fillStyle(0x2255cc); g.fillRect(4, 36, 7, 6);     // left shoe
      g.fillRect(13, 36, 7, 6);                            // right shoe
    });

    // Obstacle: LOW — bench/cooler on ground
    make('bball_low', 52, 34, g => {
      g.fillStyle(0x885522); g.fillRect(0, 0, 52, 34);
      g.lineStyle(2, 0xffaa55); g.strokeRect(1, 1, 50, 32);
      g.lineStyle(1, 0xffaa55);
      g.lineBetween(17, 0, 17, 34);
      g.lineBetween(34, 0, 34, 34);
    });

    // Obstacle: HIGH — scoreboard hanging from ceiling
    make('bball_high', 52, 60, g => {
      // Hang wire
      g.fillStyle(0x666666); g.fillRect(24, 0, 4, 14);
      // Board
      g.fillStyle(0x223355); g.fillRect(0, 14, 52, 46);
      g.lineStyle(2, 0x44aaff); g.strokeRect(1, 15, 50, 44);
      g.fillStyle(0xffff44); g.fillRect(6, 20, 40, 25);  // screen glow
    });

    // Obstacle: DEFENDER — opposing player
    make('bball_def', 24, 42, g => {
      g.fillStyle(0xff3333); g.fillRect(4, 16, 16, 20);
      g.fillStyle(0xf0c090); g.fillCircle(12, 10, 10);
      g.fillStyle(0xcc2222); g.fillRect(4, 36, 7, 6);
      g.fillRect(13, 36, 7, 6);
    });
  }

  // ── Background ─────────────────────────────────────────────────────────────

  _buildBackground() {
    const g = this.add.graphics();
    const W = this.WORLD_W;

    // Arena dark background
    g.fillStyle(0x0a0818); g.fillRect(0, 0, W, this.H);

    // Crowd area
    g.fillStyle(0x12102a); g.fillRect(0, 0, W, this.H * 0.38);
    g.lineStyle(2, 0x332266, 0.8);
    g.lineBetween(0, this.H * 0.38, W, this.H * 0.38);

    // Hardwood floor strips
    for (let y = this.GROUND_Y; y < this.H; y += 12) {
      g.fillStyle(y % 24 === 0 ? 0x3d2110 : 0x331b0d);
      g.fillRect(0, y, W, 12);
    }

    // Repeating court markings every 1500px
    for (let sx = 0; sx < W; sx += this.SECTION_LEN) {
      g.lineStyle(1.5, 0x6a4520, 0.4);
      g.strokeCircle(sx + 750, this.GROUND_Y - 100, 110);
      g.lineBetween(sx + 750 - 60, this.GROUND_Y, sx + 750 - 60, this.GROUND_Y - 10);
      g.lineBetween(sx + 750 + 60, this.GROUND_Y, sx + 750 + 60, this.GROUND_Y - 10);
    }
  }

  // ── Ground ─────────────────────────────────────────────────────────────────

  _buildGround() {
    this._ground = this.physics.add.staticImage(
      this.WORLD_W / 2, this.GROUND_Y + 10, 'bball_px'
    );
    this._ground.setDisplaySize(this.WORLD_W, 20).refreshBody().setAlpha(0);
  }

  // ── Player ─────────────────────────────────────────────────────────────────

  _buildPlayer() {
    const spawnY = this.GROUND_Y - 21;   // feet at GROUND_Y
    this.player = this.physics.add.image(160, spawnY, 'bball_player');
    this.player.setCollideWorldBounds(false).setDepth(5);
    this.player.body.setSize(18, 36).setOffset(3, 3);

    this.physics.add.collider(this.player, this._ground, () => {
      this._isOnGround = true;
    });

    this._ballSprite = this.add.image(0, 0, 'bball_ball').setDepth(6);
    this._shotSprite = this.add.image(0, 0, 'bball_ball').setDepth(6).setVisible(false);
  }

  // ── Crush Wall ─────────────────────────────────────────────────────────────

  _buildWall() {
    this._wall = this.add.rectangle(
      this.player.x - 480, this.H / 2, 28, this.H, 0xff1111
    ).setDepth(8);
    this._wallLines = this.add.graphics().setDepth(8);
    this._wallLabel = this.add.text(0, this.H / 2 - 50, 'CRUSH\nWALL', {
      fontFamily: 'Courier New', fontSize: '9px',
      color: '#ffcccc', align: 'center',
    }).setOrigin(0.5).setDepth(9);
  }

  _updateWall(dt) {
    this._wall.x += this.wallSpeed * dt;
    this._wallLabel.x = this._wall.x;
    this._wallLines.clear();
    // Animated "danger stripes" on wall
    const t = (Date.now() / 300) % 1;
    this._wallLines.lineStyle(2, 0xff6600, 0.7);
    for (let i = 0; i < 8; i++) {
      const yy = ((i + t) / 8) * this.H;
      this._wallLines.lineBetween(this._wall.x - 10, yy, this._wall.x + 10, yy - 20);
    }
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  _buildHUD() {
    const depth = 20;
    const sf    = 0; // setScrollFactor(0) = fixed to camera

    this.add.rectangle(this.W / 2, 22, this.W, 44, 0x0a0612, 0.88)
      .setScrollFactor(sf).setDepth(depth);

    this._scoreText = this.add.text(14, 22, 'Score: 0', {
      fontFamily: 'Courier New', fontSize: '16px', color: '#ffdd88',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setScrollFactor(sf).setDepth(depth);

    this._wallText = this.add.text(this.W / 2, 22, '', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#ff8888',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(depth);

    this._heatText = this.add.text(this.W - 100, 22, '', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ff6600',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(depth);

    this._msgText = this.add.text(this.W / 2, this.H / 2 - 80, '', {
      fontFamily: 'Courier New', fontSize: '28px', color: '#ffff55',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(25);

    const lb = this.add.rectangle(this.W - 46, 22, 72, 26, 0x110900)
      .setStrokeStyle(1, 0x6a4020).setInteractive({ useHandCursor: true })
      .setScrollFactor(sf).setDepth(depth);
    this.add.text(this.W - 46, 22, 'LEAVE', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#aa7744',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(depth + 1);
    lb.on('pointerup',   () => this._exit());
    lb.on('pointerover', () => lb.setFillStyle(0x221508));
    lb.on('pointerout',  () => lb.setFillStyle(0x110900));
  }

  // ── Double-Apex meter UI ───────────────────────────────────────────────────

  _buildMeterUI() {
    this._meter = this.add.container(this.W / 2, this.H / 2 + 20)
      .setScrollFactor(0).setDepth(30).setVisible(false);

    const bg = this.add.rectangle(0, 0, 280, 190, 0x000000, 0.82)
      .setStrokeStyle(2, 0x4488ff);

    this._meterTitle = this.add.text(0, -78, 'DOUBLE-APEX SHOT', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#aaddff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    // Power bar (vertical), center at (−60, 5), height 100
    const pwBg = this.add.rectangle(-60, 5, 22, 100, 0x1a1a1a).setStrokeStyle(1, 0x555555);
    // green target zone = top 10% of bar = top 10px
    this.add.rectangle(-60, -40, 20, 10, 0x00ff00, 0.25);   // target highlight
    this._powerFill = this.add.rectangle(-60, 55, 20, 0, 0x44ff44);  // bottom-anchored fill
    this._powerLabel = this.add.text(-60, -62, 'POWER', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#88ff88',
    }).setOrigin(0.5);

    // Aim bar (horizontal), center at (30, 55), width 100
    const aimBg = this.add.rectangle(30, 55, 100, 22, 0x1a1a1a).setStrokeStyle(1, 0x555555);
    // target zone = rightmost 10px
    this.add.rectangle(75, 55, 10, 20, 0x00ff00, 0.25);     // target highlight
    this._aimFill = this.add.rectangle(-20, 55, 0, 20, 0xffaa00);    // left-anchored fill
    this._aimLabel = this.add.text(30, 35, 'AIM', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#ffdd88',
    }).setOrigin(0.5);

    this._meterHint = this.add.text(0, 82, 'HOLD SPACE → lock POWER', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#888888',
    }).setOrigin(0.5);

    this._meter.add([bg, this._meterTitle,
      pwBg, this._powerFill, this._powerLabel,
      aimBg, this._aimFill, this._aimLabel,
      this._meterHint]);
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this._keys.space.on('down', () => {
      if (this.state !== this.ST_LOCKED || this._meterPhase !== 1) return;
      this._powerVal   = this._meterVal(this._meterTime);
      this._meterPhase = 2;
      this._meterTime  = 0;
      this._meterHint.setText('RELEASE SPACE → lock AIM');
    });

    this._keys.space.on('up', () => {
      if (this.state !== this.ST_LOCKED || this._meterPhase !== 2) return;
      this._aimVal = this._meterVal(this._meterTime);
      this._evaluateShot();
    });
  }

  // ── Section spawning ───────────────────────────────────────────────────────

  _spawnSection(startX) {
    const OBS_TYPES   = ['low', 'high', 'defender'];
    const OBS_OFFSETS = [350, 700, 1050];
    const HOOP_X      = startX + 1350;
    const ZONE_X      = HOOP_X - 130;

    for (let i = 0; i < 3; i++) {
      const type = OBS_TYPES[Phaser.Math.Between(0, 2)];
      this._spawnObstacle(startX + OBS_OFFSETS[i], type);
    }

    this._buildHoop(HOOP_X);

    this._shotZones.push({
      x: ZONE_X, w: 100,
      hoopX: HOOP_X,
      hoopY: this.GROUND_Y - 185,
      triggered: false,
    });

    this._nextSectionX = startX + this.SECTION_LEN;
  }

  _spawnObstacle(x, type) {
    if (type === 'low') {
      // Bench on ground — jump over
      const obs = this.add.image(x, this.GROUND_Y - 17, 'bball_low').setDepth(4);
      this._obstacles.push({ x, type: 'low', hit: false, img: obs });

    } else if (type === 'high') {
      // Scoreboard hanging from ceiling — crossover under
      // Hangs so its bottom is at GROUND_Y - 200, blocking standing height
      const hangY = this.H * 0.38 + 30;   // attaches to ceiling line
      const obs   = this.add.image(x, hangY, 'bball_high').setDepth(4);
      this._obstacles.push({ x, type: 'high', hit: false, img: obs });

    } else {
      // Defender — spin through; drifts slowly left toward player
      const obs = this.physics.add.image(x, this.GROUND_Y - 21, 'bball_def').setDepth(4);
      obs.body.allowGravity = false;
      obs.body.velocity.x   = -45;
      this._obstacles.push({ x, type: 'defender', hit: false, img: obs, moving: true });
    }
  }

  _buildHoop(x) {
    const g  = this.add.graphics().setDepth(4);
    const hy = this.GROUND_Y - 185;
    const lx = x - 24, rx = x + 24;

    // Support pole
    g.fillStyle(0x999977);
    g.fillRect(x + 28, hy - 30, 8, this.H - hy + 30);

    // Backboard
    g.fillStyle(0xe8e8d8);
    g.fillRect(x + 30, hy - 60, 8, 100);
    g.lineStyle(2, 0x888877); g.strokeRect(x + 30, hy - 60, 8, 100);
    g.lineStyle(2, 0xdd2222, 0.8); g.strokeRect(x + 30, hy - 20, 8, 45);

    // Rim connector
    g.fillStyle(0xff5500); g.fillRect(rx, hy + 4, x + 30 - rx, 5);

    // Rim
    g.lineStyle(5, 0xff5500); g.lineBetween(lx, hy + 4, rx, hy + 4);
    g.fillCircle(lx, hy + 4, 5); g.fillCircle(rx, hy + 4, 5);

    // Net
    g.lineStyle(1, 0xddddaa, 0.6);
    for (let i = 0; i <= 5; i++) {
      const nx = lx + (rx - lx) / 5 * i;
      g.lineBetween(nx, hy + 9, nx + (i - 2.5) * 2.5, hy + 42);
    }
    for (let j = 1; j <= 3; j++) {
      const ny = hy + 9 + 33 * j / 3;
      g.lineBetween(lx + j, ny, rx - j, ny);
    }

    // Shot zone floor indicator
    g.lineStyle(1, 0x334466, 0.5);
    g.strokeRect(x - 130, this.GROUND_Y - 3, 100, 5);
  }

  // ── Main update ────────────────────────────────────────────────────────────

  update(time, delta) {
    const dt = delta / 1000;

    this._isOnGround = this.player.body.blocked.down;

    // Carried ball follows player
    const ballKey = this.heatCheck ? 'bball_fire' : 'bball_ball';
    if (this._ballSprite.texture.key !== ballKey) this._ballSprite.setTexture(ballKey);
    this._ballSprite.setPosition(this.player.x + 14, this.player.y + 5);

    // Camera shake by wall proximity
    const dist = this.player.x - this._wall.x;
    if (dist < 300 && this.state === this.ST_RUNNING) {
      this.cameras.main.shake(40, Math.max(0, (300 - dist) / 300) * 0.005);
    }

    this._refreshHUD(dist);

    if (this.state === this.ST_RUNNING) this._runUpdate(dt);
    else if (this.state === this.ST_LOCKED)  this._lockUpdate(dt);
    else if (this.state === this.ST_REBOUND) this._reboundUpdate(dt);

    // Game over
    if (this.player.x <= this._wall.x + 16 && this.state !== 'gameover') {
      this._gameOver();
    }

    // Lazy-spawn next section
    if (this.player.x > this._nextSectionX - 700) {
      this._spawnSection(this._nextSectionX);
    }

    // Cull old obstacles (> 800px behind camera left)
    const cullX = this.cameras.main.scrollX - 800;
    this._obstacles = this._obstacles.filter(o => {
      const ox = o.moving ? o.img.x : o.x;
      if (ox < cullX) { o.img.destroy(); return false; }
      return true;
    });
  }

  // ── Running state ──────────────────────────────────────────────────────────

  _runUpdate(dt) {
    // Auto-move
    if (this._stunTimer > 0) {
      this._stunTimer -= dt;
      this.player.body.velocity.x = 0;
    } else {
      this.player.body.velocity.x = this._spinFrames > 0
        ? this.PLAYER_SPEED * 0.85
        : this.PLAYER_SPEED;
    }

    // Jump
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this._keys.up)
                     || Phaser.Input.Keyboard.JustDown(this._keys.w);
    if (jumpPressed && this._isOnGround) {
      this.player.body.velocity.y = -560;
    }

    // Spin (S / Down) — 30 frames of i-frames, flicker effect
    if (Phaser.Input.Keyboard.JustDown(this._keys.s) ||
        Phaser.Input.Keyboard.JustDown(this._keys.down)) {
      this._spinFrames = 30;
    }
    if (this._spinFrames > 0) {
      this._spinFrames--;
      this.player.setAlpha(0.35 + Math.sin(Date.now() / 40) * 0.35);
    } else if (!this._crossover) {
      this.player.setAlpha(1);
    }

    // Crossover (Shift / D) — visual squish, flag for high-obstacle bypass
    const crossHeld = this._keys.shift.isDown || this._keys.d.isDown;
    if (crossHeld && !this._crossover) {
      this._crossover = true;
      this.player.setScale(1, 0.55);
      this.player.setAlpha(0.7);
    } else if (!crossHeld && this._crossover) {
      this._crossover = false;
      this.player.setScale(1, 1);
      if (this._spinFrames === 0) this.player.setAlpha(1);
    }

    this._updateWall(dt);
    this._checkObstacles();
    this._checkShotZones();
  }

  // ── Locked state ───────────────────────────────────────────────────────────

  _lockUpdate(dt) {
    // Wall barely creeps during shot (slow-mo feel)
    this._wall.x += this.wallSpeed * 0.25 * dt;
    this._wallLabel.x = this._wall.x;

    if (this._meterPhase < 1 || this._meterPhase > 2) return;
    this._meterTime += dt;
    const val = this._meterVal(this._meterTime);

    if (this._meterPhase === 1) {
      // Vertical bar fills from bottom; bg center at (−60,5), height=100 → bottom at y=55
      const fillH = val * 100;
      this._powerFill.setSize(20, fillH).setY(55 - fillH / 2);
      this._powerFill.fillColor = val >= 0.9 ? 0x00ff00 : val >= 0.75 ? 0xffff00 : 0xff4444;
    } else {
      // Horizontal bar fills from left; bg center at (30,55), width=100 → left at x=−20
      const fillW = val * 100;
      this._aimFill.setSize(fillW, 20).setX(-20 + fillW / 2);
      this._aimFill.fillColor = val >= 0.9 ? 0x00ff00 : val >= 0.75 ? 0xffff00 : 0xff4444;
    }
  }

  // ── Rebound state ──────────────────────────────────────────────────────────

  _reboundUpdate(dt) {
    this._wall.x += this.wallSpeed * dt;
    this._wallLabel.x = this._wall.x;
    this._reboundTimer -= dt;
    if (this._reboundTimer <= 0) this._exitRebound();
  }

  // ── Obstacle detection ─────────────────────────────────────────────────────

  _checkObstacles() {
    const px = this.player.x;
    for (const obs of this._obstacles) {
      if (obs.hit) continue;
      const ox = obs.moving ? obs.img.x : obs.x;
      if (Math.abs(px - ox) > 28) continue;  // not at obstacle x yet

      obs.hit = true;

      const safe =
        (obs.type === 'low'      && !this._isOnGround)  ||
        (obs.type === 'high'     && this._crossover)     ||
        (obs.type === 'defender' && this._spinFrames > 0);

      if (!safe) this._stun(obs.type);
    }
  }

  _stun(obsType) {
    if (this._stunTimer > 0) return;
    this._stunTimer = 0.5;
    this.cameras.main.shake(280, 0.018);
    const hints = {
      low:      'STUMBLE! (use JUMP next time)',
      high:     'STUMBLE! (use CROSSOVER next time)',
      defender: 'STUMBLE! (use SPIN next time)',
    };
    this._showMsg(hints[obsType] || 'STUMBLE!', '#ff8844');
  }

  // ── Shot zone detection ────────────────────────────────────────────────────

  _checkShotZones() {
    for (const zone of this._shotZones) {
      if (zone.triggered) continue;
      if (this.player.x >= zone.x && this.player.x <= zone.x + zone.w) {
        zone.triggered = true;
        this._activeHoop = { x: zone.hoopX, y: zone.hoopY };
        this._enterLocked();
        return;
      }
    }
  }

  // ── Meter oscillation ──────────────────────────────────────────────────────

  _meterVal(t) {
    // Sine wave 0→1→0; frequency increases with each hoop scored
    const freq = 1.1 + this.hoopsScored * 0.12;
    return (Math.sin(t * freq * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  }

  // ── Shot flow ──────────────────────────────────────────────────────────────

  _enterLocked() {
    this.state = this.ST_LOCKED;
    this.player.body.velocity.x = 0;
    this.player.body.velocity.y = 0;
    this.player.body.allowGravity = false;

    this._meterPhase = 1;
    this._meterTime  = 0;
    this._meterHint.setText('HOLD SPACE → lock POWER');
    this._powerFill.setSize(20, 0);
    this._aimFill.setSize(0, 20);
    this._meter.setVisible(true);
  }

  _evaluateShot() {
    const p = this._powerVal, a = this._aimVal;
    const result = (p >= 0.9 && a >= 0.9) ? 'perfect'
                 : (p >= 0.75 && a >= 0.75) ? 'good'
                 : 'brick';

    this._meterPhase = 0;
    this._meter.setVisible(false);
    this._animateBall(result);
  }

  _animateBall(result) {
    const sx = this.player.x, sy = this.player.y;
    const hx = this._activeHoop.x;
    const hy = this._activeHoop.y;

    // Control point height driven by powerVal; landing x offset by aimVal
    const cpY = sy - (this._powerVal * 200 + 80);
    const cpX = (sx + hx) / 2;
    const endX = result === 'perfect' ? hx
               : result === 'good'    ? hx + 6
               : hx + 32;
    const endY = result === 'brick' ? hy + 18 : hy;

    this._shotSprite.setTexture(this.heatCheck ? 'bball_fire' : 'bball_ball')
      .setPosition(sx, sy).setVisible(true);
    this._ballSprite.setVisible(false);

    let elapsed = 0;
    const dur = 700;
    const ticker = this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        elapsed += 16;
        const t  = Math.min(elapsed / dur, 1);
        const bx = (1-t)*(1-t)*sx + 2*(1-t)*t*cpX + t*t*endX;
        const by = (1-t)*(1-t)*sy + 2*(1-t)*t*cpY + t*t*endY;
        this._shotSprite.setPosition(bx, by);
        if (t >= 1) {
          ticker.remove();
          this._shotSprite.setVisible(false);
          this._ballSprite.setVisible(true);
          this._onShotLanded(result);
        }
      },
    });
  }

  _onShotLanded(result) {
    if (result === 'perfect') {
      this.hoopsScored++;
      this.consecutiveGreens++;
      this.heatCheck = this.consecutiveGreens >= 3;
      const retreat  = this.heatCheck ? 600 : 300;
      this._wall.x  -= retreat;
      this._wallLabel.x = this._wall.x;
      this._wallScaleUp();
      const msg = this.heatCheck
        ? `HEAT CHECK! Wall -${retreat}px`
        : `PERFECT SWISH! Wall -${retreat}px`;
      this._showMsg(msg, '#00ff88');
      this.cameras.main.shake(200, 0.01);
      this._exitLocked();

    } else if (result === 'good') {
      this.hoopsScored++;
      this.consecutiveGreens = 0;
      this.heatCheck = false;
      this._wallScaleUp();
      this._showMsg('NICE! Wall paused 1s', '#ffdd44');
      const saved = this.wallSpeed;
      this.wallSpeed = 0;
      this.time.delayedCall(1000, () => { this.wallSpeed = saved; });
      this._exitLocked();

    } else {
      this.consecutiveGreens = 0;
      this.heatCheck = false;
      this._showMsg('BRICK — REBOUND...', '#ff4444');
      this.cameras.main.shake(180, 0.012);
      this._enterRebound();
    }
  }

  _wallScaleUp() {
    this.wallScaleFactor *= 1.05;
    this.wallSpeed = this.PLAYER_SPEED * 0.85 * this.wallScaleFactor;
  }

  _exitLocked() {
    this.state = this.ST_RUNNING;
    this.player.body.allowGravity = true;
    this._activeHoop = null;
  }

  _enterRebound() {
    this.state = this.ST_REBOUND;
    this._reboundTimer = 1.5;
    this.player.body.velocity.x = 0;
    this.player.body.allowGravity = false;
    this.tweens.add({
      targets: this.player,
      y: this.player.y - 12,
      yoyo: true, repeat: 3, duration: 175,
    });
  }

  _exitRebound() {
    this.state = this.ST_RUNNING;
    this.player.body.allowGravity = true;
    this._activeHoop = null;
  }

  // ── HUD refresh ────────────────────────────────────────────────────────────

  _refreshHUD(wallDist) {
    this._scoreText.setText(`Score: ${this.hoopsScored}`);
    const d   = Math.max(0, Math.floor(wallDist));
    const col = d < 120 ? '#ff3333' : d < 280 ? '#ffaa33' : '#88ff88';
    this._wallText.setText(`Wall: ${d}px`).setColor(col);
    this._heatText.setText(
      this.heatCheck            ? '🔥 HEAT CHECK'
      : this.consecutiveGreens > 0 ? `🟢 ×${this.consecutiveGreens}`
      : ''
    );
  }

  _showMsg(text, color = '#ffff55') {
    this._msgText.setText(text).setColor(color).setVisible(true);
    this.time.delayedCall(1600, () => {
      if (this._msgText) this._msgText.setVisible(false);
    });
  }

  // ── Game over ──────────────────────────────────────────────────────────────

  _gameOver() {
    this.state = 'gameover';
    this.player.body.velocity.x = 0;
    this._meter.setVisible(false);
    this.cameras.main.shake(600, 0.03);
    this._showMsg(`GAME OVER  —  ${this.hoopsScored} hoops`, '#ff2222');
    this.time.delayedCall(2800, () => this._exit());
  }

  // ── Exit ───────────────────────────────────────────────────────────────────

  _exit() {
    this.scene.stop();
    this.scene.resume('GameScene');
    this.game.events.emit('basketballExit');
  }
}
