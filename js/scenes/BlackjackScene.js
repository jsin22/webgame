/**
 * BlackjackScene — standard blackjack against a dealer.
 *
 * Rules:
 *   - Dealer hits on soft 16 or less, stands on 17+
 *   - Blackjack (natural 21 with 2 cards) pays 1.5×
 *   - Bust = instant loss
 *   - No split / double-down (keep it simple)
 */
class BlackjackScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BlackjackScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.betAmount   = 10;
    this.phase       = 'bet'; // 'bet' | 'playing' | 'dealer' | 'result'
    this.playerCards = [];
    this.dealerCards = [];

    // ── Background ────────────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x060a06);
    this.add.rectangle(W / 2, H / 2, W - 60, H - 60, 0x0d4020)
      .setStrokeStyle(3, 0xc8a840);

    this.add.text(W / 2, 22, 'BLACKJACK', {
      fontFamily: 'Courier New', fontSize: '22px', color: '#ffd700',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Money
    this.moneyText = this.add.text(W - 16, 16, `$${GameState.money}`, {
      fontFamily: 'Courier New', fontSize: '16px', color: '#50ff80',
    }).setOrigin(1, 0);

    // ── Dealer area ───────────────────────────────────────────────────────────
    this.add.text(W / 2, 52, 'DEALER', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.dealerValText = this.add.text(W / 2, 68, '', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ffd700',
    }).setOrigin(0.5);
    this.dealerCardGroup = this.add.group();

    // ── Player area ───────────────────────────────────────────────────────────
    this.add.text(W / 2, H / 2 + 10, 'YOU', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.playerValText = this.add.text(W / 2, H / 2 + 26, '', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5);
    this.playerCardGroup = this.add.group();

    // ── Status / result message ───────────────────────────────────────────────
    this.statusText = this.add.text(W / 2, H / 2 - 20, '', {
      fontFamily: 'Courier New', fontSize: '20px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Bet section ───────────────────────────────────────────────────────────
    this.betLabel = this.add.text(W / 2, H - 110, 'BET AMOUNT', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);

    const betAmounts = [5, 10, 25, 50];
    this.betBtns = [];
    betAmounts.forEach((val, i) => {
      const x = W / 2 - 90 + i * 60;
      const active = val === this.betAmount;
      const bg = this.add.rectangle(x, H - 88, 48, 24, active ? 0x4a4a00 : 0x2a2a2a)
        .setStrokeStyle(2, active ? 0xffd700 : 0x555555)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, H - 88, `$${val}`, {
        fontFamily: 'Courier New', fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5);
      bg.on('pointerup', () => {
        if (this.phase !== 'bet') return;
        this.betAmount = val;
        this.betBtns.forEach((b, j) => {
          b.setFillStyle(j === i ? 0x4a4a00 : 0x2a2a2a)
           .setStrokeStyle(2, j === i ? 0xffd700 : 0x555555);
        });
      });
      this.betBtns.push(bg);
    });

    // ── Action buttons ────────────────────────────────────────────────────────
    this.dealBtn = this._makeBtn(W / 2, H - 52, 'DEAL', 0x1a5a1a, 0x2a8a2a, () => this._deal());
    this.hitBtn  = this._makeBtn(W / 2 - 80, H - 52, 'HIT',  0x1a3a6a, 0x2255aa, () => this._hit()).setVisible(false);
    this.standBtn= this._makeBtn(W / 2 + 80, H - 52, 'STAND',0x6a1a1a, 0xaa2233, () => this._stand()).setVisible(false);
    this.nextBtn = this._makeBtn(W / 2, H - 52, 'PLAY AGAIN', 0x2a2a00, 0x5a5a00, () => this._reset()).setVisible(false);

    // ── Back button ───────────────────────────────────────────────────────────
    this._makeBtn(60, H - 52, '← BACK', 0x222222, 0x444444, () => {
      this.scene.start('CasinoLobbyScene');
    });

    // Money listener
    this.game.events.on('moneyChanged', v => {
      if (this.moneyText) this.moneyText.setText(`$${v}`);
    }, this);
    this.events.on('shutdown', () => {
      this.game.events.off('moneyChanged', undefined, this);
    });
  }

  // ── Card helpers ─────────────────────────────────────────────────────────
  _buildDeck() {
    const suits  = ['♠','♥','♦','♣'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const deck   = [];
    suits.forEach(s => values.forEach(v => deck.push({ v, s })));
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Phaser.Math.Between(0, i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  _cardNum(card) {
    if (card.v === 'A')  return 11;
    if (['J','Q','K'].includes(card.v)) return 10;
    return parseInt(card.v);
  }

  _handValue(cards) {
    let total = cards.reduce((s, c) => s + this._cardNum(c), 0);
    let aces  = cards.filter(c => c.v === 'A').length;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  _isBlackjack(cards) {
    return cards.length === 2 && this._handValue(cards) === 21;
  }

  // ── Card rendering ────────────────────────────────────────────────────────
  _drawCard(group, card, x, y, faceDown = false) {
    const W = 52, H = 76;
    const g = this.add.graphics();
    group.add(g);

    if (faceDown) {
      g.fillStyle(0x1a2a8a).fillRoundedRect(x, y, W, H, 5);
      g.lineStyle(1, 0x3a4aaa).strokeRoundedRect(x, y, W, H, 5);
      // Hatch pattern on back
      for (let i = 6; i < W - 4; i += 6) g.lineBetween(x + i, y + 2, x + 2, y + i);
      return;
    }

    const red = card.s === '♥' || card.s === '♦';
    g.fillStyle(0xfafafa).fillRoundedRect(x, y, W, H, 5);
    g.lineStyle(1, 0xcccccc).strokeRoundedRect(x, y, W, H, 5);

    const col = red ? '#cc0000' : '#111111';
    this.add.text(x + 5, y + 4, card.v, {
      fontFamily: 'Courier New', fontSize: '13px', color: col, fontStyle: 'bold',
    });
    this.add.text(x + W / 2, y + H / 2 + 4, card.s, {
      fontFamily: 'Courier New', fontSize: '20px', color: col,
    }).setOrigin(0.5);

    group.add(this.scene ? this.children.list[this.children.list.length - 1] : null);
    group.add(this.scene ? this.children.list[this.children.list.length - 2] : null);
  }

  _clearCards() {
    this.playerCardGroup.clear(true, true);
    this.dealerCardGroup.clear(true, true);
  }

  _renderHands(hideHole = true) {
    this._clearCards();
    const W = this.scale.width;
    const cardW = 56;

    // Dealer cards
    const dStartX = W / 2 - (this.dealerCards.length * cardW) / 2;
    this.dealerCards.forEach((c, i) => {
      const faceDown = hideHole && i === 1;
      this._drawCard(this.dealerCardGroup, c, dStartX + i * cardW, 80, faceDown);
    });
    const dVal = hideHole ? `${this._cardNum(this.dealerCards[0])}+?` : String(this._handValue(this.dealerCards));
    this.dealerValText.setText(dVal);

    // Player cards
    const pStartX = W / 2 - (this.playerCards.length * cardW) / 2;
    this.playerCards.forEach((c, i) => {
      this._drawCard(this.playerCardGroup, c, pStartX + i * cardW, this.scale.height / 2 + 38);
    });
    this.playerValText.setText(String(this._handValue(this.playerCards)));
  }

  // ── Game flow ─────────────────────────────────────────────────────────────
  _deal() {
    if (GameState.money < this.betAmount) {
      this.statusText.setText('Not enough money!').setColor('#ff4444');
      return;
    }
    GameState.addMoney(-this.betAmount);
    this.statusText.setText('');

    this.deck = this._buildDeck();
    this.playerCards = [this.deck.pop(), this.deck.pop()];
    this.dealerCards = [this.deck.pop(), this.deck.pop()];

    this.phase = 'playing';
    this.dealBtn.setVisible(false);
    this.betBtns.forEach(b => b.disableInteractive());
    this.betLabel.setVisible(false);

    this._renderHands(true);

    // Check natural blackjack
    if (this._isBlackjack(this.playerCards)) {
      this.time.delayedCall(400, () => this._stand());
      return;
    }

    this.hitBtn.setVisible(true);
    this.standBtn.setVisible(true);
  }

  _hit() {
    if (this.phase !== 'playing') return;
    this.playerCards.push(this.deck.pop());
    this._renderHands(true);

    if (this._handValue(this.playerCards) > 21) {
      this._endRound('bust');
    }
  }

  _stand() {
    if (this.phase !== 'playing') return;
    this.phase = 'dealer';
    this.hitBtn.setVisible(false);
    this.standBtn.setVisible(false);

    // Reveal hole card then dealer draws
    this._renderHands(false);
    this._dealerTurn();
  }

  _dealerTurn() {
    if (this._handValue(this.dealerCards) < 17) {
      this.time.delayedCall(600, () => {
        this.dealerCards.push(this.deck.pop());
        this._renderHands(false);
        this._dealerTurn();
      });
    } else {
      this.time.delayedCall(400, () => this._evaluate());
    }
  }

  _evaluate() {
    const pVal = this._handValue(this.playerCards);
    const dVal = this._handValue(this.dealerCards);
    const playerBJ = this._isBlackjack(this.playerCards);
    const dealerBJ = this._isBlackjack(this.dealerCards);

    let msg, payout;

    if (dealerBJ && playerBJ) {
      msg = 'PUSH — Both Blackjack'; payout = this.betAmount;
    } else if (playerBJ) {
      payout = Math.floor(this.betAmount * 2.5); msg = `BLACKJACK! +$${payout}`;
    } else if (pVal > 21) {
      msg = 'BUST! You lose.'; payout = 0;
    } else if (dVal > 21) {
      payout = this.betAmount * 2; msg = `Dealer busts! +$${payout}`;
    } else if (pVal > dVal) {
      payout = this.betAmount * 2; msg = `YOU WIN! +$${payout}`;
    } else if (dVal > pVal) {
      msg = 'Dealer wins.'; payout = 0;
    } else {
      msg = 'PUSH'; payout = this.betAmount;
    }

    if (payout > 0) GameState.addMoney(payout);
    this._endRound('done', msg);
  }

  _endRound(reason, msg) {
    this.phase = 'result';
    this.hitBtn.setVisible(false);
    this.standBtn.setVisible(false);
    this.dealBtn.setVisible(false);

    if (reason === 'bust') {
      this._renderHands(false);
      msg = 'BUST! You lose.';
    }

    const win = msg && (msg.includes('WIN') || msg.includes('BLACKJACK') || msg.includes('busts') || msg.includes('PUSH'));
    this.statusText.setText(msg || '').setColor(win ? '#50ff80' : '#ff4444');
    this.nextBtn.setVisible(true);
  }

  _reset() {
    this.phase = 'bet';
    this.playerCards = [];
    this.dealerCards = [];
    this._clearCards();
    this.dealerValText.setText('');
    this.playerValText.setText('');
    this.statusText.setText('');
    this.dealBtn.setVisible(true);
    this.nextBtn.setVisible(false);
    this.betBtns.forEach(b => b.setInteractive({ useHandCursor: true }));
    this.betLabel.setVisible(true);
  }

  // ── Button helper ─────────────────────────────────────────────────────────
  _makeBtn(x, y, label, bgColor, hoverColor, callback) {
    const W = Math.max(label.length * 13 + 24, 80);
    const bg = this.add.rectangle(x, y, W, 36, bgColor)
      .setStrokeStyle(2, 0xffd700)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
      fixedWidth: W - 8, align: 'center',
    }).setOrigin(0.5);
    bg.on('pointerover',  () => bg.setFillStyle(hoverColor));
    bg.on('pointerout',   () => bg.setFillStyle(bgColor));
    bg.on('pointerdown',  () => bg.setAlpha(0.7));
    bg.on('pointerup',    () => { bg.setAlpha(1); callback(); });
    return bg;
  }
}
