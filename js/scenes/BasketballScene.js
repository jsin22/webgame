/**
 * BasketballScene — "Bounce Chain" mini-game (basketball.txt).
 *
 * Drag anywhere to aim & shoot. Ball bounces off 4 walls.
 * Every bounce before scoring adds to a multiplier.
 * Launched on top of (paused) GameScene; exits via LEAVE button or ESC.
 */
class BasketballScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BasketballScene' });
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    this.physics.world.gravity.y = 650;

    this.gameScore   = 0;
    this.bounceCount = 0;
    this.launched    = false;
    this.celebrating = false;
    this.ballTrail   = [];
    this._pointerDown = false;
    this._dragPt      = null;

    this._buildTextures();
    this._buildBackground();
    this._buildHoop();
    this._buildBall();
    this._setupWorldBounds();
    this._buildHUD();
    this._setupInput();

    this.input.keyboard.once('keydown-ESC', () => this._exit());
  }

  // ── Asset generation ──────────────────────────────────────────────────────

  _buildTextures() {
    if (this.textures.exists('bball')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xe86010);
    g.fillCircle(13, 13, 13);
    g.lineStyle(1.5, 0x992200);
    g.strokeCircle(13, 13, 13);
    g.lineBetween(13, 0,  13, 26);
    g.lineBetween(0,  13, 26, 13);
    // curved seams
    g.beginPath();
    g.arc(13, 13, 8, Math.PI * 0.2, Math.PI * 0.8, false);
    g.strokePath();
    g.beginPath();
    g.arc(13, 13, 8, Math.PI * 1.2, Math.PI * 1.8, false);
    g.strokePath();
    g.generateTexture('bball', 26, 26);
    g.destroy();
  }

  // ── Court visuals ──────────────────────────────────────────────────────────

  _buildBackground() {
    // Dark hardwood background
    this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x180e06);

    const g = this.add.graphics();

    // Hardwood floor strips
    for (let y = this.H - 80; y < this.H - 20; y += 10) {
      g.fillStyle(0x5a3818, 1);
      g.fillRect(20, y, this.W - 40, 8);
    }

    // Court line (3-point arc, left side)
    g.lineStyle(1.5, 0x7a5030, 0.5);
    g.strokeCircle(200, this.H - 20, 140);
    g.lineBetween(200 - 90, this.H - 80, 200 - 90, this.H - 20);
    g.lineBetween(200 + 90, this.H - 80, 200 + 90, this.H - 20);

    // Wall shading
    g.fillStyle(0x0d0802, 1);
    g.fillRect(0,            0,            20,       this.H);
    g.fillRect(this.W - 20,  0,            20,       this.H);
    g.fillRect(0,            0,            this.W,   20);
    g.fillRect(0,            this.H - 20,  this.W,   20);

    // Wall accent lines
    g.lineStyle(1, 0x3a2810, 1);
    g.lineBetween(20, 20, 20, this.H - 20);
    g.lineBetween(this.W - 20, 20, this.W - 20, this.H - 20);
    g.lineBetween(20, 20, this.W - 20, 20);
    g.lineBetween(20, this.H - 20, this.W - 20, this.H - 20);
  }

  _buildHoop() {
    // Hoop on the right side
    // Left rim: x=685, right rim: x=730, rim y=185
    this.HOOP_LX = 685;
    this.HOOP_RX = 730;
    this.HOOP_Y  = 185;
    this.HOOP_H  = 28;   // height of scoring zone

    const g = this.add.graphics();

    // Backboard
    g.fillStyle(0xe8e8d8);
    g.fillRect(748, 138, 10, 108);
    g.lineStyle(2, 0x888877);
    g.strokeRect(748, 138, 10, 108);
    // Target square on backboard
    g.lineStyle(2, 0xdd2222, 0.8);
    g.strokeRect(748, 168, 10, 46);

    // Rim connector to backboard
    g.fillStyle(0xff5500);
    g.fillRect(this.HOOP_RX, this.HOOP_Y + 3, 748 - this.HOOP_RX, 5);

    // Left rim
    g.fillStyle(0xff5500);
    g.fillCircle(this.HOOP_LX, this.HOOP_Y + 4, 5);
    // Right rim
    g.fillCircle(this.HOOP_RX, this.HOOP_Y + 4, 5);
    // Rim bar
    g.lineStyle(5, 0xff5500);
    g.lineBetween(this.HOOP_LX, this.HOOP_Y + 4, this.HOOP_RX, this.HOOP_Y + 4);

    // Net
    g.lineStyle(1, 0xddddaa, 0.6);
    const nl = this.HOOP_LX, nr = this.HOOP_RX;
    const ny0 = this.HOOP_Y + 9, ny1 = ny0 + 34;
    const nw  = nr - nl;
    for (let i = 0; i <= 5; i++) {
      const nx     = nl + (nw / 5) * i;
      const taper  = (i - 2.5) * 2.5;
      g.lineBetween(nx, ny0, nx + taper, ny1);
    }
    for (let j = 1; j <= 3; j++) {
      const ny = ny0 + (ny1 - ny0) * j / 3;
      g.lineBetween(nl + j * 2, ny, nr - j * 2, ny);
    }

    // Ball spawn marker (faint circle on floor)
    g.lineStyle(1, 0x4a3010, 0.4);
    g.strokeCircle(this.SPAWN_X || 150, this.H - 90, 20);
  }

  // ── Ball ──────────────────────────────────────────────────────────────────

  _buildBall() {
    this.SPAWN_X = this.W / 2;
    this.SPAWN_Y = this.H / 2;

    this.ball = this.physics.add.image(this.SPAWN_X, this.SPAWN_Y, 'bball');
    this.ball.setDepth(5);
    this.ball.setBounce(0.90);
    this.ball.setCircle(13);
    this.ball.body.allowGravity = false;
    this.ball.setDragX(0);
    this.ball.setDragY(0);
    this._prevVy = 0;

    this._trailGfx = this.add.graphics().setDepth(4);
    this._aimGfx   = this.add.graphics().setDepth(4);
  }

  _setupWorldBounds() {
    this.physics.world.setBounds(20, 20, this.W - 40, this.H - 40);
    this.ball.setCollideWorldBounds(true);
    this.ball.body.onWorldBounds = true;

    this.physics.world.on('worldbounds', (body) => {
      if (body.gameObject !== this.ball || !this.launched) return;
      // Floor/ceiling bounce: only count if ball had real vertical velocity before impact
      if (body.blocked.down || body.blocked.up) {
        if (Math.abs(this._prevVy) < 120) return; // rolling skip, not a real bounce
      }
      // Side wall bounce: only count if ball was airborne (had vertical motion)
      if (body.blocked.left || body.blocked.right) {
        if (Math.abs(this._prevVy) < 60) return; // rolling into wall
      }
      this.bounceCount++;
      this._updateBounceHUD();
      this.cameras.main.shake(65, 0.003);
    });
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  _buildHUD() {
    // Title bar background
    this.add.rectangle(this.W / 2, 32, this.W, 46, 0x0d0802, 0.85).setDepth(9);

    this._scoreText = this.add.text(50, 32, 'Score: 0', {
      fontFamily: 'Courier New', fontSize: '18px',
      color: '#ffdd88', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(10);

    this._bounceText = this.add.text(this.W / 2, 32, '', {
      fontFamily: 'Courier New', fontSize: '13px',
      color: '#aaddff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    this._msgText = this.add.text(this.W / 2, this.H / 2 - 20, '', {
      fontFamily: 'Courier New', fontSize: '32px',
      color: '#ffff55', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    this._ptsText = this.add.text(this.W / 2, this.H / 2 + 28, '', {
      fontFamily: 'Courier New', fontSize: '18px',
      color: '#ffaa44', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    this._hintText = this.add.text(this.W / 2, this.H - 38, 'Drag to aim & shoot', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#887755',
    }).setOrigin(0.5).setDepth(10);

    // Leave button
    const lb = this.add.rectangle(this.W - 55, 32, 80, 26, 0x110900)
      .setStrokeStyle(1, 0x6a4020).setInteractive({ useHandCursor: true }).setDepth(10);
    this.add.text(this.W - 55, 32, 'LEAVE', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#aa7744',
    }).setOrigin(0.5).setDepth(10);
    lb.on('pointerup',   () => this._exit());
    lb.on('pointerover', () => lb.setFillStyle(0x221508));
    lb.on('pointerout',  () => lb.setFillStyle(0x110900));
  }

  _updateBounceHUD() {
    const mult = this._getMultiplier();
    const multStr = mult > 1 ? `  ×${mult}` : '';
    const n = this.bounceCount;
    this._bounceText.setText(`● ${n} bounce${n !== 1 ? 's' : ''}${multStr}`);
  }

  // ── Input & aiming ────────────────────────────────────────────────────────

  _setupInput() {
    this.input.on('pointerdown', (ptr) => {
      if (this.launched || this.celebrating) return;
      this._pointerDown = true;
      this._dragPt = { x: ptr.x, y: ptr.y };
    });

    this.input.on('pointermove', (ptr) => {
      if (!this._pointerDown) return;
      this._drawAim(ptr);
    });

    this.input.on('pointerup', (ptr) => {
      if (!this._pointerDown) return;
      this._pointerDown = false;
      this._aimGfx.clear();

      const dx   = ptr.x - this._dragPt.x;
      const dy   = ptr.y - this._dragPt.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 12) return;

      const power = Math.min(dist * 14.2, 3100);
      const ang   = Math.atan2(dy, dx);
      this._launch(Math.cos(ang) * power, Math.sin(ang) * power);
    });
  }

  _drawAim(ptr) {
    this._aimGfx.clear();

    const bx  = this.SPAWN_X, by = this.SPAWN_Y;
    const dx  = ptr.x - this._dragPt.x;
    const dy  = ptr.y - this._dragPt.y;
    const dist = Math.hypot(dx, dy);
    const power = Math.min(dist * 14.2, 3100);
    const ang   = Math.atan2(dy, dx);
    const vx    = Math.cos(ang) * power;
    const vy    = Math.sin(ang) * power;
    const grav  = this.physics.world.gravity.y;

    // Trajectory dots
    this._aimGfx.fillStyle(0xffffff, 0.35);
    for (let i = 1; i <= 38; i++) {
      const t  = i * 0.052;
      const px = bx + vx * t;
      const py = by + vy * t + 0.5 * grav * t * t;
      if (px < 22 || px > this.W - 22 || py < 22 || py > this.H - 22) break;
      const r = Math.max(0.5, 2.5 - i * 0.05);
      this._aimGfx.fillCircle(px, py, r);
    }

    // Power bar
    const MAX  = 3100;
    const barW = 72, barH = 5;
    const barX = bx - barW / 2;
    const barY = by + 30;
    this._aimGfx.fillStyle(0x222222, 0.75);
    this._aimGfx.fillRect(barX, barY, barW, barH);
    const fill = (power / MAX) * barW;
    const col  = power < 1200 ? 0x44ff44 : power < 2200 ? 0xffaa00 : 0xff4444;
    this._aimGfx.fillStyle(col, 0.9);
    this._aimGfx.fillRect(barX, barY, fill, barH);
  }

  // ── Game logic ────────────────────────────────────────────────────────────

  _launch(vx, vy) {
    this.ball.body.allowGravity = true;
    this.ball.setVelocity(vx, vy);
    this.launched    = true;
    this.bounceCount = 0;
    this.ballTrail   = [];
    this._hintText.setVisible(false);
    this._bounceText.setText('● 0 bounces');
  }

  update() {
    if (!this.launched) return;

    // Store vertical velocity BEFORE physics resolves this frame's collisions
    this._prevVy = this.ball.body.velocity.y;

    // Apply floor friction only while touching the ground (simulates rolling deceleration)
    if (this.ball.body.blocked.down) {
      this.ball.body.velocity.x *= 0.88;
    }

    // Ball trail
    this.ballTrail.push({ x: this.ball.x, y: this.ball.y });
    if (this.ballTrail.length > 20) this.ballTrail.shift();
    this._trailGfx.clear();
    this.ballTrail.forEach((pt, i) => {
      const pct = i / this.ballTrail.length;
      this._trailGfx.fillStyle(0xff6600, pct * 0.4);
      this._trailGfx.fillCircle(pt.x, pt.y, pct * 7);
    });

    if (!this.celebrating) {
      this._checkScore();
      const spd = Math.hypot(this.ball.body.velocity.x, this.ball.body.velocity.y);
      if (spd < 300 && this.ball.y > this.HOOP_Y) this._miss();
    }
  }

  _checkScore() {
    const bx = this.ball.x, by = this.ball.y;
    const vy = this.ball.body.velocity.y;
    if (bx > this.HOOP_LX - 4 && bx < this.HOOP_RX + 4 &&
        by > this.HOOP_Y      && by < this.HOOP_Y + this.HOOP_H &&
        vy > 20) {
      this._score();
    }
  }

  _getMultiplier() {
    if (this.bounceCount >= 5) return 10;
    if (this.bounceCount >= 3) return 5;
    if (this.bounceCount >= 1) return 2;
    return 1;
  }

  _score() {
    const mult = this._getMultiplier();
    const pts  = 2 * mult;
    this.gameScore += pts;
    this.celebrating = true;
    this.ball.setVelocity(0, 0);
    this.ball.body.allowGravity = false;

    const msg = mult >= 10 ? '🔥 INSANE!' : mult >= 5 ? '💥 COMBO!' : mult >= 2 ? '✓ NICE!' : '✓ Scored!';
    this._msgText.setText(msg);
    this._ptsText.setText(mult > 1 ? `×${mult} multiplier  +${pts} pts` : `+${pts} pts`);
    this._scoreText.setText(`Score: ${this.gameScore}`);

    if (mult >= 5) this.cameras.main.shake(280, 0.014);
    else           this.cameras.main.shake(90,  0.005);

    this.time.delayedCall(1900, () => this._resetBall());
  }

  _miss() {
    if (this.celebrating) return;
    this.celebrating = true;
    this._msgText.setText('Miss...');
    this._ptsText.setText('');
    this.time.delayedCall(850, () => this._resetBall());
  }

  _resetBall() {
    this.celebrating  = false;
    this.launched     = false;
    this._pointerDown = false;
    this.bounceCount  = 0;
    this.ballTrail    = [];
    this._trailGfx.clear();
    this._aimGfx.clear();
    this._msgText.setText('');
    this._ptsText.setText('');
    this._bounceText.setText('');
    this.ball.setPosition(this.SPAWN_X, this.SPAWN_Y);
    this.ball.setVelocity(0, 0);
    this.ball.body.allowGravity = false;
    this._hintText.setVisible(true);
  }

  _exit() {
    this.scene.stop();
    this.scene.resume('GameScene');
    this.game.events.emit('basketballExit');
  }
}
