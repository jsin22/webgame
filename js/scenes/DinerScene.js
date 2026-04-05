/**
 * DinerScene — "The Greasy Spoon" Dual-Mode Simulator.
 *
 * Customer Mode : order from the live menu, rate the meal.
 * Manager Mode  : procure supplies, tune prices, simulate the shift.
 *
 * DINER_BALANCE at the top holds all tunable numbers.
 */

// ── Balance knobs ─────────────────────────────────────────────────────────────
const DINER_BALANCE = {
  BASE_TRAFFIC:       40,     // NPC customers per shift at 3.0★ reputation
  GRILL_DECAY:        10,     // condition % lost per shift
  GRILL_REPAIR_COST:  50,     // $ to restore grill to 100 %
  PATIENCE_LIMIT:     12,     // minutes before NPC walks out (narrative)
  PRICE_GOUGE_RATIO:  4,      // price > baseCost × N  →  −30 % demand
  REVIEW_WEIGHT:      0.15,   // fraction one review shifts reputation
  MAX_REP:            5.0,
  MIN_REP:            1.0,
  STARTING_CASH:      500,
  STARTING_REP:       3.0,
  WITHDRAW_TAX:       0.10,   // cut when transferring diner profit to wallet
};

// ── Persistent diner state (survives Phaser scene stop / launch) ──────────────
const _DS = (() => {
  const EVENTS = [
    { name: null,              boost: {},             tMult: 1.00, desc: 'Quiet market day.' },
    { name: null,              boost: {},             tMult: 1.00, desc: 'Quiet market day.' },
    { name: null,              boost: {},             tMult: 1.00, desc: 'Quiet market day.' },
    { name: 'Frost in Brazil', boost: { coffee: 2.0 }, tMult: 1.00, desc: 'Coffee prices doubled!' },
    { name: 'Local Parade',    boost: {},             tMult: 1.35, desc: '+35% foot traffic!' },
    { name: 'Road Works',      boost: {},             tMult: 0.75, desc: '-25% foot traffic.' },
    { name: 'Meat Shortage',   boost: { meat: 1.6 },  tMult: 1.00, desc: 'Beef up 60%!' },
  ];
  const WEATHER_MULT = { Clear: 1.00, Rain: 0.75, Snow: 0.55, Heat: 0.85 };
  const BASE_PRICE   = { meat: [8, 14], buns: [3, 6], spuds: [2, 5], coffee: [4, 9] };
  const FRESH_MAX    = { meat: 2, buns: 3, spuds: 7, coffee: 5 };

  return {
    // ── Inventory ─────────────────────────────────────────────────────────────
    inv: {
      meat:   { qty: 0, cost: 0, fresh: FRESH_MAX.meat   },
      buns:   { qty: 0, cost: 0, fresh: FRESH_MAX.buns   },
      spuds:  { qty: 0, cost: 0, fresh: FRESH_MAX.spuds  },
      coffee: { qty: 0, cost: 0, fresh: FRESH_MAX.coffee },
    },

    // ── Menu ──────────────────────────────────────────────────────────────────
    menu: {
      burger:  { label: 'Jumbo Burger',  price: 10, generosity: 1, needs: ['meat','buns'],           baseCost: 5.0 },
      fries:   { label: 'Loaded Fries',  price:  6, generosity: 1, needs: ['spuds'],                 baseCost: 2.0 },
      coffee:  { label: 'Coffee',        price:  4, generosity: 1, needs: ['coffee'],                baseCost: 1.5 },
      special: { label: 'Diner Special', price: 15, generosity: 1, needs: ['meat','buns','spuds'],   baseCost: 8.0 },
    },

    // ── Finances & reputation ──────────────────────────────────────────────────
    cash:       DINER_BALANCE.STARTING_CASH,
    reputation: DINER_BALANCE.STARTING_REP,
    grillCond:  100,
    shiftsDone: 0,

    // ── Day state ─────────────────────────────────────────────────────────────
    day:       1,
    weather:   'Clear',
    event:     EVENTS[0],
    _prices:   null,

    EVENTS, WEATHER_MULT, BASE_PRICE, FRESH_MAX,

    // ── Roll new day variables ────────────────────────────────────────────────
    rollDay() {
      this.day++;
      const wList  = ['Clear','Clear','Clear','Rain','Rain','Snow','Heat'];
      this.weather = wList[Math.floor(Math.random() * wList.length)];
      this.event   = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      this._prices = {};
      for (const [k, [lo, hi]] of Object.entries(BASE_PRICE)) {
        let p = lo + Math.random() * (hi - lo);
        if (this.event.boost[k]) p *= this.event.boost[k];
        this._prices[k] = Math.round(p * 10) / 10;
      }
    },

    marketPrice(item) {
      if (!this._prices) this.rollDay();
      return this._prices[item] ?? 5;
    },

    inStock(key) {
      return this.menu[key].needs.every(n => this.inv[n].qty > 0);
    },

    /** Estimated units sold per shift. Implements the demand formula:
     *  Demand = (BaseTraffic × RepMod) × WeatherMult × EventMult
     *  with price-gouging and elasticity adjustments. */
    demand(key) {
      const item   = this.menu[key];
      const repF   = 0.4 + (this.reputation - DINER_BALANCE.MIN_REP)
                         / (DINER_BALANCE.MAX_REP - DINER_BALANCE.MIN_REP) * 0.8;
      const wM     = WEATHER_MULT[this.weather] || 1.0;
      const eM     = this.event.tMult;
      const gB     = 1 + (item.generosity - 1) * 0.15;  // generosity pulls demand
      let base     = DINER_BALANCE.BASE_TRAFFIC * repF * wM * eM * gB;

      // Effective cost per unit (generosity raises cost by 50% per tier)
      const effCost = item.baseCost * (1 + (item.generosity - 1) * 0.5);

      // Price-gouging penalty
      if (item.price > effCost * DINER_BALANCE.PRICE_GOUGE_RATIO) base *= 0.70;

      // Price-elasticity dampener
      const markup = (item.price - effCost) / (effCost + 0.01);
      base *= Math.max(0.05, 1 - markup * 0.04);

      // Bad grill → walk-outs on grilled items
      if (this.grillCond < 60 && (key === 'burger' || key === 'special')) {
        base *= this.grillCond / 100;
      }

      return Math.max(0, base);
    },

    /** Simulate a 14-hour shift (8 AM – 10 PM). Mutates state; returns report. */
    runShift() {
      const rep = {
        unitsSold:    {},
        grossRevenue: 0,
        walkouts:     0,
        spoilage:     0,
        grillBad:     this.grillCond < 60,
        netProfit:    0,
      };

      for (const key of Object.keys(this.menu)) {
        if (!this.inStock(key)) { rep.unitsSold[key] = 0; continue; }
        const want  = Math.round(this.demand(key));
        const avail = Math.min(...this.menu[key].needs.map(n => this.inv[n].qty));
        const sold  = Math.min(want, avail);
        rep.unitsSold[key]  = sold;
        rep.grossRevenue   += sold * this.menu[key].price;
        for (const n of this.menu[key].needs) {
          this.inv[n].qty = Math.max(0, this.inv[n].qty - sold);
        }
      }

      // Walk-outs from poor grill (patience limit)
      if (this.grillCond < 70) {
        rep.walkouts     = Math.round((70 - this.grillCond) * 0.6);
        rep.grossRevenue = Math.max(0, rep.grossRevenue - rep.walkouts * 6);
      }

      // Grill degrades each shift
      this.grillCond = Math.max(0, this.grillCond - DINER_BALANCE.GRILL_DECAY);

      // Spoilage (end of day)
      rep.spoilage  = this._applySpoilage();
      rep.netProfit = rep.grossRevenue - rep.spoilage;
      this.cash    += rep.netProfit;
      this.shiftsDone++;

      // Reputation drift
      const totalSold = Object.values(rep.unitsSold).reduce((a, b) => a + b, 0);
      if (totalSold > 20)      this.reputation = Math.min(DINER_BALANCE.MAX_REP, this.reputation + 0.05);
      if (rep.walkouts > 8)    this.reputation = Math.max(DINER_BALANCE.MIN_REP, this.reputation - 0.10);
      // Generous cooking boosts reputation when actually sold
      const highGen = Object.entries(this.menu).some(([k, m]) => m.generosity >= 2 && (rep.unitsSold[k] || 0) > 5);
      if (highGen) this.reputation = Math.min(DINER_BALANCE.MAX_REP, this.reputation + 0.05);
      this.reputation = Math.round(this.reputation * 10) / 10;

      rep.customerLog = this._genCustomerLog(rep.unitsSold, rep.walkouts);
      return rep;
    },

    _genCustomerLog(unitsSold, walkouts) {
      const NAMES = ['Jake','Maria','Sam','Tony','Lisa','Chen','Dave','Ana',
                     'Mike','Rosa','James','Kim','Pat','Omar','Sue','Raj'];
      const REACTIONS = ['— loved it!', '— asked for extra napkins.', '— seemed satisfied.',
                         '— left a nice tip.', '— said it hit the spot.', '— will be back!'];
      const log = [];
      for (const [key, sold] of Object.entries(unitsSold)) {
        if (sold <= 0) continue;
        const label = this.menu[key].label;
        const show  = Math.min(sold, 2);
        for (let i = 0; i < show; i++) {
          const name = NAMES[Math.floor(Math.random() * NAMES.length)];
          const rx   = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
          log.push(`${name} had the ${label} ${rx}`);
        }
        if (sold > 2) log.push(`+${sold - 2} more ordered the ${label}.`);
      }
      if (walkouts > 0) {
        log.push(`${walkouts} customer${walkouts > 1 ? 's' : ''} walked out — slow grill.`);
      }
      if (log.length === 0) log.push('No customers today. The diner sat empty.');
      return log.slice(0, 7);
    },

    _applySpoilage() {
      let lost = 0;
      for (const [k, inv] of Object.entries(this.inv)) {
        inv.fresh--;
        if (inv.fresh <= 0) {
          lost     += inv.qty * inv.cost;
          inv.qty   = 0;
          inv.fresh = FRESH_MAX[k] || 3;
        }
      }
      return Math.round(lost * 10) / 10;
    },

    /** Customer review directly adjusts diner reputation. */
    applyReview(stars) {
      const r = this.reputation + (stars - this.reputation) * DINER_BALANCE.REVIEW_WEIGHT;
      this.reputation = Math.round(
        Math.min(DINER_BALANCE.MAX_REP, Math.max(DINER_BALANCE.MIN_REP, r)) * 10) / 10;
    },

    stars() {
      const f = Math.floor(this.reputation);
      const h = (this.reputation % 1) >= 0.5 ? 1 : 0;
      return '★'.repeat(f) + (h ? '½' : '') + '☆'.repeat(5 - f - h);
    },
  };
})();


// ── Scene ─────────────────────────────────────────────────────────────────────
class DinerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DinerScene' });
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this._elements   = [];
    this._escHandler = null;
    this._buildLobby();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Utilities (mirrors PizzeriaScene)
  // ════════════════════════════════════════════════════════════════════════════

  _clear() {
    this._elements.forEach(e => { if (e && e.destroy) e.destroy(); });
    this._elements = [];
  }

  _track(obj) { this._elements.push(obj); return obj; }

  _bg(color = 0x0a0808) {
    this._track(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, color));
  }

  _title(text, y = 45) {
    this._track(this.add.text(this.W / 2, y, text, {
      fontFamily: 'Courier New', fontSize: '21px',
      color: '#ff6633', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));
  }

  _text(str, x, y, opts = {}) {
    return this._track(this.add.text(x, y, str, {
      fontFamily: 'Courier New',
      fontSize:   opts.size  || '13px',
      color:      opts.color || '#cccccc',
      stroke: '#000', strokeThickness: 2,
      align: opts.align || 'center',
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
    }).setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5));
  }

  _panel(x, y, w, h, fill = 0x110808, stroke = 0x5a2a1a) {
    return this._track(this.add.rectangle(x, y, w, h, fill).setStrokeStyle(1, stroke));
  }

  _button(x, y, label, bg, hover, cb, w = 170, h = 42) {
    const rect = this._track(
      this.add.rectangle(x, y, w, h, bg)
        .setStrokeStyle(2, 0xff6633)
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

  // ════════════════════════════════════════════════════════════════════════════
  // Lobby
  // ════════════════════════════════════════════════════════════════════════════

  _buildLobby() {
    this._clear();
    this._bg();
    this._title('🍳  THE GREASY SPOON');

    this._text(
      `Diner Cash: $${_DS.cash.toFixed(2)}  |  ${_DS.stars()}  (${_DS.reputation}★)  |  Grill: ${_DS.grillCond}%`,
      this.W / 2, 78, { size: '12px', color: '#aaa' }
    );
    this._panel(this.W / 2, 110, 480, 2, 0x3a1500, 0xff6633);

    // Customer Mode panel
    this._panel(this.W / 2, 220, 450, 112, 0x180a00, 0xff6633);
    this._text('🍔  CUSTOMER MODE', this.W / 2, 192, { size: '18px', color: '#ff8844' });
    this._text('Order from the live menu  ·  Rate your meal',
      this.W / 2, 228, { size: '11px', color: '#775533' });
    this._button(this.W / 2, 260, 'ORDER FOOD →', 0x3a1800, 0x5a2800,
      () => this._buildCustomerMenu(), 200, 38);

    // Manager Mode panel
    const mOpen = GameState.hour >= 6 && GameState.hour < 22;
    this._panel(this.W / 2, 390, 450, 112, mOpen ? 0x081600 : 0x111111, mOpen ? 0x44bb66 : 0x333333);
    this._text('📋  MANAGER MODE', this.W / 2, 362, { size: '18px', color: mOpen ? '#44bb66' : '#444' });
    this._text(mOpen ? 'Procure supplies  ·  Run the shift  ·  Earn profit'
                     : 'Opens at 6:00 AM',
      this.W / 2, 398, { size: '11px', color: mOpen ? '#448844' : '#555' });
    this._button(this.W / 2, 428, mOpen ? 'MANAGE →' : 'CLOSED',
      mOpen ? 0x0a2a0a : 0x1a1a1a, mOpen ? 0x1a4a1a : 0x1a1a1a,
      () => { if (mOpen) this._buildManagerLobby(); }, 200, 38);

    this._button(70, this.H - 52, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 110, 36);
    this._setEsc(() => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Customer Mode: menu
  // ════════════════════════════════════════════════════════════════════════════

  _buildCustomerMenu() {
    this._clear();
    this._bg();
    this._title('🍔  ORDER FOOD');

    this._text(
      `Wallet: $${GameState.money}  |  HP: ${GameState.hp}/${GameState.maxHp}  |  Energy: ${GameState.energy}/${GameState.maxEnergy}`,
      this.W / 2, 78, { size: '12px', color: '#aaa' }
    );

    // HP/energy effects per item (customer-facing)
    const EFFECTS = {
      burger:  { hp: 35, energy: 10 },
      fries:   { hp: 20, energy:  5 },
      coffee:  { hp:  5, energy: 25 },
      special: { hp: 60, energy: 25 },
    };

    Object.entries(_DS.menu).forEach(([key, m], i) => {
      const eff     = EFFECTS[key];
      const inStock = _DS.inStock(key);
      const canBuy  = inStock && GameState.money >= m.price;
      const y       = 155 + i * 84;

      this._panel(this.W / 2, y, 560, 68, canBuy ? 0x0f0a00 : 0x0d0d0d, canBuy ? 0x5a3a1a : 0x2a2a2a);

      this._text(m.label, this.W / 2 - 215, y - 18, { size: '15px', color: canBuy ? '#fff' : '#555', ox: 0 });

      if (!inStock) {
        this._text('Out of stock', this.W / 2 - 215, y + 8, { size: '11px', color: '#ff4444', ox: 0 });
      } else {
        let eff_str = `+${eff.hp} HP`;
        if (eff.energy > 0) eff_str += `   +${eff.energy} Energy`;
        this._text(eff_str, this.W / 2 - 215, y + 8, { size: '11px', color: '#50ff80', ox: 0 });
      }

      this._text(`$${m.price}`, this.W / 2 + 65, y, { size: '18px', color: canBuy ? '#ffd700' : '#444' });

      this._button(
        this.W / 2 + 208, y,
        canBuy ? 'BUY' : 'N/A',
        canBuy ? 0x3a1800 : 0x1a1a1a,
        canBuy ? 0x5a2800 : 0x1a1a1a,
        () => { if (canBuy) this._customerBuy(key, m, eff); }, 80, 34
      );
    });

    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 110, 36);
    this._setEsc(() => this._buildLobby());
  }

  _customerBuy(key, m, eff) {
    GameState.addMoney(-m.price);
    GameState.addHp(eff.hp);
    if (eff.energy > 0) GameState.addEnergy(eff.energy);
    _DS.cash += m.price;  // revenue goes to diner
    SaveManager.save();
    this._buildCustomerReview(key, m, eff);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Customer Mode: review
  // ════════════════════════════════════════════════════════════════════════════

  _buildCustomerReview(key, m, eff) {
    this._clear();
    this._bg(0x0a0805);
    this._title('🍳  THE GREASY SPOON');

    this._panel(this.W / 2, 195, 500, 110, 0x140a00, 0xff8844);
    this._text(`Enjoy your ${m.label}!`, this.W / 2, 155, { size: '18px', color: '#ff8844' });
    this._text(`$${m.price} charged`, this.W / 2, 182, { size: '12px', color: '#888' });
    const effStr = `+${eff.hp} HP${eff.energy > 0 ? `   +${eff.energy} Energy` : ''}`;
    this._text(effStr, this.W / 2, 205, { size: '14px', color: '#50ff80' });
    this._text(`Wallet: $${GameState.money}`, this.W / 2, 230, { size: '12px', color: '#ffd700' });

    this._text('Rate your experience:', this.W / 2, 305, { size: '15px', color: '#ccc' });
    this._text('(affects diner reputation)', this.W / 2, 326, { size: '11px', color: '#666' });

    for (let s = 1; s <= 5; s++) {
      const x = this.W / 2 - 120 + (s - 1) * 62;
      const btn = this._button(x, 372, '★'.repeat(s), 0x1a0a00, 0x3a1a00, () => {
        _DS.applyReview(s);
        this._buildRateConfirm(s);
      }, 52, 38);
      btn.txt.setColor('#ffd700').setFontSize('15px');
      btn.rect.setStrokeStyle(1, 0xffd700);
    }

    this._button(this.W / 2 - 90, this.H - 52, 'ORDER MORE', 0x3a1800, 0x5a2800,
      () => this._buildCustomerMenu(), 160, 38);
    this._button(this.W / 2 + 90, this.H - 52, 'LEAVE', 0x2a2a2a, 0x444444,
      () => this._exit(), 130, 38);
    this._setEsc(() => this._exit());
  }

  _buildRateConfirm(stars) {
    this._clear();
    this._bg(0x060a06);
    this._title('🍳  THE GREASY SPOON');

    this._panel(this.W / 2, this.H / 2, 480, 190, 0x0a140a, 0x44bb66);
    this._text('Thanks for the review!', this.W / 2, this.H / 2 - 60, { size: '18px', color: '#44bb66' });
    this._text('★'.repeat(stars) + '☆'.repeat(5 - stars), this.W / 2, this.H / 2 - 20,
      { size: '22px', color: '#ffd700' });
    this._text(`Diner reputation: ${_DS.stars()} (${_DS.reputation}★)`,
      this.W / 2, this.H / 2 + 20, { size: '13px', color: '#aaa' });
    this._text('Reputation drives NPC foot traffic in Manager Mode.',
      this.W / 2, this.H / 2 + 50, { size: '11px', color: '#666' });

    this._button(this.W / 2 - 90, this.H - 52, 'ORDER MORE', 0x3a1800, 0x5a2800,
      () => this._buildCustomerMenu(), 160, 38);
    this._button(this.W / 2 + 90, this.H - 52, 'LEAVE', 0x2a2a2a, 0x444444,
      () => this._exit(), 130, 38);
    this._setEsc(() => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Manager Mode: lobby
  // ════════════════════════════════════════════════════════════════════════════

  _buildManagerLobby() {
    this._clear();
    this._bg();
    this._title('📋  MANAGER MODE');

    // Status bar
    this._panel(this.W / 2, 105, 560, 50, 0x0a0f0a, 0x44bb66);
    this._text(`Cash: $${_DS.cash.toFixed(2)}`, this.W / 2 - 160, 98, { size: '13px', color: '#50ff80' });
    this._text(`${_DS.stars()} (${_DS.reputation}★)`, this.W / 2, 98, { size: '13px', color: '#ffd700' });
    this._text(`Grill: ${_DS.grillCond}%`, this.W / 2 + 160, 98,
      { size: '13px', color: _DS.grillCond < 60 ? '#ff4444' : '#50ff80' });
    this._text(`Shifts done: ${_DS.shiftsDone}  |  Day ${_DS.day}`,
      this.W / 2, 122, { size: '11px', color: '#666' });

    // Inventory overview
    this._panel(this.W / 2, 218, 560, 100, 0x080c08, 0x2a4a2a);
    this._text('— Current Inventory —', this.W / 2, 178, { size: '12px', color: '#557755' });
    const INV_META = {
      meat:   { icon: '🥩', label: 'Meat'   },
      buns:   { icon: '🍞', label: 'Buns'   },
      spuds:  { icon: '🥔', label: 'Spuds'  },
      coffee: { icon: '☕', label: 'Coffee'  },
    };
    let col = 0;
    for (const [k, inv] of Object.entries(_DS.inv)) {
      const x = this.W / 2 - 205 + col * 140;
      this._text(`${INV_META[k].icon} ${INV_META[k].label}`, x, 197, { size: '11px', color: '#888' });
      this._text(`${inv.qty} units`, x, 217,
        { size: '13px', color: inv.qty > 0 ? '#ccc' : '#555' });
      this._text(`${inv.fresh}d fresh`, x, 237,
        { size: '10px', color: inv.fresh <= 1 ? '#ff6644' : '#556655' });
      col++;
    }

    // Withdraw panel
    const withdrawable = Math.floor(_DS.cash * (1 - DINER_BALANCE.WITHDRAW_TAX));
    this._panel(this.W / 2, 310, 560, 50, 0x0e0e00, 0x4a4a00);
    this._text(
      withdrawable > 0
        ? `Withdraw profits to wallet: $${withdrawable}  (${Math.round(DINER_BALANCE.WITHDRAW_TAX * 100)}% tax)`
        : 'No diner profits to withdraw yet.',
      this.W / 2, 303, { size: '11px', color: '#aa9900' }
    );
    this._button(this.W / 2, 328, withdrawable > 0 ? `WITHDRAW $${withdrawable}` : 'NO FUNDS',
      withdrawable > 0 ? 0x2a2a00 : 0x1a1a1a,
      withdrawable > 0 ? 0x4a4a00 : 0x1a1a1a,
      () => { if (withdrawable > 0) this._doWithdraw(withdrawable); }, 220, 30);

    this._button(this.W / 2, this.H - 52, 'GO TO MARKET →', 0x0a2a0a, 0x1a4a1a,
      () => this._buildMarket(), 200, 40);
    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444,
      () => this._buildLobby(), 110, 36);
    this._setEsc(() => this._buildLobby());
  }

  _doWithdraw(amount) {
    _DS.cash = 0;
    GameState.addMoney(amount);
    SaveManager.save();
    this._buildManagerLobby();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Manager Mode: market
  // ════════════════════════════════════════════════════════════════════════════

  _buildMarket() {
    this._clear();
    this._bg();
    if (!_DS._prices) _DS.rollDay();
    this._title(`🛒  MARKET  —  Day ${_DS.day}`);

    // Weather & event banner
    const wColors = { Clear: '#aaddff', Rain: '#5588ff', Snow: '#ccccff', Heat: '#ff8844' };
    this._panel(this.W / 2, 83, 560, 38, 0x100c08, 0x443322);
    this._text(`${_DS.weather}`, this.W / 2 - 180, 83,
      { size: '12px', color: wColors[_DS.weather] || '#ccc' });
    this._text(
      _DS.event.name ? `${_DS.event.name}  —  ${_DS.event.desc}` : _DS.event.desc,
      this.W / 2 + 60, 83, { size: '11px', color: '#aa8866' }
    );

    this._text(`Diner Cash: $${_DS.cash.toFixed(2)}`, this.W / 2, 116, { size: '13px', color: '#50ff80' });

    const MARKET_META = [
      { key: 'meat',   icon: '🥩', label: 'Meat',   spoil: '2-day shelf life' },
      { key: 'buns',   icon: '🍞', label: 'Buns',   spoil: '3-day shelf life' },
      { key: 'spuds',  icon: '🥔', label: 'Spuds',  spoil: '7-day shelf life' },
      { key: 'coffee', icon: '☕', label: 'Coffee',  spoil: '5-day shelf life' },
    ];

    MARKET_META.forEach((meta, i) => {
      const mp  = _DS.marketPrice(meta.key);
      const inv = _DS.inv[meta.key];
      const y   = 180 + i * 68;
      this._panel(this.W / 2, y, 600, 54, 0x0c0908, 0x3a2a18);

      // Left: name + stock (contained to left third of panel)
      this._text(`${meta.icon} ${meta.label}`, this.W / 2 - 275, y - 10,
        { size: '13px', color: '#ccc', ox: 0 });
      this._text(`${inv.qty} in stock  •  ${inv.fresh}d fresh  •  ${meta.spoil}`,
        this.W / 2 - 275, y + 12, { size: '10px', color: '#667755', ox: 0 });

      // Center: price
      this._text(`$${mp}/unit`, this.W / 2 - 30, y, { size: '14px', color: '#ffd700' });

      // Right: three buy buttons, contained within panel
      [5, 10, 20].forEach((amt, bi) => {
        const cost      = Math.round(mp * amt * 10) / 10;
        const canAfford = _DS.cash >= cost;
        this._button(
          this.W / 2 + 90 + bi * 75, y,
          `+${amt} $${cost}`,
          canAfford ? 0x1a1400 : 0x1a1a1a,
          canAfford ? 0x3a2800 : 0x1a1a1a,
          () => {
            if (_DS.cash < cost) return;
            _DS.cash  -= cost;
            inv.qty   += amt;
            inv.cost   = mp;
            inv.fresh  = _DS.FRESH_MAX[meta.key];
            this._buildMarket();
          }, 68, 28
        );
      });
    });

    // Grill repair row
    const needsRepair = _DS.grillCond < 100;
    const canRepair   = _DS.cash >= DINER_BALANCE.GRILL_REPAIR_COST;
    const grillColor  = _DS.grillCond < 60 ? '#ff4444' : _DS.grillCond < 90 ? '#ffaa44' : '#50ff80';
    this._panel(this.W / 2, 462, 600, 40, 0x0c0808, needsRepair ? 0x5a2222 : 0x1a3a1a);
    this._text(
      `🔧 Grill: ${_DS.grillCond}%  ${_DS.grillCond < 60 ? '— POOR (walk-outs likely!)' : _DS.grillCond < 90 ? '— Fair' : '— Good'}`,
      this.W / 2 - 120, 462, { size: '12px', color: grillColor, ox: 0 }
    );
    this._button(
      this.W / 2 + 210, 462,
      canRepair && needsRepair ? `Repair ($${DINER_BALANCE.GRILL_REPAIR_COST})` : needsRepair ? 'No funds' : 'OK',
      canRepair && needsRepair ? 0x2a0a0a : 0x1a1a1a,
      canRepair && needsRepair ? 0x4a1a1a : 0x1a1a1a,
      () => {
        if (canRepair && needsRepair) {
          _DS.cash -= DINER_BALANCE.GRILL_REPAIR_COST;
          _DS.grillCond = 100;
          this._buildMarket();
        }
      }, 130, 30
    );

    this._button(this.W / 2, this.H - 52, 'SET PRICES →', 0x0a2a0a, 0x1a4a1a,
      () => this._buildPricing(), 200, 40);
    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444,
      () => this._buildManagerLobby(), 110, 36);
    this._setEsc(() => this._buildManagerLobby());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Manager Mode: menu pricing
  // ════════════════════════════════════════════════════════════════════════════

  _buildPricing() {
    this._clear();
    this._bg();
    this._title('💲  SET MENU PRICES');

    this._text(
      `Weather: ${_DS.weather}  |  ${_DS.event.name || 'Normal day'}  |  Rep: ${_DS.stars()}`,
      this.W / 2, 72, { size: '11px', color: '#888' }
    );

    const MENU_KEYS = ['burger', 'fries', 'coffee', 'special'];
    let gouged = [];

    MENU_KEYS.forEach((key, i) => {
      const item    = _DS.menu[key];
      const inStock = _DS.inStock(key);
      const effCost = item.baseCost * (1 + (item.generosity - 1) * 0.5);
      const units   = inStock ? Math.round(_DS.demand(key)) : 0;
      const rev     = units * item.price;
      const y       = 143 + i * 87;

      this._panel(this.W / 2, y, 590, 72,
        inStock ? 0x0d0d1a : 0x0d0d0d,
        inStock ? 0x3a3a5a : 0x2a2a2a
      );

      // Row 1 (top of panel): item name on the left, price control on the right
      this._text(item.label, this.W / 2 - 275, y - 20,
        { size: '14px', color: inStock ? '#ccc' : '#555', ox: 0 });

      this._button(this.W / 2 + 8,  y - 20, '−', 0x2a0a1a, 0x4a1a2a, () => {
        item.price = Math.max(1, item.price - 1);
        this._buildPricing();
      }, 28, 24);
      this._text(`$${item.price}`, this.W / 2 + 60, y - 20,
        { size: '16px', color: '#ffd700' });
      this._button(this.W / 2 + 112, y - 20, '+', 0x0a2a0a, 0x1a4a1a, () => {
        item.price = Math.min(50, item.price + 1);
        this._buildPricing();
      }, 28, 24);

      // Row 1 right: generosity toggle
      const genLabels = ['Normal', 'Generous', 'Extra'];
      const genFills  = [0x1a1a00, 0x1a2a00, 0x1a3a00];
      const gLabel = genLabels[item.generosity - 1] || 'Normal';
      this._button(this.W / 2 + 228, y - 20, `Gen: ${gLabel}`, genFills[item.generosity - 1],
        genFills[item.generosity - 1] + 0x111100, () => {
          item.generosity = (item.generosity % 3) + 1;
          this._buildPricing();
        }, 110, 24);

      // Row 2 (bottom of panel): cost/stock info left, est revenue right
      this._text(
        `Cost $${effCost.toFixed(2)}  •  ${item.needs.join(', ')}  •  ${inStock ? 'in stock ✓' : 'out of stock ✗'}`,
        this.W / 2 - 275, y + 16, { size: '10px', color: inStock ? '#6677aa' : '#553333', ox: 0 }
      );
      if (inStock) {
        this._text(`Est. ${units} sold → $${rev.toFixed(0)}`,
          this.W / 2 + 275, y + 16, { size: '10px', color: '#558855', ox: 1 });
      }

      // Price-gouge flag
      if (item.price > effCost * DINER_BALANCE.PRICE_GOUGE_RATIO) gouged.push(item.label);
    });

    if (gouged.length > 0) {
      this._panel(this.W / 2, 496, 590, 26, 0x200808, 0xaa2222);
      this._text(`⚠ Price gouging: ${gouged.join(', ')} — demand −30%`,
        this.W / 2, 496, { size: '11px', color: '#ff6666' });
    }

    this._button(this.W / 2, this.H - 52, 'RUN SHIFT ▶', 0x0a2a0a, 0x1a4a1a,
      () => this._runShift(), 200, 40);
    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444,
      () => this._buildMarket(), 110, 36);
    this._setEsc(() => this._buildMarket());
  }

  _runShift() {
    const report = _DS.runShift();
    GameState.advanceHours(4);
    this._buildShiftResults(report);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Manager Mode: end-of-day report
  // ════════════════════════════════════════════════════════════════════════════

  _buildShiftResults(rep) {
    this._clear();
    this._setEsc(null);
    this._bg(0x050510);
    this._title('📊  END OF DAY  —  Shift #' + _DS.shiftsDone, 42);

    this._text(
      `${_DS.stars()} reputation  |  Grill: ${_DS.grillCond}%  |  Diner Cash: $${_DS.cash.toFixed(2)}`,
      this.W / 2, 72, { size: '12px', color: '#aaa' }
    );

    // Two-column layout
    const LX = 200;  // left column center
    const RX = 590;  // right column center
    this._panel(LX, 295, 350, 330, 0x08090c, 0x2a3a5a);
    this._panel(RX, 295, 350, 330, 0x080c08, 0x2a5a2a);

    // ── Left: customer log ────────────────────────────────────────────────────
    this._text('— CUSTOMERS —', LX, 142, { size: '12px', color: '#5577aa' });
    (rep.customerLog || []).forEach((line, i) => {
      this._text(line, LX - 155, 162 + i * 34,
        { size: '11px', color: '#9999cc', ox: 0, oy: 0, wrap: 320 });
    });

    // ── Right: sales + financials ─────────────────────────────────────────────
    this._text('— SALES —', RX, 142, { size: '12px', color: '#557755' });
    let ry = 162;
    for (const [key, sold] of Object.entries(rep.unitsSold)) {
      const price = _DS.menu[key].price;
      this._text(_DS.menu[key].label, RX - 155, ry,
        { size: '11px', color: '#888', ox: 0, oy: 0 });
      this._text(`${sold} × $${price} = $${(sold * price).toFixed(0)}`,
        RX + 155, ry, { size: '11px', color: '#ccc', ox: 1, oy: 0 });
      ry += 22;
    }

    ry += 8;
    const rows = [
      { label: 'Gross Revenue',  val: `$${rep.grossRevenue.toFixed(2)}`,  color: '#50ccff' },
    ];
    if (rep.walkouts > 0) rows.push(
      { label: `Walk-outs ×${rep.walkouts}`, val: `−$${(rep.walkouts * 6).toFixed(0)}`, color: '#ff6644' }
    );
    rows.push(
      { label: 'Spoilage',       val: `−$${rep.spoilage.toFixed(2)}`,   color: '#ff9944' },
      null,
      { label: 'Net Profit',     val: `$${rep.netProfit.toFixed(2)}`,   color: rep.netProfit >= 0 ? '#50ff80' : '#ff4444' },
      { label: 'Cash Now',       val: `$${_DS.cash.toFixed(2)}`,        color: '#ffd700' },
    );
    rows.forEach(row => {
      if (!row) { ry += 6; return; }
      this._text(row.label, RX - 155, ry, { size: '11px', color: '#888', ox: 0, oy: 0 });
      this._text(row.val,   RX + 155, ry, { size: '11px', color: row.color, ox: 1, oy: 0 });
      ry += 20;
    });

    // Grill / reputation notes
    if (rep.grillBad) {
      this._panel(this.W / 2, 448, 760, 24, 0x200808, 0xaa2222);
      this._text('⚠ Poor grill caused walk-outs — repair at the market.',
        this.W / 2, 448, { size: '11px', color: '#ff6666' });
    }
    this._text(`Rep after shift: ${_DS.stars()} (${_DS.reputation}★)`,
      this.W / 2, rep.grillBad ? 472 : 456, { size: '11px', color: '#888' });

    this._button(this.W / 2 - 100, this.H - 52, 'NEXT DAY ▶', 0x0a2a0a, 0x1a4a1a, () => {
      _DS.rollDay();
      this._buildManagerLobby();
    }, 170, 40);
    this._button(this.W / 2 + 100, this.H - 52, 'LEAVE', 0x2a2a2a, 0x444444,
      () => this._exit(), 140, 40);
    this.input.keyboard.once('keydown-ESC', () => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Exit
  // ════════════════════════════════════════════════════════════════════════════

  _exit() {
    this._setEsc(null);
    this.game.events.emit('dinerExit');
    this.scene.stop();
    this.scene.resume('GameScene');
  }
}
