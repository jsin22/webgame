/**
 * Unit tests for js/scenes/DinerScene.js logic (Greasy Spoon 2.0)
 * Run: npx jest tests/DinerState.test.js
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
  _DS.shiftsDone = 0;
  _DS.day = 1;
  _DS.weather = 'Clear';
  
  // Equipment
  _DS.equip.grill = 100;
  _DS.equip.toaster = 100;
  _DS.equip.urn = 100;

  // Prep
  _DS.prep.soup = 0;
  _DS.prep.bakery = 0;

  // Inventory Groups
  _DS.inv.protein.qty = 20;
  _DS.inv.grain.qty = 20;
  _DS.inv.produce.qty = 20;
  _DS.inv.coffee.qty = 50;
  
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

  test('generates valid prices for NYC groups', () => {
    _DS.rollDay();
    for (const [group, price] of Object.entries(_DS._prices)) {
      expect(price).toBeGreaterThan(0);
      const [lo, hi] = _DS.BASE_PRICE[group];
      expect(price).toBeGreaterThan(lo * 0.5);
      expect(price).toBeLessThan(hi * 2.5);
    }
  });

  test('Rainy Commute event boosts coffee demand', () => {
    const rainyEvent = _DS.EVENTS.find(e => e.name === 'Rainy Commute');
    
    // Normal day
    _DS.event = _DS.EVENTS[0];
    _DS.weather = 'Clear';
    const normalDemand = _DS.demand('coffee');
    
    // Rainy day
    _DS.event = rainyEvent;
    _DS.weather = 'Clear'; // Keep weather same to isolate event boost
    const coffeeDemand = _DS.demand('coffee');
    
    // Boost is 1.8 * 0.9 = 1.62
    expect(coffeeDemand).toBeCloseTo(normalDemand * 1.62, 1);
  });
});

// ── demand ────────────────────────────────────────────────────────────────────

describe('demand', () => {
  test('returns 0 when equipment is broken', () => {
    _DS.equip.toaster = 0;
    const d = _DS.demand('standard'); // "Standard" needs toaster
    expect(d).toBe(0);
  });

  test('NY Rush Hour multipliers affect demand', () => {
    _DS.reputation = 3.5;
    _DS.weather = 'Clear';
    
    // Sunday Brunch Rush (tMult: 2.0)
    const brunch = _DS.EVENTS.find(e => e.name === 'Sunday Brunch Rush');
    _DS.event = brunch;
    const dBrunch = _DS.demand('burger');

    _DS.event = _DS.EVENTS[0]; // Normal day
    const dNormal = _DS.demand('burger');

    expect(dBrunch).toBeCloseTo(dNormal * 2.0, 1);
  });
});

// ── simulation logic ──────────────────────────────────────────────────────────

describe('runShift', () => {
  test('consumes inventory and generates profit', () => {
    const startCash = _DS.cash;
    _DS.prep.soup = 20;
    _DS.prep.bakery = 20;
    
    const report = _DS.runShift();
    
    expect(report.grossRevenue).toBeGreaterThan(0);
    expect(_DS.cash).not.toBe(startCash);
    expect(_DS.equip.grill).toBeLessThan(100);
  });

  test('Health Inspector fines for dirty grill', () => {
    const inspectorEvent = _DS.EVENTS.find(e => e.name === 'Health Inspector');
    _DS.event = inspectorEvent;
    _DS.equip.grill = 20; // Poor condition
    
    const report = _DS.runShift();
    expect(report.fines).toBe(200);
    expect(_DS.reputation).toBeLessThan(3.5);
  });
});
