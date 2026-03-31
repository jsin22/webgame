/**
 * HomeScene — Player's home / rest hub (LOC-001).
 *
 * Launched on top of (paused) GameScene.
 * While inside, GameState._restingAtHome = true, so world_tick applies
 * +0.25E/min recovery instead of -0.066E/min decay.
 * Faint penalties do NOT apply while resting here.
 */
class HomeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HomeScene' });
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this._elements = [];

    this._buildHome();

    // Re-render whenever energy or HP changes (server tick updates these)
    this.game.events.on('energyChanged', () => this._updateStats(), this);
    this.game.events.on('hpChanged',     () => this._updateStats(), this);
  }

  _track(obj) { this._elements.push(obj); return obj; }

  _clear() {
    this._elements.forEach(e => { if (e && e.destroy) e.destroy(); });
    this._elements = [];
  }

  _buildHome() {
    this._clear();

    // Background
    this._track(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x0a0808));
    this._track(this.add.rectangle(this.W / 2, this.H / 2, this.W - 60, this.H - 60, 0x140e0a)
      .setStrokeStyle(2, 0xa08060));

    // Title
    this._track(this.add.text(this.W / 2, 40, '🏠  HOME', {
      fontFamily: 'Courier New', fontSize: '22px',
      color: '#d4aa70', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));

    // Subtitle hint
    this._track(this.add.text(this.W / 2, 78, 'Resting here restores Energy (+15/hr)', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#887755',
    }).setOrigin(0.5));

    // Stats panel
    this._track(this.add.rectangle(this.W / 2, 165, 420, 90, 0x100c08).setStrokeStyle(1, 0x4a3a28));

    this._statText = this._track(this.add.text(this.W / 2, 148,
      this._statsLine(), {
        fontFamily: 'Courier New', fontSize: '14px', color: '#ccbbaa',
      }).setOrigin(0.5));

    this._energyLine = this._track(this.add.text(this.W / 2, 178,
      this._energyDesc(), {
        fontFamily: 'Courier New', fontSize: '12px', color: '#50ff80',
      }).setOrigin(0.5));

    // Faint warning when HP is low
    if (GameState.hp < GameState.maxHp * 0.5) {
      this._track(this.add.text(this.W / 2, 205, '⚠ HP is low — food from the Pizzeria restores HP', {
        fontFamily: 'Courier New', fontSize: '11px', color: '#ff6644',
      }).setOrigin(0.5));
    }

    // Decorative cosy room description
    const lines = [
      'Your apartment. Soft light filters through the curtains.',
      'You feel safe here — the city cannot reach you.',
      '',
      'Resting slowly restores your Energy.',
      'Leave when you\'re ready to explore again.',
    ];
    lines.forEach((line, i) => {
      this._track(this.add.text(this.W / 2, 260 + i * 22, line, {
        fontFamily: 'Courier New', fontSize: '12px', color: '#665544',
      }).setOrigin(0.5));
    });

    // Leave button
    const btn = this._track(
      this.add.rectangle(this.W / 2, this.H - 55, 200, 44, 0x1a1208)
        .setStrokeStyle(2, 0xa08060)
        .setInteractive({ useHandCursor: true })
    );
    const btnTxt = this._track(this.add.text(this.W / 2, this.H - 55, 'LEAVE HOME', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#d4aa70',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5));

    btn.on('pointerover',  () => btn.setFillStyle(0x2a1e10));
    btn.on('pointerout',   () => btn.setFillStyle(0x1a1208));
    btn.on('pointerdown',  () => btn.setAlpha(0.7));
    btn.on('pointerup',    () => { btn.setAlpha(1); this._exit(); });

    this.input.keyboard.once('keydown-ESC', () => this._exit());
  }

  _statsLine() {
    return `HP: ${GameState.hp}/${GameState.maxHp}   |   Energy: ${GameState.energy}/${GameState.maxEnergy}   |   $${GameState.money}`;
  }

  _energyDesc() {
    if (GameState.energy >= GameState.maxEnergy) return '✓ Fully rested';
    const needed = GameState.maxEnergy - GameState.energy;
    const minsLeft = Math.ceil(needed / 0.25);
    return `Recovering… ~${minsLeft}s until full`;
  }

  _updateStats() {
    if (this._statText)   this._statText.setText(this._statsLine());
    if (this._energyLine) this._energyLine.setText(this._energyDesc());
  }

  _exit() {
    this.game.events.off('energyChanged', null, this);
    this.game.events.off('hpChanged',     null, this);
    this.game.events.emit('homeExit');
    this.scene.stop();
    this.scene.resume('GameScene');
  }
}
