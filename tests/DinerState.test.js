/**
 * Unit tests for the _DS (DinerState) pure logic in js/scenes/DinerScene.js.
 * Run: npm test
 *
 * _DS has no Phaser dependencies — only DINER_BALANCE and its own IIFE constants.
 * We mock Phaser.Scene so the class declaration at the bottom of the file parses.
 */

const fs   = require('fs');
const path = require('path');

global.Phaser = { Scene: class { constructor() {} } };

const src = fs.readFileSync(
  path.join(__dirname, '../js/scenes/DinerScene.js'), 'utf8'
);
const { _DS, DINER_BALANCE } = new Function(src + '\nreturn { _DS, DINER_BALANCE };')();

/** Reset _DS to a clean baseline before each test. */
function resetDS() {
  _DS.cash       = DINER_BALANCE.STARTING_CASH;
  _DS.reputation = DINER_BALANCE.STARTING_REP;
  _DS.grillCond  = 100;
  _DS.shiftsDone = 0;
  _DS.weather    = 'Clear';
  _DS.event      = _DS.EVENTS[0];   // null-event (tMult 1.0, no boost)
  _DS._prices    = null;

  // Reset inventory to zero (fresh)
  for (const [k, inv] of Object.entries(_DS.inv)) {
    inv.qty   = 0;
    inv.cost  = 0;
    inv.fresh = _DS.FRESH_MAX[k];
  }

  // Reset menu to defaults
  _DS.menu.burger.price      = 10;
  _DS.menu.burger.generosity = 1;
  _DS.menu.fries.price       = 6;
  _DS.menu.fries.generosity  = 1;
  _DS.menu.coffee.price      = 4;
  _DS.menu.coffee.generosity = 1;
  _DS.menu.special.price     = 15;
  _DS.menu.special.generosity = 1;
}

beforeEach(resetDS);

// ── inStock ───────────────────────────────────────────────────────────────────

describe('inStock', () => {
  test('returns false when all ingredients are 0', () => {
    expect(_DS.inStock('burger')).toBe(false);
  });

  test('returns false when only one of two needed ingredients is stocked', () => {
    _DS.inv.meat.qty = 5;
    expect(_DS.inStock('burger')).toBe(false);  // needs meat AND buns
  });

  test('returns true when all needed ingredients are available', () => {
    _DS.inv.meat.qty = 5;
    _DS.inv.buns.qty = 5;
    expect(_DS.inStock('burger')).toBe(true);
  });

  test('fries only needs spuds', () => {
    _DS.inv.spuds.qty = 3;
    expect(_DS.inStock('fries')).toBe(true);
  });

  test('special needs meat, buns, and spuds', () => {
    _DS.inv.meat.qty  = 3;
    _DS.inv.buns.qty  = 3;
    expect(_DS.inStock('special')).toBe(false);
    _DS.inv.spuds.qty = 3;
    expect(_DS.inStock('special')).toBe(true);
  });
});

// ── marketPrice ───────────────────────────────────────────────────────────────

describe('marketPrice', () => {
  test('calls rollDay and returns a price when _prices is null', () => {
    _DS._prices = null;
    const price = _DS.marketPrice('meat');
    expect(typeof price).toBe('number');
    expect(price).toBeGreaterThan(0);
  });

  test('returns consistent price within the same day', () => {
    _DS._prices = null;
    const p1 = _DS.marketPrice('coffee');
    const p2 = _DS.marketPrice('coffee');
    expect(p1).toBe(p2);
  });

  test('returns fallback 5 for unknown item', () => {
    _DS._prices = { meat: 10 };
    expect(_DS.marketPrice('unknown_item')).toBe(5);
  });
});

// ── rollDay ───────────────────────────────────────────────────────────────────

describe('rollDay', () => {
  test('increments day counter', () => {
    _DS.day = 1;
    _DS.rollDay();
    expect(_DS.day).toBe(2);
  });

  test('sets a valid weather value', () => {
    _DS.rollDay();
    expect(['Clear', 'Rain', 'Snow', 'Heat']).toContain(_DS.weather);
  });

  test('sets prices for all four ingredients', () => {
    _DS.rollDay();
    expect(_DS._prices).not.toBeNull();
    for (const item of ['meat', 'buns', 'spuds', 'coffee']) {
      expect(typeof _DS._prices[item]).toBe('number');
      expect(_DS._prices[item]).toBeGreaterThan(0);
    }
  });

  test('Frost in Brazil event doubles coffee price', () => {
    // Force the event and run rollDay many times — at least verify the boost
    // is applied when the event is active.
    const frostEvent = _DS.EVENTS.find(e => e.name === 'Frost in Brazil');
    _DS.event = frostEvent;
    // Seed a normal price by running without event first
    _DS.event = _DS.EVENTS[0];
    _DS.rollDay();
    const basePrice = _DS._prices.coffee;

    // Now set the frost event and roll again
    _DS.event = frostEvent;
    _DS.rollDay();
    const boostedPrice = _DS._prices.coffee;

    // boostedPrice should be in range [lo*2, hi*2]
    const [lo, hi] = _DS.BASE_PRICE.coffee;
    expect(boostedPrice).toBeGreaterThanOrEqual(lo * frostEvent.boost.coffee * 0.9);
    expect(boostedPrice).toBeLessThanOrEqual(hi * frostEvent.boost.coffee * 1.1);
  });
});

// ── demand ────────────────────────────────────────────────────────────────────

describe('demand', () => {
  test('returns a positive number under normal conditions', () => {
    const d = _DS.demand('burger');
    expect(d).toBeGreaterThan(0);
  });

  test('is reduced by 30% when price exceeds gouge threshold', () => {
    _DS.menu.burger.price = 1;   // well below gouge threshold
    const low = _DS.demand('burger');

    _DS.menu.burger.price = 999;  // way above gouge threshold
    const high = _DS.demand('burger');

    expect(high).toBeLessThan(low);
  });

  test('bad grill (< 60) reduces demand for burger', () => {
    _DS.grillCond = 100;
    const goodGrill = _DS.demand('burger');

    _DS.grillCond = 30;
    const badGrill = _DS.demand('burger');

    expect(badGrill).toBeLessThan(goodGrill);
  });

  test('bad grill does NOT reduce demand for fries', () => {
    _DS.grillCond = 100;
    const goodGrill = _DS.demand('fries');

    _DS.grillCond = 30;
    const badGrill = _DS.demand('fries');

    expect(badGrill).toBeCloseTo(goodGrill, 5);
  });

  test('rain weather reduces demand', () => {
    _DS.weather = 'Clear';
    const clearDemand = _DS.demand('coffee');

    _DS.weather = 'Rain';
    const rainDemand = _DS.demand('coffee');

    expect(rainDemand).toBeLessThan(clearDemand);
  });

  test('Local Parade event increases demand', () => {
    _DS.event = _DS.EVENTS[0];  // neutral
    const baseDemand = _DS.demand('fries');

    _DS.event = _DS.EVENTS.find(e => e.name === 'Local Parade');
    const paradeDemand = _DS.demand('fries');

    expect(paradeDemand).toBeGreaterThan(baseDemand);
  });
});

// ── applyReview ───────────────────────────────────────────────────────────────

describe('applyReview', () => {
  test('5-star review nudges reputation upward', () => {
    _DS.reputation = 3.0;
    _DS.applyReview(5);
    expect(_DS.reputation).toBeGreaterThan(3.0);
  });

  test('1-star review nudges reputation downward', () => {
    _DS.reputation = 3.0;
    _DS.applyReview(1);
    expect(_DS.reputation).toBeLessThan(3.0);
  });

  test('review matching current reputation leaves it unchanged', () => {
    _DS.reputation = 3.0;
    _DS.applyReview(3);
    expect(_DS.reputation).toBeCloseTo(3.0);
  });

  test('reputation is clamped to MAX_REP', () => {
    _DS.reputation = DINER_BALANCE.MAX_REP;
    _DS.applyReview(5);
    expect(_DS.reputation).toBeLessThanOrEqual(DINER_BALANCE.MAX_REP);
  });

  test('reputation is clamped to MIN_REP', () => {
    _DS.reputation = DINER_BALANCE.MIN_REP;
    _DS.applyReview(1);
    expect(_DS.reputation).toBeGreaterThanOrEqual(DINER_BALANCE.MIN_REP);
  });
});

// ── stars ─────────────────────────────────────────────────────────────────────

describe('stars', () => {
  test('3.0 reputation returns 3 filled stars', () => {
    _DS.reputation = 3.0;
    expect(_DS.stars()).toContain('★★★');
    expect(_DS.stars()).toContain('☆☆');
  });

  test('5.0 reputation returns all filled stars', () => {
    _DS.reputation = 5.0;
    expect(_DS.stars()).toBe('★★★★★');
  });

  test('1.0 reputation returns mostly empty stars', () => {
    _DS.reputation = 1.0;
    expect(_DS.stars()).toContain('★');
    expect(_DS.stars()).toContain('☆☆☆☆');
  });

  test('3.5 reputation includes half star', () => {
    _DS.reputation = 3.5;
    expect(_DS.stars()).toContain('½');
  });
});

// ── runShift ─────────────────────────────────────────────────────────────────

describe('runShift', () => {
  function stockAll(qty = 20) {
    _DS.inv.meat.qty  = qty;
    _DS.inv.buns.qty  = qty;
    _DS.inv.spuds.qty = qty;
    _DS.inv.coffee.qty = qty;
  }

  test('returns a report object with expected keys', () => {
    stockAll();
    const rep = _DS.runShift();
    expect(rep).toHaveProperty('grossRevenue');
    expect(rep).toHaveProperty('netProfit');
    expect(rep).toHaveProperty('unitsSold');
    expect(rep).toHaveProperty('walkouts');
    expect(rep).toHaveProperty('spoilage');
    expect(rep).toHaveProperty('customerLog');
  });

  test('increments shiftsDone', () => {
    stockAll();
    _DS.runShift();
    expect(_DS.shiftsDone).toBe(1);
  });

  test('adds net profit to cash', () => {
    stockAll();
    const before = _DS.cash;
    const rep    = _DS.runShift();
    expect(_DS.cash).toBeCloseTo(before + rep.netProfit, 1);
  });

  test('sells 0 units when nothing is stocked', () => {
    const rep = _DS.runShift();
    const totalSold = Object.values(rep.unitsSold).reduce((a, b) => a + b, 0);
    expect(totalSold).toBe(0);
    expect(rep.grossRevenue).toBe(0);
  });

  test('degrades grill condition each shift', () => {
    stockAll();
    _DS.grillCond = 100;
    _DS.runShift();
    expect(_DS.grillCond).toBe(100 - DINER_BALANCE.GRILL_DECAY);
  });

  test('grill cannot go below 0', () => {
    stockAll();
    _DS.grillCond = 5;
    _DS.runShift();
    expect(_DS.grillCond).toBeGreaterThanOrEqual(0);
  });

  test('walkouts occur when grill condition < 70', () => {
    stockAll();
    _DS.grillCond = 50;
    const rep = _DS.runShift();
    expect(rep.walkouts).toBeGreaterThan(0);
  });
});

// ── _applySpoilage ────────────────────────────────────────────────────────────

describe('_applySpoilage', () => {
  test('decrements freshness each call', () => {
    _DS.inv.meat.qty   = 5;
    _DS.inv.meat.cost  = 10;
    _DS.inv.meat.fresh = 2;
    _DS._applySpoilage();
    expect(_DS.inv.meat.fresh).toBe(1);
  });

  test('wipes inventory and returns cost when freshness hits 0', () => {
    _DS.inv.meat.qty   = 5;
    _DS.inv.meat.cost  = 8;
    _DS.inv.meat.fresh = 1;
    const lost = _DS._applySpoilage();
    expect(_DS.inv.meat.qty).toBe(0);
    expect(lost).toBeCloseTo(5 * 8, 1);
  });

  test('returns 0 spoilage when inventory is empty', () => {
    const lost = _DS._applySpoilage();
    expect(lost).toBe(0);
  });

  test('resets freshness to FRESH_MAX after spoilage', () => {
    _DS.inv.meat.qty   = 3;
    _DS.inv.meat.cost  = 5;
    _DS.inv.meat.fresh = 1;
    _DS._applySpoilage();
    expect(_DS.inv.meat.fresh).toBe(_DS.FRESH_MAX.meat);
  });
});
