/**
 * BasketballScene — "Pro-Hoops Duel"
 *
 * 1-on-1 behind-the-back basketball with pseudo-3D vanishing-point court.
 *
 * OFFENSE  ← / →  Crossover  (time against steal → Blow-by)
 *          ↓ / S  Spin move   (also beats steal attempts)
 *          SPACE  Hold to charge shot, release in green zone
 * DEFENSE  SPACE  Steal attempt — press when STEAL WINDOW flashes
 *          ↑ / W  Contest/block — press during CPU's shot arc
 * ESC — leave gym
 */

// Persistent state across gym visits
const _BB = (() => ({ level: 0 }))();

const BB_OPPONENTS = [
  { name: 'Rookie',   reactionMs: 800, stealFreq: 0.055, shotAcc: 0.28 },
  { name: 'Hustler',  reactionMs: 560, stealFreq: 0.14,  shotAcc: 0.44 },
  { name: 'Pro',      reactionMs: 370, stealFreq: 0.27,  shotAcc: 0.58 },
  { name: 'All-Star', reactionMs: 230, stealFreq: 0.44,  shotAcc: 0.72 },
  { name: 'Legend',   reactionMs: 100, stealFreq: 0.70,  shotAcc: 0.90 },
];

const BB_WIN = 5;  // baskets to win a match

class BasketballScene extends Phaser.Scene {
  constructor() { super({ key: 'BasketballScene' }); }

  // ── Create ──────────────────────────────────────────────────────────────────

  create() {
    const W = this.W = this.scale.width;    // 800
    const H = this.H = this.scale.height;   // 560

    this.physics.world.gravity.y = 0;

    // Court geometry
    this.VP           = { x: W / 2, y: 182 };  // vanishing point
    this.BY           = 548;                     // court bottom y
    this.RX           = W / 2;                   // rim x
    this.RY           = 152;                     // rim y (high above defender)
    this.PLY          = 454;                     // player sprite center y
    this.PLAYER_SCALE = 1.3;                     // player sprite scale

    // Match
    this.playerScore = 0;
    this.aiScore     = 0;
    this.possession  = 'player';
    this.state       = 'menu';

    // Offense vars
    this.openness          = 0.28;
    this._charging         = false;
    this._chargeVal        = 0;
    this._stealWarnActive  = false;
    this._stealWarnTimer   = 0;
    this._stealDodgeActive = false;
    this._stealDodgeTimer  = 0;
    this._nextStealTimer   = 0;
    this._crossoverDir     = 0;
    this._crossoverTimer   = 0;
    this._spinActive       = false;
    this._spinTimer        = 0;

    // Defense vars
    this._switchWindowActive = false;
    this._switchWindowTimer  = 0;
    this._nextSwitchTimer    = 0;
    this._aiShootTimer       = 0;
    this._arcContested       = false;

    // Defender animated position (tweened via plain object)
    this._defPos = { y: 314, x: 0 };  // x is lateral offset from center

    // Player x position (moves left/right on court during offense)
    this._playerX = W / 2;

    // Player depth (0 = at baseline, 1 = advanced near hoop/defender)
    this._playerDepth    = 0;
    this._pastDefender   = false;   // true after crossover/spin beats defender
    this._pastDefenderTimer = 0;

    // Ball arc
    this._ballArcT         = 0;
    this._ballArcDur       = 1;
    this._ballArcSx        = 0; this._ballArcSy = 0;
    this._ballArcCx        = 0; this._ballArcCy = 0;
    this._ballArcEx        = 0; this._ballArcEy = 0;
    this._ballArcForPlayer = true;
    this._ballArcMade      = false;

    // Ball display position
    this._ballX      = W / 2 + 18;
    this._ballY      = this.PLY - 20;
    this._dribblePhase = 0;

    // Fixed-logic accumulator — game logic runs at 60 Hz regardless of render FPS
    // This keeps timing windows (steal reactions) consistent across frame rates.
    this._logicAccum = 0;
    this.LOGIC_DT    = 1 / 60;

    this._buildTextures();
    this._drawBg();
    this._drawCourt();
    this._drawHoop();
    this._buildPlayer();
    this._buildDefender();
    this._buildBall();
    this._buildHUD();
    this._buildMeterUI();
    this._setupInput();
    this._showMenu();
  }

  // ── Textures ────────────────────────────────────────────────────────────────

  _buildTextures() {
    if (!this.textures.exists('bb2_ball')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xe86010); g.fillCircle(13, 13, 13);
      g.lineStyle(1.5, 0x992200); g.strokeCircle(13, 13, 13);
      g.lineBetween(13, 0, 13, 26); g.lineBetween(0, 13, 26, 13);
      g.beginPath(); g.arc(13, 13, 8, 0.2 * Math.PI, 0.8 * Math.PI); g.strokePath();
      g.beginPath(); g.arc(13, 13, 8, 1.2 * Math.PI, 1.8 * Math.PI); g.strokePath();
      g.generateTexture('bb2_ball', 26, 26);
      g.destroy();
    }
  }

  // ── Court background ────────────────────────────────────────────────────────

  _drawBg() {
    const g = this.add.graphics();
    const W = this.W, vpy = this.VP.y;

    // Arena ceiling
    g.fillStyle(0x09051a); g.fillRect(0, 0, W, vpy);
    // Crowd silhouette bands
    g.fillStyle(0x14102a); g.fillRect(0, vpy, W, 28);
    g.fillStyle(0x0f0c22); g.fillRect(0, vpy + 28, W, 16);

    // Scoreboard hanging from ceiling
    g.fillStyle(0x1a1430); g.fillRect(W / 2 - 72, 38, 144, 66);
    g.lineStyle(2, 0x2a3460); g.strokeRect(W / 2 - 72, 38, 144, 66);
    g.fillStyle(0x221c38); g.fillRect(W / 2 - 62, 48, 124, 50);
    // Scoreboard light strip
    g.fillStyle(0xff8800, 0.6);
    for (let i = 0; i < 9; i++) g.fillCircle(W / 2 - 58 + i * 14.5, 104, 3);

    // Arena side lights
    g.lineStyle(1, 0x333366, 0.4);
    for (let x = 60; x < W; x += 130) {
      g.lineBetween(x, vpy, x, vpy + 44);
    }
  }

  _drawCourt() {
    const g = this.add.graphics();
    const vpx = this.VP.x, vpy = this.VP.y;
    const BY = this.BY, W = this.W;

    // perspX: x at y on the line from (x0, BY) toward VP
    const perspX = (x0, y) => x0 + (vpx - x0) * (BY - y) / (BY - vpy);

    // Floor gradient strips (dark near VP, lighter near bottom)
    for (let y = vpy + 44; y < BY; y += 13) {
      const t = (y - vpy) / (BY - vpy);
      const r = Math.round(0x14 + t * (0x38 - 0x14));
      const gg = Math.round(0x09 + t * (0x1d - 0x09));
      const b  = Math.round(0x03 + t * (0x07 - 0x03));
      g.fillStyle((r << 16) | (gg << 8) | b);
      g.fillRect(0, y, W, 13);
    }

    // Perspective floor lines (vertical, every 62px)
    g.lineStyle(1, 0x5a3810, 0.36);
    for (let bx = 0; bx <= W; bx += 62) {
      g.lineBetween(bx, BY, perspX(bx, vpy + 6), vpy + 6);
    }

    // Horizontal court lines
    g.lineStyle(1.5, 0x6a4618, 0.5);
    for (const hy of [438, 368, 300, 240]) {
      g.lineBetween(perspX(0, hy), hy, perspX(W, hy), hy);
    }

    // Key / paint trapezoid (half-width = 116 at bottom)
    const KW = 116;
    g.lineStyle(2, 0x7a5820, 0.65);
    g.lineBetween(perspX(vpx - KW, BY), BY, perspX(vpx - KW, 242), 242);
    g.lineBetween(perspX(vpx + KW, BY), BY, perspX(vpx + KW, 242), 242);
    g.lineBetween(perspX(vpx - KW, 242), 242, perspX(vpx + KW, 242), 242);
    g.lineBetween(perspX(vpx - KW, BY), BY, perspX(vpx + KW, BY), BY);

    // Free throw arc
    g.lineStyle(1.5, 0x7a5820, 0.52);
    g.strokeEllipse(vpx, 300, 118, 38);

    // Three-point arc
    g.strokeEllipse(vpx, 390, 528, 185);
  }

  // ── Hoop ────────────────────────────────────────────────────────────────────

  _drawHoop() {
    const g = this.add.graphics().setDepth(2);
    const rx = this.RX, ry = this.RY;

    // Backboard
    g.fillStyle(0xe8e8d0);
    g.fillRect(rx - 46, ry - 66, 92, 54);
    g.lineStyle(2, 0x888877);
    g.strokeRect(rx - 46, ry - 66, 92, 54);
    g.lineStyle(2, 0xdd2222, 0.9);
    g.strokeRect(rx - 24, ry - 44, 48, 30);

    // Rim (ellipse for 3D look)
    g.lineStyle(5, 0xff5500);
    g.strokeEllipse(rx, ry + 4, 46, 16);

    // Net
    g.lineStyle(1, 0xddddaa, 0.65);
    for (let i = 0; i <= 5; i++) {
      const nx = rx - 22 + 44 / 5 * i;
      g.lineBetween(nx, ry + 4, nx + (i - 2.5) * 3.5, ry + 36);
    }
    for (let j = 1; j <= 3; j++) {
      const ny = ry + 4 + 32 * j / 3;
      g.lineBetween(rx - 22 + j * 2, ny, rx + 22 - j * 2, ny);
    }

    // Floor target ring under hoop
    g.lineStyle(1, 0x334466, 0.3);
    g.strokeEllipse(rx, this.BY - 2, 48, 18);
  }

  // ── Player sprite ────────────────────────────────────────────────────────────

  _buildPlayer() {
    const W = this.W, y = this.PLY;
    const cd  = window.characterData || {};
    const t   = hex => parseInt((hex || '#ffffff').replace('#', ''), 16);
    const bk  = cd.gender === 'female' ? 'player_body_female' : 'player_body_male';

    const ps = this.PLAYER_SCALE;
    this._pBody  = this.add.sprite(W / 2, y, bk, 8).setDepth(6.0).setAlpha(0.88).setScale(ps);
    this._pShirt = this.add.sprite(W / 2, y, 'player_shirt', 8).setDepth(6.2).setAlpha(0.88)
      .setTint(t(cd.colors?.shirt)).setScale(ps);
    this._pPants = this.add.sprite(W / 2, y, 'player_pants', 8).setDepth(6.3).setAlpha(0.88)
      .setTint(t(cd.colors?.pants)).setScale(ps);
    this._pShoes = this.add.sprite(W / 2, y, 'player_shoes', 8).setDepth(6.1).setAlpha(0.88)
      .setTint(t(cd.colors?.shoes)).setScale(ps);

    if (!this.anims.exists('bb2_idle')) {
      this.anims.create({ key: 'bb2_idle',
        frames: this.anims.generateFrameNumbers(bk, { start: 8, end: 11 }),
        frameRate: 5, repeat: -1 });
    }
    this._pBody.play('bb2_idle');
  }

  _pLayers() { return [this._pBody, this._pShirt, this._pPants, this._pShoes]; }
  _pAlpha(a) { this._pLayers().forEach(s => s.setAlpha(a)); }
  _pScale(sx, sy) {
    const ps = this.PLAYER_SCALE;
    this._pLayers().forEach(s => s.setScale(ps * sx, ps * sy));
  }
  _pFrame(f) { this._pLayers().forEach(s => s.setFrame(f)); }

  // ── Perspective Manager ───────────────────────────────────────────────────────
  // Single source of truth for depth→scale mapping.
  // y = VP.y (horizon, 182) → 0.18   y = BY (bottom, 548) → 1.0
  perspScale(y) {
    const t = Math.max(0, Math.min(1, (y - this.VP.y) / (this.BY - this.VP.y)));
    return 0.18 + t * 0.82;
  }

  // ── Defender (drawn each frame) ──────────────────────────────────────────────

  _buildDefender() {
    this._defG = this.add.graphics().setDepth(5);
    const opp  = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
    this._defNameText = this.add.text(this.W / 2, 60, opp.name.toUpperCase(), {
      fontFamily: 'Courier New', fontSize: '11px', color: '#aabbff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(7).setVisible(false);
  }

  _drawDefender() {
    const g = this._defG;
    g.clear();
    if (this.state === 'menu') return;

    const y  = this._defPos.y;
    const sc = this.perspScale(y);
    const s  = v => v * sc;

    // ── Visual states ───────────────────────────────────────────────────────────
    // Steal warn: defender LEANS toward player (5px shift) + jersey flashes
    const stealWarn  = this._stealWarnActive || this._stealDodgeActive;
    const switchWarn = this._switchWindowActive;
    const now        = Date.now();

    // Dribble sway: defender shifts slightly L/R while dribbling
    const dribbleSway = (this.state === 'defense')
      ? Math.sin(this._dribblePhase * 1.8) * s(7) : 0;

    // Lean during steal warn: 8px toward player center
    const leanX = stealWarn ? s(8) * (this._defPos.x <= 0 ? 1 : -1) : 0;

    // Flash: rapid jersey color flicker every 60ms during tell window
    const flashing = stealWarn || switchWarn;
    const flashOn  = flashing && (Math.floor(now / 55) % 2 === 0);

    const x = this.W / 2 + this._defPos.x + dribbleSway + leanX;

    const jerseyC = flashOn  ? 0xffee00 : (stealWarn || switchWarn) ? 0xff2222 : 0x1f4dcc;
    const shortsC = flashOn  ? 0xddcc00 : (stealWarn || switchWarn) ? 0xcc1111 : 0x163a99;
    const skinC   = 0xd4956a;

    // ── Y-sort: defender depth relative to player ───────────────────────────────
    // Defender is "in front of" player when their Y >= player's screen Y
    const playerScreenY = this.PLY - this._playerDepth * 130;
    if (y >= playerScreenY - 20) {
      this._defG.setDepth(7);
      this._pLayers().forEach(pl => pl.setDepth(5.5));
    } else {
      this._defG.setDepth(5);
      this._pLayers().forEach(pl => pl.setDepth(6));
    }

    // ── Draw ────────────────────────────────────────────────────────────────────

    // Shadow
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(x, y + s(28), s(82), s(15));

    // Shoes
    g.fillStyle(0x111111);
    g.fillRect(x - s(28), y + s(10), s(22), s(12));
    g.fillRect(x + s(6),  y + s(10), s(22), s(12));

    // Lower legs
    g.lineStyle(s(12), jerseyC);
    g.lineBetween(x - s(14), y - s(42), x - s(12), y + s(10));
    g.lineBetween(x + s(14), y - s(42), x + s(12), y + s(10));

    // Shorts
    g.fillStyle(shortsC);
    g.fillRect(x - s(32), y - s(64), s(64), s(26));

    // Torso / jersey
    g.fillStyle(jerseyC);
    g.fillRect(x - s(32), y - s(132), s(64), s(72));
    // Jersey number
    g.lineStyle(s(2.5), 0xffffff, 0.8);
    g.lineBetween(x - s(13), y - s(118), x - s(13), y - s(82));
    g.lineBetween(x - s(4),  y - s(82),  x - s(4),  y - s(68));
    g.strokeCircle(x + s(10), y - s(95), s(12));

    // Arms — raised during steal / contest; swing during dribble
    const armSwing  = (this.state === 'defense') ? Math.sin(this._dribblePhase * 1.8) * s(10) : 0;
    const armRaise  = (switchWarn || this._stealDodgeActive) ? s(28) : 0;
    g.lineStyle(s(14), jerseyC);
    g.lineBetween(x - s(32), y - s(112), x - s(55), y - s(72) + armSwing);
    g.lineBetween(x + s(32), y - s(112), x + s(55), y - s(72) - armSwing);
    g.lineStyle(s(11), skinC);
    g.lineBetween(x - s(55), y - s(72) + armSwing,  x - s(50), y - s(105) - armRaise + armSwing);
    g.lineBetween(x + s(55), y - s(72) - armSwing,  x + s(50), y - s(105) - armRaise - armSwing);

    // Neck + head
    g.fillStyle(skinC);
    g.fillRect(x - s(12), y - s(146), s(24), s(18));
    g.fillCircle(x, y - s(162), s(20));

    // Eyes — flash yellow when steal is imminent
    const eyeC = flashOn ? 0xff4400 : 0xffffff;
    g.fillStyle(eyeC);
    g.fillRect(x - s(12), y - s(170), s(8), s(5));
    g.fillRect(x + s(4),  y - s(170), s(8), s(5));
    g.fillStyle(0x111111);
    g.fillRect(x - s(10), y - s(169), s(5), s(4));
    g.fillRect(x + s(5),  y - s(169), s(5), s(4));
    // Scowl (angry brow)
    g.lineStyle(s(2), 0x3a1a00);
    g.lineBetween(x - s(13), y - s(176), x - s(5), y - s(172));
    g.lineBetween(x + s(5),  y - s(172), x + s(13), y - s(176));

    // Name plate
    const nameY = y - s(192);
    this._defNameText.setPosition(x, nameY).setVisible(true)
      .setFontSize(Math.max(8, Math.round(10 * sc)) + 'px');
  }

  // ── Ball ────────────────────────────────────────────────────────────────────

  _buildBall() {
    this._ballSprite = this.add.image(this._ballX, this._ballY, 'bb2_ball').setDepth(8);
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────

  _buildHUD() {
    const W = this.W, H = this.H;
    const sf = 0, d  = 20;

    this.add.rectangle(W / 2, 22, W, 44, 0x080410, 0.90).setScrollFactor(sf).setDepth(d);

    this._pScoreText = this.add.text(W / 4 - 10, 22, 'YOU: 0', {
      fontFamily: 'Courier New', fontSize: '18px', color: '#55ff88',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d);

    this._aScoreText = this.add.text(3 * W / 4 + 10, 22, 'CPU: 0', {
      fontFamily: 'Courier New', fontSize: '18px', color: '#ff5555',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d);

    this._oppText = this.add.text(W / 2, 12, '', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#778899',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d);

    this._possText = this.add.text(W / 2, 30, '', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d);

    this._msgText = this.add.text(W / 2, H / 2 - 52, '', {
      fontFamily: 'Courier New', fontSize: '28px', color: '#ffff55',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(25).setVisible(false);

    this._ctrlText = this.add.text(W / 2, H - 16, '', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#445566',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d);

    this._opennessText = this.add.text(W - 90, H - 16, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#445566',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d);

    // STEAL! flash (offense — defender lunging)
    this._stealWarnText = this.add.text(W / 2, H / 2 + 45, 'STEAL!', {
      fontFamily: 'Courier New', fontSize: '26px', color: '#ff2222',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(26).setVisible(false);

    // STEAL WINDOW flash (defense — dribble switch)
    this._switchText = this.add.text(W / 2, H / 2 + 45, 'STEAL WINDOW!', {
      fontFamily: 'Courier New', fontSize: '22px', color: '#ffff22',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(26).setVisible(false);

    // Leave button
    const lb = this.add.rectangle(W - 46, 22, 72, 26, 0x110900)
      .setStrokeStyle(1, 0x6a4020).setInteractive({ useHandCursor: true })
      .setScrollFactor(sf).setDepth(d);
    this.add.text(W - 46, 22, 'LEAVE', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#aa7744',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d + 1);
    lb.on('pointerup',   () => this._exit());
    lb.on('pointerover', () => lb.setFillStyle(0x221508));
    lb.on('pointerout',  () => lb.setFillStyle(0x110900));
  }

  _updateHUD() {
    const opp  = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
    this._pScoreText.setText(`YOU: ${this.playerScore}`);
    this._aScoreText.setText(`CPU: ${this.aiScore}`);
    this._oppText.setText(`${opp.name}  ·  Lv ${_BB.level + 1}  ·  First to ${BB_WIN}`);
    this._possText.setText(this.possession === 'player' ? '▶ YOUR BALL' : '▶ CPU BALL');

    if (this.state === 'offense') {
      const pct = Math.round(this.openness * 100);
      const col = pct >= 60 ? '#55ff88' : pct >= 40 ? '#ffdd44' : '#ff8844';
      this._opennessText.setText(`Open: ${pct}%`).setColor(col);
    } else {
      this._opennessText.setText('');
    }
  }

  // ── Charge meter UI ──────────────────────────────────────────────────────────

  _buildMeterUI() {
    const W = this.W, H = this.H;
    this._meterCont = this.add.container(W / 2, H - 52)
      .setScrollFactor(0).setDepth(22).setVisible(false);

    const bg  = this.add.rectangle(0, 0, 240, 28, 0x000000, 0.80)
      .setStrokeStyle(1, 0x334455);
    const trk = this.add.rectangle(0, 4, 200, 14, 0x1a1a1a)
      .setStrokeStyle(1, 0x2a2a2a);
    // Sweet spot: charge 0.60–0.90 → bar pixels 120–180 from left edge
    // Bar spans x = -100 to +100. 0.60 → -100+120=20, 0.90 → -100+180=80, center=50, width=60
    const gz = this.add.rectangle(50, 4, 60, 14, 0x007700, 0.42);
    this._mFill = this.add.rectangle(-99, 4, 2, 12, 0x44ff44);
    this._mLabel = this.add.text(0, -11, 'HOLD SPACE — release in GREEN ZONE', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#667788',
    }).setOrigin(0.5);

    this._meterCont.add([bg, trk, gz, this._mFill, this._mLabel]);
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      f:     Phaser.Input.Keyboard.KeyCodes.F,
    });

    this._keys.space.on('down', () => this._onSpaceDown());
    this._keys.space.on('up',   () => this._onSpaceUp());
    this._keys.f.on('down',     () => this._onSpaceDown());
    this._keys.up.on('down',    () => this._onContest());
    this._keys.w.on('down',     () => this._onContest());
    this._keys.left.on('down',  () => this._onCrossover(-1));
    this._keys.right.on('down', () => this._onCrossover(1));
    // ↓ is reserved for retreating; S triggers spin
    this._keys.s.on('down',     () => this._onSpin());
    // Persistent ESC listener — exits any time
    this.input.keyboard.on('keydown-ESC', () => this._exit());
  }

  _onSpaceDown() {
    if (this.state === 'offense' && !this._stealDodgeActive && !this._stealWarnActive) {
      this._charging  = true;
      this._chargeVal = 0;
      this._meterCont.setVisible(true);
      this._ctrlText.setText('Release SPACE to shoot!');
    } else if (this.state === 'defense' && this._switchWindowActive) {
      this._attemptPlayerSteal();
    }
  }

  _onSpaceUp() {
    if (this.state === 'offense' && this._charging) {
      this._charging = false;
      this._meterCont.setVisible(false);
      this._releaseShot();
    }
  }

  _onCrossover(dir) {
    if (this.state !== 'offense') return;
    if (this._stealDodgeActive) {
      this._beatSteal('BLOW-BY!', 0.38, dir, false);
    } else if (!this._stealWarnActive) {
      this.openness        = Math.min(0.95, this.openness + 0.07);
      this._crossoverDir   = dir;
      this._crossoverTimer = 0.42;
    }
  }

  _onSpin() {
    if (this.state !== 'offense') return;
    if (this._stealDodgeActive) {
      this._beatSteal('SPIN MOVE!', 0.28, 0, true);
    } else if (!this._stealWarnActive) {
      this.openness    = Math.min(0.95, this.openness + 0.05);
      this._spinActive = true;
      this._spinTimer  = 0.55;
    }
  }

  _beatSteal(msg, bonus, crossDir, spin) {
    this._stealDodgeActive  = false;
    this._stealWarnActive   = false;
    this._stealWarnText.setVisible(false);
    this.openness           = Math.min(0.95, this.openness + bonus);
    this._pastDefender      = true;
    this._pastDefenderTimer = 3.5;  // seconds before defender recovers
    this._showMsg(msg, '#00ffcc');
    if (crossDir !== 0) { this._crossoverDir = crossDir; this._crossoverTimer = 0.5; }
    if (spin)           { this._spinActive = true;        this._spinTimer = 0.60; }
    this._resetNextStealTimer();

    // Defender stumbles sideways (opposite crossover dir) and retreats on Z-axis.
    // Recovery is handled by the logic loop once _pastDefender expires.
    const slideDir = crossDir !== 0 ? -crossDir : (Math.random() < 0.5 ? 1 : -1);
    this.tweens.add({
      targets: this._defPos, x: slideDir * 220, y: 224,
      duration: 320, ease: 'Power2',
    });
  }

  _onContest() {
    // Only effective while CPU shot is in the air
    if (this.state !== 'shot_arc' || this._ballArcForPlayer) return;
    if (!this._arcContested) {
      this._arcContested = true;
      this._showMsg('CONTESTED!', '#ffff33', 1000);
    }
  }

  // ── Menu ─────────────────────────────────────────────────────────────────────

  _showMenu() {
    const W   = this.W, H = this.H;
    const opp = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
    const sf  = 0, d  = 50;
    const PW  = 466, PH = 372;
    const cx  = W / 2, top = H / 2 - PH / 2;
    const ts  = { fontFamily: 'Courier New', stroke: '#000', strokeThickness: 3 };

    const menuObjs = [];
    const mk = obj => { menuObjs.push(obj); return obj; };

    mk(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.80).setScrollFactor(sf).setDepth(d));
    mk(this.add.rectangle(cx, H/2, PW, PH, 0x050310, 0.97)
      .setStrokeStyle(2, 0x334488).setScrollFactor(sf).setDepth(d));

    mk(this.add.text(cx, top + 24, 'PRO-HOOPS DUEL', {
      ...ts, fontSize: '22px', color: '#ff8844', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
    mk(this.add.text(cx, top + 50, `vs ${opp.name}  ·  First to ${BB_WIN} baskets`, {
      fontFamily: 'Courier New', fontSize: '13px', color: '#7788aa',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
    mk(this.add.text(cx, top + 70, `Opponent level ${_BB.level + 1} of ${BB_OPPONENTS.length}`, {
      fontFamily: 'Courier New', fontSize: '11px', color: '#445566',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
    mk(this.add.rectangle(cx, top + 84, PW - 20, 1, 0x223355).setScrollFactor(sf).setDepth(d));

    const rows = [
      { label: 'OFFENSE',   color: '#ff8844' },
      { key: '← / →',     action: 'Move laterally — tap to Crossover, hold to run' },
      { key: '↑',          action: 'Advance toward hoop (blocked if defender mirrors you)' },
      { key: '↓',          action: 'Retreat back to baseline' },
      { key: 'S',          action: 'Spin move — beats steal attempts' },
      { key: 'SPACE',      action: 'Hold to charge shot, release in green zone' },
      { label: 'DEFENSE',  color: '#44aaff' },
      { key: 'SPACE / F',  action: 'Steal — press when STEAL WINDOW flashes!' },
      { key: '↑ / W',     action: "Contest — press during CPU's shot arc" },
    ];

    let cy = top + 98;
    for (const r of rows) {
      if (r.label) {
        mk(this.add.text(cx - 206, cy, r.label + ':', {
          fontFamily: 'Courier New', fontSize: '12px', color: r.color,
          stroke: '#000', strokeThickness: 2,
        }).setScrollFactor(sf).setDepth(d));
      } else {
        mk(this.add.text(cx - 206, cy, r.key, {
          fontFamily: 'Courier New', fontSize: '12px', color: '#ffdd88',
          stroke: '#000', strokeThickness: 2,
        }).setScrollFactor(sf).setDepth(d));
        mk(this.add.text(cx - 82, cy, r.action, {
          fontFamily: 'Courier New', fontSize: '11px', color: '#778899',
        }).setScrollFactor(sf).setDepth(d));
      }
      cy += 26;
    }

    mk(this.add.rectangle(cx, top + 288, PW - 20, 1, 0x223355).setScrollFactor(sf).setDepth(d));

    const btnBg = mk(this.add.rectangle(cx, top + 316, 150, 34, 0x0a2810)
      .setStrokeStyle(2, 0x33aa55).setInteractive({ useHandCursor: true })
      .setScrollFactor(sf).setDepth(d));
    mk(this.add.text(cx, top + 316, 'START GAME', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#55ff88',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
    mk(this.add.text(cx, top + 350, 'ESC — leave gym', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#443322',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));

    btnBg.on('pointerover', () => btnBg.setFillStyle(0x133d1e));
    btnBg.on('pointerout',  () => btnBg.setFillStyle(0x0a2810));
    btnBg.on('pointerup',   () => { menuObjs.forEach(o => o.destroy()); this._startMatch(); });

    const startFromKey = () => {
      if (menuObjs[0]?.active) {
        menuObjs.forEach(o => o.destroy());
        this._startMatch();
      }
    };
    this.input.keyboard.once('keydown-ENTER', startFromKey);
    this.input.keyboard.once('keydown-SPACE', startFromKey);
  }

  // ── Match flow ───────────────────────────────────────────────────────────────

  _startMatch() {
    this.playerScore = 0;
    this.aiScore     = 0;
    this.possession  = 'player';
    this._updateHUD();
    this._startPossession();
  }

  _startPossession() {
    if (this.playerScore >= BB_WIN || this.aiScore >= BB_WIN) return;
    if (this.possession === 'player') this._startOffense();
    else                              this._startDefense();
  }

  _startOffense() {
    this.state             = 'offense';
    this.possession        = 'player';
    this.openness          = 0.28;
    this._charging         = false;
    this._chargeVal        = 0;
    this._stealWarnActive  = false;
    this._stealDodgeActive = false;
    this._crossoverDir     = 0;
    this._spinActive       = false;
    this._stealWarnText.setVisible(false);
    this._switchText.setVisible(false);
    this._meterCont.setVisible(false);
    this._defPos.y          = 314;
    this._defPos.x          = 0;
    this._playerX           = this.W / 2;
    this._playerDepth       = 0;
    this._pastDefender      = false;
    this._pastDefenderTimer = 0;
    this._ballX             = this._playerX + 18;
    this._ballY             = this.PLY - 20;
    this._resetNextStealTimer();
    this._updateHUD();
    this._ctrlText.setText('←/→ move  ↑ advance  ↓ retreat  S Spin  SPACE hold+release to shoot');
  }

  _startDefense() {
    this.state               = 'defense';
    this.possession          = 'ai';
    this._switchWindowActive = false;
    this._arcContested       = false;
    this._stealWarnText.setVisible(false);
    this._switchText.setVisible(false);
    this._defPos.y           = 314;
    this._defPos.x           = 0;
    this._playerX            = this.W / 2;
    this._ballX              = this.W / 2 + 16;
    this._ballY              = this._defPos.y - 38;
    this._resetNextSwitchTimer();
    this._resetAiShootTimer();
    this._updateHUD();
    this._ctrlText.setText('SPACE — Steal (in window)   ↑/W — Contest (during CPU shot)');
  }

  // ── Main update ──────────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.state === 'menu' || this.state === 'match_end') return;

    // ── Fixed logic ticks (60 Hz) ─────────────────────────────────────────────
    // Game logic runs at a fixed rate so timing windows are consistent
    // regardless of render FPS (separates physics/logic from rendering).
    this._logicAccum += delta / 1000;
    while (this._logicAccum >= this.LOGIC_DT) {
      this._logicTick(this.LOGIC_DT);
      this._logicAccum -= this.LOGIC_DT;
    }

    // ── Render update (every frame) ───────────────────────────────────────────
    this._drawDefender();
    this._updateVisuals(delta / 1000);
    this._updateBallSprite();
    this._updateHUD();
  }

  _logicTick(dt) {
    if (this.state === 'offense')        this._updateOffense(dt);
    else if (this.state === 'defense')   this._updateDefense(dt);
    else if (this.state === 'shot_arc')  this._updateBallArc(dt);
    // 'result' state: just waits for delayedCall
  }

  // ── Offense ──────────────────────────────────────────────────────────────────

  _updateOffense(dt) {
    const opp = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];

    // ── Player movement ──────────────────────────────────────────────────────────
    // Lateral: free left/right (crossover animation fires on keydown separately)
    if (!this._stealDodgeActive) {
      if (this._keys.left.isDown)  this._playerX = Math.max(80,  this._playerX - 220 * dt);
      if (this._keys.right.isDown) this._playerX = Math.min(720, this._playerX + 220 * dt);
    }

    // Forward (↑): blocked if defender is directly in front
    const playerScreenY   = this.PLY - this._playerDepth * 130;
    const defLateralGap   = Math.abs(this._playerX - (this.W / 2 + this._defPos.x));
    const defBlocking     = !this._pastDefender && defLateralGap < 70;
    if (this._keys.up.isDown && !defBlocking && !this._charging) {
      this._playerDepth = Math.min(1, this._playerDepth + 0.28 * dt);
    }
    // Backward (↓)
    if (this._keys.down.isDown) {
      this._playerDepth = Math.max(0, this._playerDepth - 0.38 * dt);
    }

    // ── Defender lateral mirroring ───────────────────────────────────────────────
    // Harder defenders mirror faster, making it harder to get past
    const mirrorSpeed = 80 + opp.stealFreq * 320;  // Rookie ~98 px/s, Legend ~304 px/s
    const targetDefX  = this._playerX - this.W / 2; // center-relative
    if (!this._pastDefender) {
      const dx   = targetDefX - this._defPos.x;
      const step = mirrorSpeed * dt;
      this._defPos.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
    }

    // ── Defender depth tracks player (when not in steal animation) ───────────────
    if (!this._stealWarnActive && !this._stealDodgeActive && !this._pastDefender) {
      const targetDefY = (this.PLY - this._playerDepth * 130) - 80;
      const dy         = targetDefY - this._defPos.y;
      this._defPos.y  += dy * Math.min(1, 3.5 * dt);
    }

    // ── Past-defender timer ──────────────────────────────────────────────────────
    if (this._pastDefender) {
      this._pastDefenderTimer -= dt;
      // Openness grows while past the defender (near basket, open look)
      this.openness = Math.min(0.95, this.openness + 0.06 * dt);
      if (this._pastDefenderTimer <= 0) {
        this._pastDefender = false;
        // Defender recovers — smoothly slides back (logic will mirror again)
      }
    }

    // Charge meter animation
    if (this._charging) {
      this._chargeVal = Math.min(1, this._chargeVal + 0.88 * dt);
      const w = Math.max(2, this._chargeVal * 200);
      this._mFill.setSize(w, 12).setX(-100 + w / 2);
      const inZone = this._chargeVal >= 0.60 && this._chargeVal <= 0.90;
      this._mFill.fillColor = inZone ? 0x44ff44 : this._chargeVal > 0.90 ? 0xff4444 : 0xffaa00;
    }

    // Steal dodge window → turnover if expired
    if (this._stealDodgeActive) {
      this._stealDodgeTimer -= dt;
      if (this._stealDodgeTimer <= 0) {
        this._stealDodgeActive = false;
        this._stealWarnActive  = false;
        this._stealWarnText.setVisible(false);
        this._meterCont.setVisible(false);
        this._turnoverToAI();
        return;
      }
    }

    // Brief steal warning → then open dodge window
    if (this._stealWarnActive && !this._stealDodgeActive) {
      this._stealWarnTimer -= dt;
      if (this._stealWarnTimer <= 0) {
        this._stealWarnActive  = false;
        this._stealDodgeActive = true;
        const opp = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
        this._stealDodgeTimer = opp.reactionMs / 1000;
      }
    }

    // Countdown to next steal attempt
    if (!this._stealWarnActive && !this._stealDodgeActive) {
      this._nextStealTimer -= dt;
      if (this._nextStealTimer <= 0) this._triggerStealAttempt();
    }

    // Crossover/spin animation timers
    if (this._crossoverTimer > 0 && (this._crossoverTimer -= dt) <= 0) this._crossoverDir = 0;
    if (this._spinTimer     > 0 && (this._spinTimer     -= dt) <= 0) this._spinActive = false;

  }

  _triggerStealAttempt() {
    if (this._charging) { this._resetNextStealTimer(); return; }
    this._stealWarnActive = true;
    this._stealWarnTimer  = 0.44;
    this._stealWarnText.setVisible(true);
    // Defender lunges very close — Z-axis lunge makes them loom large
    this.tweens.add({
      targets: this._defPos, y: 432, duration: 320, ease: 'Power2.easeIn',
    });
    this.tweens.add({
      targets: this._stealWarnText,
      alpha: { from: 1, to: 0.15 },
      duration: 120, yoyo: true, repeat: 5,
    });
  }

  _resetNextStealTimer() {
    const opp = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
    const base = Math.max(0.8, 2.8 - opp.stealFreq * 3.5);
    this._nextStealTimer = base + Math.random() * 1.8;
  }

  _releaseShot() {
    if (this.state !== 'offense') return;
    const cv = this._chargeVal;
    let q;
    if (cv >= 0.60 && cv <= 0.90) {
      q = 0.65 + (1 - Math.abs(cv - 0.75) / 0.15) * 0.35;
    } else if (cv > 0.90) {
      q = Math.max(0.05, 0.65 - (cv - 0.90) * 6.5);
    } else {
      q = (cv / 0.60) * 0.45;
    }

    // Openness also grows with depth: deeper = better look
    const depthOpenBonus = this._playerDepth * 0.25;
    const made = Math.random() < Math.min(0.95, this.openness + depthOpenBonus) * q;
    this._stealWarnText.setVisible(false);
    this._ctrlText.setText('');
    const playerScreenY = this.PLY - this._playerDepth * 130;
    this._startBallArc(this._playerX, playerScreenY - 20, this.RX, this.RY, 880, made, true);
    this.state = 'shot_arc';
  }

  _turnoverToAI() {
    this.state      = 'result';
    this.possession = 'ai';
    this._showMsg('STOLEN! CPU ball', '#ff3333');
    this.cameras.main.shake(220, 0.014);
    this.time.delayedCall(1100, () => this._startPossession());
  }

  // ── Defense ──────────────────────────────────────────────────────────────────

  _updateDefense(dt) {
    if (this._switchWindowActive) {
      this._switchWindowTimer -= dt;
      if (this._switchWindowTimer <= 0) {
        this._switchWindowActive = false;
        this._switchText.setVisible(false);
        this._resetNextSwitchTimer();
      }
    } else {
      this._nextSwitchTimer -= dt;
      if (this._nextSwitchTimer <= 0) this._openStealWindow();
    }

    this._aiShootTimer -= dt;
    if (this._aiShootTimer <= 0 && !this._switchWindowActive) this._aiTakesShot();
  }

  _openStealWindow() {
    const opp = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
    this._switchWindowActive = true;
    this._switchWindowTimer  = opp.reactionMs / 1000;
    this._switchText.setVisible(true);
    this.tweens.add({
      targets: this._switchText,
      alpha: { from: 1, to: 0.15 },
      duration: 120, yoyo: true, repeat: 5,
    });
  }

  _attemptPlayerSteal() {
    this._switchWindowActive = false;
    this._switchText.setVisible(false);
    this._showMsg('STEAL! Your ball', '#ffff44');
    this.possession = 'player';
    this.state      = 'result';
    this.time.delayedCall(900, () => this._startPossession());
  }

  _resetNextSwitchTimer() {
    const opp = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
    const base = Math.max(0.8, 2.2 - opp.stealFreq * 2.5);
    this._nextSwitchTimer = base + Math.random() * 2.5;
  }

  _resetAiShootTimer() {
    this._aiShootTimer = 3.8 + Math.random() * 3.2;
  }

  _aiTakesShot() {
    this._arcContested = false;
    this._showMsg('CPU SHOOTING!', '#ff8855', 700);
    this._ctrlText.setText('↑/W — CONTEST NOW!');
    // made=null: evaluated on landing (contest can still happen during arc)
    this._startBallArc(this.W / 2 + this._defPos.x + 14, this._defPos.y - 36, this.RX, this.RY, 860, null, false);
    this.state = 'shot_arc';
  }

  // ── Ball arc ──────────────────────────────────────────────────────────────────

  _startBallArc(sx, sy, ex, ey, durMs, made, forPlayer) {
    this._ballArcSx  = sx; this._ballArcSy = sy;
    this._ballArcEx  = ex; this._ballArcEy = ey;
    this._ballArcCx  = (sx + ex) / 2;
    this._ballArcCy  = Math.min(sy, ey) - 130;
    this._ballArcT   = 0;
    this._ballArcDur = durMs / 1000;
    this._ballArcMade      = made;
    this._ballArcForPlayer = forPlayer;
  }

  _updateBallArc(dt) {
    this._ballArcT = Math.min(1, this._ballArcT + dt / this._ballArcDur);
    const t  = this._ballArcT;
    const bx = (1 - t) * (1 - t) * this._ballArcSx + 2 * (1 - t) * t * this._ballArcCx + t * t * this._ballArcEx;
    const by = (1 - t) * (1 - t) * this._ballArcSy + 2 * (1 - t) * t * this._ballArcCy + t * t * this._ballArcEy;
    this._ballX = bx;
    this._ballY = by;

    if (t >= 1) {
      this.state = 'result';  // prevent re-firing
      if (this._ballArcForPlayer) {
        this._onPlayerShotLanded(this._ballArcMade);
      } else {
        const opp  = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
        const acc  = opp.shotAcc * (this._arcContested ? 0.52 : 1.0);
        this._onAiShotLanded(Math.random() < acc);
      }
    }
  }

  _onPlayerShotLanded(made) {
    if (made) {
      this.playerScore++;
      this._showMsg('SCORE! +1', '#55ff88');
      this.cameras.main.shake(180, 0.011);
      GameState.addMoney(3);
      SaveManager.save();
    } else {
      this._showMsg('MISS — CPU ball', '#ff8844');
    }
    this.possession = 'ai';
    this._updateHUD();
    this._checkMatchEnd();
  }

  _onAiShotLanded(made) {
    if (made) {
      this.aiScore++;
      this._showMsg('CPU SCORES!', '#ff5555');
      this.cameras.main.shake(160, 0.009);
    } else {
      this._showMsg('CPU MISSES — your ball!', '#55ff88');
    }
    this.possession = 'player';
    this._updateHUD();
    this._checkMatchEnd();
  }

  _checkMatchEnd() {
    if (this.playerScore >= BB_WIN) {
      this.time.delayedCall(1300, () => this._winMatch());
    } else if (this.aiScore >= BB_WIN) {
      this.time.delayedCall(1300, () => this._loseMatch());
    } else {
      this.time.delayedCall(1400, () => this._startPossession());
    }
  }

  _winMatch() {
    this.state  = 'match_end';
    _BB.level   = Math.min(_BB.level + 1, BB_OPPONENTS.length - 1);
    const money = 25 + (_BB.level - 1) * 12;
    GameState.addMoney(money);
    SaveManager.save();
    this._showEndScreen(true, money);
  }

  _loseMatch() {
    this.state = 'match_end';
    this._showEndScreen(false, 0);
  }

  _showEndScreen(won, money) {
    const W = this.W, H = this.H;
    const opp = BB_OPPONENTS[Math.min(_BB.level, BB_OPPONENTS.length - 1)];
    const sf = 0, d = 50;
    const PW = 370, PH = 268;
    const cx = W / 2, top = H / 2 - PH / 2;
    const endObjs = [];
    const mk = obj => { endObjs.push(obj); return obj; };

    mk(this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.82).setScrollFactor(sf).setDepth(d));
    mk(this.add.rectangle(cx, H / 2, PW, PH, 0x050310, 0.97)
      .setStrokeStyle(2, won ? 0x33aa55 : 0xaa2222).setScrollFactor(sf).setDepth(d));
    mk(this.add.text(cx, top + 30, won ? 'VICTORY!' : 'DEFEAT', {
      fontFamily: 'Courier New', fontSize: '26px', color: won ? '#55ff88' : '#ff4444',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
    mk(this.add.text(cx, top + 64, `${this.playerScore} — ${this.aiScore}`, {
      fontFamily: 'Courier New', fontSize: '20px', color: '#aabbcc',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
    mk(this.add.text(cx, top + 92, won
      ? `Earned $${money}  ·  Next: ${opp.name}`
      : 'Try again — same opponent', {
      fontFamily: 'Courier New', fontSize: '12px',
      color: won ? '#778899' : '#665544',
    }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));

    if (won && _BB.level < BB_OPPONENTS.length - 1) {
      mk(this.add.text(cx, top + 112, `New opponent unlocked!`, {
        fontFamily: 'Courier New', fontSize: '11px', color: '#446655',
      }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
    }

    // Shared button maker
    const makeBtn = (bx, label, bgCol, strokeCol, action) => {
      const bg = mk(this.add.rectangle(bx, top + 194, 128, 33, bgCol)
        .setStrokeStyle(2, strokeCol).setInteractive({ useHandCursor: true })
        .setScrollFactor(sf).setDepth(d));
      mk(this.add.text(bx, top + 194, label, {
        fontFamily: 'Courier New', fontSize: '12px', color: '#ffffff',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(sf).setDepth(d));
      bg.on('pointerover', () => bg.setFillStyle(
        Phaser.Display.Color.ValueToColor(bgCol).lighten(12).color));
      bg.on('pointerout',  () => bg.setFillStyle(bgCol));
      bg.on('pointerup',   action);
    };

    makeBtn(cx - 72, 'PLAY AGAIN', 0x0a1f28, 0x2288aa, () => {
      endObjs.forEach(o => o.destroy());
      this._showMenu();
    });
    makeBtn(cx + 72, 'LEAVE GYM', 0x1a0808, 0x884422, () => this._exit());
  }

  // ── Visuals ───────────────────────────────────────────────────────────────────

  _updateVisuals(dt) {
    this._dribblePhase = (this._dribblePhase + dt * 6.5) % (Math.PI * 2);

    // Player screen position — depth moves them toward the hoop (up the court)
    const playerScreenY = this.PLY - this._playerDepth * 130;
    const psc = this.perspScale(playerScreenY);  // scale shrinks as they advance
    this._pLayers().forEach(s => s.setPosition(this._playerX, playerScreenY));

    // Ball dribble position (while not arcing)
    if (this.state !== 'shot_arc') {
      if (this.state === 'offense') {
        const sway = this._crossoverDir * 20 * Math.max(0, this._crossoverTimer / 0.42);
        this._ballX = this._playerX + 18 + sway;
        this._ballY = playerScreenY - 18 - Math.abs(Math.sin(this._dribblePhase)) * 22;
      } else if (this.state === 'defense') {
        this._ballX = this.W / 2 + this._defPos.x + 16;
        this._ballY = this._defPos.y - 36 - Math.abs(Math.sin(this._dribblePhase)) * 18;
      }
    }

    // Player frame selection (animation state machine)
    const now = Date.now();
    let fi;
    if (this._spinActive)            fi = Math.floor(now / 55) % 4 + 12;  // spin: walk-up frames
    else if (this._crossoverDir < 0) fi = Math.floor(now / 70) % 4 + 4;   // crossover left
    else if (this._crossoverDir > 0) fi = Math.floor(now / 70) % 4 + 8;   // crossover right
    else if (this._keys?.up?.isDown) fi = Math.floor(now / 120) % 4 + 12;  // advancing forward
    else                             fi = Math.floor(now / 220) % 4 + 8;   // idle dribble
    this._pFrame(fi);

    // Player transparency — 50% so the defender is always visible through them
    this._pAlpha(this._spinActive
      ? 0.25 + Math.abs(Math.sin(now / 38)) * 0.35   // flicker during spin
      : 0.50);                                         // always semi-transparent

    // Player squish on crossover — scale uses perspective depth
    if (this._crossoverDir !== 0 && this._crossoverTimer > 0) {
      const prog = 1 - this._crossoverTimer / 0.42;
      const sq   = Math.sin(prog * Math.PI * 2) * 0.10;
      const ps   = this.PLAYER_SCALE * psc;
      this._pLayers().forEach(s => s.setScale(ps * (1 - sq), ps * (1 + sq * 0.4)));
    } else {
      const ps = this.PLAYER_SCALE * psc;
      this._pLayers().forEach(s => s.setScale(ps, ps));
    }
  }

  _updateBallSprite() {
    const t  = Math.max(0, Math.min(1, (this._ballY - this.VP.y) / (this.BY - this.VP.y)));
    const sc = 0.38 + t * 0.76;
    this._ballSprite.setPosition(this._ballX, this._ballY).setScale(sc).setDepth(6.5 + t);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  _showMsg(text, color = '#ffff55', duration = 1500) {
    this._msgText.setText(text).setColor(color).setVisible(true);
    this.time.delayedCall(duration, () => {
      if (this._msgText?.active) this._msgText.setVisible(false);
    });
  }

  _exit() {
    this.scene.stop();
    this.scene.resume('GameScene');
    this.game.events.emit('basketballExit');
  }
}
