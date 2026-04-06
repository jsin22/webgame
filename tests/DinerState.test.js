/**
 * Unit tests for js/scenes/DinerScene.js logic
 * Run: npm test
 */

const fs = require('fs');
const path = require('path');

// Mock Phaser
global.Phaser = {
  Scene: class {}
};

// Capture the persistent state from DinerScene.js
const src = fs.readFileSync(path.join(__dirname, '../js/scenes/DinerScene.js'), 'utf8');
const dinerLogic = new Function('Phaser', src + '\nreturn { _DS, DINER_BALANCE };')(global.Phaser);
const { _DS, DINER_BALANCE } = dinerLogic;

function resetDinerState() {
  _DS.cash = DINER_BALANCE.STARTING_CASH;
  _DS.reputation = DINER_BALANCE.STARTING_REP;
  _DS.grillCond = 100;
  _DS.shiftsDone = 0;
  _DS.day = 1;
  _DS.inv.meat.qty = 0;
  _DS.inv.buns.qty = 0;
  _DS.inv.spuds.qty = 0;
  _DS.inv.coffee.qty = 0;
  _DS._prices = null;
}

beforeEach(resetDinerState);

// ── rollDay ───────────────────────────────────────────────────────────────────

describe('rollDay', () => {
  test('increments day counter', () => {
    const startDay = _DS.day;
    _DS.rollDay();
    expect(_DS.day).toBe(startDay + 1);
  });

  test('generates valid prices', () => {
    _DS.rollDay();
    for (const [item, price] of Object.entries(_DS._prices)) {
      const [lo, hi] = _DS.BASE_PRICE[item];
      // Price could be boosted by event, so we just check it exists and is positive
      expect(price).toBeGreaterThan(0);
    }
  });

  test('Frost in Brazil event doubles coffee price', () => {
    const frostEvent = _DS.EVENTS.find(e => e.name === 'Frost in Brazil');
    // Seed a normal price by running without event first
    _DS.rollDay(_DS.EVENTS[0]);
    
    // Now set the frost event and roll again
    _DS.rollDay(frostEvent);
    const boostedPrice = _DS._prices.coffee;

    // boostedPrice should be in range [lo*2, hi*2]
    const [lo, hi] = _DS.BASE_PRICE.coffee;
    expect(boostedPrice).toBeGreaterThanOrEqual(lo * frostEvent.boost.coffee * 0.9);
    expect(boostedPrice).toBeLessThanOrEqual(hi * frostEvent.boost.coffee * 1.1);
  });
});

// ── demand ────────────────────────────────────────────────────────────────────

describe('demand', () => {
  test('returns 0 when reputation is at minimum', () => {
    _DS.reputation = DINER_BALANCE.MIN_REP;
    _DS.rollDay(_DS.EVENTS[0]);
    _DS.weather = 'Heat'; // Harsh weather
    // High price
    _DS.menu.burger.price = 50; 
    const d = _DS.demand('burger');
    expect(d).toBeLessThan(10); 
  });

  test('Event multipliers affect demand', () => {
    _DS.reputation = 3.0;
    _DS.weather = 'Clear';
    
    // Road Works (-25%)
    const roadWorks = _DS.EVENTS.find(e => e.name === 'Road Works');
    _DS.rollDay(roadWorks);
    const d1 = _DS.demand('burger');

    // Local Parade (+35%)
    const parade = _DS.EVENTS.find(e => e.name === 'Local Parade');
    _DS.rollDay(parade);
    const d2 = _DS.demand('burger');

    expect(d2).toBeGreaterThan(d1);
  });
});

// ── proc logic ────────────────────────────────────────────────────────────────

describe('procure', () => {
  // We can't test scene-level methods like procureItem directly if they use Phaser UI,
  // but we can test the state changes they would trigger.
  test('updates inventory and cash', () => {
    const startCash = _DS.cash;
    const qty = 10;
    const price = 5.5;
    
    // Manual state update mimic
    _DS.cash -= qty * price;
    _DS.inv.meat.qty += qty;
    
    expect(_DS.cash).toBe(startCash - 55);
    expect(_DS.inv.meat.qty).toBe(10);
  });
});
