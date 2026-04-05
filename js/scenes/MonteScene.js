/**
 * MonteScene — Three Card Monte.
 *
 * Three cards are laid out face-down. The Queen of Hearts is briefly revealed,
 * then the cards are shuffled. Player picks one; correct = double the bet.
 *
 * Shuffle speed increases each round, with per-swap random jitter so the
 * pace feels unpredictable.
 */
class MonteScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MonteScene' });
  }

  create() {
    this.W = this.scale.width;   // 800
    this.H = this.scale.height;  // 560

    this.round    = 0;
    this.bet      = 10;
    this.queenIdx = 0;  // which card index (0/1/2) holds the Queen this round

    // Three fixed horizontal slot positions
    this.slotX = [this.W / 2 - 158, this.W / 2, this.W / 2 + 158];
    this.cardY = this.H / 2 + 20;

    // ── Background ──────────────────────────────────────────────────────────
    this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x080808);
    this.add.rectangle(this.W / 2, this.H / 2 + 28, this.W - 60, 310, 0x0b3d1a)
      .setStrokeStyle(3, 0xc8a840);

    this.add.text(this.W / 2, 28, '♥  THREE CARD MONTE  ♥', {
      fontFamily: 'Courier New', fontSize: '22px', color: '#ff4444',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Live stats ──────────────────────────────────────────────────────────
    this.moneyText = this.add.text(this.W - 12, 12, `$${GameState.money}`, {
      fontFamily: 'Courier New', fontSize: '14px', color: '#50ff80',
    }).setOrigin(1, 0);

    this.roundText = this.add.text(12, 12, '', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0, 0);

    this.game.events.on('moneyChanged', v => {
      if (this.moneyText) this.moneyText.setText(`$${v}`);
    }, this);
    this.events.on('shutdown', () => {
      this.game.events.off('moneyChanged', null, this);
    });

    // ── Centre messages ─────────────────────────────────────────────────────
    this.msgText = this.add.text(this.W / 2, 70, '', {
      fontFamily: 'Courier New', fontSize: '16px', color: '#ffdd88',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.betLabel = this.add.text(this.W / 2, 96, '', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#888888',
    }).setOrigin(0.5);

    // ── Build the three card containers ─────────────────────────────────────
    this.cards = [];
    const CW = 88, CH = 126;   // card width / height

    for (let i = 0; i < 3; i++) {
      const c = this.add.container(this.slotX[i], this.cardY);

      // Back layer
      c._back  = this.add.rectangle(0, 0, CW, CH, 0x7a1515).setStrokeStyle(2, 0xffd700);
      c._bpl   = this.add.rectangle(0, 0, CW - 18, 2,  0x9a2525);  // horizontal rule
      c._bpv   = this.add.rectangle(0, 0, 2, CH - 18,  0x9a2525);  // vertical rule
      c._bpTL  = this.add.rectangle(-(CW / 2 - 7), -(CH / 2 - 7), 8, 8, 0x9a2525);
      c._bpBR  = this.add.rectangle( (CW / 2 - 7),  (CH / 2 - 7), 8, 8, 0x9a2525);

      // Face layer (hidden until revealed)
      c._face  = this.add.rectangle(0, 0, CW, CH, 0xfffef0)
        .setStrokeStyle(2, 0x333333).setVisible(false);
      c._main  = this.add.text(0, 4, '', {
        fontFamily: 'Courier New', fontSize: '26px', color: '#cc1111',
        stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5).setVisible(false);
      c._tl    = this.add.text(-(CW / 2 - 6), -(CH / 2 - 5), '', {
        fontFamily: 'Courier New', fontSize: '11px', color: '#cc1111',
      }).setOrigin(0, 0).setVisible(false);
      c._br    = this.add.text( (CW / 2 - 6),  (CH / 2 - 5), '', {
        fontFamily: 'Courier New', fontSize: '11px', color: '#cc1111',
      }).setOrigin(1, 1).setVisible(false);

      c.add([c._back, c._bpl, c._bpv, c._bpTL, c._bpBR,
             c._face, c._main, c._tl, c._br]);
      this.cards.push(c);
    }

    // ── Ephemeral UI group (cleared each phase change) ──────────────────────
    this.ui = this.add.group();

    // ── Permanent back-to-lobby button ──────────────────────────────────────
    const lobbyBg = this.add.rectangle(54, this.H - 28, 98, 32, 0x2a2a2a)
      .setStrokeStyle(1, 0x666666)
      .setInteractive({ useHandCursor: true });
    this.add.text(54, this.H - 28, '← LOBBY', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5);
    lobbyBg.on('pointerup', () => this.scene.start('CasinoLobbyScene'));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('CasinoLobbyScene'));

    this._buildBetUI();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Card helpers
  // ════════════════════════════════════════════════════════════════════════════

  _showFace(i, label, isRed) {
    const c   = this.cards[i];
    const col = isRed ? '#cc1111' : '#111111';
    c._back.setVisible(false); c._bpl.setVisible(false); c._bpv.setVisible(false);
    c._bpTL.setVisible(false); c._bpBR.setVisible(false);
    c._face.setVisible(true);
    c._main.setText(label).setColor(col).setVisible(true);
    c._tl.setText(label).setColor(col).setVisible(true);
    c._br.setText(label).setColor(col).setVisible(true);
  }

  _showBack(i) {
    const c = this.cards[i];
    c._back.setVisible(true); c._bpl.setVisible(true); c._bpv.setVisible(true);
    c._bpTL.setVisible(true); c._bpBR.setVisible(true);
    c._face.setVisible(false); c._main.setVisible(false);
    c._tl.setVisible(false);   c._br.setVisible(false);
  }

  /** Flip animation: squash to 0 on X, swap content, unsquash. */
  _flip(idx, toFace, label, isRed, dur, cb) {
    this.tweens.add({
      targets: this.cards[idx], scaleX: 0,
      duration: dur / 2, ease: 'Quad.easeIn',
      onComplete: () => {
        if (toFace) this._showFace(idx, label, isRed);
        else        this._showBack(idx);
        this.tweens.add({
          targets: this.cards[idx], scaleX: 1,
          duration: dur / 2, ease: 'Quad.easeOut',
          onComplete: cb ?? null,
        });
      },
    });
  }

  _resetCards() {
    for (let i = 0; i < 3; i++) {
      this.tweens.killTweensOf(this.cards[i]);
      this._showBack(i);
      this.cards[i].x      = this.slotX[i];
      this.cards[i].y      = this.cardY;
      this.cards[i].scaleX = 1;
      this.cards[i].scaleY = 1;
      this.cards[i].disableInteractive();
      this.cards[i].removeAllListeners('pointerover');
      this.cards[i].removeAllListeners('pointerout');
      this.cards[i].removeAllListeners('pointerup');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Bet phase
  // ════════════════════════════════════════════════════════════════════════════

  _buildBetUI() {
    this.ui.clear(true, true);
    this._resetCards();
    this.msgText.setText('Find the Queen of Hearts!').setColor('#ffdd88');
    this.betLabel.setText('');
    if (this.round > 0) this.roundText.setText(`Round ${this.round}`);

    const W = this.W, H = this.H;

    // ── Chip presets ────────────────────────────────────────────────────────
    const CHIPS = [5, 10, 25, 50, 100];
    CHIPS.forEach((v, i) => {
      const x      = W / 2 - (CHIPS.length - 1) * 40 + i * 80;
      const afford = GameState.money >= v;
      const chip   = this.add.circle(x, H - 168, 24, afford ? 0x8b1a1a : 0x2a2a2a)
        .setStrokeStyle(2, afford ? 0xffd700 : 0x444444)
        .setInteractive({ useHandCursor: afford });
      const lbl = this.add.text(x, H - 168, `$${v}`, {
        fontFamily: 'Courier New', fontSize: '10px',
        color: afford ? '#ffd700' : '#555',
      }).setOrigin(0.5);
      if (afford) chip.on('pointerup', () => { this.bet = v; this._buildBetUI(); });
      this.ui.addMultiple([chip, lbl]);
    });

    // ── Bet label with −/+ ──────────────────────────────────────────────────
    const betY = H - 122;
    const mkAdj = (x, sign, delta) => {
      const bg = this.add.rectangle(x, betY, 34, 32, 0x2a2a2a)
        .setStrokeStyle(1, 0xffd700).setInteractive({ useHandCursor: true });
      const t  = this.add.text(x, betY, sign, {
        fontFamily: 'Courier New', fontSize: '18px', color: '#fff',
      }).setOrigin(0.5);
      bg.on('pointerover', () => bg.setFillStyle(0x4a4a1a));
      bg.on('pointerout',  () => bg.setFillStyle(0x2a2a2a));
      bg.on('pointerup',   () => {
        this.bet = Math.min(GameState.money, Math.max(5, this.bet + delta));
        this._buildBetUI();
      });
      this.ui.addMultiple([bg, t]);
    };
    mkAdj(W / 2 - 74, '−', -5);
    mkAdj(W / 2 + 74, '+',  5);

    this.ui.add(this.add.text(W / 2, betY, `BET: $${this.bet}`, {
      fontFamily: 'Courier New', fontSize: '19px', color: '#ffd700',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5));

    // ── Deal button ─────────────────────────────────────────────────────────
    if (GameState.money >= this.bet && this.bet >= 5) {
      const dealBg = this.add.rectangle(W / 2, H - 70, 190, 44, 0x1a5a1a)
        .setStrokeStyle(2, 0x50ff80).setInteractive({ useHandCursor: true });
      const dealTxt = this.add.text(W / 2, H - 70, '▶  DEAL', {
        fontFamily: 'Courier New', fontSize: '17px', color: '#50ff80',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);
      dealBg.on('pointerover', () => dealBg.setFillStyle(0x2a7a2a));
      dealBg.on('pointerout',  () => dealBg.setFillStyle(0x1a5a1a));
      dealBg.on('pointerup',   () => this._startRound());
      this.ui.addMultiple([dealBg, dealTxt]);
    } else {
      this.ui.add(this.add.text(W / 2, H - 70, 'Not enough money', {
        fontFamily: 'Courier New', fontSize: '13px', color: '#ff5555',
      }).setOrigin(0.5));
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Round: reveal queen, then shuffle
  // ════════════════════════════════════════════════════════════════════════════

  _startRound() {
    this.ui.clear(true, true);
    this.round++;
    this.roundText.setText(`Round ${this.round}`);
    this.betLabel.setText(`Bet: $${this.bet}`);
    this._resetCards();

    // Place queen at a random slot
    this.queenIdx = Math.floor(Math.random() * 3);

    this.msgText.setText('Watch the Queen of Hearts…').setColor('#ff9999');

    // Pause → flip queen face-up → hold → flip back → shuffle
    this.time.delayedCall(400, () => {
      this._flip(this.queenIdx, true, 'Q♥', true, 200, () => {
        this.time.delayedCall(1000, () => {
          this._flip(this.queenIdx, false, null, null, 200, () => {
            this.time.delayedCall(300, () => this._beginShuffle());
          });
        });
      });
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Shuffle
  // ════════════════════════════════════════════════════════════════════════════

  _beginShuffle() {
    this.msgText.setText('Follow the Queen…').setColor('#ffdd88');

    // More swaps each round; capped at 16
    const numSwaps = Math.min(4 + this.round * 2, 16);

    // Pre-build swap list: each entry is [cardIndexA, cardIndexB]
    const swaps = [];
    for (let n = 0; n < numSwaps; n++) {
      let a = Math.floor(Math.random() * 3);
      let b = Math.floor(Math.random() * 2);
      if (b >= a) b++;
      swaps.push([a, b]);
    }

    this._execSwaps(swaps, 0);
  }

  /**
   * Duration (ms) for a single swap.
   * Baseline shrinks each round; a ±30% jitter makes some swaps
   * unexpectedly fast or slow mid-sequence.
   */
  _swapMs() {
    const base   = Math.max(140, 490 - this.round * 44);
    const jitter = 0.7 + Math.random() * 0.6;
    return Math.round(base * jitter);
  }

  _execSwaps(swaps, idx) {
    if (idx >= swaps.length) {
      this.time.delayedCall(240, () => this._enterPickPhase());
      return;
    }

    const [a, b] = swaps[idx];
    const ax = this.cards[a].x;
    const bx = this.cards[b].x;
    const dur = this._swapMs();

    // Card a arcs over (y offset gives crossing illusion)
    this.tweens.add({ targets: this.cards[a], x: bx, duration: dur, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.cards[a], y: this.cardY - 22,
      duration: dur / 2, ease: 'Sine.easeOut', yoyo: true });

    // Card b slides under
    this.tweens.add({ targets: this.cards[b], x: ax, duration: dur, ease: 'Sine.easeInOut' });

    this.time.delayedCall(dur + 16, () => this._execSwaps(swaps, idx + 1));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Pick phase
  // ════════════════════════════════════════════════════════════════════════════

  _enterPickPhase() {
    this.msgText.setText('Pick the Queen of Hearts!').setColor('#ffffaa');

    for (let i = 0; i < 3; i++) {
      const card = this.cards[i];
      card.setInteractive(
        new Phaser.Geom.Rectangle(-44, -63, 88, 126),
        Phaser.Geom.Rectangle.Contains
      );
      card.on('pointerover', () => {
        this.tweens.killTweensOf(card);
        this.tweens.add({ targets: card, y: this.cardY - 16, duration: 90, ease: 'Sine.easeOut' });
      });
      card.on('pointerout', () => {
        this.tweens.killTweensOf(card);
        this.tweens.add({ targets: card, y: this.cardY, duration: 90, ease: 'Sine.easeOut' });
      });
      card.on('pointerup', () => this._cardPicked(i));
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Resolution
  // ════════════════════════════════════════════════════════════════════════════

  _cardPicked(pickedIdx) {
    // Immediately lock all cards
    for (let i = 0; i < 3; i++) {
      this.cards[i].disableInteractive();
      this.cards[i].removeAllListeners('pointerover');
      this.cards[i].removeAllListeners('pointerout');
      this.cards[i].removeAllListeners('pointerup');
      this.tweens.killTweensOf(this.cards[i]);
      this.tweens.add({ targets: this.cards[i], y: this.cardY, duration: 55 });
    }

    const won = pickedIdx === this.queenIdx;

    // Assign face labels: queen + two non-queens
    const sides = ['J♣', 'K♠'];
    let si = 0;
    const faces = Array.from({ length: 3 }, (_, i) =>
      i === this.queenIdx
        ? { txt: 'Q♥', red: true }
        : { txt: sides[si++], red: false }
    );

    // Stagger-flip all cards face up
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 140, () => {
        this._flip(i, true, faces[i].txt, faces[i].red, 200, null);
      });
    }

    // Highlight picked card after reveal
    this.time.delayedCall(3 * 140 + 120, () => {
      const stroke = won ? 0x50ff80 : 0xff5555;
      this.cards[pickedIdx]._face.setStrokeStyle(4, stroke);
      this._showResult(won);
    });
  }

  _showResult(won) {
    const W = this.W, H = this.H;

    if (won) {
      GameState.addMoney(this.bet);
      this.msgText.setText(`✓  Queen found!  +$${this.bet}`).setColor('#50ff80');
    } else {
      GameState.addMoney(-this.bet);
      this.msgText.setText(`✗  Wrong card!  −$${this.bet}`).setColor('#ff5555');
    }
    SaveManager.save();

    const canContinue = GameState.money >= 5;

    const btnBg = this.add.rectangle(W / 2, H - 70, 190, 44,
      canContinue ? 0x1a5a1a : 0x3a1a1a)
      .setStrokeStyle(2, canContinue ? 0x50ff80 : 0x884444)
      .setInteractive({ useHandCursor: canContinue });
    const btnTxt = this.add.text(W / 2, H - 70,
      canContinue ? '▶  PLAY AGAIN' : 'Out of money', {
        fontFamily: 'Courier New', fontSize: '15px',
        color: canContinue ? '#50ff80' : '#ff5555',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);

    if (canContinue) {
      btnBg.on('pointerover', () => btnBg.setFillStyle(0x2a7a2a));
      btnBg.on('pointerout',  () => btnBg.setFillStyle(0x1a5a1a));
      btnBg.on('pointerup',   () => this._buildBetUI());
    }

    this.ui.addMultiple([btnBg, btnTxt]);
  }
}
