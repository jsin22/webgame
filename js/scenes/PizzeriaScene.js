/**
 * PizzeriaScene — "Pizzeria Shift" mini-game.
 * Launched on top of (paused) GameScene.
 *
 * Lobby → Work Shift: ORDER_REVEAL → ASSEMBLY → SLICING → RESULTS (per pizza) → ROUND RESULT
 * Lobby → Order Food: buy food to restore HP / Energy
 *
 * Session mode: rounds keep going until score < passThreshold. Session state
 * persists across scene re-entries via module-level _PizSess.
 */

// ── Ingredient registry ────────────────────────────────────────────────────────
const _ING = {
  Dough:     { layer: 0, color: 0xc8a050 },
  Sauce:     { layer: 1, color: 0xcc2200 },
  Cheese:    { layer: 2, color: 0xffcc00 },
  Pepperoni: { layer: 3, color: 0x8b0000 },
  Mushrooms: { layer: 3, color: 0x7a5010 },
  Onions:    { layer: 3, color: 0x9966cc },
  Peppers:   { layer: 3, color: 0x228b22 },
  Olives:    { layer: 3, color: 0x2d4a1e },
};
const _TOPPING_LIST = ['Pepperoni', 'Mushrooms', 'Onions', 'Peppers', 'Olives'];
const _BASE_LAYERS  = ['Dough', 'Sauce', 'Cheese'];
const _ALL_BINS     = [..._BASE_LAYERS, ..._TOPPING_LIST];

// ── Module-level session state (persists across scene restarts) ────────────────
const _PizSess = { round: 0, earnings: 0, active: false };

// ── Difficulty scaling ─────────────────────────────────────────────────────────
function _pizDiff(round) {
  return {
    numPizzas:     Math.min(1 + Math.floor(round / 2), 3),
    numToppings:   Math.min(1 + round, 3),
    revealSecs:    Math.max(2, (3 + 0.5 * Math.min(1 + Math.floor(round / 2), 3)) - round * 0.25),
    useHalf:       round >= 2,
    passThreshold: 0.60,
  };
}

// ── Bin display name ──────────────────────────────────────────────────────────
function _binDisplayName(name, side) {
  if (side === 'full') return name;
  if (side === 'left')  return '\u00bdL ' + name.slice(0, 4);
  if (side === 'right') return '\u00bdR ' + name.slice(0, 4);
  return name;
}

// ── Scatter positions for pizza toppings ──────────────────────────────────────
const _SCATTER_FULL = [
  { dx:  0,  dy: -32 }, { dx:  30, dy: -14 }, { dx:  30, dy:  18 },
  { dx:  0,  dy:  34 }, { dx: -30, dy:  18 }, { dx: -30, dy: -14 },
];
const _SCATTER_LEFT = [
  { dx: -22, dy: -22 }, { dx: -32, dy:  8 }, { dx: -14, dy:  28 },
];
const _SCATTER_RIGHT = [
  { dx:  22, dy: -22 }, { dx:  32, dy:  8 }, { dx:  14, dy:  28 },
];

class PizzeriaScene extends Phaser.Scene {
  constructor() { super({ key: 'PizzeriaScene' }); }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    // Pizza circle geometry
    this._PX = this.W / 2;
    this._PY = 220;
    this._PR = 80;

    // Multi-pizza session state (reset each round)
    this._orders        = [];   // array of pizza orders for this ticket
    this._curPizzaIdx   = 0;    // index of pizza currently being worked on
    this._allBuildLists = [];   // buildList per pizza
    this._allCutSets    = [];   // cuts per pizza

    // Current pizza working state
    this._buildList     = [];
    this._cuts          = [];

    // Graphics layers
    this._pizzaG        = null;
    this._sliceG        = null;
    this._previewG      = null;
    this._dragStart     = null;
    this._sliceHandlers = null;

    // UI management
    this._elements   = [];
    this._escHandler = null;
    this._binRects   = {};

    this._buildLobby();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Utility helpers
  // ════════════════════════════════════════════════════════════════════════════

  _clear() {
    this._elements.forEach(e => { if (e?.destroy) e.destroy(); });
    this._elements = [];
  }
  _track(obj) { this._elements.push(obj); return obj; }
  _bg(color = 0x080812) {
    this._track(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, color));
  }
  _title(text, y = 38) {
    this._track(this.add.text(this.W / 2, y, text, {
      fontFamily: 'Courier New', fontSize: '20px',
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
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
    }).setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5));
  }
  _panel(x, y, w, h, fill = 0x0d0d20, stroke = 0x3a3a6a) {
    return this._track(this.add.rectangle(x, y, w, h, fill).setStrokeStyle(1, stroke));
  }
  _button(x, y, label, bg, hover, cb, w = 170, h = 42) {
    const rect = this._track(
      this.add.rectangle(x, y, w, h, bg)
        .setStrokeStyle(2, 0xff9900).setInteractive({ useHandCursor: true })
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
    const h = GameState.hour, m = GameState.minute;
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Lobby
  // ════════════════════════════════════════════════════════════════════════════

  _buildLobby() {
    this._clear();
    this._bg();
    this._title('\uD83C\uDF55  PIZZA PALACE');
    this._text(
      `Balance: $${GameState.money}  |  HP: ${GameState.hp}/${GameState.maxHp}  |  Energy: ${GameState.energy}/${GameState.maxEnergy}`,
      this.W / 2, 72, { size: '12px', color: '#aaaaaa' }
    );

    // Active session banner
    if (_PizSess.active) {
      this._panel(this.W / 2, 100, 480, 28, 0x1a1200, 0xffaa33);
      this._text(
        `Session in progress — Round ${_PizSess.round + 1} — Earned: $${_PizSess.earnings}`,
        this.W / 2, 100, { size: '11px', color: '#ffaa33' }
      );
    }

    this._panel(this.W / 2, _PizSess.active ? 118 : 106, 480, 2, 0x3a2200, 0xff9900);

    const baseY = _PizSess.active ? 130 : 118;

    // ORDER FOOD
    this._panel(this.W / 2, baseY + 97, 440, 110, 0x1a0e00, 0xff9900);
    this._text('\uD83C\uDF55  ORDER FOOD', this.W / 2, baseY + 74, { size: '18px', color: '#ff9900' });
    this._text('Buy a slice or whole pizza to restore HP and energy',
      this.W / 2, baseY + 107, { size: '11px', color: '#887755' });
    this._button(this.W / 2, baseY + 137, 'ORDER \u2192', 0x3a1e00, 0x5a3200,
      () => this._buildMenu(), 200, 38);

    // WORK A SHIFT
    const workOpen = GameState.hour >= 10 && GameState.hour < 22;
    this._panel(this.W / 2, baseY + 260, 440, 110, workOpen ? 0x001a00 : 0x111111, workOpen ? 0x50ff80 : 0x333333);
    this._text('\uD83D\uDCBC  WORK A SHIFT', this.W / 2, baseY + 237, { size: '18px', color: workOpen ? '#50ff80' : '#444' });
    this._text(
      workOpen ? 'Memorize the order, build the pizza, slice it right!' : `Closed until 10:00 AM  (now ${this._fmtTime()})`,
      this.W / 2, baseY + 270, { size: '11px', color: workOpen ? '#558855' : '#555' }
    );
    this._button(
      this.W / 2, baseY + 300, workOpen ? 'WORK \u2192' : 'CLOSED',
      workOpen ? 0x0a2a0a : 0x1a1a1a, workOpen ? 0x1a4a1a : 0x1a1a1a,
      () => { if (workOpen) this._startShift(); else this._buildClosed(); },
      200, 38
    );

    this._button(70, this.H - 48, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 110, 34);
    this._setEsc(() => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Food Menu
  // ════════════════════════════════════════════════════════════════════════════

  _buildMenu() {
    this._clear();
    this._bg();
    this._title('\uD83C\uDF55  PIZZA PALACE \u2014 Menu');
    this._text(
      `Balance: $${GameState.money}  |  HP: ${GameState.hp}/${GameState.maxHp}  |  Energy: ${GameState.energy}/${GameState.maxEnergy}`,
      this.W / 2, 72, { size: '12px', color: '#aaaaaa' }
    );
    const ITEMS = [
      { name: 'Slice',      price:  8, hp: 20, energy:  0 },
      { name: 'Half Pizza', price: 15, hp: 45, energy: 15 },
      { name: 'Full Pizza', price: 25, hp: 80, energy: 35 },
    ];
    ITEMS.forEach((item, i) => {
      const y   = 158 + i * 92;
      const can = GameState.money >= item.price;
      this._panel(this.W / 2, y, 540, 76, can ? 0x0d0f0a : 0x0d0d0d, can ? 0x3a5a2a : 0x2a2a2a);
      this._text(item.name, this.W / 2 - 200, y - 16, { size: '16px', color: can ? '#fff' : '#555', ox: 0 });
      this._text(`+${item.hp} HP${item.energy ? `   +${item.energy} Energy` : ''}`,
        this.W / 2 - 200, y + 12, { size: '12px', color: can ? '#50ff80' : '#444', ox: 0 });
      this._text(`$${item.price}`, this.W / 2 + 60, y, { size: '18px', color: can ? '#ffd700' : '#444' });
      this._button(this.W / 2 + 195, y, can ? 'BUY' : 'N/A',
        can ? 0x1a3a0a : 0x1a1a1a, can ? 0x2a5a1a : 0x1a1a1a,
        () => { if (can) this._buyItem(item); }, 80, 34);
    });
    this._button(70, this.H - 48, '\u2190 BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 110, 34);
    this._setEsc(() => this._buildLobby());
  }

  _buyItem(item) {
    GameState.addMoney(-item.price);
    GameState.addHp(item.hp);
    if (item.energy > 0) GameState.addEnergy(item.energy);
    SaveManager.save();
    this._clear();
    this._bg(0x060f06);
    this._title('\uD83C\uDF55  PIZZA PALACE');
    this._panel(this.W / 2, this.H / 2 - 20, 460, 170, 0x0a1a0a, 0x50ff80);
    this._text('Enjoy your food! \uD83C\uDF55', this.W / 2, this.H / 2 - 68, { size: '20px', color: '#50ff80' });
    this._text(`${item.name} \u2014 $${item.price} charged`, this.W / 2, this.H / 2 - 35, { size: '13px', color: '#aaa' });
    this._text(
      `HP: ${GameState.hp}/${GameState.maxHp}${item.energy ? `   Energy: ${GameState.energy}/${GameState.maxEnergy}` : ''}`,
      this.W / 2, this.H / 2 + 2, { size: '14px', color: '#50ff80' });
    this._text(`Balance: $${GameState.money}`, this.W / 2, this.H / 2 + 38, { size: '13px', color: '#ffd700' });
    this._button(this.W / 2 - 90, this.H - 48, 'ORDER MORE', 0x1a3a0a, 0x2a5a1a, () => this._buildMenu(), 158, 38);
    this._button(this.W / 2 + 90, this.H - 48, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 138, 38);
    this._setEsc(() => this._exit());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Closed screen
  // ════════════════════════════════════════════════════════════════════════════

  _buildClosed() {
    this._clear();
    this._bg();
    this._title('\uD83C\uDF55  PIZZA PALACE');
    this._panel(this.W / 2, this.H / 2, 460, 140, 0x1a0a0a, 0x664444);
    this._text('CLOSED', this.W / 2, this.H / 2 - 35, { size: '22px', color: '#ff4444' });
    this._text(`Current time: ${this._fmtTime()}`, this.W / 2, this.H / 2);
    this._text('Shifts available: 10:00 AM \u2013 10:00 PM', this.W / 2, this.H / 2 + 30, { color: '#888' });
    this._button(this.W / 2 - 80, this.H - 48, '\u2190 BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 130, 34);
    this._button(this.W / 2 + 80, this.H - 48, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 110, 34);
    this._setEsc(() => this._buildLobby());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SHIFT: Order generation
  // ════════════════════════════════════════════════════════════════════════════

  _startShift() {
    // Initialize session if not active
    if (!_PizSess.active) {
      _PizSess.round    = 0;
      _PizSess.earnings = 0;
      _PizSess.active   = true;
    }

    const diff = _pizDiff(_PizSess.round);

    // Generate orders for all pizzas this round
    this._orders        = [];
    this._allBuildLists = [];
    this._allCutSets    = [];
    this._curPizzaIdx   = 0;

    for (let p = 0; p < diff.numPizzas; p++) {
      const order = this._generateOrder(diff);
      this._orders.push(order);
      this._allBuildLists.push([]);
      this._allCutSets.push([]);
    }

    // Reset current working state
    this._buildList = [];
    this._cuts      = [];

    this._revealOrder();
  }

  _generateOrder(diff) {
    // Slices: random 1-10 (including odd numbers)
    const slices = 1 + Math.floor(Math.random() * 10);

    // Toppings — pick numToppings unique toppings
    const chosenToppings = Phaser.Utils.Array.Shuffle([..._TOPPING_LIST]).slice(0, diff.numToppings);

    const ingredients = [];
    // Base layers always full
    for (const base of _BASE_LAYERS) {
      ingredients.push({ name: base, side: 'full' });
    }
    // Toppings — some can be halves if difficulty allows
    for (const top of chosenToppings) {
      let side = 'full';
      if (diff.useHalf && Math.random() < 0.45) {
        side = Math.random() < 0.5 ? 'left' : 'right';
      }
      ingredients.push({ name: top, side });
    }

    return { ingredients, slices };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1: ORDER_REVEAL — show ticket, then go to assembly
  // ════════════════════════════════════════════════════════════════════════════

  _revealOrder() {
    this._clear();
    this._setEsc(null);
    this._bg();

    const diff      = _pizDiff(_PizSess.round);
    const revealSec = Math.round(diff.revealSecs);
    const W = this.W, H = this.H;

    this._title('\uD83D\uDCCB  MEMORIZE YOUR ORDER!');
    this._text(`Round ${_PizSess.round + 1}  |  ${diff.numPizzas} pizza${diff.numPizzas > 1 ? 's' : ''}`,
      W / 2, 68, { size: '12px', color: '#998866' });

    // Countdown display
    const timerTxt = this._text(String(revealSec), W / 2, 92, { size: '22px', color: '#ffaa33' });

    // ── Ticket panel ──────────────────────────────────────────────────────────
    // Calculate height needed for all pizzas
    const perPizzaH = 24 + this._orders.reduce((mx, o) => Math.max(mx, o.ingredients.length), 0) * 20 + 28;
    const ticketH   = 40 + this._orders.length * (perPizzaH + 12);
    const ticketW   = 420;
    const ticketY   = 115 + ticketH / 2;

    this._panel(W / 2, ticketY, ticketW, ticketH, 0x1a1200, 0xffaa33);
    this._text('\u2500\u2500\u2500 ORDER TICKET \u2500\u2500\u2500',
      W / 2, ticketY - ticketH / 2 + 18, { size: '13px', color: '#ffaa33' });

    let py = ticketY - ticketH / 2 + 38;
    this._orders.forEach((order, oi) => {
      const hasHalf = order.ingredients.some(i => i.side !== 'full');

      this._text(`PIZZA ${oi + 1}:`, W / 2 - ticketW / 2 + 24, py,
        { size: '13px', color: '#ffdd88', ox: 0 });
      py += 20;

      order.ingredients.forEach(ing => {
        const meta  = _ING[ing.name];
        const hex   = '#' + meta.color.toString(16).padStart(6, '0');
        const label = ing.side === 'full'
          ? `\u2022 ${ing.name}`
          : `\u2022 ${ing.name} (${ing.side === 'left' ? '\u00bdL' : '\u00bdR'})`;
        this._text(label, W / 2 - ticketW / 2 + 32, py,
          { size: '13px', color: hex, ox: 0 });
        py += 20;
      });

      const req = Math.ceil(order.slices / 2);
      this._text(`Slices: ${order.slices}  (${req} cut${req !== 1 ? 's' : ''})`,
        W / 2 - ticketW / 2 + 32, py, { size: '12px', color: '#ffd700', ox: 0 });
      py += 28;
    });

    this._text('Ticket hides when the timer hits 0!',
      W / 2, H - 48, { size: '11px', color: '#556677' });

    // Countdown → assembly
    let t = revealSec;
    const tick = this.time.addEvent({
      delay: 1000, repeat: revealSec - 1,
      callback: () => {
        t--;
        if (timerTxt?.active) timerTxt.setText(String(Math.max(0, t)));
        if (t <= 0) { tick.remove(); this._startAssembly(); }
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2: ASSEMBLY — build the current pizza from memory
  // ════════════════════════════════════════════════════════════════════════════

  _startAssembly() {
    this._clear();
    this._setEsc(() => this._exit());
    this._binRects = {};

    const order = this._orders[this._curPizzaIdx];
    this._buildList = this._allBuildLists[this._curPizzaIdx];

    const W = this.W, H = this.H;
    const totalPizzas = this._orders.length;
    const pizzaLabel  = totalPizzas > 1
      ? `Pizza ${this._curPizzaIdx + 1} of ${totalPizzas}`
      : 'Build the Pizza';

    this._bg();
    this._title(`\uD83C\uDF55  ${pizzaLabel.toUpperCase()} FROM MEMORY`);
    this._text(
      `${order.ingredients.length} ingredients in order \u00b7 ${order.slices} slices needed`,
      W / 2, 65, { size: '11px', color: '#556677' }
    );

    // Pizza graphic
    this._pizzaG = this.add.graphics();
    this._track(this._pizzaG);
    this._drawPizza(this._buildList);

    this._progressText = this._text(
      `Added: ${this._buildList.length}`, W / 2, 322, { color: '#888', size: '12px' });
    this._feedbackText = this._text('', W / 2, 344, { size: '15px', color: '#55ff88' });

    // ── Ingredient bins ───────────────────────────────────────────────────────
    // Determine which half bins are needed for THIS pizza
    const halfBins = [];
    const usedHalfNames = new Set();
    order.ingredients.forEach(ing => {
      if (ing.side !== 'full' && !usedHalfNames.has(ing.name + ing.side)) {
        usedHalfNames.add(ing.name + ing.side);
        halfBins.push({ name: ing.name, side: ing.side });
      }
    });

    // Full bins: all 8 standard bins
    const fullBinDefs = _ALL_BINS.map(n => ({ name: n, side: 'full' }));
    // Combined: full bins + half bins
    const allBinDefs = [...fullBinDefs, ...halfBins];

    const cols   = 4;
    const binW   = 88, binH = 36, hGap = 8, vGap = 8;
    const totalBinCols = cols;
    const startX = W / 2 - (totalBinCols / 2 - 0.5) * (binW + hGap);
    const binStartY = 380;

    allBinDefs.forEach((bDef, i) => {
      const binKey = `${bDef.name}:${bDef.side}`;
      const bx     = startX + (i % cols) * (binW + hGap);
      const by     = binStartY + Math.floor(i / cols) * (binH + vGap);

      // Check if already placed
      const placed = this._buildList.some(b => b.name === bDef.name && b.side === bDef.side);
      const c      = _ING[bDef.name]?.color ?? 0x888888;
      const label  = _binDisplayName(bDef.name, bDef.side);

      const rect = this._track(
        this.add.rectangle(bx, by, binW, binH, placed ? 0x111111 : 0x1a1a1a)
          .setStrokeStyle(2, placed ? 0x333333 : c)
          .setInteractive({ useHandCursor: !placed })
      );
      const txt = this._text(label, bx, by, {
        size: '10px', color: placed ? '#444' : '#ffffff',
      });
      this._binRects[binKey] = { rect, txt };

      if (!placed) {
        rect.on('pointerover',  () => rect.setFillStyle(0x2a2a2a));
        rect.on('pointerout',   () => rect.setFillStyle(0x1a1a1a));
        rect.on('pointerdown',  () => rect.setAlpha(0.6));
        rect.on('pointerup',    () => { rect.setAlpha(1); this._onIngredientClick(bDef.name, bDef.side); });
      }
    });

    this._button(W / 2 + 60, H - 48, 'DONE BUILDING \u25b6', 0x0a2a0a, 0x1a4a1a,
      () => this._startSlicing(), 196, 36);
    this._button(70, H - 48, 'QUIT', 0x2a2a2a, 0x444444, () => this._exit(), 110, 34);
  }

  _onIngredientClick(name, side) {
    const binKey = `${name}:${side}`;
    if (this._buildList.some(b => b.name === name && b.side === side)) return;

    const order   = this._orders[this._curPizzaIdx];
    const thisLayer = _ING[name]?.layer ?? 3;
    const currentMaxLayer = this._buildList.reduce(
      (mx, i) => Math.max(mx, _ING[i.name]?.layer ?? 0), -1);

    const inOrder = order.ingredients.some(i => i.name === name && i.side === side);

    let msg, color;
    if (!inOrder) {
      msg   = `\u2717 ${_binDisplayName(name, side)} \u2014 not on order!`;
      color = '#ff4444';
    } else if (thisLayer < currentMaxLayer) {
      msg   = '\u2717 Messy pizza! Wrong order!';
      color = '#ff8800';
    } else {
      msg   = `\u2713 ${_binDisplayName(name, side)}`;
      color = '#55ff88';
    }

    this._buildList.push({ name, side });
    this._drawPizza(this._buildList);

    if (this._feedbackText?.active) this._feedbackText.setText(msg).setColor(color);
    if (this._progressText?.active) this._progressText.setText(`Added: ${this._buildList.length}`);

    // Gray out this bin in-place
    const bin = this._binRects?.[binKey];
    if (bin?.rect?.active) {
      bin.rect.removeAllListeners();
      bin.rect.setFillStyle(0x111111).setStrokeStyle(2, 0x333333).setAlpha(1);
      bin.rect.disableInteractive();
    }
    if (bin?.txt?.active) bin.txt.setColor('#444');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Pizza drawing
  // ════════════════════════════════════════════════════════════════════════════

  _drawPizza(buildList) {
    const g = this._pizzaG;
    if (!g?.active) return;
    g.clear();

    const cx = this._PX, cy = this._PY, r = this._PR;
    const placed = buildList || [];

    // Dough base
    g.fillStyle(0xd4a843);
    g.fillCircle(cx, cy, r);
    g.lineStyle(4, 0xb88a30);
    g.strokeCircle(cx, cy, r);

    if (placed.some(i => i.name === 'Sauce')) {
      g.fillStyle(0xcc2200, 0.88);
      g.fillCircle(cx, cy, r - 7);
    }

    if (placed.some(i => i.name === 'Cheese')) {
      g.fillStyle(0xffcc00, 0.82);
      [
        { dx:  0,  dy:  0,  r: 26 },
        { dx:  24, dy: -16, r: 18 },
        { dx: -24, dy: -16, r: 18 },
        { dx:  0,  dy:  28, r: 18 },
        { dx:  26, dy:  14, r: 14 },
        { dx: -26, dy:  14, r: 14 },
      ].forEach(p => g.fillCircle(cx + p.dx, cy + p.dy, p.r));
    }

    // Check if any half toppings are present — draw dividing line if so
    const hasHalf = placed.some(i => _TOPPING_LIST.includes(i.name) && i.side !== 'full');
    if (hasHalf) {
      g.lineStyle(1.5, 0xffffff, 0.25);
      g.lineBetween(cx, cy - r + 4, cx, cy + r - 4);
    }

    // Toppings
    const toppingItems = placed.filter(i => _TOPPING_LIST.includes(i.name));
    toppingItems.forEach((item, ti) => {
      const col  = _ING[item.name]?.color ?? 0x888888;
      let pts;
      if (item.side === 'left')       pts = _SCATTER_LEFT;
      else if (item.side === 'right') pts = _SCATTER_RIGHT;
      else                            pts = _SCATTER_FULL;

      g.fillStyle(col);
      pts.forEach(p => g.fillCircle(cx + p.dx, cy + p.dy, 8));
      g.fillStyle(0xffffff, 0.22);
      pts.forEach(p => g.fillCircle(cx + p.dx - 2, cy + p.dy - 2, 3));
    });

    // Crust ring on top
    g.lineStyle(3, 0xb88a30, 0.5);
    g.strokeCircle(cx, cy, r);
  }

  _drawCutLines() {
    if (!this._sliceG?.active) return;
    const g = this._sliceG;
    g.clear();
    g.lineStyle(2.5, 0xffffff, 0.85);
    this._cuts.forEach(({ x1, y1, x2, y2 }) => {
      g.lineBetween(x1, y1, x2, y2);
    });
    g.fillStyle(0xffffff, 0.6);
    this._cuts.forEach(({ x1, y1, x2, y2 }) => {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      g.fillCircle(mx, my, 3);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3: SLICING — drag to cut the pizza
  // ════════════════════════════════════════════════════════════════════════════

  _startSlicing() {
    this._clear();
    this._setEsc(null);
    this._bg();

    const order        = this._orders[this._curPizzaIdx];
    const requiredCuts = Math.ceil(order.slices / 2);
    this._cuts         = this._allCutSets[this._curPizzaIdx];

    const W = this.W, H = this.H;
    const totalPizzas = this._orders.length;
    const pizzaLabel  = totalPizzas > 1
      ? `Pizza ${this._curPizzaIdx + 1} of ${totalPizzas}`
      : 'Slice the Pizza';

    this._title(`\uD83D\uDD2A  ${pizzaLabel.toUpperCase()}`);
    this._text(
      `Required cuts: ${requiredCuts} (for ${order.slices} slice${order.slices !== 1 ? 's' : ''})`,
      W / 2, 65, { size: '12px', color: '#aabbcc' }
    );

    // Pizza + slice layers
    this._pizzaG = this.add.graphics();
    this._track(this._pizzaG);
    this._drawPizza(this._allBuildLists[this._curPizzaIdx]);

    this._sliceG = this.add.graphics();
    this._track(this._sliceG);
    this._drawCutLines();

    this._previewG = this.add.graphics();
    this._track(this._previewG);

    this._cutCountText = this._text(
      `Cuts: 0 / ${requiredCuts}`, W / 2, 322, { size: '15px', color: '#ffdd44' });

    this._sliceFeedbackText = this._text('', W / 2, 346, { size: '13px', color: '#ff8844' });

    this._text('Click and drag across the pizza to cut', W / 2, 372, { size: '11px', color: '#445566' });

    this._button(W / 2 + 60, H - 48, 'DONE CUTTING \u25b6', 0x0a2a0a, 0x1a4a1a,
      () => this._finishSlicing(), 196, 36);
    this._button(70, H - 48, 'RESET CUTS', 0x2a1a00, 0x4a3000,
      () => {
        this._cuts.length = 0;
        this._drawCutLines();
        this._updateCutCount(requiredCuts);
      }, 130, 34);

    this._setupSliceInput(requiredCuts);
  }

  _setupSliceInput(requiredCuts) {
    const onDown = (ptr) => {
      this._dragStart = { x: ptr.x, y: ptr.y };
    };

    const onMove = (ptr) => {
      if (!this._dragStart || !this._previewG?.active) return;
      const g = this._previewG;
      g.clear();
      g.lineStyle(2, 0xffffff, 0.40);
      g.lineBetween(this._dragStart.x, this._dragStart.y, ptr.x, ptr.y);
    };

    const onUp = (ptr) => {
      if (!this._dragStart) return;
      const { x: x1, y: y1 } = this._dragStart;
      const x2 = ptr.x, y2 = ptr.y;
      this._dragStart = null;
      if (this._previewG?.active) this._previewG.clear();
      this._onSliceAttempt(x1, y1, x2, y2, requiredCuts);
    };

    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup',   onUp);
    this._sliceHandlers = { onDown, onMove, onUp };
  }

  _cleanupSliceInput() {
    if (!this._sliceHandlers) return;
    const { onDown, onMove, onUp } = this._sliceHandlers;
    this.input.off('pointerdown', onDown);
    this.input.off('pointermove', onMove);
    this.input.off('pointerup',   onUp);
    this._sliceHandlers = null;
  }

  // Line-segment ↔ circle intersection (quadratic formula parametric form)
  _lineHitsCircle(x1, y1, x2, y2) {
    const cx = this._PX, cy = this._PY, r = this._PR;
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a  = dx * dx + dy * dy;
    if (a === 0) return false;
    const b    = 2 * (fx * dx + fy * dy);
    const c    = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 <= 0 && t2 >= 1);
  }

  _distPointToSegment(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    const t  = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(x1 + t * dx - px, y1 + t * dy - py);
  }

  _onSliceAttempt(x1, y1, x2, y2, requiredCuts) {
    const minLen = 60;
    if (Math.hypot(x2 - x1, y2 - y1) < minLen) return;

    if (!this._lineHitsCircle(x1, y1, x2, y2)) {
      this._showSliceFeedback('Missed! Draw through the pizza.', '#ff6644');
      return;
    }

    const distToCenter = this._distPointToSegment(x1, y1, x2, y2, this._PX, this._PY);
    if (distToCenter > this._PR * 0.55) {
      this._showSliceFeedback('Cut closer to the center!', '#ffaa33');
      return;
    }

    this._cuts.push({ x1, y1, x2, y2 });
    this._drawCutLines();
    this._updateCutCount(requiredCuts);
    this._showSliceFeedback('\u2713 Clean cut!', '#55ff88');
    this._spawnCutParticles(x1, y1, x2, y2);
  }

  _spawnCutParticles(x1, y1, x2, y2) {
    // Spawn 6 small dots along the cut line that fade out
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t  = (i + 0.5) / count;
      const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 14;
      const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 14;
      const colors = [0xffffff, 0xffdd99, 0xff9955, 0xffcc44];
      const col    = colors[Math.floor(Math.random() * colors.length)];
      const dot    = this.add.circle(px, py, 3 + Math.random() * 3, col, 1);
      this.tweens.add({
        targets:  dot,
        alpha:    0,
        scaleX:   2.5,
        scaleY:   2.5,
        duration: 380 + Math.random() * 80,
        ease:     'Power2',
        onComplete: () => dot.destroy(),
      });
    }
  }

  _updateCutCount(requiredCuts) {
    if (!this._cutCountText?.active) return;
    const n   = this._cuts.length;
    const col = n === requiredCuts ? '#55ff88' : n > requiredCuts ? '#ff8844' : '#ffdd44';
    this._cutCountText.setText(`Cuts: ${n} / ${requiredCuts}`).setColor(col);
  }

  _showSliceFeedback(msg, color) {
    if (!this._sliceFeedbackText?.active) return;
    this._sliceFeedbackText.setText(msg).setColor(color);
    this.time.delayedCall(1000, () => {
      if (this._sliceFeedbackText?.active) this._sliceFeedbackText.setText('');
    });
  }

  _finishSlicing() {
    this._cleanupSliceInput();
    // Save state for this pizza
    this._allCutSets[this._curPizzaIdx]    = [...this._cuts];
    this._allBuildLists[this._curPizzaIdx] = [...this._buildList];

    // Move to next pizza, or show round results
    const nextIdx = this._curPizzaIdx + 1;
    if (nextIdx < this._orders.length) {
      this._curPizzaIdx = nextIdx;
      this._buildList   = this._allBuildLists[this._curPizzaIdx];
      this._cuts        = this._allCutSets[this._curPizzaIdx];
      this._revealNextPizza();
    } else {
      this._buildRoundResults();
    }
  }

  // Brief "next pizza" transition
  _revealNextPizza() {
    this._clear();
    this._setEsc(() => this._exit());
    this._bg();
    this._title('\uD83C\uDF55  PIZZA PALACE');
    const idx = this._curPizzaIdx + 1;
    this._text(`Pizza ${idx} of ${this._orders.length}`, this.W / 2, this.H / 2 - 30,
      { size: '22px', color: '#ffdd44' });
    this._text('Build and slice this pizza from the ticket you memorized.',
      this.W / 2, this.H / 2 + 10, { size: '13px', color: '#aaa' });
    this._button(this.W / 2, this.H / 2 + 60, 'BUILD PIZZA \u25b6', 0x0a2a0a, 0x1a4a1a,
      () => this._startAssembly(), 200, 42);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Scoring
  // ════════════════════════════════════════════════════════════════════════════

  _calcArcSymmetry(cuts, requiredCuts) {
    if (requiredCuts === 0) return 0;
    if (cuts.length !== requiredCuts) return 0;

    // Compute angle of each cut in [0, 180)
    const angles = cuts.map(({ x1, y1, x2, y2 }) => {
      let a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      // Normalize to [0, 180)
      a = ((a % 180) + 180) % 180;
      return a;
    });
    angles.sort((a, b) => a - b);

    // Compute spacings between consecutive angles, including wrap-around
    const spacings = [];
    for (let i = 0; i < angles.length; i++) {
      const next = (i + 1) % angles.length;
      let gap = angles[next] - angles[i];
      if (gap <= 0) gap += 180;
      spacings.push(gap);
    }

    const idealSpacing = 180 / requiredCuts;
    const meanErr = spacings.reduce((s, sp) => s + Math.abs(sp - idealSpacing), 0) / spacings.length;
    return Math.max(0, 1 - meanErr / idealSpacing);
  }

  _calcPizzaScore(pizzaOrder, buildList, cuts) {
    // Memory: sequential match
    let orderIdx = 0, matched = 0, wrongCount = 0;
    for (const item of buildList) {
      if (orderIdx < pizzaOrder.ingredients.length) {
        const expected = pizzaOrder.ingredients[orderIdx];
        if (item.name === expected.name && item.side === expected.side) {
          matched++;
          orderIdx++;
        } else if (!pizzaOrder.ingredients.some(i => i.name === item.name && i.side === item.side)) {
          wrongCount++;
        }
      } else if (!pizzaOrder.ingredients.some(i => i.name === item.name && i.side === item.side)) {
        wrongCount++;
      }
    }
    const memRaw     = pizzaOrder.ingredients.length > 0 ? matched / pizzaOrder.ingredients.length : 0;
    const memPenalty = Math.min(0.40, wrongCount * 0.15);
    const memScore   = Math.max(0, memRaw - memPenalty);

    // Slice accuracy
    const requiredCuts = Math.ceil(pizzaOrder.slices / 2);
    const actualCuts   = cuts.length;
    const sliceScore   = requiredCuts === 0 ? 1
      : Math.max(0, 1 - Math.abs(actualCuts - requiredCuts) / requiredCuts);

    // Arc symmetry bonus (up to 0.20)
    const arcScore = this._calcArcSymmetry(cuts, requiredCuts) * 0.20;

    const combined = memScore * 0.55 + sliceScore * 0.25 + arcScore;

    return {
      memScore,
      sliceScore,
      arcScore,
      combined: Math.min(1, combined),
      matched,
      wrongCount,
      missing: pizzaOrder.ingredients.length - matched,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4: ROUND RESULTS
  // ════════════════════════════════════════════════════════════════════════════

  _buildRoundResults() {
    this._clear();
    this._setEsc(null);

    const diff      = _pizDiff(_PizSess.round);
    const pizzaScores = this._orders.map((order, i) =>
      this._calcPizzaScore(order, this._allBuildLists[i], this._allCutSets[i])
    );
    const avgCombined = pizzaScores.reduce((s, ps) => s + ps.combined, 0) / pizzaScores.length;
    const passed      = avgCombined >= diff.passThreshold;

    // Apply commission
    const weekend    = GameState.isWeekend;
    const rankBefore = GameState.jobRank;
    const base       = 35;
    const commission = Math.max(1, Math.round(base * avgCombined * (weekend ? 1.3 : 1.0) * (0.5 + GameState.profitCut)));
    _PizSess.earnings += commission;

    GameState.addMoney(commission);
    GameState.addEnergy(-2);
    GameState.shiftsWorked++;
    GameState._updateRank();
    GameState.advanceHours(4);
    SaveManager.save();

    const promoted  = GameState.jobRank > rankBefore;
    const nextRound = _PizSess.round + 1;
    const nextDiff  = _pizDiff(nextRound);

    const W = this.W, H = this.H;
    this._bg(0x050510);
    this._title('\uD83C\uDF55  ROUND ' + (_PizSess.round + 1) + ' RESULTS');

    const grade      = avgCombined >= 0.85 ? 'PERFECT' : avgCombined >= 0.65 ? 'GOOD' : avgCombined >= 0.40 ? 'OK' : 'POOR';
    const gradeColor = avgCombined >= 0.85 ? '#55ff88' : avgCombined >= 0.65 ? '#ffdd44' : avgCombined >= 0.40 ? '#ff9944' : '#ff4444';

    let curY = 70;

    // Per-pizza breakdowns
    pizzaScores.forEach((ps, i) => {
      const order = this._orders[i];
      const req   = Math.ceil(order.slices / 2);
      this._panel(W / 2, curY + 44, 500, 94, 0x0a0a18, 0x2a3a5a);
      this._text(`Pizza ${i + 1}`, W / 2, curY + 12, { size: '13px', color: '#aaccff' });
      curY += 24;

      const cols = [
        [`Memory: ${Math.round(ps.memScore * 100)}%`,
         `${ps.matched}/${order.ingredients.length} correct, ${ps.wrongCount} extra`],
        [`Slicing: ${Math.round(ps.sliceScore * 100)}%`,
         `${this._allCutSets[i].length}/${req} cuts`],
        [`Arc sym: +${Math.round(ps.arcScore * 100)}%`, ''],
      ];
      cols.forEach(([label, detail]) => {
        this._text(label, W / 2 - 90, curY + 10, { size: '12px', color: '#aabbcc', ox: 0.5 });
        if (detail) this._text(detail, W / 2 + 80, curY + 10, { size: '11px', color: '#778899', ox: 0.5 });
        curY += 22;
      });
      this._text(`Combined: ${Math.round(ps.combined * 100)}%`,
        W / 2, curY + 6, { size: '13px', color: ps.combined >= diff.passThreshold ? '#55ff88' : '#ff6644' });
      curY += 22;
    });

    curY += 8;

    // Round total
    this._panel(W / 2, curY + 26, 500, 56, 0x0d1a0d, 0x2a5a2a);
    this._text(grade, W / 2, curY + 14, { size: '18px', color: gradeColor });
    this._text(
      `Round avg: ${Math.round(avgCombined * 100)}%  |  Commission: +$${commission}  |  Session total: $${_PizSess.earnings}`,
      W / 2, curY + 38, { size: '11px', color: '#ffd700' }
    );
    curY += 62;

    if (promoted) {
      this._panel(W / 2, curY + 16, 460, 30, 0x1a1a00, 0xffd700);
      this._text(`\u2605 PROMOTED TO ${GameState.rankName.toUpperCase()}! \u2605`, W / 2, curY + 16, { size: '13px', color: '#ffd700' });
      curY += 36;
    }

    curY += 8;

    if (passed) {
      const nP = nextDiff.numPizzas, nT = nextDiff.numToppings;
      this._text(`Next round: ${nP} pizza${nP > 1 ? 's' : ''}, up to ${nT} toppings`, W / 2, curY + 10,
        { size: '11px', color: '#aabbcc' });
      curY += 26;

      const btnY = Math.min(curY + 24, H - 60);
      this._button(W / 2 - 100, btnY, 'CONTINUE \u2192', 0x0a2a0a, 0x1a4a1a, () => {
        _PizSess.round++;
        this._startShift();
      }, 166, 38);
      this._button(W / 2 + 90, btnY, 'END SESSION', 0x2a1a00, 0x4a3000, () => {
        _PizSess.active = false;
        this._buildSessionSummary();
      }, 150, 38);
    } else {
      const btnY = Math.min(curY + 24, H - 60);
      this._text('FAILED \u2014 round ends', W / 2, curY + 4, { size: '14px', color: '#ff4444' });
      this._button(W / 2 - 90, btnY + 12, 'SEE SUMMARY', 0x1a0a00, 0x3a1a00, () => {
        _PizSess.active = false;
        this._buildSessionSummary();
      }, 160, 38);
      this._button(W / 2 + 80, btnY + 12, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 120, 38);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SESSION SUMMARY
  // ════════════════════════════════════════════════════════════════════════════

  _buildSessionSummary() {
    this._clear();
    this._setEsc(() => this._exit());

    const W = this.W, H = this.H;
    const roundsDone = _PizSess.round + 1;
    const total      = _PizSess.earnings;

    this._bg(0x050510);
    this._title('\uD83C\uDF55  SESSION SUMMARY');

    this._panel(W / 2, H / 2 - 30, 500, 240, 0x0a0f0a, 0x2a5a2a);

    const rows = [
      { label: 'Rounds completed', val: String(roundsDone), color: '#aaccff' },
      { label: 'Total earned',     val: `$${total}`,        color: '#ffd700' },
    ];

    let y = H / 2 - 115;
    this._text('\u2500 END OF SESSION \u2500', W / 2, y, { size: '15px', color: '#ff9900' });
    y += 38;

    rows.forEach(row => {
      this._text(row.label, W / 2 - 80, y, { size: '14px', color: '#778899', ox: 1, oy: 0.5 });
      this._text(row.val,   W / 2 + 80, y, { size: '14px', color: row.color,   ox: 0, oy: 0.5 });
      y += 34;
    });

    y += 16;
    this._text(`Balance: $${GameState.money}`, W / 2, y, { size: '13px', color: '#cccccc' });

    this._button(W / 2 - 100, H - 48, 'PLAY AGAIN', 0x0a2a0a, 0x1a4a1a, () => {
      _PizSess.round    = 0;
      _PizSess.earnings = 0;
      _PizSess.active   = false;
      this._startShift();
    }, 156, 38);
    this._button(W / 2 + 80, H - 48, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 120, 38);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Exit
  // ════════════════════════════════════════════════════════════════════════════

  _exit() {
    this._cleanupSliceInput();
    this._setEsc(null);
    this.game.events.emit('pizzeriaExit');
    this.scene.stop();
    this.scene.resume('GameScene');
  }
}
