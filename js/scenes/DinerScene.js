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
  BASE_TRAFFIC:       50,     // NPC customers per shift at 3.0★ reputation
  GRILL_DECAY:        10,     // condition % lost per shift
  TOASTER_DECAY:       5,     // condition % lost per shift
  URN_DECAY:           5,     // condition % lost per shift
  REPAIR_COST:        50,     // $ to restore any equipment to 100%
  PATIENCE_LIMIT:     12,     // minutes before NPC walks out (narrative)
  PRICE_GOUGE_RATIO:  3.5,    // price > baseCost × N  →  −30 % demand
  REVIEW_WEIGHT:      0.15,   // fraction one review shifts reputation
  MAX_REP:            5.0,
  MIN_REP:            1.0,
  STARTING_CASH:      500,
  STARTING_REP:       3.5,
  WITHDRAW_TAX:       0.10,   // cut when transferring diner profit to wallet
};

// ── Persistent diner state (survives Phaser scene stop / launch) ──────────────
const _DS = (() => {
  const EVENTS = [
    { name: 'Quiet Day',         boost: {},               tMult: 1.00, desc: 'Quiet NY market day.' },
    { name: 'Quiet Day',         boost: {},               tMult: 1.00, desc: 'Quiet NY market day.' },
    { name: 'Sunday Brunch Rush',boost: { protein: 1.5 }, tMult: 2.00, desc: 'Demand x2! Grill decay doubled.', grillMult: 2 },
    { name: 'Construction Site', boost: {},               tMult: 1.50, desc: 'Burger and Coffee demand +50%!', focus: ['burger', 'coffee'] },
    { name: 'Health Inspector',  boost: {},               tMult: 0.80, desc: 'Inspector visiting! Keep it clean.', inspector: true },
    { name: 'Rainy Commute',     boost: { coffee: 1.8 },  tMult: 0.90, desc: 'Coffee demand up, traffic down.' },
  ];
  const WEATHER_MULT = { Clear: 1.00, Rain: 0.85, Snow: 0.65, Heat: 0.90 };
  const BASE_PRICE   = { protein: [6, 12], grain: [2, 5], produce: [3, 7], coffee: [4, 9] };
  const FRESH_MAX    = { protein: 3, grain: 4, produce: 5, coffee: 10 };

  return {
    // ── Inventory Groups ──────────────────────────────────────────────────────
    inv: {
      protein: { qty: 20, cost: 0, fresh: FRESH_MAX.protein }, // Beef, Bacon, Eggs, Chicken
      grain:   { qty: 20, cost: 0, fresh: FRESH_MAX.grain   }, // Buns, Rye, Muffins
      produce: { qty: 20, cost: 0, fresh: FRESH_MAX.produce }, // Soup, Toppings, Cheesecake base
      coffee:  { qty: 50, cost: 0, fresh: FRESH_MAX.coffee  }, // Grounds
    },

    // ── Equipment ─────────────────────────────────────────────────────────────
    equip: {
      grill:   100,
      toaster: 100,
      urn:     100,
    },

    // ── Prep Stock ────────────────────────────────────────────────────────────
    prep: {
      soup:   0, // servings
      bakery: 0, // servings
    },

    // ── Menu 2.0 ──────────────────────────────────────────────────────────────
    menu: {
      coffee:   { label: '"Bottomless" Coffee', price: 3,  generosity: 1, needs: ['coffee'],          baseCost: 0.5, cat: 'Beverage' },
      standard: { label: 'The "Standard"',      price: 12, generosity: 1, needs: ['protein','grain'], baseCost: 4.0, cat: 'Breakfast', equip: 'toaster' },
      soup:     { label: 'Matzo Ball Soup',     price: 8,  generosity: 1, needs: ['prep_soup'],       baseCost: 2.5, cat: 'Soup' },
      burger:   { label: 'Classic NY Burger',   price: 14, generosity: 1, needs: ['protein','grain'], baseCost: 5.0, cat: 'Lunch', equip: 'grill' },
      chicken:  { label: 'Grilled Chicken',     price: 16, generosity: 1, needs: ['protein','produce'],baseCost: 6.0, cat: 'Lunch', equip: 'grill' },
      muffin:   { label: 'Blueberry Muffin',    price: 5,  generosity: 1, needs: ['prep_bakery'],     baseCost: 1.5, cat: 'Bakery' },
      cheesecake:{ label: 'NY Cheesecake',      price: 9,  generosity: 1, needs: ['prep_bakery'],     baseCost: 3.0, cat: 'Dessert' },
    },

    cash:       DINER_BALANCE.STARTING_CASH,
    reputation: DINER_BALANCE.STARTING_REP,
    shiftsDone: 0,
    day:        1,
    weather:    'Clear',
    event:      EVENTS[0],
    _prices:    null,

    EVENTS, WEATHER_MULT, BASE_PRICE, FRESH_MAX,

    rollDay(forceEvent = null) {
      this.day++;
      const wList  = ['Clear','Clear','Clear','Rain','Rain','Snow','Heat'];
      this.weather = wList[Math.floor(Math.random() * wList.length)];
      this.event   = forceEvent || this.EVENTS[Math.floor(Math.random() * this.EVENTS.length)];
      this._prices = {};
      for (const [k, [lo, hi]] of Object.entries(this.BASE_PRICE)) {
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
      const m = this.menu[key];
      return m.needs.every(n => {
        if (n === 'prep_soup')   return this.prep.soup > 0;
        if (n === 'prep_bakery') return this.prep.bakery > 0;
        return this.inv[n].qty > 0;
      });
    },

    demand(key) {
      const item   = this.menu[key];
      const repF   = 0.4 + (this.reputation - DINER_BALANCE.MIN_REP)
                         / (DINER_BALANCE.MAX_REP - DINER_BALANCE.MIN_REP) * 0.8;
      const wM     = WEATHER_MULT[this.weather] || 1.0;
      let eM       = this.event.tMult;
      
      // Focus events
      if (this.event.focus && !this.event.focus.includes(key)) eM = 1.0;
      // Specific item boosts (e.g. coffee)
      if (this.event.boost[key]) eM *= this.event.boost[key];

      const gB     = 1 + (item.generosity - 1) * 0.15;
      let base     = DINER_BALANCE.BASE_TRAFFIC * repF * wM * eM * gB;

      const effCost = item.baseCost * (1 + (item.generosity - 1) * 0.5);
      if (item.price > effCost * DINER_BALANCE.PRICE_GOUGE_RATIO) base *= 0.70;

      const markup = (item.price - effCost) / (effCost + 0.01);
      base *= Math.max(0.05, 1 - markup * 0.04);

      // Equipment penalties
      if (item.equip === 'grill' && this.equip.grill < 50) base *= 0.70;
      if (item.equip === 'toaster' && this.equip.toaster < 20) base = 0;
      if (key === 'coffee' && this.equip.urn < 10) base = 0;

      return Math.max(0, base);
    },

    runShift() {
      const rep = {
        unitsSold:    {},
        grossRevenue: 0,
        walkouts:     0,
        spoilage:     0,
        netProfit:    0,
        fines:        0,
        logs:         [],
      };

      // 1. Health Inspection
      if (this.event.inspector) {
        if (this.equip.grill < 40) {
          rep.fines += 200;
          this.reputation = Math.max(DINER_BALANCE.MIN_REP, this.reputation - 1.0);
          rep.logs.push('HEALTH INSPECTOR: Dirty grill! $200 fine, -1.0 Rep.');
        } else {
          rep.logs.push('HEALTH INSPECTOR: Passed inspection.');
        }
      }

      // 2. Sales Simulation
      for (const key of Object.keys(this.menu)) {
        if (!this.inStock(key)) { rep.unitsSold[key] = 0; continue; }
        const want = Math.round(this.demand(key));
        
        let avail = 999;
        this.menu[key].needs.forEach(n => {
          if (n === 'prep_soup')   avail = Math.min(avail, this.prep.soup);
          else if (n === 'prep_bakery') avail = Math.min(avail, this.prep.bakery);
          else avail = Math.min(avail, this.inv[n].qty);
        });

        const sold = Math.min(want, avail);
        rep.unitsSold[key] = sold;
        rep.grossRevenue += sold * this.menu[key].price;

        // Consume stock
        this.menu[key].needs.forEach(n => {
          if (n === 'prep_soup')        this.prep.soup -= sold;
          else if (n === 'prep_bakery') this.prep.bakery -= sold;
          else                          this.inv[n].qty -= sold;
        });
      }

      // 3. Equipment Decay
      let gDecay = DINER_BALANCE.GRILL_DECAY * (this.event.grillMult || 1);
      this.equip.grill   = Math.max(0, this.equip.grill - gDecay);
      this.equip.toaster = Math.max(0, this.equip.toaster - DINER_BALANCE.TOASTER_DECAY);
      this.equip.urn     = Math.max(0, this.equip.urn - DINER_BALANCE.URN_DECAY);

      if (this.equip.grill < 40) rep.walkouts += 5;
      if (this.equip.urn < 10)   rep.walkouts += 10;
      
      rep.grossRevenue = Math.max(0, rep.grossRevenue - rep.walkouts * 8);

      // 4. Spoilage (Soup spoils daily, bakery survives if lucky?)
      rep.spoilage = this._applySpoilage();
      // Soup specifically spoils 100%
      if (this.prep.soup > 0) {
        rep.spoilage += this.prep.soup * 1.5;
        this.prep.soup = 0;
      }

      rep.netProfit = rep.grossRevenue - rep.spoilage - rep.fines;
      this.cash += rep.netProfit;
      this.shiftsDone++;

      // 5. Rep Drift
      const totalSold = Object.values(rep.unitsSold).reduce((a, b) => a + b, 0);
      if (totalSold > 30) this.reputation = Math.min(DINER_BALANCE.MAX_REP, this.reputation + 0.1);
      if (rep.walkouts > 5) this.reputation = Math.max(DINER_BALANCE.MIN_REP, this.reputation - 0.15);
      this.reputation = Math.round(this.reputation * 10) / 10;

      rep.customerLog = [...rep.logs, ...this._genCustomerLog(rep.unitsSold, rep.walkouts)];
      return rep;
    },

    _genCustomerLog(unitsSold, walkouts) {
      const NAMES = ['Jake','Maria','Sam','Tony','Lisa','Chen','Dave','Ana','Mike','Rosa'];
      const REACTIONS = ['— loved the NY vibe!', '— said it was "authentic".', '— left a fat tip.', '— complained about the noise.'];
      const log = [];
      Object.entries(unitsSold).forEach(([key, sold]) => {
        if (sold > 5) {
          const name = NAMES[Math.floor(Math.random() * NAMES.length)];
          const rx   = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
          log.push(`${name} had the ${this.menu[key].label} ${rx}`);
        }
      });
      if (walkouts > 0) log.push(`${walkouts} customers walked out — check equipment!`);
      if (log.length === 0) log.push('A slow day in the city.');
      return log.slice(0, 7);
    },

    _applySpoilage() {
      let lost = 0;
      for (const [k, inv] of Object.entries(this.inv)) {
        inv.fresh--;
        if (inv.fresh <= 0) {
          lost += inv.qty * (inv.cost || 2);
          inv.qty = 0;
          inv.fresh = FRESH_MAX[k];
        }
      }
      return Math.round(lost * 10) / 10;
    },

    applyReview(stars) {
      const r = this.reputation + (stars - this.reputation) * DINER_BALANCE.REVIEW_WEIGHT;
      this.reputation = Math.round(Math.min(5, Math.max(1, r)) * 10) / 10;
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
    this._page = 0;
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

    const eq = _DS.equip;
    const condStr = `Grill: ${eq.grill}% | Toaster: ${eq.toaster}% | Urn: ${eq.urn}%`;
    this._text(
      `Diner Cash: $${_DS.cash.toFixed(2)}  |  ${_DS.stars()}  (${_DS.reputation}★)`,
      this.W / 2, 72, { size: '12px', color: '#aaa' }
    );
    this._text(condStr, this.W / 2, 90, { size: '10px', color: '#888' });
    this._panel(this.W / 2, 110, 480, 2, 0x3a1500, 0xff6633);

    // Customer Mode panel
    this._panel(this.W / 2, 220, 450, 112, 0x180a00, 0xff6633);
    this._text('🍔  CUSTOMER MODE', this.W / 2, 192, { size: '18px', color: '#ff8844' });
    this._text('Specific NY staples for strategic recovery',
      this.W / 2, 228, { size: '11px', color: '#775533' });
    this._button(this.W / 2, 260, 'ORDER FOOD →', 0x3a1800, 0x5a2800,
      () => this._buildCustomerMenu(), 200, 38);

    // Manager Mode panel
    const mOpen = GameState.hour >= 6 && GameState.hour < 22;
    this._panel(this.W / 2, 390, 450, 112, mOpen ? 0x081600 : 0x111111, mOpen ? 0x44bb66 : 0x333333);
    this._text('📋  MANAGER MODE', this.W / 2, 362, { size: '18px', color: mOpen ? '#44bb66' : '#444' });
    this._text(mOpen ? 'Prep stock  ·  Monitor equipment  ·  NY Rush events'
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
    this._bg(0x221a15); // Slightly warmer background for "paper" feel
    this._title('📜  NY DINER MENU');

    this._text(
      `Wallet: $${GameState.money}  |  HP: ${GameState.hp}  |  Energy: ${GameState.energy}`,
      this.W / 2, 78, { size: '13px', color: '#aa8866' }
    );

    const EFFECTS = {
      coffee:    { hp: 5,  energy: 30 },
      standard:  { hp: 45, energy: 15 },
      soup:      { hp: 30, energy: 5  },
      burger:    { hp: 40, energy: 10 },
      chicken:   { hp: 35, energy: 20 },
      muffin:    { hp: 10, energy: 15 },
      cheesecake:{ hp: 15, energy: 25 },
    };

    // "Laminated paper" menu style
    this._panel(this.W / 2, 290, 620, 380, 0xfaf3e0, 0x8b4513); // Cream paper

    const entries = Object.entries(_DS.menu);
    const PER_PAGE = 5;
    const maxPage = Math.ceil(entries.length / PER_PAGE) - 1;
    this._page = Math.min(this._page, maxPage);
    
    const pageItems = entries.slice(this._page * PER_PAGE, (this._page + 1) * PER_PAGE);

    pageItems.forEach(([key, m], i) => {
      this._buildItemRow(key, m, EFFECTS[key], i);
    });

    this._buildPagination(this.W / 2, 485, this._page, maxPage, () => this._buildCustomerMenu());

    this._button(75, this.H - 45, '← BACK', 0x8b4513, 0xa0522d, () => { this._page = 0; this._buildLobby(); }, 110, 36);
    this._setEsc(() => { this._page = 0; this._buildLobby(); });
  }

  _buildItemRow(key, m, eff, i) {
    const x = this.W / 2;
    const y = 140 + i * 65;
    const inStock = _DS.inStock(key);
    const canBuy  = inStock && GameState.money >= m.price;

    // Item name & price
    this._text(`${m.label}`, x - 280, y, { size: '17px', color: '#2c1e1e', ox: 0 });
    this._text(`${m.cat}`, x - 280, y + 18, { size: '11px', color: '#8b4513', ox: 0 });
    this._text(`$${m.price.toFixed(2)}`, x + 110, y, { size: '17px', color: '#2c1e1e', ox: 1 });

    // Stats
    const statStr = `+${eff.hp}HP / +${eff.energy}E`;
    this._text(inStock ? statStr : 'OUT OF STOCK', x - 30, y, { 
      size: '13px', 
      color: inStock ? '#4a6741' : '#a63d3d', 
      ox: 0 
    });

    if (canBuy) {
      this._button(x + 235, y + 5, 'BUY', 0x2c1e1e, 0x4a3a3a, 
        () => this._customerBuy(key, m, eff), 70, 32);
    }
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
    this._panel(this.W / 2, 105, 600, 60, 0x0a0f0a, 0x44bb66);
    this._text(`Cash: $${_DS.cash.toFixed(2)}`, this.W / 2 - 180, 98, { size: '15px', color: '#50ff80' });
    this._text(`${_DS.stars()} (${_DS.reputation}★)`, this.W / 2, 98, { size: '15px', color: '#ffd700' });
    const eq = _DS.equip;
    this._text(`G:${eq.grill}% T:${eq.toaster}% U:${eq.urn}%`, this.W / 2 + 180, 98,
      { size: '13px', color: '#50ff80' });
    this._text(`Shifts: ${_DS.shiftsDone} | Day ${_DS.day} | ${_DS.event.name}`,
      this.W / 2, 125, { size: '11px', color: '#888' });

    // Inventory overview
    this._panel(this.W / 2, 225, 600, 110, 0x080c08, 0x2a4a2a);
    this._text('— Current Inventory —', this.W / 2, 182, { size: '13px', color: '#557755' });
    const INV_META = {
      protein: { icon: '🥩', label: 'Proteins' },
      grain:   { icon: '🍞', label: 'Grains'   },
      produce: { icon: '🥬', label: 'Produce'  },
      coffee:  { icon: '☕', label: 'Coffee'   },
    };
    let col = 0;
    Object.entries(_DS.inv).forEach(([k, inv]) => {
      const x = this.W / 2 - 215 + col * 145;
      this._text(`${INV_META[k].icon} ${INV_META[k].label}`, x, 205, { size: '12px', color: '#888' });
      this._text(`${inv.qty} units`, x, 228, { size: '15px', color: inv.qty > 0 ? '#ccc' : '#555' });
      this._text(`${inv.fresh}d fresh`, x, 250, { size: '11px', color: inv.fresh <= 1 ? '#ff6644' : '#556655' });
      col++;
    });

    // Prep Section
    this._panel(this.W / 2, 345, 600, 110, 0x0d121a, 0x3a5a8a);
    this._text('— Prep Stock —', this.W / 2, 302, { size: '13px', color: '#5577aa' });
    
    // Soup Prep
    const canSoup = _DS.inv.produce.qty >= 10 && _DS.inv.protein.qty >= 5;
    this._text(`Soup Stock: ${_DS.prep.soup} serv.`, this.W / 2 - 140, 328, { size: '14px', color: '#aaa' });
    this._button(this.W / 2 - 140, 365, 'PREP SOUP (10 Prod, 5 Prot)', canSoup ? 0x1a3a5a : 0x1a1a1a, 0x2a4a7a, () => {
      if (canSoup) {
        _DS.inv.produce.qty -= 10;
        _DS.inv.protein.qty -= 5;
        _DS.prep.soup += 20;
        this._buildManagerLobby();
      }
    }, 260, 34);

    // Bakery Prep
    const canBakery = _DS.inv.grain.qty >= 10 && _DS.inv.produce.qty >= 5;
    this._text(`Bakery Case: ${_DS.prep.bakery} serv.`, this.W / 2 + 140, 328, { size: '14px', color: '#aaa' });
    this._button(this.W / 2 + 140, 365, 'PREP BAKERY (10 Grn, 5 Prod)', canBakery ? 0x1a3a5a : 0x1a1a1a, 0x2a4a7a, () => {
      if (canBakery) {
        _DS.inv.grain.qty -= 10;
        _DS.inv.produce.qty -= 5;
        _DS.prep.bakery += 20;
        this._buildManagerLobby();
      }
    }, 260, 34);

    this._button(this.W / 2 - 110, this.H - 52, 'GO TO MARKET →', 0x0a2a0a, 0x1a4a1a, () => this._buildMarket(), 200, 40);
    this._button(this.W / 2 + 110, this.H - 52, 'SET PRICES →', 0x2a2a0a, 0x4a4a1a, () => { this._page = 0; this._buildPricing(); }, 200, 40);
    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 110, 36);
    this._setEsc(() => this._buildLobby());
  }

  _buildMarket() {
    this._clear();
    this._bg();
    if (!_DS._prices) _DS.rollDay();
    this._title(`🛒 NY MARKET — Day ${_DS.day}`);

    this._panel(this.W / 2, 85, 640, 45, 0x100c08, 0x443322);
    this._text(`${_DS.weather} | ${_DS.event.name}: ${_DS.event.desc}`, this.W / 2, 85, { size: '13px', color: '#aa8866' });
    this._text(`Diner Cash: $${_DS.cash.toFixed(2)}`, this.W / 2, 120, { size: '15px', color: '#50ff80' });

    const MARKET_META = [
      { key: 'protein', icon: '🥩', label: 'Proteins',  desc: 'Burgers, Bacon, Eggs' },
      { key: 'grain',   icon: '🍞', label: 'Grains',    desc: 'Buns, Rye, Muffins' },
      { key: 'produce', icon: '🥬', label: 'Dairy/Prod', desc: 'Soup, Toppings, Cake' },
      { key: 'coffee',  icon: '☕', label: 'Grounds',   desc: 'Coffee' },
    ];

    MARKET_META.forEach((meta, i) => {
      const mp  = _DS.marketPrice(meta.key);
      const inv = _DS.inv[meta.key];
      const y   = 195 + i * 75;
      this._panel(this.W / 2, y, 680, 60, 0x0c0908, 0x3a2a18);

      this._text(`${meta.icon} ${meta.label}`, this.W / 2 - 320, y - 12, { size: '16px', color: '#ccc', ox: 0 });
      this._text(`${inv.qty} in stock | ${meta.desc}`, this.W / 2 - 320, y + 15, { size: '11px', color: '#667755', ox: 0 });
      this._text(`$${mp}/unit`, this.W / 2 - 20, y, { size: '16px', color: '#ffd700' });

      [10, 25, 50].forEach((amt, bi) => {
        const cost = Math.round(mp * amt * 10) / 10;
        const canAfford = _DS.cash >= cost;
        this._button(this.W / 2 + 105 + bi * 85, y, `+${amt} $${cost}`, canAfford ? 0x1a1400 : 0x1a1a1a, 0x3a2800, () => {
          if (_DS.cash >= cost) { _DS.cash -= cost; inv.qty += amt; this._buildMarket(); }
        }, 75, 32);
      });
    });

    // Repairs
    this._panel(this.W / 2, 485, 680, 55, 0x0c0808, 0x5a2222);
    const eq = _DS.equip;
    this._text(`🔧 Grill: ${eq.grill}% | Toaster: ${eq.toaster}% | Urn: ${eq.urn}%`, this.W / 2 - 140, 485, { size: '14px', color: '#aaa', ox: 0 });
    const canRepair = _DS.cash >= DINER_BALANCE.REPAIR_COST;
    this._button(this.W / 2 + 230, 485, `Repair All ($${DINER_BALANCE.REPAIR_COST})`, canRepair ? 0x2a0a0a : 0x1a1a1a, 0x4a1a1a, () => {
      if (canRepair) { _DS.cash -= DINER_BALANCE.REPAIR_COST; eq.grill = 100; eq.toaster = 100; eq.urn = 100; this._buildMarket(); }
    }, 160, 36);

    this._button(70, this.H - 52, '← BACK', 0x2a2a2a, 0x444444, () => this._buildManagerLobby(), 110, 36);
    this._setEsc(() => this._buildManagerLobby());
  }

  _buildPricing() {
    this._clear();
    this._bg();
    this._title('💲 NY PRICING');

    this._text(`Event: ${_DS.event.name} | Rep: ${_DS.stars()}`, this.W / 2, 72, { size: '13px', color: '#888' });

    let gouged = [];
    const entries = Object.entries(_DS.menu);
    const PER_PAGE = 4;
    const maxPage = Math.ceil(entries.length / PER_PAGE) - 1;
    this._page = Math.min(this._page, maxPage);
    
    const pageItems = entries.slice(this._page * PER_PAGE, (this._page + 1) * PER_PAGE);

    pageItems.forEach(([key, item], i) => {
      const inStock = _DS.inStock(key);
      const effCost = item.baseCost * (1 + (item.generosity - 1) * 0.5);
      const units   = inStock ? Math.round(_DS.demand(key)) : 0;
      const y       = 155 + i * 80;

      this._panel(this.W / 2, y, 640, 70, inStock ? 0x0d0d1a : 0x0d0d0d, 0x3a3a5a);
      
      // Label & Stock info
      this._text(item.label, this.W / 2 - 300, y - 10, { size: '16px', color: '#fff', ox: 0 });
      this._text(`${item.cat} | ${inStock ? 'In Stock' : 'OUT'}`, this.W / 2 - 300, y + 15, { size: '11px', color: inStock ? '#888' : '#ff4444', ox: 0 });

      // Price controls
      this._button(this.W / 2 - 20, y, '−', 0x2a0a1a, 0x4a1a2a, () => { 
        item.price = Math.max(1, item.price - 1); 
        this._buildPricing(); 
      }, 36, 30);
      
      this._text(`$${item.price}`, this.W / 2 + 35, y, { size: '20px', color: '#ffd700' });
      
      this._button(this.W / 2 + 90, y, '+', 0x0a2a0a, 0x1a4a1a, () => { 
        item.price = Math.min(50, item.price + 1); 
        this._buildPricing(); 
      }, 36, 30);

      // Generosity toggle
      const genL = ['Norm', 'Gen', 'Extra'][item.generosity - 1];
      this._button(this.W / 2 + 185, y, genL, 0x1a1a00, 0x2a2a00, () => { 
        item.generosity = (item.generosity % 3) + 1; 
        this._buildPricing(); 
      }, 75, 30);

      // Sales estimate
      this._text(`Est. ${units} sold`, this.W / 2 + 310, y, { size: '13px', color: '#55ff88', ox: 1 });
      
      if (item.price > effCost * DINER_BALANCE.PRICE_GOUGE_RATIO) gouged.push(item.label);
    });

    if (gouged.length > 0) {
      this._text(`⚠ Gouging: ${gouged.join(', ')} (-30% demand)`, this.W / 2, 98, { size: '12px', color: '#ff6666' });
    }

    this._buildPagination(this.W / 2, 475, this._page, maxPage, () => this._buildPricing());

    this._button(this.W / 2, this.H - 45, 'RUN SHIFT ▶', 0x0a2a0a, 0x1a4a1a, () => this._runShift(), 200, 40);
    this._button(75, this.H - 45, '← BACK', 0x2a2a2a, 0x444444, () => { this._page = 0; this._buildManagerLobby(); }, 110, 36);
    this._setEsc(() => { this._page = 0; this._buildManagerLobby(); });
  }

  _buildPagination(x, y, current, max, cb) {
    if (max <= 0) return;
    this._text(`Page ${current + 1} of ${max + 1}`, x, y - 25, { size: '12px', color: '#888' });
    
    if (current > 0) {
      this._button(x - 80, y, '◀ PREV', 0x333333, 0x555555, () => { this._page--; cb(); }, 100, 30);
    }
    if (current < max) {
      this._button(x + 80, y, 'NEXT ▶', 0x333333, 0x555555, () => { this._page++; cb(); }, 100, 30);
    }
  }

  _runShift() {
    const report = _DS.runShift();
    GameState.advanceHours(4);
    this._buildShiftResults(report);
  }

  _buildShiftResults(rep) {
    this._clear();
    this._bg(0x050510);
    this._title('📊 NY SHIFT REPORT');

    // Rush Meter (Satisfaction)
    const sat = Math.min(100, (rep.grossRevenue / (rep.grossRevenue + rep.walkouts * 10 + 1)) * 100);
    this._panel(this.W / 2, 105, 440, 25, 0x222222, 0x444444);
    this._track(this.add.rectangle(this.W / 2 - 215 + (sat * 2.15), 105, sat * 4.3, 22, 0x44bb66));
    this._text(`Customer Satisfaction: ${Math.round(sat)}%`, this.W / 2, 82, { size: '14px', color: '#fff' });

    const LX = 210, RX = 590;
    this._panel(LX, 315, 380, 350, 0x08090c, 0x2a3a5a);
    this._panel(RX, 315, 380, 350, 0x080c08, 0x2a5a2a);

    this._text('— CITY BUZZ —', LX, 158, { size: '14px', color: '#5577aa' });
    rep.customerLog.forEach((line, i) => {
      this._text(line, LX - 170, 190 + i * 35, { size: '11px', color: '#9999cc', ox: 0, wrap: 340 });
    });

    this._text('— FINANCIALS —', RX, 158, { size: '14px', color: '#557755' });
    let ry = 190;
    const rows = [
      { l: 'Gross Revenue', v: `$${rep.grossRevenue.toFixed(2)}`, c: '#50ccff' },
      { l: 'Walk-outs',     v: `-$${(rep.walkouts * 8).toFixed(2)}`, c: '#ff6644' },
      { l: 'Spoilage',      v: `-$${rep.spoilage.toFixed(2)}`, c: '#ff9944' },
      { l: 'Fines',         v: `-$${rep.fines.toFixed(2)}`, c: '#ff4444' },
      null,
      { l: 'Net Profit',    v: `$${rep.netProfit.toFixed(2)}`, c: rep.netProfit >= 0 ? '#50ff80' : '#ff4444' },
      { l: 'Diner Cash',    v: `$${_DS.cash.toFixed(2)}`, c: '#ffd700' },
    ];
    rows.forEach(r => {
      if (!r) { ry += 12; return; }
      this._text(r.l, RX - 170, ry, { size: '12px', color: '#888', ox: 0 });
      this._text(r.v, RX + 170, ry, { size: '12px', color: r.c, ox: 1 });
      ry += 28;
    });

    this._button(this.W / 2, this.H - 52, 'NEXT DAY ▶', 0x0a2a0a, 0x1a4a1a, () => { 
      this._page = 0; 
      _DS.rollDay(); 
      this._buildManagerLobby(); 
    }, 200, 40);
    this.input.keyboard.once('keydown-ESC', () => { this._page = 0; this._exit(); });
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
