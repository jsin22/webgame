/**
 * CasinoLobbyScene — the inside of the casino.
 * Launched on top of (paused) GameScene.
 * Player chooses Roulette, Blackjack, or exits.
 */
class CasinoLobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CasinoLobbyScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Background ────────────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0818);

    // Felt table pattern
    this.add.rectangle(W / 2, H / 2 + 60, W - 80, 260, 0x0d4a2a)
      .setStrokeStyle(3, 0xc8a840);

    // ── Title ─────────────────────────────────────────────────────────────────
    this.add.text(W / 2, 55, '★  LUCKY PIXEL CASINO  ★', {
      fontFamily: 'Courier New',
      fontSize:   '26px',
      color:      '#ffd700',
      stroke:     '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, 95, 'Place your bets!', {
      fontFamily: 'Courier New',
      fontSize:   '13px',
      color:      '#aaaaaa',
    }).setOrigin(0.5);

    // ── Money display ─────────────────────────────────────────────────────────
    this.moneyText = this.add.text(W / 2, 130, `$${GameState.money}`, {
      fontFamily: 'Courier New',
      fontSize:   '20px',
      color:      '#50ff80',
      stroke:     '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Game buttons ──────────────────────────────────────────────────────────
    this._makeButton(W / 2 - 130, H / 2 + 60, 'ROULETTE', 0x8b1a1a, 0xff4444, () => {
      this.scene.start('RouletteScene');
    });

    this._makeButton(W / 2 + 130, H / 2 + 60, 'BLACKJACK', 0x1a1a6a, 0x4444ff, () => {
      this.scene.start('BlackjackScene');
    });

    // ── Exit button ───────────────────────────────────────────────────────────
    this._makeButton(W / 2, H - 60, 'EXIT CASINO', 0x3a3a3a, 0x888888, () => {
      this._exitCasino();
    });

    // Escape key also exits
    this.input.keyboard.once('keydown-ESC', () => this._exitCasino());

    // Update money display when it changes
    this.game.events.on('moneyChanged', this._updateMoney, this);
    this.events.on('shutdown', () => {
      this.game.events.off('moneyChanged', this._updateMoney, this);
    });
  }

  _updateMoney(amount) {
    if (this.moneyText) this.moneyText.setText(`$${amount}`);
  }

  _makeButton(x, y, label, bgColor, hoverColor, callback) {
    const W = 200, H = 54;
    const bg = this.add.rectangle(x, y, W, H, bgColor)
      .setStrokeStyle(2, 0xffd700)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(x, y, label, {
      fontFamily: 'Courier New',
      fontSize:   '16px',
      color:      '#ffffff',
      stroke:     '#000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    bg.on('pointerover',  () => bg.setFillStyle(hoverColor));
    bg.on('pointerout',   () => bg.setFillStyle(bgColor));
    bg.on('pointerdown',  () => bg.setAlpha(0.7));
    bg.on('pointerup',    () => { bg.setAlpha(1); callback(); });

    return { bg, text };
  }

  _exitCasino() {
    this.game.events.emit('casinoExit');
    this.scene.stop();
    this.scene.resume('GameScene');
  }
}
