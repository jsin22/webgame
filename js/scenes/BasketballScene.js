/**
 * BasketballScene — "Super Pro-Hoops"
 *
 * 1-on-1 behind-the-back basketball with Super Punch-Out!! inspiration.
 *
 * GOAL: Score 5 baskets to move to the next round.
 * LOSS: 3 misses and you lose the round.
 *
 * OFFENSE  ARROWS  Move Left/Right/Up/Down
 *          D       Crossover (beat steal window)
 *          S       Spin move (beat steal window)
 *          SPACE   Hold to charge shot, release in green zone
 *
 * ESC — leave gym
 */

// Persistent state across gym visits
const _BB = (() => ({ round: 0 }))();

const BB_OPPONENTS = [
  {
    name: 'BIG DOG',
    difficulty: 'Easy',
    skin: 0xd4956a,
    shirt: 0xff4444,
    pants: 0x222222,
    reactionMs: 750,
    stealFreq: 0.15,
    speed: 350
  },
  {
    name: 'THE FLASH',
    difficulty: 'Normal',
    skin: 0x8d5524,
    shirt: 0xeeee00,
    pants: 0x4444ff,
    reactionMs: 500,
    stealFreq: 0.30,
    speed: 500
  },
  {
    name: 'GRANDMASTER',
    difficulty: 'Hard',
    skin: 0xebb495,
    shirt: 0x333333,
    pants: 0xff8800,
    reactionMs: 320,
    stealFreq: 0.55,
    speed: 650
  }
];

const BB_GOAL = 5;
const BB_MAX_MISSES = 3;
const BASE_CHARACTER_SCALE = 2.0;

class BasketballScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BasketballScene' });
  }

  create() {
    const W = this.W = this.scale.width;
    const H = this.H = this.scale.height;

    this.physics.world.gravity.y = 0;

    // Perspective Geometry
    this.VP           = { x: W / 2, y: 182 };  // vanishing point
    this.BY           = 548;                    // court bottom y
    this.RX           = W / 2;                  // rim x
    this.RY           = 152;                    // rim y
    this.PLY          = 454;                    // player sprite base y

    // Match State
    this.score  = 0;
    this.misses = 0;
    this.state  = 'menu'; // menu, offense, shot_arc, result, match_end

    // Gameplay Variables
    this.openness          = 0.3;
    this.shotClock         = 10.0;
    this._shotState        = 'none'; // none, pwr_hold, aim_tap
    this._pwrVal           = 0;      // 0..1
    this._pwrDir           = 1;
    this._aimVal           = 0.5;    // 0..1
    this._aimDir           = 1;
    this._stealWarnActive  = false;
    this._stealWarnTimer   = 0;
    this._stealDodgeActive = false;
    this._stealDodgeTimer  = 0;
    this._blockActive      = false;
    this._blockTimer       = 0;
    this._nextStealTimer   = 0;
    this._crossoverDir     = 0;
    this._crossoverTimer   = 0;
    this._spinActive       = false;
    this._spinTimer        = 0;
    this._defenderFrozen   = false;
    this._playerX          = W / 2;
    this._playerDepth      = 0.1; // 0..1
    this._pastDefender     = false;

    // Display Smoothing
    this._playerDispX     = W / 2;
    this._playerDispDepth = 0.1;

    this._inputBuffer = [];
    this._bufferTime  = 0;

    // Ball
    this._ballX = W / 2 + 18;
    this._ballY = this.PLY - 20;
    this._dribblePhase = 0;

    // Setup
    this._buildTextures();
    this._drawBg();
    this._drawCourt();
    this._drawHoop();
    this._buildPlayer();
    this._buildOpponent();
    this._buildBall();
    this._buildHUD();
    this._buildMeterUI();
    this._setupInput();

    this._showMenu();
  }

  // ── Textures ────────────────────────────────────────────────────────────────

  _buildTextures() {
    if (!this.textures.exists('bb_ball')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xe86010); g.fillCircle(13, 13, 13);
      g.lineStyle(1.5, 0x992200); g.strokeCircle(13, 13, 13);
      g.lineBetween(13, 0, 13, 26); g.lineBetween(0, 13, 26, 13);
      g.beginPath(); g.arc(13, 13, 8, 0.2 * Math.PI, 0.8 * Math.PI); g.strokePath();
      g.beginPath(); g.arc(13, 13, 8, 1.2 * Math.PI, 1.8 * Math.PI); g.strokePath();
      g.generateTexture('bb_ball', 26, 26);
      g.destroy();
    }
  }

  // ── Visuals ─────────────────────────────────────────────────────────────────

  _drawBg() {
    const g = this.add.graphics();
    const W = this.W, vpy = this.VP.y;
    g.fillStyle(0x09051a); g.fillRect(0, 0, W, vpy);
    g.fillStyle(0x14102a); g.fillRect(0, vpy, W, 28);
    g.fillStyle(0x0f0c22); g.fillRect(0, vpy + 28, W, 16);
    // Scoreboard
    g.fillStyle(0x1a1430); g.fillRect(W / 2 - 80, 38, 160, 70);
    g.lineStyle(2, 0x2a3460); g.strokeRect(W / 2 - 80, 38, 160, 70);
  }

  _drawCourt() {
    const g = this.add.graphics();
    const vpx = this.VP.x, vpy = this.VP.y, BY = this.BY, W = this.W;
    const perspX = (x0, y) => x0 + (vpx - x0) * (BY - y) / (BY - vpy);
    // Floor
    for (let y = vpy + 44; y < BY; y += 14) {
      const t = (y - vpy) / (BY - vpy);
      const r = Math.round(0x22 + t * 0x33);
      const gg = Math.round(0x11 + t * 0x22);
      const b  = Math.round(0x08 + t * 0x11);
      g.fillStyle((r << 16) | (gg << 8) | b);
      g.fillRect(0, y, W, 14);
    }
    // Lines
    g.lineStyle(1.5, 0x6a4618, 0.4);
    for (let bx = 0; bx <= W; bx += 64) g.lineBetween(bx, BY, perspX(bx, vpy + 6), vpy + 6);
    for (const hy of [438, 368, 300, 240]) g.lineBetween(perspX(0, hy), hy, perspX(W, hy), hy);
    // Paint
    g.lineStyle(2, 0x8a6830, 0.6);
    const KW = 120;
    g.lineBetween(perspX(vpx - KW, BY), BY, perspX(vpx - KW, 242), 242);
    g.lineBetween(perspX(vpx + KW, BY), BY, perspX(vpx + KW, 242), 242);
    g.lineBetween(perspX(vpx - KW, 242), 242, perspX(vpx + KW, 242), 242);
  }

  _drawHoop() {
    const g = this.add.graphics().setDepth(2);
    const rx = this.RX, ry = this.RY;
    g.fillStyle(0xeeeeee); g.fillRect(rx - 50, ry - 70, 100, 60);
    g.lineStyle(2, 0x888888); g.strokeRect(rx - 50, ry - 70, 100, 60);
    g.lineStyle(2, 0xff0000); g.strokeRect(rx - 25, ry - 45, 50, 32);
    g.lineStyle(6, 0xff5500); g.strokeEllipse(rx, ry + 5, 50, 18);
    g.lineStyle(1, 0xffffff, 0.5);
    for (let i = 0; i <= 6; i++) {
      const nx = rx - 24 + 48 / 6 * i;
      g.lineBetween(nx, ry + 5, nx + (i - 3) * 4, ry + 40);
    }
  }

  _buildPlayer() {
    const cd = window.characterData || {};
    const t  = h => parseInt((h || '#ffffff').replace('#', ''), 16);
    const bk = cd.gender === 'female' ? 'player_body_female' : 'player_body_male';
    const s  = BASE_CHARACTER_SCALE;
    this._pBody  = this.add.sprite(0, 0, bk, 8).setDepth(6.0).setAlpha(0.5).setScale(s);
    this._pShirt = this.add.sprite(0, 0, 'player_shirt', 8).setDepth(6.1).setAlpha(0.5).setTint(t(cd.colors?.shirt)).setScale(s);
    this._pPants = this.add.sprite(0, 0, 'player_pants', 8).setDepth(6.2).setAlpha(0.5).setTint(t(cd.colors?.pants)).setScale(s);
    this._pShoes = this.add.sprite(0, 0, 'player_shoes', 8).setDepth(6.3).setAlpha(0.5).setTint(t(cd.colors?.shoes)).setScale(s);
    this._pLayers = [this._pBody, this._pShirt, this._pPants, this._pShoes];
  }

  _buildOpponent() {
    const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
    const s   = BASE_CHARACTER_SCALE;
    this._oBody  = this.add.sprite(0, 0, 'player_body_male', 0).setDepth(5.0).setTint(opp.skin).setScale(s);
    this._oShirt = this.add.sprite(0, 0, 'player_shirt', 0).setDepth(5.1).setTint(opp.shirt).setScale(s);
    this._oPants = this.add.sprite(0, 0, 'player_pants', 0).setDepth(5.2).setTint(opp.pants).setScale(s);
    this._oShoes = this.add.sprite(0, 0, 'player_shoes', 0).setDepth(5.3).setScale(s);
    this._oLayers = [this._oBody, this._oShirt, this._oPants, this._oShoes];
    this._oPos = { x: 0, y: 340 };
  }

  _buildBall() {
    this._ball = this.add.image(0, 0, 'bb_ball').setDepth(8);
  }

  _buildHUD() {
    const W = this.W, H = this.H;
    this._hudText = this.add.text(W / 2, 40, '', {
      fontFamily: 'Courier New', fontSize: '20px', color: '#ffffff',
      stroke: '#000', strokeThickness: 4, align: 'center'
    }).setOrigin(0.5).setDepth(100).setVisible(false);

    this._missText = this.add.text(W / 2, 80, '', {
      fontFamily: 'Courier New', fontSize: '16px', color: '#ff5555',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(100).setVisible(false);

    this._openText = this.add.text(W / 2, 110, '', {
      fontFamily: 'Courier New', fontSize: '20px', color: '#00ffcc',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(100).setVisible(false);

    this._clockText = this.add.text(W / 2, 140, '', {
      fontFamily: 'Courier New', fontSize: '24px', color: '#ffffff',
      stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(100).setVisible(false);

    this._msgText = this.add.text(W / 2, H / 2 - 40, '', {
      fontFamily: 'Courier New', fontSize: '32px', color: '#ffff00',
      stroke: '#000', strokeThickness: 6
    }).setOrigin(0.5).setDepth(101).setVisible(false);

    this._stealWarn = this.add.text(W / 2, H / 2 + 60, 'STEAL!!', {
      fontFamily: 'Courier New', fontSize: '40px', color: '#ff0000',
      stroke: '#000', strokeThickness: 8
    }).setOrigin(0.5).setDepth(101).setVisible(false);
  }

  _buildMeterUI() {
    const W = this.W, H = this.H;
    this._meter = this.add.container(W / 2 + 100, H / 2).setDepth(100).setVisible(false);
    
    // Background
    const bg = this.add.rectangle(0, 0, 30, 200, 0x000000, 0.7).setStrokeStyle(2, 0xffffff);
    
    // Dynamic Sweet Spot (Will move based on distance)
    this._gz = this.add.rectangle(0, 0, 26, 30, 0x00ff00, 0.5); 
    
    // Filling bar
    this._fill = this.add.rectangle(0, 100, 26, 0, 0x00ffff).setOrigin(0.5, 1);
    
    this._meter.add([bg, this._gz, this._fill]);

    // Dotted Trajectory Line
    this._trajectory = this.add.graphics().setDepth(5).setVisible(false);
  }

  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN',
      d: 'D', s: 'S', space: 'SPACE', esc: 'ESC'
    });

    // Sequence tracking for all relevant keys
    ['LEFT', 'RIGHT', 'UP', 'DOWN'].forEach(k => {
      this._keys[k.toLowerCase()].on('down', () => this._onKeyDown(k));
    });

    this._keys.space.on('down', () => this._onSpaceDown());
    this._keys.space.on('up',   () => this._onSpaceUp());
    this._keys.d.on('down',     () => this._onCrossover());
    this._keys.s.on('down',     () => this._onSpin());
    this._keys.esc.on('down',   () => this._exit());
  }

  _onKeyDown(k) {
    this._inputBuffer.push(k);
    if (this._inputBuffer.length > 8) this._inputBuffer.shift();
    this._bufferTime = 0.6; // Slightly longer window for combos
  }

  // ── Game Logic ──────────────────────────────────────────────────────────────

  _showMenu() {
    this.state = 'menu';
    const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
    const bg = this.add.rectangle(this.W/2, this.H/2, this.W, this.H, 0x000000, 0.95).setDepth(200);
    
    const title = this.add.text(this.W/2, 80, `ROUND ${_BB.round + 1}\nVS ${opp.name}`, {
      fontFamily: 'Courier New', fontSize: '28px', color: '#ffffff', align: 'center', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(201);

    const diff = this.add.text(this.W/2, 140, `${opp.difficulty} Difficulty`, {
      fontFamily: 'Courier New', fontSize: '18px', color: '#ff5555'
    }).setOrigin(0.5).setDepth(201);

    const controls = this.add.text(this.W/2, 280, 
      'COMBO MOVES (PRESS IN ORDER):\n\n' +
      'CROSSOVER LEFT : ↓, ←, D\n' +
      'CROSSOVER RIGHT: ↓, →, D\n' +
      'SPIN LEFT     : →, ←, S\n' +
      'SPIN RIGHT    : ←, →, S\n\n' +
      'SHOOTING (SPACE):\n' +
      '1. Tap to Start Aim Swing\n' +
      '2. Tap to Lock Aim & Start Power\n' +
      '3. Hold then Release at Sweet Spot', {
      fontFamily: 'Courier New', fontSize: '18px', color: '#00ffcc', align: 'center', lineSpacing: 10
    }).setOrigin(0.5).setDepth(201);

    const start = this.add.text(this.W/2, 460, 'PRESS SPACE TO START', {
      fontFamily: 'Courier New', fontSize: '22px', color: '#ffff00', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(201);

    this.input.keyboard.once('keydown-SPACE', () => {
      bg.destroy(); title.destroy(); diff.destroy(); controls.destroy(); start.destroy();
      this._startRound();
    });
  }

  _startRound() {
    this.score = 0;
    this.misses = 0;
    this._startPossession();
  }

  _startPossession() {
    this.state = 'offense';
    this.openness = 0.3;
    this.shotClock = 10.0;
    this._playerX = this.W / 2;
    this._playerDepth = 0.1;
    this._pastDefender = false;
    this._shotState = 'none';
    this._chargeVal = 0;
    this._powerLevel = 0;
    if (this._pwrMarker) this._pwrMarker.setVisible(false);
    if (this._meter) this._meter.setVisible(false);
    if (this._trajectory) this._trajectory.setVisible(false);
    this._stealWarnActive = false;
    this._stealDodgeActive = false;
    this._oPos.y = 340;
    this._oPos.x = 0;
    this._resetStealTimer();
    
    this._hudText.setVisible(true);
    this._missText.setVisible(true);
    this._openText.setVisible(true);
    this._clockText.setVisible(true);

    this._updateHUD();
  }

  _resetStealTimer() {
    const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
    this._nextStealTimer = (1.5 + Math.random() * 2) / (opp.stealFreq + 0.5);
  }

  update(time, delta) {
    if (this.state === 'menu' || this.state === 'match_end') return;

    const dt = delta / 1000;
    
    if (this._bufferTime > 0) {
      this._bufferTime -= dt;
      if (this._bufferTime <= 0) this._inputBuffer = [];
    }

    this._updatePhysics(dt);
    this._updateVisuals(dt);
    this._updateHUD();
  }

  _updatePhysics(dt) {
    if (this.state === 'offense') {
      const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];

      // Shot Clock
      this.shotClock -= dt;
      if (this.shotClock <= 0) {
        this.shotClock = 0;
        this._onShotClockViolation();
        return;
      }

      // Player Movement
      if (!this._charging && this._crossoverTimer <= 0 && !this._spinActive && this._shotState === 'none') {
        let prevX = this._playerX;
        let prevDepth = this._playerDepth;

        if (this._keys.left.isDown)  this._playerX = Math.max(100, this._playerX - 350 * dt);
        if (this._keys.right.isDown) this._playerX = Math.min(700, this._playerX + 350 * dt);
        if (this._keys.up.isDown)    this._playerDepth = Math.min(1, this._playerDepth + 0.4 * dt);
        if (this._keys.down.isDown)  this._playerDepth = Math.max(0, this._playerDepth - 0.5 * dt);

        // Blocking Logic
        const defenderX = this.W / 2 + this._oPos.x;
        const defenderY = this._oPos.y;
        const playerY = this.PLY - this._playerDepth * 150;
        const distToDefenderX = Math.abs(this._playerX - defenderX);

        if (!this._pastDefender) {
           if (playerY < defenderY - 30) {
             this._pastDefender = true;
             this._stealWarnActive = false;
             this._stealDodgeActive = false;
             this._showMsg('PAST DEFENDER!', '#00ffcc');
           } else if (!this._spinActive && this._crossoverTimer <= 0) {
             if (Math.abs(playerY - defenderY) < 40) {
               if (distToDefenderX < 65) {
                  if (this._playerDepth > prevDepth) {
                    this._playerDepth = prevDepth;
                    this._triggerBlock();
                  }
               }
             }
           }
        }
      } else if (this._crossoverTimer > 0) {
        // Crossover move: Exactly 64px (1 character width at scale 2)
        // over 0.1s = 640 speed
        const speed = 640; 
        this._playerX = Phaser.Math.Clamp(this._playerX + this._crossoverDir * speed * dt, 100, 700);
      } else if (this._spinActive && this._spinTimer > 0) {
        // Spin moves player quickly side to side
        // To match crossover distance (64px) over 0.6s: speed = 107
        const speed = 107;
        this._playerX = Phaser.Math.Clamp(this._playerX + (this._spinDir || 0) * speed * dt, 100, 700);
      }

      // Timers (Moved after movement for better snappy feel)
      if (this._crossoverTimer > 0) {
        this._crossoverTimer -= dt;
        if (this._crossoverTimer <= 0) {
          this._crossoverTimer = 0;
          this._crossoverDir = 0;
        }
      }
      if (this._spinTimer > 0) {
        this._spinTimer -= dt;
        if (this._spinTimer <= 0) {
          this._spinTimer = 0;
          this._spinActive = false;
          this._spinDir = 0;
        }
      }

      // Defender Logic
      if (!this._pastDefender && !this._defenderFrozen) {
        // Mirror player (fast!)
        const targetX = this._playerX - this.W / 2;
        const dx = targetX - this._oPos.x;
        this._oPos.x += Math.sign(dx) * Math.min(Math.abs(dx), opp.speed * dt);

        // Defender Y tracking: try to stay close to player's depth
        const playerY = this.PLY - this._playerDepth * 150;
        let targetY = Phaser.Math.Clamp(playerY + 40, 280, 420);
        
        // Even closer during steal
        if (this._stealWarnActive || this._stealDodgeActive) targetY = playerY + 15;
        
        const dy = targetY - this._oPos.y;
        this._oPos.y += Math.sign(dy) * Math.min(Math.abs(dy), 180 * dt);

        // Openness Calculation based on distance
        const defenderX = this.W / 2 + this._oPos.x;
        const dX = (this._playerX - defenderX);
        const dY = (playerY - this._oPos.y);
        const dist = Math.sqrt(dX*dX + dY*dY);
        // Distance of 200+ is 100% open, distance of 40 is 10% open
        this.openness = Phaser.Math.Clamp((dist - 40) / 160, 0.1, 1.0);

        // Steal Timer
        if (!this._stealWarnActive && !this._stealDodgeActive && !this._blockActive) {
          this._nextStealTimer -= dt;
          if (this._nextStealTimer <= 0) this._triggerSteal();
        }
      } else if (this._pastDefender) {
        // Stay past for the rest of this possession
        // Defender stays exactly where they were when beaten
        this.openness = 1.0;
      }

      // Action States
      if (this._stealWarnActive) {
        this._stealWarnTimer -= dt;
        if (this._stealWarnTimer <= 0) {
          this._stealWarnActive = false;
          this._stealDodgeActive = true;
          this._stealDodgeTimer = opp.reactionMs / 1000;
        }
      } else if (this._stealDodgeActive) {
        this._stealDodgeTimer -= dt;
        if (this._stealDodgeTimer <= 0) {
          this._stealDodgeActive = false;
          this._onStolen();
        }
      } else if (this._blockActive) {
        this._blockTimer -= dt;
        if (this._blockTimer <= 0) {
          this._blockActive = false;
          this._stealWarn.setVisible(false);
        }
      }

      // Shot Meter Logic
      if (this._shotState === 'aim_swing') {
        const speed = 1.2 + (_BB.round * 0.2);
        this._aimVal += this._aimDir * speed * dt;
        if (this._aimVal > 1) { this._aimVal = 1; this._aimDir = -1; }
        if (this._aimVal < 0) { this._aimVal = 0; this._aimDir = 1; }
      } else if (this._shotState === 'pwr_charge') {
        // Ping-pong fill while holding
        this._pwrVal += this._pwrDir * 1.5 * dt;
        if (this._pwrVal > 1) { this._pwrVal = 1; this._pwrDir = -1; }
        if (this._pwrVal < 0) { this._pwrVal = 0; this._pwrDir = 1; }
        // With origin (0.5, 1) and y=100, height grows UP
        this._fill.setSize(26, this._pwrVal * 200);
      }
    } else if (this.state === 'shot_arc') {
      this._updateBallArc(dt);
    }
  }

  _triggerSteal() {
    this._stealWarnActive = true;
    this._stealWarnTimer = 0.5;
    this._stealWarn.setText('STEAL ATTEMPT!').setVisible(true);
    this.tweens.add({
      targets: this._stealWarn, alpha: { from: 1, to: 0 }, duration: 100, yoyo: true, repeat: 3
    });
  }

  _triggerBlock(msg = 'BLOCKED!') {
    if (this._blockActive) return;
    this._blockActive = true;
    this._blockTimer = 1.0;
    this._stealWarn.setText(msg).setVisible(true);
    this.tweens.add({
      targets: this._stealWarn, alpha: { from: 1, to: 0 }, duration: 100, yoyo: true, repeat: 3
    });
    // Push back to start and reset states
    this._playerX = this.W / 2;
    this._playerDepth = 0.1;
    this._spinActive = false;
    this._spinTimer = 0;
    this._spinDir = 0;
    this._crossoverTimer = 0;
    this._crossoverDir = 0;
    this.cameras.main.shake(250, 0.015);
  }

  _onStolen() {
    this._stealWarn.setVisible(false);
    this._showMsg('STOLEN!', '#ff0000');
    this.cameras.main.shake(200, 0.02);
    this.misses++;
    this.state = 'result';

    if (this.misses >= BB_MAX_MISSES) {
      this.time.delayedCall(1000, () => this._lose());
    } else {
      this.time.delayedCall(1000, () => this._startPossession());
    }
  }

  _onShotClockViolation() {
    this._showMsg('SHOT CLOCK!', '#ff0000');
    this.cameras.main.shake(200, 0.02);
    this.misses++;
    this.state = 'result';

    if (this.misses >= BB_MAX_MISSES) {
      this.time.delayedCall(1000, () => this._lose());
    } else {
      this.time.delayedCall(1000, () => this._startPossession());
    }
  }

  _onCrossover() {
    if (this.state !== 'offense' || this._crossoverTimer > 0 || this._spinActive || this._pastDefender) return;

    // SF Combo check (Sequential)
    const buf = this._inputBuffer;
    const len = buf.length;
    let dir = 0;

    // Check last 2 entries: DOWN -> LEFT or DOWN -> RIGHT
    if (len >= 2) {
      const prev = buf[len-1];
      const pprev = buf[len-2];
      if (pprev === 'DOWN' && prev === 'LEFT') dir = -1;
      if (pprev === 'DOWN' && prev === 'RIGHT') dir = 1;
    }

    if (dir === 0) return;

    this._inputBuffer = []; // Clear on success
    this._crossoverDir = dir;
    this._crossoverTimer = 0.1; // Snappy move

    const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
    let failChance = 0.35; // Easy (Round 1)
    if (opp.difficulty === 'Normal') failChance = 0.55; // Normal (Round 2)
    if (opp.difficulty === 'Hard')   failChance = 0.80; // Hard (Round 3)

    if (this._stealDodgeActive || this._stealWarnActive || Math.random() > failChance) {
      this._beatDefender('CROSSOVER!', 0.3);
    } else {
      this._triggerBlock('CROSSOVER BLOCKED');
    }
    }

  _onSpin() {
    if (this.state !== 'offense' || this._spinActive || this._crossoverTimer > 0 || this._pastDefender) return;

    // SF Combo check (Sequential)
    const buf = this._inputBuffer;
    const len = buf.length;
    let dir = 0;

    // Check last 2 entries: LEFT -> RIGHT or RIGHT -> LEFT
    if (len >= 2) {
      const prev = buf[len-1];
      const pprev = buf[len-2];
      if (pprev === 'LEFT' && prev === 'RIGHT') dir = 1;
      if (pprev === 'RIGHT' && prev === 'LEFT') dir = -1;
    }

    if (dir === 0) return;

    this._inputBuffer = []; // Clear on success
    this._spinActive = true;
    this._spinTimer = 0.6;
    this._spinDir = dir;
    this._defenderFrozen = true;

    const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
    let failChance = 0.30; // Easy (Round 1)
    if (opp.difficulty === 'Normal') failChance = 0.50; // Normal (Round 2)
    if (opp.difficulty === 'Hard')   failChance = 0.75; // Hard (Round 3)

    // Spin can dodge steals too
    if (this._stealDodgeActive || this._stealWarnActive) {
      failChance = 0; // Guaranteed escape if timed during steal attempt
    }

    if (Math.random() < failChance) {
       this.time.delayedCall(400, () => {
         this._defenderFrozen = false;
         this._triggerBlock('SPIN BLOCKED');
       });
       return;
    }

    this.time.delayedCall(400, () => {
      this._defenderFrozen = false;
      this._beatDefender('SPIN MOVE!', 0.25);
      this.tweens.add({
        targets: this,
        _playerDepth: Math.min(1.0, this._playerDepth + 0.35),
        duration: 300,
        ease: 'Quad.easeOut'
      });
    });
  }

  _beatDefender(msg, bonus) {
    this._stealDodgeActive = false;
    this._stealWarn.setVisible(false);
    this._pastDefender = true;
    this.openness = 1.0;
    this._showMsg(msg, '#00ffcc');
    
    // Stumble animation for defender - NO YOYO (stay in the stumble position)
    this.tweens.add({ 
      targets: this._oPos, 
      x: this._oPos.x + (Math.random() < 0.5 ? -80 : 80), 
      y: this._oPos.y + 40,
      duration: 300, 
      ease: 'Quad.easeOut' 
    });
  }

  _onSpaceDown() {
    if (this.state !== 'offense' || this._stealDodgeActive || this._stealWarnActive) return;

    if (this._shotState === 'none') {
      // Step 1: Trigger - Plant feet and start aim swing
      this._shotState = 'aim_swing';
      this._aimVal = 0.5;
      this._aimDir = 1;
      this._trajectory.setVisible(true).setAlpha(1);
    } else if (this._shotState === 'aim_swing') {
      // Step 2: Aim - Stop aim swing and start power charge
      this._shotState = 'pwr_charge';
      this._pwrVal = 0;
      this._pwrDir = 1;
      this._meter.setVisible(true);
    }
  }

  _onSpaceUp() {
    if (this.state === 'offense' && this._shotState === 'pwr_charge') {
      // Step 3: Power - Release to launch ball
      this._shoot();
      this._shotState = 'none';
      this._meter.setVisible(false);
      this._trajectory.setVisible(false);
    }
  }

  _shoot() {
    const pwr = this._pwrVal;
    const aim = this._aimVal;
    
    // 1. Power Accuracy (Distance-based sweet spot)
    const sweetSpot = 0.9 - (this._playerDepth * 0.6);
    const pwrDist = Math.abs(pwr - sweetSpot);
    
    // Half-range of the green zone in 0..1 scale
    const pwrRange = (this._gz.height / 200) / 2;
    
    let pwrAcc = 0;
    if (pwrDist < pwrRange) {
      pwrAcc = 1.0;
    } else if (pwr < sweetSpot - 0.25) {
      this._showMsg('AIRBALL! (Short)', '#ff5555');
      pwrAcc = 0.0;
    } else if (pwr > sweetSpot + 0.25) {
      this._showMsg('CLANK! (Too Hard)', '#ff5555');
      pwrAcc = 0.0;
    } else {
      pwrAcc = Math.max(0, 1.0 - (pwrDist / 0.3));
    }

    // 2. Aim Accuracy (Trajectory timing)
    const aimDist = Math.abs(aim - 0.5);
    let aimAcc = 0;
    if (aimDist < 0.08) { 
      aimAcc = 1.0;
    } else {
      aimAcc = Math.max(0, 1.0 - (aimDist / 0.4));
    }

    const accuracy = pwrAcc * aimAcc;
    const made = Math.random() < (this.openness * accuracy + this._playerDepth * 0.2);
    
    this.state = 'shot_arc';
    this._startBallArc(made);
  }

  _startBallArc(made) {
    this._arcT = 0;
    this._arcMade = made;
    this._arcSx = this._playerDispX;
    this._arcSy = this._pBody.y - 40;
    this._arcEx = this.RX;
    this._arcEy = this.RY;
    this._arcCx = (this._arcSx + this._arcEx) / 2;
    this._arcCy = Math.min(this._arcSy, this._arcEy) - 150;
  }

  _updateBallArc(dt) {
    this._arcT += dt * 1.2;
    const t = Math.min(1, this._arcT);
    this._ballX = (1 - t) * (1 - t) * this._arcSx + 2 * (1 - t) * t * this._arcCx + t * t * this._arcEx;
    this._ballY = (1 - t) * (1 - t) * this._arcSy + 2 * (1 - t) * t * this._arcCy + t * t * this._arcEy;

    if (t >= 1) {
      this._onShotResult(this._arcMade);
    }
  }

  _onShotResult(made) {
    this.state = 'result';
    if (made) {
      this.score++;
      this._showMsg('GOAL!', '#00ff00');
      this.cameras.main.shake(200, 0.015);
      GameState.addMoney(5);
    } else {
      this.misses++;
      this._showMsg('MISS!', '#ff0000');
    }

    if (this.score >= BB_GOAL) {
      this.time.delayedCall(1500, () => this._win());
    } else if (this.misses >= BB_MAX_MISSES) {
      this.time.delayedCall(1500, () => this._lose());
    } else {
      this.time.delayedCall(1200, () => this._startPossession());
    }
  }

  _win() {
    this.state = 'match_end';
    _BB.round++;
    this._showEndScreen(true);
  }

  _lose() {
    this.state = 'match_end';
    this._showEndScreen(false);
  }

  _showEndScreen(won) {
    const W = this.W, H = this.H;
    
    // Hide HUD
    this._hudText.setVisible(false);
    this._missText.setVisible(false);
    this._openText.setVisible(false);
    this._clockText.setVisible(false);

    const bg = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.9).setDepth(200);
    const title = won ? 'VICTORY!' : 'GAME OVER';
    const col = won ? '#00ff00' : '#ff0000';
    this.add.text(W/2, H/2 - 60, title, { fontFamily: 'Courier New', fontSize: '48px', color: col }).setOrigin(0.5).setDepth(201);
    
    const btn = this.add.rectangle(W/2, H/2 + 60, 200, 40, 0x333333).setInteractive({ useHandCursor: true }).setDepth(201);
    this.add.text(W/2, H/2 + 60, won ? 'NEXT ROUND' : 'TRY AGAIN', { fontFamily: 'Courier New', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setDepth(202);
    
    btn.on('pointerup', () => {
      this.scene.restart();
    });

    const leave = this.add.text(W/2, H/2 + 110, 'ESC to Leave', { fontFamily: 'Courier New', fontSize: '14px', color: '#888888' }).setOrigin(0.5).setDepth(201);
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _getPerspectiveScale(y) {
    // Map Y from VP.y to BY to a scale factor 0.4 to 1.0
    const t = (y - this.VP.y) / (this.BY - this.VP.y);
    return 0.4 + t * 0.6;
  }

  _updateVisuals(dt) {
    this._dribblePhase = (this._dribblePhase + dt * 10) % (Math.PI * 2);

    // Smooth player
    const lerpX = this._crossoverTimer > 0 ? 0.35 : 0.15;
    this._playerDispX += (this._playerX - this._playerDispX) * lerpX;
    this._playerDispDepth += (this._playerDepth - this._playerDispDepth) * 0.15;

    const py = this.PLY - this._playerDispDepth * 150;
    const ps = BASE_CHARACTER_SCALE * this._getPerspectiveScale(py);

    this._pLayers.forEach(l => {
      l.setPosition(this._playerDispX, py);
      l.setScale(ps);
      // Animation frames
      let f = 12; // default idle facing away (UP)
      if (this._spinActive) {
        // Spin visuals: scaling squeeze effect + direction cycling
        const squeeze = 1.0 + Math.sin(this._spinTimer * 20) * 0.2;
        l.setScale(ps * squeeze, ps);
        
        const spinFrames = [0, 4, 12, 8];
        const idx = Math.floor(Date.now() / 100) % 4;
        f = spinFrames[idx];
        l.angle = 0;
      } else {
        l.angle = 0;
        if (this._crossoverDir !== 0) {
          f = (this._crossoverDir < 0 ? 4 : 8) + (Math.floor(Date.now() / 100) % 4);
          // Better crossover animation: tilt and slight hop
          l.angle = this._crossoverDir * 15;
          l.y -= 10; 
        } else {
          f = 12; // idle dribble facing basket
        }
      }
      l.setFrame(f);
    });

    // Opponent
    const oy = this._oPos.y;
    const ox = this.W / 2 + this._oPos.x;
    const os = BASE_CHARACTER_SCALE * this._getPerspectiveScale(oy);

    this._oLayers.forEach(l => {
      l.setPosition(ox, oy);
      l.setScale(os);

      let f = Math.floor(Date.now() / 150) % 4; // idle/walk
      if (this._blockActive) {
        f = 12 + (Math.floor(Date.now() / 100) % 4); // hands up
      } else if (this._stealWarnActive || this._stealDodgeActive) {
        // Reaching motion
        f = (this._oPos.x < 0 ? 4 : 8) + (Math.floor(Date.now() / 100) % 4);
      }
      l.setFrame(f);
    });

    // Ball
    if (this.state === 'offense') {
      this._ballX = this._playerDispX + 20;
      this._ballY = py - 10 + Math.sin(this._dribblePhase) * 15;
    }
    this._ball.setPosition(this._ballX, this._ballY);
    this._ball.setScale(this._getPerspectiveScale(this._ballY) * 0.8);

    // Dynamic Shot Meter
    // Scale aggressively by depth AND distance to defender
    const playerY = this.PLY - this._playerDispDepth * 150;
    const defenderX = this.W / 2 + this._oPos.x;
    const dX = (this._playerDispX - defenderX);
    const dY = (playerY - this._oPos.y);
    const distToDefender = Math.sqrt(dX*dX + dY*dY);

    const clockFactor = 0.2 + (this.shotClock / 10.0) * 0.8;
    
    let baseGw = 10;
    if (this._pastDefender) {
      baseGw = 80 + (this._playerDepth * 40);
    } else {
      const challengePenalty = Phaser.Math.Clamp((distToDefender - 40) / 160, 0.1, 1.0);
      baseGw = (10 + (this._playerDepth * 30)) * challengePenalty;
    }

    const gw = baseGw * clockFactor;
    const finalSize = Phaser.Math.Clamp(gw / 2, 8, 60);
    this._gz.height = finalSize;
    
    // Position sweet spot based on distance
    const sweetSpot = 0.9 - (this._playerDepth * 0.6);
    this._gz.y = 100 - (sweetSpot * 200);

    // Draw Trajectory Line
    this._trajectory.clear();
    // Show during BOTH aim swing and power charge phases
    if (this._shotState === 'aim_swing' || this._shotState === 'pwr_charge') {
      const sx = this._playerDispX;
      const sy = py - 40;
      // Target moves based on aimVal
      const targetX = this.RX + (this._aimVal - 0.5) * 400;
      const targetY = this.RY;
      
      this._trajectory.lineStyle(2, 0xffffff, 0.6);
      // Simple dotted line
      const points = 10;
      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const px = sx + (targetX - sx) * t;
        const py_ = sy + (targetY - sy) * t - Math.sin(t * Math.PI) * 100;
        if (i % 2 === 0) {
          const nextT = (i+0.5) / points;
          const npx = sx + (targetX - sx) * nextT;
          const npy = sy + (targetY - sy) * nextT - Math.sin(nextT * Math.PI) * 100;
          this._trajectory.lineBetween(px, py_, npx, npy);
        }
      }
    }
  }

  _updateHUD() {
    const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
    this._hudText.setText(`SCORE: ${this.score} / ${BB_GOAL}\nROUND ${_BB.round + 1}: ${opp.name}`);
    
    let missesStr = '';
    for(let i=0; i<BB_MAX_MISSES; i++) {
      missesStr += (i < this.misses) ? '✘ ' : '○ ';
    }
    this._missText.setText(`MISSES: ${missesStr}`);

    const openPct = Math.round(this.openness * 100);
    this._openText.setText(`OPEN: ${openPct}%`);
    this._openText.setColor(openPct > 70 ? '#00ff00' : (openPct > 40 ? '#ffff00' : '#ff5555'));

    this._clockText.setText(`CLOCK: ${Math.ceil(this.shotClock)}`);
    this._clockText.setColor(this.shotClock < 3 ? '#ff0000' : '#ffffff');
  }

  _showMsg(text, color) {
    this._msgText.setText(text).setColor(color).setVisible(true);
    this.tweens.add({ targets: this._msgText, scale: { from: 0.5, to: 1.2 }, alpha: { from: 1, to: 0 }, duration: 1000, onComplete: () => this._msgText.setVisible(false) });
  }

  _exit() {
    this.game.events.emit('basketballExit');
    this.scene.stop();
    this.scene.resume('GameScene');
  }
}
