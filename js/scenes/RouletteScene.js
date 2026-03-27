/**
 * RouletteScene — European roulette (0-36).
 *
 * Bet types:
 *   Red / Black  → 2× payout
 *   Odd / Even   → 2× payout
 *   Single number → 36× payout
 *
 * Numbers 1-36; red = 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36
 */
class RouletteScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RouletteScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.spinning   = false;
    this.betAmount  = 10;
    this.betType    = null;   // 'red'|'black'|'odd'|'even'|0-36
    this.result     = null;

    // Red numbers in European roulette
    this.RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

    // ── Background ────────────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x080614);

    this.add.text(W / 2, 28, 'ROULETTE', {
      fontFamily: 'Courier New', fontSize: '22px', color: '#ffd700',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Money
    this.moneyText = this.add.text(W - 16, 16, `$${GameState.money}`, {
      fontFamily: 'Courier New', fontSize: '16px', color: '#50ff80',
    }).setOrigin(1, 0);

    // ── Wheel display (a simple spinning number) ──────────────────────────────
    const wheelBg = this.add.circle(W / 2, 145, 80, 0x1a3a1a).setStrokeStyle(4, 0xffd700);
    this.add.circle(W / 2, 145, 60, 0x0d2a0d).setStrokeStyle(2, 0x888800);

    this.wheelNum = this.add.text(W / 2, 145, '?', {
      fontFamily: 'Courier New', fontSize: '36px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Bet amount row ────────────────────────────────────────────────────────
    this.add.text(W / 2, 248, 'BET AMOUNT', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);

    const betAmounts = [5, 10, 25, 50];
    this.betBtns = [];
    betAmounts.forEach((val, i) => {
      const x = W / 2 - 90 + i * 60;
      const btn = this._chipButton(x, 272, `$${val}`, val === this.betAmount, () => {
        this.betAmount = val;
        this.betBtns.forEach((b, j) => b.setActive(j === i));
      });
      this.betBtns.push(btn);
    });

    // ── Bet type row ──────────────────────────────────────────────────────────
    this.add.text(W / 2, 306, 'BET ON', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);

    const betTypes = [
      { label: 'RED',   value: 'red',   color: 0x8b0000, hover: 0xcc2222 },
      { label: 'BLACK', value: 'black', color: 0x111111, hover: 0x444444 },
      { label: 'ODD',   value: 'odd',   color: 0x1a3a6a, hover: 0x2244aa },
      { label: 'EVEN',  value: 'even',  color: 0x1a3a6a, hover: 0x2244aa },
    ];

    this.typeBtns = [];
    betTypes.forEach((t, i) => {
      const x = W / 2 - 150 + i * 100;
      const { bg, text } = this._labelButton(x, 330, t.label, t.color, t.hover, () => {
        this.betType = t.value;
        this.typeBtns.forEach((b, j) => {
          b.bg.setStrokeStyle(j === i ? 3 : 1, j === i ? 0xffd700 : 0x555555);
        });
        this._updateSpinBtn();
      });
      this.typeBtns.push({ bg, text });
    });

    // ── Number grid (compact, 0-36) ───────────────────────────────────────────
    this.add.text(W / 2, 362, 'or pick a number (36×)', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#666666',
    }).setOrigin(0.5);

    this.numBtns = [];
    for (let n = 0; n <= 36; n++) {
      const col = n % 13;
      const row = Math.floor(n / 13);
      const x   = 28 + col * 58;
      const y   = 382 + row * 26;
      const isRed = this.RED_NUMS.has(n);
      const clr   = n === 0 ? 0x006600 : (isRed ? 0x660000 : 0x111111);

      const btn = this.add.rectangle(x, y, 50, 20, clr)
        .setStrokeStyle(1, 0x555555)
        .setInteractive({ useHandCursor: true });
      const lbl = this.add.text(x, y, String(n), {
        fontFamily: 'Courier New', fontSize: '10px', color: '#ffffff',
      }).setOrigin(0.5);

      btn.on('pointerup', () => {
        this.betType = n;
        // Clear type buttons selection
        this.typeBtns.forEach(b => b.bg.setStrokeStyle(1, 0x555555));
        // Highlight chosen number
        this.numBtns.forEach((b, j) => b.setStrokeStyle(1, j === n ? 0xffd700 : 0x555555));
        this._updateSpinBtn();
      });
      this.numBtns.push(btn);
    }

    // ── Spin button ───────────────────────────────────────────────────────────
    this.spinBg = this.add.rectangle(W / 2, H - 50, 160, 44, 0x2a2a2a)
      .setStrokeStyle(2, 0x555555)
      .setInteractive({ useHandCursor: true });
    this.spinTxt = this.add.text(W / 2, H - 50, 'SELECT A BET', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#666666',
    }).setOrigin(0.5);
    this.spinBg.on('pointerup', () => this._spin());

    // ── Result text ───────────────────────────────────────────────────────────
    this.resultText = this.add.text(W / 2, 218, '', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    // ── Back button ───────────────────────────────────────────────────────────
    this._labelButton(60, H - 50, '← BACK', 0x222222, 0x444444, () => {
      this.scene.start('CasinoLobbyScene');
    });

    // Keep money text updated
    this.game.events.on('moneyChanged', v => {
      if (this.moneyText) this.moneyText.setText(`$${v}`);
    }, this);
    this.events.on('shutdown', () => {
      this.game.events.off('moneyChanged', undefined, this);
    });
  }

  _updateSpinBtn() {
    const ready = this.betType !== null;
    this.spinBg.setFillStyle(ready ? 0x1a5a1a : 0x2a2a2a)
               .setStrokeStyle(2, ready ? 0xffd700 : 0x555555);
    this.spinTxt.setText(ready ? 'SPIN!' : 'SELECT A BET')
                .setColor(ready ? '#ffd700' : '#666666');
  }

  _spin() {
    if (this.spinning || this.betType === null) return;
    if (GameState.money < this.betAmount) {
      this.resultText.setText("Not enough money!").setColor('#ff4444');
      return;
    }

    this.spinning = true;
    this.resultText.setText('');
    this.spinBg.disableInteractive();

    // Deduct bet immediately
    GameState.addMoney(-this.betAmount);

    // Animate wheel cycling rapidly → slow down → stop
    const finalNum = Phaser.Math.Between(0, 36);
    let ticks = 0;
    const totalTicks = 40;

    const timer = this.time.addEvent({
      delay: 50,
      repeat: totalTicks - 1,
      callback: () => {
        ticks++;
        const displayNum = Phaser.Math.Between(0, 36);
        const isRed = this.RED_NUMS.has(displayNum);
        this.wheelNum.setText(String(ticks < totalTicks ? displayNum : finalNum));
        this.wheelNum.setColor(finalNum === 0 ? '#00ff00' : (isRed ? '#ff4444' : '#ffffff'));

        // Slow down in last 10 ticks
        if (ticks > 30) timer.delay = 80 + (ticks - 30) * 30;

        if (ticks === totalTicks) {
          this._showResult(finalNum);
        }
      },
    });
  }

  _showResult(num) {
    const isRed = this.RED_NUMS.has(num);
    const color = num === 0 ? '#00cc00' : (isRed ? '#ff4444' : '#ffffff');
    this.wheelNum.setText(String(num)).setColor(color);

    // Evaluate win
    let won = false;
    let payout = 0;

    if (typeof this.betType === 'number') {
      won = this.betType === num;
      payout = won ? this.betAmount * 36 : 0;
    } else if (this.betType === 'red')   { won = num !== 0 && isRed;  payout = won ? this.betAmount * 2 : 0; }
    else if (this.betType === 'black')   { won = num !== 0 && !isRed; payout = won ? this.betAmount * 2 : 0; }
    else if (this.betType === 'odd')     { won = num !== 0 && num % 2 === 1; payout = won ? this.betAmount * 2 : 0; }
    else if (this.betType === 'even')    { won = num !== 0 && num % 2 === 0; payout = won ? this.betAmount * 2 : 0; }

    if (won) GameState.addMoney(payout);

    this.resultText
      .setText(won ? `WIN! +$${payout}` : `LOSE  -$${this.betAmount}`)
      .setColor(won ? '#50ff80' : '#ff4444');

    this.spinning = false;
    this.spinBg.setInteractive({ useHandCursor: true });
  }

  _chipButton(x, y, label, active, callback) {
    const obj = { active };
    const bg = this.add.rectangle(x, y, 48, 24, active ? 0x4a4a00 : 0x2a2a2a)
      .setStrokeStyle(2, active ? 0xffd700 : 0x555555)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontFamily: 'Courier New', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5);

    const setActive = (isActive) => {
      obj.active = isActive;
      bg.setFillStyle(isActive ? 0x4a4a00 : 0x2a2a2a)
        .setStrokeStyle(2, isActive ? 0xffd700 : 0x555555);
    };
    bg.on('pointerup', () => { callback(); });
    bg.setActive = setActive;
    return bg;
  }

  _labelButton(x, y, label, bgColor, hoverColor, callback) {
    const W = label.length * 9 + 24;
    const bg = this.add.rectangle(x, y, W, 32, bgColor)
      .setStrokeStyle(1, 0x555555)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5);
    bg.on('pointerover',  () => bg.setFillStyle(hoverColor));
    bg.on('pointerout',   () => bg.setFillStyle(bgColor));
    bg.on('pointerdown',  () => bg.setAlpha(0.7));
    bg.on('pointerup',    () => { bg.setAlpha(1); callback(); });
    return { bg, text };
  }
}
