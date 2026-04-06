/**
 * PizzeriaScene — "Pizzeria Shift" mini-game.
 * Launched on top of (paused) GameScene.
 *
 * Lobby → Work Shift: ORDER_REVEAL → ASSEMBLY → SLICING → RESULTS
 * Lobby → Order Food: buy food to restore HP / Energy
 *
 * Work Shift flow:
 *   1. ORDER_REVEAL  — memorize the ticket (3-second timer, then it flips over)
 *   2. ASSEMBLY      — click ingredient bins from memory in the correct order
 *   3. SLICING       — drag the mouse to cut the pizza into the right slice count
 *   4. RESULTS       — score breakdown + commission
 */

// Ingredient registry: layer order enforces Dough→Sauce→Cheese→Toppings
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

class PizzeriaScene extends Phaser.Scene {
  constructor() { super({ key: 'PizzeriaScene' }); }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    // Pizza circle geometry
    this._PX = this.W / 2;
    this._PY = 232;
    this._PR = 82;

    // Shift state (reset each shift)
    this._order         = null;
    this._buildList     = [];
    this._cuts          = [];
    this._pizzaG        = null;
    this._sliceG        = null;
    this._previewG      = null;
    this._dragStart     = null;
    this._sliceHandlers = null;

    // UI management
    this._elements   = [];
    this._escHandler = null;

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
    return `${h12}:${String(m).padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Lobby
  // ════════════════════════════════════════════════════════════════════════════

  _buildLobby() {
    this._clear();
    this._bg();
    this._title('🍕  PIZZA PALACE');
    this._text(
      `Balance: $${GameState.money}  |  HP: ${GameState.hp}/${GameState.maxHp}  |  Energy: ${GameState.energy}/${GameState.maxEnergy}`,
      this.W / 2, 72, { size: '12px', color: '#aaaaaa' }
    );
    this._panel(this.W / 2, 106, 480, 2, 0x3a2200, 0xff9900);

    // ORDER FOOD
    this._panel(this.W / 2, 215, 440, 110, 0x1a0e00, 0xff9900);
    this._text('🍕  ORDER FOOD', this.W / 2, 192, { size: '18px', color: '#ff9900' });
    this._text('Buy a slice or whole pizza to restore HP and energy',
      this.W / 2, 225, { size: '11px', color: '#887755' });
    this._button(this.W / 2, 255, 'ORDER →', 0x3a1e00, 0x5a3200,
      () => this._buildMenu(), 200, 38);

    // WORK A SHIFT
    const workOpen = GameState.hour >= 10 && GameState.hour < 22;
    this._panel(this.W / 2, 378, 440, 110, workOpen ? 0x001a00 : 0x111111, workOpen ? 0x50ff80 : 0x333333);
    this._text('💼  WORK A SHIFT', this.W / 2, 355, { size: '18px', color: workOpen ? '#50ff80' : '#444' });
    this._text(
      workOpen ? 'Memorize the order, build the pizza, slice it right!' : `Closed until 10:00 AM  (now ${this._fmtTime()})`,
      this.W / 2, 388, { size: '11px', color: workOpen ? '#558855' : '#555' }
    );
    this._button(
      this.W / 2, 418, workOpen ? 'WORK →' : 'CLOSED',
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
    this._title('🍕  PIZZA PALACE — Menu');
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
      const y = 158 + i * 92;
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
    this._button(70, this.H - 48, '← BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 110, 34);
    this._setEsc(() => this._buildLobby());
  }

  _buyItem(item) {
    GameState.addMoney(-item.price);
    GameState.addHp(item.hp);
    if (item.energy > 0) GameState.addEnergy(item.energy);
    SaveManager.save();
    this._clear();
    this._bg(0x060f06);
    this._title('🍕  PIZZA PALACE');
    this._panel(this.W / 2, this.H / 2 - 20, 460, 170, 0x0a1a0a, 0x50ff80);
    this._text('Enjoy your food! 🍕', this.W / 2, this.H / 2 - 68, { size: '20px', color: '#50ff80' });
    this._text(`${item.name} — $${item.price} charged`, this.W / 2, this.H / 2 - 35, { size: '13px', color: '#aaa' });
    this._text(`HP: ${GameState.hp}/${GameState.maxHp}${item.energy ? `   Energy: ${GameState.energy}/${GameState.maxEnergy}` : ''}`,
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
    this._title('🍕  PIZZA PALACE');
    this._panel(this.W / 2, this.H / 2, 460, 140, 0x1a0a0a, 0x664444);
    this._text('CLOSED', this.W / 2, this.H / 2 - 35, { size: '22px', color: '#ff4444' });
    this._text(`Current time: ${this._fmtTime()}`, this.W / 2, this.H / 2);
    this._text('Shifts available: 10:00 AM – 10:00 PM', this.W / 2, this.H / 2 + 30, { color: '#888' });
    this._button(this.W / 2 - 80, this.H - 48, '← BACK', 0x2a2a2a, 0x444444, () => this._buildLobby(), 130, 34);
    this._button(this.W / 2 + 80, this.H - 48, 'LEAVE', 0x2a2a2a, 0x444444, () => this._exit(), 110, 34);
    this._setEsc(() => this._buildLobby());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SHIFT: Order generation
  // ════════════════════════════════════════════════════════════════════════════

  _startShift() {
    // Generate a random order
    const numToppings = 1 + Math.floor(Math.random() * 2);  // 1 or 2 toppings
    const toppings    = Phaser.Utils.Array.Shuffle([..._TOPPING_LIST]).slice(0, numToppings);
    const sliceChoice = [4, 6, 8][Math.floor(Math.random() * 3)];

    this._order     = { ingredients: [..._BASE_LAYERS, ...toppings], slices: sliceChoice };
    this._buildList = [];
    this._cuts      = [];

    this._revealOrder();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1: ORDER_REVEAL — show ticket for 3 s then hide it
  // ════════════════════════════════════════════════════════════════════════════

  _revealOrder() {
    this._clear();
    this._setEsc(null);
    this._bg();
    this._title('📋  MEMORIZE YOUR ORDER!');

    const W = this.W, H = this.H;
    const order = this._order;

    // Countdown
    const timerTxt = this._text('3', W / 2, 72, { size: '22px', color: '#ffaa33' });

    // Ticket panel
    this._panel(W / 2, H / 2 - 10, 300, 220, 0x1a1200, 0xffaa33);
    this._text('─── ORDER TICKET ───', W / 2, H / 2 - 90, { size: '13px', color: '#ffaa33' });

    order.ingredients.forEach((ing, i) => {
      const meta = _ING[ing];
      const hex  = '#' + meta.color.toString(16).padStart(6, '0');
      this._text(`• ${ing}`, W / 2 - 70, H / 2 - 58 + i * 28,
        { size: '15px', color: hex, ox: 0 });
    });

    this._text(`SLICES:  ${order.slices}`,
      W / 2, H / 2 + 60, { size: '20px', color: '#ffd700' });

    this._text('Ticket hides when the timer hits 0!',
      W / 2, H - 48, { size: '11px', color: '#556677' });

    // Countdown 3 → 2 → 1 → assembly
    let t = 3;
    const tick = this.time.addEvent({
      delay: 1000, repeat: 2,
      callback: () => {
        t--;
        if (timerTxt?.active) timerTxt.setText(String(t));
        if (t <= 0) { tick.remove(); this._startAssembly(); }
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2: ASSEMBLY — build the pizza from memory
  // ════════════════════════════════════════════════════════════════════════════

  _startAssembly() {
    this._clear();
    this._setEsc(null);
    this._bg();
    this._title('🍕  BUILD THE PIZZA FROM MEMORY');

    const W = this.W, H = this.H;

    this._text(
      `Remember: ${this._order.ingredients.length} ingredients in order · ${this._order.slices} slices`,
      W / 2, 68, { size: '11px', color: '#556677' }
    );

    // Pizza display (persistent — not in _elements list yet, we'll add below)
    this._pizzaG = this.add.graphics();
    this._track(this._pizzaG);
    this._drawPizza();

    // Progress + feedback
    this._progressText = this._text(
      `Added: ${this._buildList.length}`, W / 2, 332, { color: '#888', size: '12px' });
    this._feedbackText = this._text('', W / 2, 358, { size: '15px', color: '#55ff88' });

    // ── Ingredient bins (2 rows of 4) ──────────────────────────────────────────
    const binW = 90, binH = 38, hGap = 10, vGap = 8;
    const cols = 4;
    const startX = W / 2 - (cols / 2 - 0.5) * (binW + hGap);

    _ALL_BINS.forEach((ing, i) => {
      const col    = i % cols;
      const row    = Math.floor(i / cols);
      const bx     = startX + col * (binW + hGap);
      const by     = 400 + row * (binH + vGap);
      const placed = this._buildList.includes(ing);
      const c      = _ING[ing].color;

      const rect = this._track(
        this.add.rectangle(bx, by, binW, binH, placed ? 0x111111 : 0x1a1a1a)
          .setStrokeStyle(2, placed ? 0x333333 : c)
          .setInteractive(placed ? {} : { useHandCursor: true })
      );
      const txt = this._text(ing, bx, by, {
        size: '11px', color: placed ? '#444' : '#ffffff',
      });

      if (!placed) {
        rect.on('pointerover',  () => rect.setFillStyle(0x2a2a2a));
        rect.on('pointerout',   () => rect.setFillStyle(0x1a1a1a));
        rect.on('pointerdown',  () => rect.setAlpha(0.6));
        rect.on('pointerup',    () => { rect.setAlpha(1); this._onIngredientClick(ing); });
      }
    });

    // ── Buttons ────────────────────────────────────────────────────────────────
    this._button(W / 2 + 60, H - 48, 'DONE BUILDING ▶', 0x0a2a0a, 0x1a4a1a,
      () => this._startSlicing(), 190, 36);
    this._button(70, H - 48, 'QUIT', 0x2a2a2a, 0x444444, () => this._exit(), 110, 34);
  }

  _onIngredientClick(name) {
    if (this._buildList.includes(name)) return;

    const currentMaxLayer = this._buildList.reduce(
      (mx, i) => Math.max(mx, _ING[i]?.layer ?? 0), -1);
    const thisLayer = _ING[name]?.layer ?? 3;

    let msg, color;
    if (!this._order.ingredients.includes(name)) {
      // Wrong ingredient
      msg   = `✗ ${name} — not on order!`;
      color = '#ff4444';
    } else if (thisLayer < currentMaxLayer) {
      // Layer violation: e.g. sauce after cheese
      msg   = `✗ Messy pizza! Wrong order!`;
      color = '#ff8800';
    } else {
      msg   = `✓ ${name}`;
      color = '#55ff88';
    }

    this._buildList.push(name);
    this._drawPizza();

    if (this._feedbackText?.active) this._feedbackText.setText(msg).setColor(color);
    if (this._progressText?.active) this._progressText.setText(`Added: ${this._buildList.length}`);

    // Defer rebuild — destroying the clicked rect during its own event callback freezes Phaser.
    // Short delay lets the event handler return before _clear() runs.
    this.time.delayedCall(500, () => this._startAssembly());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Pizza drawing (layers + toppings + cut lines)
  // ════════════════════════════════════════════════════════════════════════════

  _drawPizza() {
    const g  = this._pizzaG;
    if (!g?.active) return;
    g.clear();

    const cx = this._PX, cy = this._PY, r = this._PR;
    const placed = this._buildList;

    // Dough base (always shown as empty shell if nothing placed)
    g.fillStyle(0xd4a843);
    g.fillCircle(cx, cy, r);
    g.lineStyle(4, 0xb88a30);
    g.strokeCircle(cx, cy, r);

    if (placed.includes('Sauce')) {
      g.fillStyle(0xcc2200, 0.88);
      g.fillCircle(cx, cy, r - 7);
    }

    if (placed.includes('Cheese')) {
      // Irregular cheese blobs
      g.fillStyle(0xffcc00, 0.82);
      [
        { dx:  0,  dy:  0,  r: 28 },
        { dx:  26, dy: -18, r: 20 },
        { dx: -26, dy: -18, r: 20 },
        { dx:  0,  dy:  30, r: 20 },
        { dx:  28, dy:  16, r: 16 },
        { dx: -28, dy:  16, r: 16 },
      ].forEach(p => g.fillCircle(cx + p.dx, cy + p.dy, p.r));
    }

    // Topping scatter (deterministic positions per topping slot)
    const SCATTER = [
      [{ dx:  0, dy: -32 }, { dx: 28, dy:  12 }, { dx: -28, dy:  12 }, { dx: 0, dy: 32 }],
      [{ dx: 20, dy: -28 }, { dx: -20, dy: -28 }, { dx: 24, dy: 20 }, { dx: -24, dy: 20 }],
    ];
    placed.filter(i => !_BASE_LAYERS.includes(i)).forEach((top, ti) => {
      const col  = _ING[top]?.color ?? 0x888888;
      const pts  = SCATTER[ti % SCATTER.length];
      g.fillStyle(col);
      pts.forEach(p => g.fillCircle(cx + p.dx, cy + p.dy, 8));
      // Lighter highlight dots
      g.fillStyle(0xffffff, 0.22);
      pts.forEach(p => g.fillCircle(cx + p.dx - 2, cy + p.dy - 2, 3));
    });

    // Crust ring border again on top
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
    // Small dot at each intersection with pizza center area
    g.fillStyle(0xffffff, 0.6);
    const cx = this._PX, cy = this._PY;
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
    this._title('🔪  SLICE THE PIZZA');

    const W = this.W, H = this.H;
    const requiredCuts = this._order.slices / 2;

    this._text(
      `Make ${requiredCuts} cut${requiredCuts !== 1 ? 's' : ''} through the center for ${this._order.slices} slices`,
      W / 2, 68, { size: '12px', color: '#aabbcc' }
    );

    // Pizza + slice layers
    this._pizzaG = this.add.graphics();
    this._track(this._pizzaG);
    this._drawPizza();

    this._sliceG = this.add.graphics();
    this._track(this._sliceG);

    this._previewG = this.add.graphics();
    this._track(this._previewG);

    // Cut counter
    this._cutCountText = this._text(
      `Cuts: 0 / ${requiredCuts}`, W / 2, 336, { size: '15px', color: '#ffdd44' });

    this._sliceFeedbackText = this._text('', W / 2, 362, { size: '13px', color: '#ff8844' });

    this._text('Click and drag across the pizza to cut', W / 2, 390, { size: '11px', color: '#445566' });

    this._button(W / 2 + 60, H - 48, 'DONE CUTTING ▶', 0x0a2a0a, 0x1a4a1a,
      () => this._finishSlicing(), 190, 36);
    this._button(70, H - 48, 'RESET CUTS', 0x2a1a00, 0x4a3000,
      () => { this._cuts = []; this._drawCutLines(); this._updateCutCount(); }, 130, 34);

    this._setupSliceInput();
  }

  _setupSliceInput() {
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
      this._onSliceAttempt(x1, y1, x2, y2);
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

  // Minimum distance from point (px,py) to the line defined by (x1,y1)→(x2,y2)
  _distPointToSegment(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    const t  = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(x1 + t * dx - px, y1 + t * dy - py);
  }

  _onSliceAttempt(x1, y1, x2, y2) {
    const minLen = 60;
    if (Math.hypot(x2 - x1, y2 - y1) < minLen) return;  // too short

    if (!this._lineHitsCircle(x1, y1, x2, y2)) {
      this._showSliceFeedback('Missed! Draw through the pizza.', '#ff6644');
      return;
    }

    // Require the line to pass near the center (≤55% of radius) for a valid slice
    const distToCenter = this._distPointToSegment(x1, y1, x2, y2, this._PX, this._PY);
    if (distToCenter > this._PR * 0.55) {
      this._showSliceFeedback('Cut closer to the center!', '#ffaa33');
      return;
    }

    this._cuts.push({ x1, y1, x2, y2 });
    this._drawCutLines();
    this._updateCutCount();
    this._showSliceFeedback('✓ Clean cut!', '#55ff88');
  }

  _updateCutCount() {
    const req = this._order.slices / 2;
    if (this._cutCountText?.active) {
      const col = this._cuts.length === req ? '#55ff88'
                : this._cuts.length  >  req ? '#ff8844' : '#ffdd44';
      this._cutCountText.setText(`Cuts: ${this._cuts.length} / ${req}`).setColor(col);
    }
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
    this._buildResults();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4: RESULTS — score breakdown + commission
  // ════════════════════════════════════════════════════════════════════════════

  _calcScores() {
    const order = this._order;

    // Sequential memory match
    let orderIdx = 0, matched = 0, wrongCount = 0;
    for (const item of this._buildList) {
      if (orderIdx < order.ingredients.length && item === order.ingredients[orderIdx]) {
        matched++;
        orderIdx++;
      } else if (!order.ingredients.includes(item)) {
        wrongCount++;
      }
    }
    const memRaw      = order.ingredients.length > 0 ? matched / order.ingredients.length : 0;
    const memPenalty  = Math.min(0.40, wrongCount * 0.15);
    const memScore    = Math.max(0, memRaw - memPenalty);

    // Slice accuracy: S = 2n, so requiredCuts = slices / 2
    const requiredCuts = order.slices / 2;
    const actualCuts   = this._cuts.length;
    const sliceScore   = requiredCuts === 0 ? 1
      : Math.max(0, 1 - Math.abs(actualCuts - requiredCuts) / requiredCuts);

    return { memScore, sliceScore, matched, missing: order.ingredients.length - matched, wrongCount };
  }

  _buildResults() {
    this._clear();
    this._setEsc(null);

    const { memScore, sliceScore, matched, missing, wrongCount } = this._calcScores();
    const quality    = memScore * 0.65 + sliceScore * 0.35;
    const weekend    = GameState.isWeekend;
    const base       = 35;
    const commission = Math.max(1, Math.round(base * quality * (weekend ? 1.3 : 1.0) * (0.5 + GameState.profitCut)));

    // Apply to game state
    const rankBefore = GameState.jobRank;
    GameState.addMoney(commission);
    GameState.addEnergy(-2);
    GameState.shiftsWorked++;
    GameState._updateRank();
    GameState.advanceHours(4);
    SaveManager.save();
    const promoted = GameState.jobRank > rankBefore;

    // UI
    this._bg(0x050510);
    this._title('🍕  SHIFT COMPLETE!');

    this._panel(this.W / 2, this.H / 2 - 10, 500, 330, 0x0a0f0a, 0x2a5a2a);

    const grade = quality >= 0.85 ? 'PERFECT' : quality >= 0.65 ? 'GOOD' : quality >= 0.40 ? 'OK' : 'POOR';
    const gradeColor = quality >= 0.85 ? '#55ff88' : quality >= 0.65 ? '#ffdd44' : quality >= 0.40 ? '#ff9944' : '#ff4444';
    this._text(grade, this.W / 2, 90, { size: '24px', color: gradeColor });

    const rows = [
      { label: 'Memory score',       val: `${Math.round(memScore * 100)}%`,    color: '#aaccff' },
      { label: `  Correct (in order)`,  val: `${matched} / ${this._order.ingredients.length}`, color: '#55ff88' },
      { label: `  Missing`,           val: `${missing}`,   color: missing   > 0 ? '#ff6644' : '#888' },
      { label: `  Extra (wrong)`,     val: `${wrongCount}`, color: wrongCount > 0 ? '#ff6644' : '#888' },
      null,
      { label: 'Slice score',         val: `${Math.round(sliceScore * 100)}%`, color: '#aaccff' },
      { label: `  Required cuts`,     val: `${this._order.slices / 2}  (${this._order.slices} slices)`, color: '#ccc' },
      { label: `  Your cuts`,         val: `${this._cuts.length}`,             color: '#ccc' },
      null,
      { label: `Commission (${Math.round(GameState.profitCut * 100)}% rank)`, val: `+$${commission}`, color: '#ffd700' },
    ];

    let y = 130;
    rows.forEach(row => {
      if (!row) { y += 10; return; }
      this._text(row.label, this.W / 2 - 80, y, { size: '13px', color: '#778899', ox: 1, oy: 0.5 });
      this._text(row.val,   this.W / 2 + 80, y, { size: '13px', color: row.color, ox: 0, oy: 0.5 });
      y += 26;
    });

    if (promoted) {
      this._panel(this.W / 2, 450, 460, 36, 0x1a1a00, 0xffd700);
      this._text(`★ PROMOTED TO ${GameState.rankName.toUpperCase()}! ★`, this.W / 2, 450, { size: '13px', color: '#ffd700' });
    } else if (GameState.jobRank < 2) {
      const needed = GameState.jobRank === 0 ? 5 : 15;
      const left   = Math.max(0, needed - GameState.shiftsWorked);
      if (left > 0)
        this._text(`${left} more shift${left !== 1 ? 's' : ''} until next promotion`, this.W / 2, 450, { size: '11px', color: '#445566' });
    }

    this._button(this.W / 2, this.H - 48, 'DONE', 0x0a2a0a, 0x1a4a1a, () => this._exit());
    this.input.keyboard.once('keydown-ESC', () => this._exit());
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
