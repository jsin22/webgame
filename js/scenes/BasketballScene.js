/**
 * BasketballScene — "NBA Jam Style 1-on-1"
 *
 * Side-view arcade basketball.
 *
 * CONTROLS:
 * - ARROWS: Move
 * - SPACE: Jump (release at apex to shoot; turbo dunk in paint zone)
 * - SHIFT: Turbo — 1.5x speed/jump, enables dunk in paint zone
 * - D: Shove (stuns opponent and knocks ball loose)
 * - ESC: Quit
 */

// Constants for test compatibility
const _BB = { round: 0 };
const BB_GOAL = 5;
const BB_MAX_MISSES = 3;
const BB_OPPONENTS = [
  { name: 'BIG DOG',     difficulty: 'Easy',   speed: 250, stealFreq: 0.1 },
  { name: 'THE FLASH',   difficulty: 'Normal', speed: 350, stealFreq: 0.2 },
  { name: 'GRANDMASTER', difficulty: 'Hard',   speed: 450, stealFreq: 0.3 }
];

const BB_TURBO_MAX      = 100;
const BB_TURBO_DRAIN    = 30;   // per second while active
const BB_TURBO_REGEN    = 15;   // per second while inactive
const BB_TURBO_MULT     = 1.5;  // speed & jump multiplier
const BB_PAINT_X        = 550;  // x threshold for "paint zone" (near hoop)
const BB_STUN_DURATION  = 900;  // ms

class BasketballScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BasketballScene' });
    }

    create() {
        const W = this.W = this.scale.width;
        const H = this.H = this.scale.height;

        this.COURT_Y      = 480;
        this.COURT_TOP    = 350;
        this.COURT_LEFT   = 60;          // half-court line
        this.COURT_RIGHT  = W - 60;      // baseline (before backboard)
        this.HOOP_X       = W - 100;
        this.HOOP_Y       = 220;
        this.RIM_X        = this.HOOP_X - 25;
        this.RIM_Y        = this.HOOP_Y + 10;

        // Scene-level flow state: 'controls', 'playing', 'dunking', 'goal', 'transition'
        this.state        = 'controls';
        this.hasBall      = 'player';
        this.playerScore  = 0;
        this.opponentScore = 0;
        this.turbo        = BB_TURBO_MAX;

        this._setupVisuals();
        this._setupEntities();
        this._setupInput();
        this._setupPhysics();
        this._showControls();
    }

    _setupVisuals() {
        const g = this.add.graphics();

        // Sky / wall
        g.fillStyle(0x1a1a2e);
        g.fillRect(0, 0, this.W, this.COURT_Y);

        // Floor
        g.fillStyle(0x332211);
        g.fillRect(0, this.COURT_Y, this.W, this.H - this.COURT_Y);

        // Paint zone (semi-transparent highlight near hoop)
        g.fillStyle(0xffa500, 0.12);
        g.fillRect(BB_PAINT_X, this.COURT_TOP, this.COURT_RIGHT - BB_PAINT_X, this.COURT_Y - this.COURT_TOP);

        // Court boundary lines — full rectangle
        const CL = this.COURT_LEFT, CR = this.COURT_RIGHT;
        const CT = this.COURT_TOP,  CY = this.COURT_Y;
        g.lineStyle(3, 0xffffff, 0.5);
        g.lineBetween(CL, CY, CR, CY);          // near sideline (bottom)
        g.lineBetween(CL, CT, CR, CT);          // far sideline  (top)
        g.lineBetween(CL, CT, CL, CY);          // half-court line (left)
        g.lineBetween(CR, CT, CR, CY);          // baseline       (right)

        // Half-court circle stub
        g.lineStyle(2, 0xffffff, 0.3);
        g.beginPath();
        g.arc(CL, (CY + CT) / 2, 40, -Math.PI / 2, Math.PI / 2);
        g.strokePath();

        // Three-point arc
        g.lineStyle(3, 0xffffff, 0.4);
        g.beginPath();
        g.arc(this.HOOP_X, (CY + CT) / 2, 200, Math.PI / 2, 3 * Math.PI / 2);
        g.strokePath();

        this._drawHoop();

        // Score
        this.scoreText = this.add.text(this.W / 2, 50, 'PLAYER 0 - 0 CPU', {
            fontFamily: 'monospace', fontSize: '32px', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setStroke('#000000', 6);

        // Turbo bar
        this.add.rectangle(this.W / 2, 90, 200, 14, 0x333333).setOrigin(0.5);
        this.turboBar = this.add.rectangle(this.W / 2 - 99, 90, 198, 10, 0x00aacc).setOrigin(0, 0.5);
        this.add.text(this.W / 2 - 107, 90, 'TURBO', {
            fontFamily: 'monospace', fontSize: '10px', color: '#00ccff'
        }).setOrigin(1, 0.5);

        // Big message (SWISH, BOOMSHAKALAKA, etc.)
        this.msgText = this.add.text(this.W / 2, this.H / 2, '', {
            fontFamily: 'monospace', fontSize: '64px', color: '#ffff00', fontStyle: 'bold'
        }).setOrigin(0.5).setStroke('#000000', 8).setVisible(false);

        // Shot accuracy feedback
        this.accText = this.add.text(this.W / 2, this.H / 2 - 80, '', {
            fontFamily: 'monospace', fontSize: '28px', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setStroke('#000000', 4).setVisible(false);
    }

    _drawHoop() {
        const g = this.add.graphics().setDepth(10);
        const x = this.HOOP_X, y = this.HOOP_Y;

        // Backboard
        g.fillStyle(0xffffff);
        g.fillRect(x, y - 60, 10, 80);
        g.lineStyle(2, 0x888888);
        g.strokeRect(x, y - 60, 10, 80);

        // Rim
        g.lineStyle(4, 0xff5500);
        g.lineBetween(x - 40, y + 10, x, y + 10);

        // Net
        g.lineStyle(1, 0xffffff, 0.6);
        for (let i = 0; i < 5; i++) {
            g.lineBetween(x - 35 + i * 8, y + 10, x - 35 + i * 8 + (i - 2) * 2, y + 40);
        }
    }

    _setupEntities() {
        const cd = window.characterData || {};
        const s  = 1.5; // ~72px tall on a 560px screen ≈ 13% — "small agile athlete"

        // Player — per-entity state: idle | dribbling | shooting | stunned
        this.player = this.add.container(200, this.COURT_Y);
        this.playerSprite = this.add.sprite(0, 0,
            cd.gender === 'female' ? 'player_body_female' : 'player_body_male', 0).setScale(s);
        this.playerShirt = this.add.sprite(0, 0, 'player_shirt', 0).setScale(s)
            .setTint(this._parseColor(cd.colors?.shirt));
        this.playerPants = this.add.sprite(0, 0, 'player_pants', 0).setScale(s)
            .setTint(this._parseColor(cd.colors?.pants));
        this.player.add([this.playerSprite, this.playerShirt, this.playerPants]);
        this.player.floorY      = this.COURT_Y;
        this.player.jumpV       = 0;
        this.player.isJumping   = false;
        this.player.entityState = 'dribbling'; // starts with ball
        this.player.stunTimer   = 0;

        // Opponent
        const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
        this.opponent = this.add.container(600, this.COURT_Y);
        this.oppSprite = this.add.sprite(0, 0, 'player_body_male', 0).setScale(s).setTint(0xcc9988);
        this.oppShirt  = this.add.sprite(0, 0, 'player_shirt',     0).setScale(s).setTint(0xff4444);
        this.oppPants  = this.add.sprite(0, 0, 'player_pants',     0).setScale(s).setTint(0x222222);
        this.opponent.add([this.oppSprite, this.oppShirt, this.oppPants]);
        this.opponent.floorY      = this.COURT_Y;
        this.opponent.jumpV       = 0;
        this.opponent.isJumping   = false;
        this.opponent.speed       = opp.speed;
        this.opponent.entityState = 'idle';
        this.opponent.stunTimer   = 0;

        // Ball
        this.ball = this.add.circle(0, 0, 10, 0xe86010).setStrokeStyle(2, 0x000000);
        this.ball.vx      = 0;
        this.ball.vy      = 0;
        this.ball.isInAir = false;
    }

    _parseColor(hex) {
        return parseInt((hex || '#ffffff').replace('#', ''), 16);
    }

    _setupInput() {
        this.keys = this.input.keyboard.addKeys({
            up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
            space: 'SPACE', d: 'D', esc: 'ESC', turbo: 'SHIFT'
        });

        this.keys.esc.on('down', () => this._exit());

        this.keys.space.on('down', () => {
            if (this.state !== 'playing') return;
            if (this.player.entityState === 'stunned') return;
            this._handleJump('player');
        });

        this.keys.space.on('up', () => {
            if (this.state !== 'playing') return;
            if (this.hasBall === 'player' && this.player.isJumping) {
                this._shoot('player');
            }
        });

        this.keys.d.on('down', () => {
            if (this.state !== 'playing') return;
            if (this.player.entityState === 'stunned') return;
            this._shove('player');
        });
    }

    _setupPhysics() {
        this.GRAVITY        = 0.3;   // Player jump gravity — lower for "hang time"
        this.APEX_GRAVITY   = 0.08;  // Very floaty at jump apex
        this.APEX_THRESHOLD = 1.5;   // |jumpV| < this => at apex (narrower = shorter hang time)
        this.BALL_GRAVITY   = 0.6;   // Separate ball gravity — keeps shot trajectories correct
        this.JUMP_POWER     = -8;    // Smaller = lower jump (apex ~120px above floor, below rim)
        this.MOVE_SPEED     = 300;
    }

    _showControls() {
        const cx = this.W / 2, cy = this.H / 2;

        const overlay = this.add.rectangle(cx, cy, this.W, this.H, 0x000000, 0.72).setDepth(200);
        const panel   = this.add.rectangle(cx, cy, 460, 310, 0x0a0a2a, 1)
            .setStrokeStyle(2, 0x3355ff).setDepth(201);

        const rows = [
            { text: 'CONTROLS',                          color: '#ffff00', size: 26, bold: true  },
            { text: '',                                  color: '',        size: 6              },
            { text: '\u2190 \u2192 \u2191 \u2193   Move',               color: '#ffffff', size: 18 },
            { text: 'SHIFT       Turbo  (1.5\u00d7 speed & jump)',     color: '#00ccff', size: 18 },
            { text: 'SPACE       Jump / release at apex to shoot',     color: '#ffffff', size: 18 },
            { text: 'D           Shove  (stun + knock ball loose)',    color: '#ffffff', size: 18 },
            { text: 'ESC         Exit gym',                            color: '#aaaaaa', size: 16 },
            { text: '',                                  color: '',        size: 6              },
            { text: 'Turbo + \u2192 inside orange zone = DUNK',        color: '#ff8800', size: 16 },
            { text: '',                                  color: '',        size: 8              },
            { text: 'PRESS ANY KEY TO START',            color: '#ffff00', size: 20, bold: true  },
        ];

        const textObjs = [];
        let y = cy - 138;
        for (const row of rows) {
            if (!row.text) { y += row.size; continue; }
            textObjs.push(
                this.add.text(cx, y, row.text, {
                    fontFamily: 'monospace',
                    fontSize:   `${row.size}px`,
                    color:      row.color,
                    fontStyle:  row.bold ? 'bold' : 'normal'
                }).setOrigin(0.5, 0).setDepth(202)
            );
            y += row.size + 4;
        }

        const dismiss = () => {
            overlay.destroy();
            panel.destroy();
            textObjs.forEach(t => t.destroy());
            this._showIntro();
        };
        this.input.keyboard.once('keydown', dismiss);
    }

    _showIntro() {
        const opp = BB_OPPONENTS[_BB.round % BB_OPPONENTS.length];
        this._showMsg('VS ' + opp.name, '#ffffff', 2000);
        this.time.delayedCall(2000, () => {
            this._showMsg('START!', '#ffff00', 1000);
            this.time.delayedCall(600, () => { this.state = 'playing'; });
        });
    }

    update(time, delta) {
        const dt = delta / 1000;
        if (this.state === 'transition' || this.state === 'controls') return;

        this._updateTurbo(dt);
        this._updateStun(dt);
        this._handlePlayerMovement(dt, time);
        this._handleOpponentAI(dt, time);
        this._updateJumpPhysics(this.player, dt);
        this._updateJumpPhysics(this.opponent, dt);
        this._updateBallPhysics(dt);
        this._checkCollisions();
        this._updateZOrdering();
    }

    _updateTurbo(dt) {
        const active = this.keys.turbo.isDown && this.turbo > 0 && this.player.entityState !== 'stunned';
        if (active) {
            this.turbo = Math.max(0, this.turbo - BB_TURBO_DRAIN * dt);
        } else {
            this.turbo = Math.min(BB_TURBO_MAX, this.turbo + BB_TURBO_REGEN * dt);
        }
        this.turboBar.width = (this.turbo / BB_TURBO_MAX) * 198;
        this.turboBar.setFillStyle(active ? 0x00ffff : (this.turbo < 20 ? 0x885500 : 0x00aacc));
    }

    _updateStun(dt) {
        for (const [ent, key] of [[this.player, 'player'], [this.opponent, 'opponent']]) {
            if (ent.entityState === 'stunned') {
                ent.stunTimer -= dt * 1000;
                if (ent.stunTimer <= 0) {
                    ent.entityState = this.hasBall === key ? 'dribbling' : 'idle';
                }
            }
        }
    }

    _handlePlayerMovement(dt, time) {
        if (this.state !== 'playing') return;
        if (this.player.entityState === 'stunned') return;

        const turboActive = this.keys.turbo.isDown && this.turbo > 0;
        const speed = this.MOVE_SPEED * (turboActive ? BB_TURBO_MULT : 1);

        let dx = 0, dy = 0;
        if (this.keys.left.isDown)  dx -= 1;
        if (this.keys.right.isDown) dx += 1;
        if (this.keys.up.isDown)    dy -= 0.6;
        if (this.keys.down.isDown)  dy += 0.6;

        if (dx !== 0 || dy !== 0) {
            const mag = Math.sqrt(dx * dx + dy * dy);
            const vx  = (dx / mag) * speed;
            const vy  = (dy / mag) * speed;

            this.player.x      += vx * dt;
            this.player.floorY += vy * dt;

            this.player.x      = Phaser.Math.Clamp(this.player.x,      this.COURT_LEFT, this.COURT_RIGHT);
            this.player.floorY = Phaser.Math.Clamp(this.player.floorY, this.COURT_TOP,  this.COURT_Y);

            const frame = vx > 0 ? 8 : (vx < 0 ? 4 : (vy > 0 ? 0 : 12));
            this._setFrame(this.player, frame + (Math.floor(time / 150) % 4));

            if (!this.player.isJumping) {
                this.player.entityState = this.hasBall === 'player' ? 'dribbling' : 'idle';
            }
        } else {
            this._setFrame(this.player, 0);
            if (!this.player.isJumping && this.player.entityState !== 'stunned') {
                this.player.entityState = this.hasBall === 'player' ? 'dribbling' : 'idle';
            }
        }
    }

    _handleOpponentAI(dt, time) {
        if (this.state !== 'playing') return;
        if (this.opponent.entityState === 'stunned') return;

        const targetX = this.hasBall === 'player' ? this.player.x
                      : this.hasBall === 'none'   ? this.ball.x
                      : this.HOOP_X - 150;
        const targetY = this.hasBall === 'player' ? this.player.floorY
                      : this.hasBall === 'none'   ? (this.ball.floorY || this.ball.y)
                      : (this.COURT_Y + this.COURT_TOP) / 2;

        const dx   = targetX - this.opponent.x;
        const dy   = targetY - this.opponent.floorY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 20) {
            const vx = (dx / dist) * this.opponent.speed;
            const vy = (dy / dist) * this.opponent.speed * 0.6;
            this.opponent.x      += vx * dt;
            this.opponent.floorY += vy * dt;
            this.opponent.x      = Phaser.Math.Clamp(this.opponent.x,      this.COURT_LEFT, this.COURT_RIGHT);
            this.opponent.floorY = Phaser.Math.Clamp(this.opponent.floorY, this.COURT_TOP,  this.COURT_Y);
            const frame = vx > 0 ? 8 : (vx < 0 ? 4 : (vy > 0 ? 0 : 12));
            this._setFrame(this.opponent, frame + (Math.floor(time / 150) % 4));
        } else {
            this._setFrame(this.opponent, 0);
            if (this.hasBall === 'player' && !this.opponent.isJumping) {
                if (this.player.isJumping) {
                    this._handleJump('opponent');
                } else if (Math.random() < 0.05) {
                    this._shove('opponent');
                }
            }
        }

        // CPU drives and shoots when it has the ball
        if (this.hasBall === 'opponent' && !this.opponent.isJumping) {
            if (this.opponent.x > this.HOOP_X - 300) {
                this._handleJump('opponent');
                this.time.delayedCall(300 + Math.random() * 500, () => {
                    if (this.hasBall === 'opponent' && this.opponent.isJumping) this._shoot('opponent');
                });
            } else {
                this.opponent.x = Phaser.Math.Clamp(
                    this.opponent.x + this.opponent.speed * dt,
                    this.COURT_LEFT, this.COURT_RIGHT
                );
            }
        }
    }

    _setFrame(container, frame) {
        container.iterate(child => {
            if (child.setFrame) child.setFrame(frame);
        });
    }

    _handleJump(who) {
        const ent = who === 'player' ? this.player : this.opponent;
        if (ent.isJumping) return;
        if (ent.entityState === 'stunned') return;

        const turboActive = who === 'player' && this.keys.turbo.isDown && this.turbo > 0;
        ent.isJumping = true;
        ent.jumpV     = this.JUMP_POWER * (turboActive ? BB_TURBO_MULT : 1);

        // Turbo dunk: player moving toward hoop + turbo + in paint zone; CPU dunk when very close
        if (this.hasBall === who) {
            const movingTowardHoop = this.keys.right.isDown;
            const playerDunk = who === 'player' && turboActive && ent.x > BB_PAINT_X && movingTowardHoop;
            const cpuDunk    = who === 'opponent' && ent.x > this.HOOP_X - 150;
            if (playerDunk || cpuDunk) {
                this._dunk(who);
            }
        }
    }

    _updateJumpPhysics(ent, dt) {
        if (!ent.isJumping) {
            ent.y = ent.floorY;
            return;
        }

        // Floaty apex: gravity is much weaker near the peak
        const atApex = Math.abs(ent.jumpV) < this.APEX_THRESHOLD;
        ent.jumpV += atApex ? this.APEX_GRAVITY : this.GRAVITY;
        ent.y     += ent.jumpV;

        if (ent.y >= ent.floorY) {
            ent.y         = ent.floorY;
            ent.isJumping = false;
            ent.jumpV     = 0;
        }
    }

    _updateBallPhysics(dt) {
        if (this.hasBall === 'player') {
            const bounce = Math.abs(Math.sin(Date.now() / 150)) * 20;
            const frame  = this.playerSprite.frame.name;
            const ox     = (frame >= 8 && frame < 12) ? 25 : ((frame >= 4 && frame < 8) ? -25 : 0);
            this.ball.x      = this.player.x + ox;
            this.ball.y      = this.player.y - 20 + bounce;
            this.ball.floorY = this.player.floorY;
        } else if (this.hasBall === 'opponent') {
            const bounce = Math.abs(Math.sin(Date.now() / 150)) * 20;
            const frame  = this.oppSprite.frame.name;
            const ox     = (frame >= 8 && frame < 12) ? 25 : ((frame >= 4 && frame < 8) ? -25 : 0);
            this.ball.x      = this.opponent.x + ox;
            this.ball.y      = this.opponent.y - 20 + bounce;
            this.ball.floorY = this.opponent.floorY;
        } else if (this.ball.isInAir) {
            this.ball.vy += this.BALL_GRAVITY;
            this.ball.x  += this.ball.vx;   // per-frame, no dt
            this.ball.y  += this.ball.vy;

            // Ceiling bounce (keep ball on screen)
            if (this.ball.y < 20) {
                this.ball.y  = 20;
                this.ball.vy = Math.abs(this.ball.vy) * 0.5;
            }

            // Backboard bounce (high restitution ~0.75)
            if (this.ball.x >= this.HOOP_X - 2 &&
                this.ball.y > this.HOOP_Y - 60 &&
                this.ball.y < this.HOOP_Y + 20) {
                this.ball.vx *= -0.75;
                this.ball.x   = this.HOOP_X - 3;
            }

            // Left boundary — bounce ball back in
            if (this.ball.x < this.COURT_LEFT) {
                this.ball.x  = this.COURT_LEFT;
                this.ball.vx = Math.abs(this.ball.vx) * 0.5;
            }

            // Right boundary (past baseline, not a backboard hit) — bounce ball back
            if (this.ball.x > this.COURT_RIGHT && !(this.ball.y > this.HOOP_Y - 60 && this.ball.y < this.HOOP_Y + 20)) {
                this.ball.x  = this.COURT_RIGHT;
                this.ball.vx = -Math.abs(this.ball.vx) * 0.5;
            }

            // Rim collision
            const rimDist = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, this.RIM_X, this.RIM_Y);
            if (this.ball.vy > 0 && rimDist < 22) {
                // Good entry angle → score; otherwise bounce off rim
                const centered = this.ball.x > this.RIM_X - 20 && this.ball.x < this.RIM_X + 5;
                if (centered) {
                    this._scoreGoal(this.ball.lastShooter);
                    this.ball.isInAir = false;
                } else {
                    // High-restitution rim bounce
                    this.ball.vy *= -0.65;
                    this.ball.vx *= 0.5;
                }
            }

            // Floor — settle into a loose ball
            if (this.ball.y > this.COURT_Y) {
                if (Math.abs(this.ball.vy) < 2) {
                    this.ball.isInAir = false;
                    this.ball.vx      = 0;
                    this.ball.vy      = 0;
                    this.ball.y       = this.COURT_Y;
                    this.ball.floorY  = this.COURT_Y;
                    // Clamp to court
                    this.ball.x = Phaser.Math.Clamp(this.ball.x, this.COURT_LEFT, this.COURT_RIGHT);
                } else {
                    this.ball.y  = this.COURT_Y;
                    this.ball.vy *= -0.6;
                    this.ball.vx *= 0.8;
                }
            }
        }
    }

    _shoot(who) {
        const ent = who === 'player' ? this.player : this.opponent;
        if (this.hasBall !== who) return;

        // Accuracy: 1.0 = perfect apex release, 0.0 = very early/late
        const accuracy = 1 - Math.min(1, Math.abs(ent.jumpV) / Math.abs(this.JUMP_POWER));

        this.hasBall          = 'none';
        this.ball.isInAir     = true;
        this.ball.lastShooter = who;

        const dx   = this.RIM_X - ent.x;
        const dist = Math.abs(dx);

        // Arc via fixed apex height: ball always peaks near y=APEX_Y (top of visible court),
        // then falls to the rim. vx is derived so the ball covers `dist` in t_total frames.
        //   rise: vy_up = sqrt(2*g*rise),  t_up  = vy_up / g
        //   fall: rim is below apex by (RIM_Y - APEX_Y),  t_down = sqrt(2*(RIM_Y-APEX_Y)/g)
        const APEX_Y  = 120;   // px from screen top — ball peaks here
        const rise    = Math.max(20, ent.y - APEX_Y);   // how far ball rises from shooter
        const vyUp    = Math.sqrt(2 * this.BALL_GRAVITY * rise);
        const t_up    = vyUp / this.BALL_GRAVITY;
        const t_down  = Math.sqrt(2 * Math.max(1, this.RIM_Y - APEX_Y) / this.BALL_GRAVITY);
        const t_total = t_up + t_down;
        const vxBase  = dist / t_total;

        // Poor timing: nudge the arc up/down (miss long or short)
        const noise = (1 - accuracy) * 5 * (Math.random() - 0.3);

        this.ball.vx = (dx > 0 ? 1 : -1) * vxBase;
        this.ball.vy = -(vyUp - noise);

        if (who === 'player') this._showAccuracy(accuracy);
        ent.entityState = 'shooting';
    }

    _showAccuracy(accuracy) {
        let label, color;
        if (accuracy > 0.8)       { label = 'PERFECT!'; color = '#ffff00'; }
        else if (accuracy > 0.55) { label = 'GOOD';     color = '#00ff88'; }
        else if (accuracy > 0.3)  { label = 'OK';       color = '#ffffff'; }
        else                      { label = 'EARLY';    color = '#ff8800'; }

        this.accText.setText(label).setColor(color).setVisible(true).setAlpha(1);
        this.tweens.add({
            targets: this.accText,
            y: this.H / 2 - 130,
            alpha: 0,
            duration: 900,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                this.accText.setVisible(false);
                this.accText.y = this.H / 2 - 80;
            }
        });
    }

    _dunk(who) {
        const ent = who === 'player' ? this.player : this.opponent;
        if (this.hasBall !== who) return;

        this.state = 'dunking';
        this.tweens.add({
            targets: ent,
            x: this.RIM_X - 10,
            y: this.RIM_Y - 20,
            duration: 250,
            ease: 'Back.easeOut',
            onComplete: () => this._scoreGoal(who, true)
        });
    }

    _scoreGoal(who, isDunk = false) {
        if (this.state === 'goal' || this.state === 'transition') return;
        this.state = 'goal';

        if (who === 'player') {
            this.playerScore += 2;
            if (typeof GameState !== 'undefined') GameState.addMoney(5);
        } else {
            this.opponentScore += 2;
        }

        this._updateHUD();
        this._showMsg(isDunk ? 'BOOMSHAKALAKA!' : 'SWISH!', '#00ff00', 1500);
        this.cameras.main.shake(300, 0.02);

        this.time.delayedCall(1500, () => {
            if (this.playerScore >= BB_GOAL * 2) {
                this._win();
            } else if (this.opponentScore >= BB_GOAL * 2) {
                this._lose();
            } else {
                this._resetPossession(who === 'player' ? 'opponent' : 'player');
            }
        });
    }

    _win() {
        this.state = 'transition';
        _BB.round++;
        this._showMsg('WINNER!', '#ffff00', 2000);
        this.time.delayedCall(2000, () => this.scene.restart());
    }

    _lose() {
        this.state = 'transition';
        this._showMsg('GAME OVER', '#ff0000', 2000);
        this.time.delayedCall(2000, () => this.scene.restart());
    }

    _resetPossession(whoGetsBall) {
        this.state = 'playing';
        this.hasBall = whoGetsBall;
        this.player.x         = 200;
        this.player.floorY    = this.COURT_Y;
        this.opponent.x       = 600;
        this.opponent.floorY  = this.COURT_Y;
        this.ball.isInAir     = false;
        this.player.isJumping = false;
        this.opponent.isJumping = false;
        this.player.entityState   = whoGetsBall === 'player'   ? 'dribbling' : 'idle';
        this.opponent.entityState = whoGetsBall === 'opponent' ? 'dribbling' : 'idle';
    }

    _shove(who) {
        const target    = who === 'player' ? this.opponent : this.player;
        const targetKey = who === 'player' ? 'opponent' : 'player';

        const dist = Phaser.Math.Distance.Between(
            this.player.x, this.player.floorY,
            this.opponent.x, this.opponent.floorY
        );
        if (dist > 80) return;

        // Stun the target
        target.entityState = 'stunned';
        target.stunTimer   = BB_STUN_DURATION;

        // Knock ball loose if target had possession
        if (this.hasBall === targetKey) {
            this.hasBall      = 'none';
            this.ball.isInAir = true;
            this.ball.vx      = (who === 'player' ? 1 : -1) * (2 + Math.random() * 2); // px/frame
            this.ball.vy      = -4 - Math.random() * 3;
        }

        this._showMsg(who === 'player' ? 'SHOVE!' : 'SHOVED!', '#ff44ff', 500);
        this.tweens.add({
            targets: target,
            x: target.x + (who === 'player' ? 50 : -50),
            duration: 180,
            yoyo: true,
            ease: 'Power2'
        });
    }

    _checkCollisions() {
        if (this.hasBall === 'none' && !this.ball.isInAir) {
            if (Phaser.Math.Distance.Between(this.player.x, this.player.floorY, this.ball.x, this.ball.y) < 50) {
                this.hasBall = 'player';
                this.player.entityState = 'dribbling';
            } else if (Phaser.Math.Distance.Between(this.opponent.x, this.opponent.floorY, this.ball.x, this.ball.y) < 50) {
                this.hasBall = 'opponent';
                this.opponent.entityState = 'dribbling';
            }
        }
    }

    _updateZOrdering() {
        this.player.setDepth(this.player.floorY);
        this.opponent.setDepth(this.opponent.floorY);
        if (this.hasBall === 'none') {
            this.ball.setDepth(this.ball.floorY || this.ball.y);
        }
    }

    _updateHUD() {
        this.scoreText.setText(`PLAYER ${this.playerScore} - ${this.opponentScore} CPU`);
    }

    _showMsg(text, color, duration = 1000) {
        this.msgText.setText(text).setColor(color).setVisible(true).setScale(0.5).setAlpha(1);
        this.tweens.add({
            targets: this.msgText,
            scale: 1,
            alpha: { from: 1, to: 0 },
            duration: duration,
            ease: 'Cubic.easeOut',
            onComplete: () => this.msgText.setVisible(false)
        });
    }

    _exit() {
        this.game.events.emit('basketballExit');
        this.scene.stop();
        this.scene.resume('GameScene');
    }
}
