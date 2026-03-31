/**
 * PizzeriaScene — Employment minigame.
 * Launched on top of (paused) GameScene.
 *
 * Flow:
 *   [closed check] → supply phase → price phase → summary
 *
 * Career ranks (tracked in GameState):
 *   0 = Trainee   (20% cut, default)
 *   1 = Lead Cook (25% cut, unlocked at 5 shifts)
 *   2 = Manager   (35% cut, unlocked at 15 shifts)
 */
class PizzeriaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PizzeriaScene' });
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    // Per-shift state
    this._supplies    = { dough: false, toppings: false, marketing: false };
    this._price       = 5;
    this._companyFloat = 200;
    this._elements    = [];   // all display objects, cleared on phase change
    this._escHandler  = null;

    this._buildLobby();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Utility helpers
  // ════════════════════════════════════════════════════════════════════════════

  _clear() {
    this._elements.forEach(e => { if (e && e.destroy) e.destroy(); });
    this._elements = [];
  }

  _track(obj) { this._elements.push(obj); return obj; }

  _bg(color = 0x080812) {
    this._track(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, color));
  }

  _title(text, y = 45) {
    this._track(this.add.text(this.W / 2, y, text, {
      fontFamily: 'Courier New', fontSize: '21px',
      color: '#ff9900', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));
  }

  _text(str, x, y, opts = {}) {
    return this._track(this.add.text(x, y, str, {
      fontFamily: 'Courier New',
      fontSize:   opts.size  || '13px',
      color:      opts.color || '#cccccc',
      stroke: '#000', strokeThickness: 2,
      align: opts.align || 'center',
    }).setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5));
  }

  _panel(x, y, w, h, fill = 0x0d0d20, stroke = 0x3a3a6a) {
    return this._track(this.add.rectangle(x, y, w, h, fill).setStrokeStyle(1, stroke));
  }

  _button(x, y, label, bg, hover, cb, w = 170, h = 42) {
    const rect = this._track(
      this.add.rectangle(x, y, w, h, bg)
        .setStrokeStyle(2, 0xff9900)
        .setInteractive({ useHandCursor: true })
    );
    const txt = this._track(this.add.text(x, y, label, {
      fontFamily: 'Courier New', fontSize: '14px',
      color: '#fff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5));

    rect.on('pointerover',  () => rect.setFillStyle(hover));
    rect.on('pointerout',   () => rect.setFillStyle(bg));
    rect.on('pointerdown',  () => rect.setAlpha(0.7));
    rect.on('pointerup',    () => { rect.setAlpha(1); cb(); });
    return { rect, txt };
  }

  _setEsc(fn) {
    if (this._escHandler) this.input.keyboard.off('keydown-ESC', this._escHandler);
    this._escHandler = fn;
    if (fn) this.input.keyboard.on('keydown-ESC', this._escHandler);
  }

  _fmtTime() {
    const h  = GameState.hour;
    const m  = GameState.minute;
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
  }

  _supplySpent() {
    return (this._supplies.dough     ? 20 : 0)
         + (this._supplies.toppings  ? 30 : 0)
         + (this._supplies.marketing ? 10 : 0);
  }

  _simulate() {
    let baseDemand = 50;
    if (GameState.isWeekend)        baseDemand *= 1.25;
    if (this._supplies.toppings)    baseDemand += 15;
    const sensitivity   = 2;
    const marketingMult = this._supplies.marketing ? 1.3 : 1.0;
    const sales         = Math.max(0, (baseDemand - this._price * sensitivity) * marketingMult);
    const revenue       = sales * this._price;
    return { sales, revenue };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Lobby — choose between ordering food or working a shift
  // ════════════════════════════════════════════════════════════════════════════

  _buildLobby() {
    this._clear();
    this._bg();
    this._title('🍕  PIZZA PALACE');

    this._text(
      `Balance: $${GameState.money}  |  HP: ${GameState.hp}/${GameState.maxHp}  |  Energy: ${GameState.energy}/${GameState.maxEnergy}`,
      this.W / 2, 82, { size: '12px', color: '#aaaaaa' }
    );

    // Decorative divider
    this._panel(this.W / 2, 115, 480, 2, 0x3a2200, 0xff9900);

    // ORDER FOOD button
    this._panel(this.W / 2, 230, 440, 120, 0x1a0e00, 0xff9900);
    this._text('🍕  ORDER FOOD', this.W / 2, 205, { size: '18px', color: '#ff9900' });
    this._text('Buy a slice or a whole pizza to restore HP and energy',
      this.W / 2, 238, { size: '11px', color: '#887755' });
    this._button(this.W / 2, 268, 'ORDER →', 0x3a1e00, 0x5a3200,
      () => this._buildMenu(), 200, 40);

    // WORK button
    const workOpen = GameState.hour >= 10 && GameState.hour < 22;
    this._panel(this.W / 2, 390, 440, 120, workOpen ? 0x001a00 : 0x111111, workOpen ? 0x50ff80 : 0x333333);
    this._text('💼  WORK A SHIFT', this.W / 2, 365, { size: '18px', color: workOpen ? '#50ff80' : '#444' });
    this._text(
      workOpen ? 'Manage supplies & pricing to earn commission' : `Closed until 10:00 AM  (now ${this._fmtTime()})`,
      this.W / 2, 398, { size: '11px', color: workOpen ? '#558855' : '#555' }
    );
    this._button(
      this.W / 2, 428,
      workOpen ? 'WORK →' : 'CLOSED',
      workOpen ? 0x0a2a0a : 0x1a1a1a,
      workOpen ? 0x1a4a1a : 0x1a1a1a,
      () => { if (workOpen) this._buildSupplyPhase(); else this._buildClosed(); },
      200, 40
    );

    this._button(70, this.H - 52, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 110, 36);
    this._setEsc(() => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Food Menu
  // ════════════════════════════════════════════════════════════════════════════

  _buildMenu() {
    this._clear();
    this._bg();
    this._title('🍕  PIZZA PALACE — Menu');

    this._text(
      `Balance: $${GameState.money}  |  HP: ${GameState.hp}/${GameState.maxHp}  |  Energy: ${GameState.energy}/${GameState.maxEnergy}`,
      this.W / 2, 82, { size: '12px', color: '#aaaaaa' }
    );

    const ITEMS = [
      { name: 'Slice',       price:  8, hp: 20, energy:  0 },
      { name: 'Half Pizza',  price: 15, hp: 45, energy: 15 },
      { name: 'Full Pizza',  price: 25, hp: 80, energy: 35 },
    ];

    ITEMS.forEach((item, i) => {
      const y         = 165 + i * 95;
      const canAfford = GameState.money >= item.price;
      const full      = GameState.hp >= GameState.maxHp && GameState.energy >= GameState.maxEnergy;

      this._panel(this.W / 2, y, 540, 78, canAfford ? 0x0d0f0a : 0x0d0d0d, canAfford ? 0x3a5a2a : 0x2a2a2a);

      this._text(item.name, this.W / 2 - 200, y - 18, { size: '16px', color: canAfford ? '#ffffff' : '#555', ox: 0 });

      let desc = `+${item.hp} HP`;
      if (item.energy > 0) desc += `   +${item.energy} Energy`;
      this._text(desc, this.W / 2 - 200, y + 10, { size: '12px', color: canAfford ? '#50ff80' : '#444', ox: 0 });

      this._text(`$${item.price}`, this.W / 2 + 60, y, { size: '18px', color: canAfford ? '#ffd700' : '#444' });

      this._button(
        this.W / 2 + 195, y,
        canAfford ? 'BUY' : 'N/A',
        canAfford ? 0x1a3a0a : 0x1a1a1a,
        canAfford ? 0x2a5a1a : 0x1a1a1a,
        () => { if (canAfford) this._buyItem(item); },
        80, 36
      );
    });

    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 110, 36);
    this._setEsc(() => this._buildLobby());
  }

  _buyItem(item) {
    GameState.addMoney(-item.price);
    GameState.addHp(item.hp);
    if (item.energy > 0) GameState.addEnergy(item.energy);
    SaveManager.save();
    this._buildPurchaseConfirm(item);
  }

  _buildPurchaseConfirm(item) {
    this._clear();
    this._bg(0x060f06);
    this._title('🍕  PIZZA PALACE');

    this._panel(this.W / 2, this.H / 2 - 30, 460, 170, 0x0a1a0a, 0x50ff80);
    this._text('Enjoy your food! 🍕', this.W / 2, this.H / 2 - 70, { size: '20px', color: '#50ff80' });
    this._text(`${item.name} — $${item.price} charged`, this.W / 2, this.H / 2 - 35, { size: '13px', color: '#aaa' });

    let effect = `HP: ${GameState.hp}/${GameState.maxHp}`;
    if (item.energy > 0) effect += `   Energy: ${GameState.energy}/${GameState.maxEnergy}`;
    this._text(effect, this.W / 2, this.H / 2, { size: '14px', color: '#50ff80' });
    this._text(`Balance: $${GameState.money}`, this.W / 2, this.H / 2 + 35, { size: '13px', color: '#ffd700' });

    this._button(this.W / 2 - 90, this.H - 52, 'ORDER MORE', 0x1a3a0a, 0x2a5a1a,
      () => this._buildMenu(), 160, 40);
    this._button(this.W / 2 + 90, this.H - 52, 'LEAVE', 0x2a2a2a, 0x444444,
      () => this._exit(), 140, 40);
    this._setEsc(() => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Phase: Closed
  // ════════════════════════════════════════════════════════════════════════════

  _buildClosed() {
    this._bg();
    this._title('🍕  PIZZA PALACE');
    this._panel(this.W / 2, this.H / 2, 460, 140, 0x1a0a0a, 0x664444);
    this._text('CLOSED', this.W / 2, this.H / 2 - 35, { size: '22px', color: '#ff4444' });
    this._text(`Current time: ${this._fmtTime()}`, this.W / 2, this.H / 2);
    this._text('Shifts available: 10:00 AM – 10:00 PM', this.W / 2, this.H / 2 + 30, { color: '#888' });
    this._button(this.W / 2 - 80, this.H - 60, '← BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 130, 36);
    this._button(this.W / 2 + 80, this.H - 60, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 110, 36);
    this._setEsc(() => this._buildLobby());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Phase: Supply
  // ════════════════════════════════════════════════════════════════════════════

  _buildSupplyPhase() {
    this._clear();
    this._bg();
    this._title('🍕  PIZZA PALACE — Supply Phase');

    // Context bar
    const weekend = GameState.isWeekend;
    this._text(
      `${GameState.dayName}${weekend ? ' ★ WEEKEND' : ''}  ${this._fmtTime()}  |  `
      + `Rank: ${GameState.rankName}  (${Math.round(GameState.profitCut * 100)}% cut)  |  `
      + `Shifts: ${GameState.shiftsWorked}`,
      this.W / 2, 78, { size: '11px', color: weekend ? '#ffd700' : '#777' }
    );

    // Company float header
    this._panel(this.W / 2, 115, 320, 36, 0x0a1a0a, 0x50ff80);
    this._text(`Company Float: $${this._companyFloat}`, this.W / 2, 115, { size: '15px', color: '#50ff80' });

    // Supply items
    const items = [
      { key: 'dough',     label: 'Dough',     cost: 20, desc: 'Required — enables the shift' },
      { key: 'toppings',  label: 'Toppings',  cost: 30, desc: '+15 base demand per shift' },
      { key: 'marketing', label: 'Marketing', cost: 10, desc: '×1.3 sales multiplier' },
    ];

    items.forEach((item, i) => {
      const y   = 185 + i * 88;
      const on  = this._supplies[item.key];
      this._panel(this.W / 2, y, 560, 70, on ? 0x0a1a0a : 0x0d0d20, on ? 0x50ff80 : 0x3a3a6a);

      this._text(item.label, this.W / 2 - 185, y - 14, { size: '16px', color: '#fff', ox: 0 });
      this._text(item.desc,  this.W / 2 - 185, y + 12, { size: '11px', color: '#777', ox: 0 });
      this._text(`$${item.cost}`, this.W / 2 + 55, y, { size: '16px', color: '#ffd700' });

      this._button(
        this.W / 2 + 175, y,
        on ? 'REMOVE' : 'BUY',
        on ? 0x3a0a0a : 0x0a2a0a,
        on ? 0x5a1a1a : 0x1a4a1a,
        () => { this._supplies[item.key] = !this._supplies[item.key]; this._buildSupplyPhase(); },
        110, 36
      );
    });

    // Remaining float
    const remaining = this._companyFloat - this._supplySpent();
    this._text(
      `Remaining float after supplies: $${remaining}`,
      this.W / 2, 460,
      { size: '13px', color: remaining < 0 ? '#ff4444' : '#aaaaaa' }
    );

    if (!this._supplies.dough) {
      this._text('Buy Dough to unlock the shift', this.W / 2, 488, { size: '11px', color: '#ff6666' });
    }

    // Buttons
    const canStart = this._supplies.dough;
    const startBtn = this._button(
      this.W / 2, this.H - 52,
      'START SHIFT →',
      canStart ? 0x0a2a0a : 0x1a1a1a,
      canStart ? 0x1a4a1a : 0x1a1a1a,
      () => { if (canStart) this._buildPricePhase(); }
    );
    if (!canStart) {
      startBtn.txt.setColor('#555');
      startBtn.rect.setStrokeStyle(2, 0x333333);
    }

    this._button(70, this.H - 52, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 110, 36);
    this._setEsc(() => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Phase: Price Setting
  // ════════════════════════════════════════════════════════════════════════════

  _buildPricePhase() {
    this._clear();
    this._bg();
    this._title('🍕  PIZZA PALACE — Set Price');

    const spent     = this._supplySpent();
    const remaining = this._companyFloat - spent;
    this._text(
      `Supplies: $${spent} spent  |  Float remaining: $${remaining}`,
      this.W / 2, 78, { size: '12px', color: '#888' }
    );

    // Price control panel
    this._panel(this.W / 2, 185, 380, 100, 0x0d0d20, 0x3a3a6a);
    this._text('Price per slice', this.W / 2, 150, { size: '13px', color: '#888' });

    this._priceDisplay = this._text(`$${this._price}`, this.W / 2, 185, { size: '38px', color: '#ffd700' });

    this._button(this.W / 2 - 100, 222, '−', 0x3a0a0a, 0x5a1a1a, () => {
      this._price = Math.max(1, this._price - 1);
      this._updateForecast();
    }, 56, 34);
    this._button(this.W / 2 + 100, 222, '+', 0x0a2a0a, 0x1a4a1a, () => {
      this._price = Math.min(20, this._price + 1);
      this._updateForecast();
    }, 56, 34);

    // Forecast panel
    this._panel(this.W / 2, 358, 480, 164, 0x060f06, 0x1a3a1a);
    this._text('— Demand Forecast —', this.W / 2, 290, { size: '12px', color: '#666' });

    const { sales, revenue } = this._simulate();
    const profit = revenue + remaining - this._companyFloat;
    const cut    = Math.max(0, profit) * GameState.profitCut;

    this._fSlices  = this._text(`Est. slices sold: ${Math.round(sales)}`,     this.W / 2, 320, { color: '#ccc' });
    this._fRev     = this._text(`Est. gross revenue: $${revenue.toFixed(2)}`, this.W / 2, 346, { color: '#ccc' });
    this._fProfit  = this._text(`Est. shop profit: $${profit.toFixed(2)}`,    this.W / 2, 372, { color: profit >= 0 ? '#ccc' : '#ff6666' });
    this._fCut     = this._text(`Est. your commission: $${cut.toFixed(2)}`,   this.W / 2, 402, { size: '15px', color: cut > 0 ? '#50ff80' : '#ff4444' });

    if (GameState.isWeekend) {
      this._text('★ Weekend bonus: +25% demand', this.W / 2, 432, { size: '11px', color: '#ffd700' });
    }

    this._button(this.W / 2, this.H - 52, 'RUN SHIFT ▶', 0x0a2a0a, 0x1a4a1a, () => this._runShift());
    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444, () => this._buildSupplyPhase(), 110, 36);
    this._setEsc(() => this._buildSupplyPhase());
  }

  _updateForecast() {
    const { sales, revenue } = this._simulate();
    const remaining = this._companyFloat - this._supplySpent();
    const profit    = revenue + remaining - this._companyFloat;
    const cut       = Math.max(0, profit) * GameState.profitCut;

    this._priceDisplay.setText(`$${this._price}`);
    this._fSlices.setText(`Est. slices sold: ${Math.round(sales)}`);
    this._fRev.setText(`Est. gross revenue: $${revenue.toFixed(2)}`);
    this._fProfit.setText(`Est. shop profit: $${profit.toFixed(2)}`);
    this._fProfit.setColor(profit >= 0 ? '#cccccc' : '#ff6666');
    this._fCut.setText(`Est. your commission: $${cut.toFixed(2)}`);
    this._fCut.setColor(cut > 0 ? '#50ff80' : '#ff4444');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Run the shift (calculation + state update)
  // ════════════════════════════════════════════════════════════════════════════

  _runShift() {
    const rankBefore  = GameState.jobRank;
    const { sales, revenue } = this._simulate();
    const spent         = this._supplySpent();
    const remainingFloat = this._companyFloat - spent;
    const grossTotal    = revenue + remainingFloat;
    const profit        = grossTotal - this._companyFloat;
    const commission    = Math.max(0, profit) * GameState.profitCut;

    // Apply earnings and progress
    GameState.addMoney(Math.round(commission));
    GameState.addEnergy(-2);   // FEAT-002: active work drains extra energy
    GameState.shiftsWorked++;
    GameState._updateRank();
    const promoted = GameState.jobRank > rankBefore;

    // Advance time by 4 hours
    GameState.advanceHours(4);

    // Auto-save after shift
    SaveManager.save();

    this._buildSummary({
      startingFloat: this._companyFloat,
      spent,
      remainingFloat,
      sales:      Math.round(sales),
      revenue,
      profit,
      commission,
      promoted,
      newRankName: GameState.rankName,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Phase: Shift Summary
  // ════════════════════════════════════════════════════════════════════════════

  _buildSummary(d) {
    this._clear();
    this._setEsc(null);
    this._bg(0x050510);
    this._title('🍕  SHIFT COMPLETE!', 42);

    this._text(`Shifts worked: ${GameState.shiftsWorked}  |  Rank: ${GameState.rankName}`,
      this.W / 2, 76, { size: '12px', color: '#aaa' });

    // Main summary box
    this._panel(this.W / 2, 270, 500, 320, 0x0a0f0a, 0x2a5a2a);

    const rows = [
      { label: 'Shop Starting Float',  val: `$${d.startingFloat}`,          color: '#aaa' },
      { label: 'Supplies Purchased',   val: `−$${d.spent}`,                  color: '#ff9944' },
      { label: 'Float Carried Over',   val: `$${d.remainingFloat.toFixed(2)}`, color: '#aaa' },
      null, // divider
      { label: 'Slices Sold',          val: `${d.sales}`,                    color: '#ccc' },
      { label: 'Total Sales Revenue',  val: `$${d.revenue.toFixed(2)}`,      color: '#50ccff' },
      null,
      { label: 'Shop Gross Profit',    val: `$${d.profit.toFixed(2)}`,       color: d.profit >= 0 ? '#ccc' : '#ff4444' },
      { label: `Your Commission (${Math.round(GameState.profitCut * 100)}%)`, val: `$${d.commission.toFixed(2)}`, color: d.commission > 0 ? '#50ff80' : '#ff4444' },
    ];

    let y = 145;
    rows.forEach(row => {
      if (!row) { y += 12; return; }
      this._text(row.label, this.W / 2 - 90, y, { size: '13px', color: '#888', ox: 1, oy: 0.5 });
      this._text(row.val,   this.W / 2 + 95, y, { size: '13px', color: row.color, ox: 0, oy: 0.5 });
      y += 28;
    });

    // Warning if no profit
    if (d.profit < 0) {
      this._panel(this.W / 2, 380, 460, 36, 0x2a0a0a, 0xaa2222);
      this._text('⚠ Shop lost money. No commission this shift.', this.W / 2, 380, { size: '12px', color: '#ff6666' });
    }

    // Promotion banner
    if (d.promoted) {
      this._panel(this.W / 2, 428, 460, 42, 0x1a1a00, 0xffd700);
      this._text(`★ PROMOTED TO ${d.newRankName.toUpperCase()}! ★`, this.W / 2, 428, { size: '14px', color: '#ffd700' });
    }

    // Next rank hint
    if (GameState.jobRank < 2) {
      const needed = GameState.jobRank === 0 ? 5 : 15;
      const left   = needed - GameState.shiftsWorked;
      if (left > 0) {
        this._text(`${left} more shift${left !== 1 ? 's' : ''} until next promotion`, this.W / 2, 460, { size: '11px', color: '#555' });
      }
    }

    this._button(this.W / 2, this.H - 52, 'DONE', 0x0a2a0a, 0x1a4a1a, () => this._exit());
    this.input.keyboard.once('keydown-ESC', () => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Exit
  // ════════════════════════════════════════════════════════════════════════════

  _exit() {
    this._setEsc(null);
    this.game.events.emit('pizzeriaExit');
    this.scene.stop();
    this.scene.resume('GameScene');
  }
}
