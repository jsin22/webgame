/**
 * Unit tests for js/GameState.js
 * Run: npm test
 */

const fs = require('fs');
const path = require('path');

// Minimal window mock (GameState emits events through window._phaserGame)
const mockEmit = jest.fn();
global.window = {
  _phaserGame: { events: { emit: mockEmit } },
};

// GameState.js declares `const GameState` at script scope, which doesn't land
// on globalThis. Wrap it in a function so we can capture and return it.
const src = fs.readFileSync(path.join(__dirname, '../js/GameState.js'), 'utf8');
const GameState = new Function(src + '\nreturn GameState;')();

function resetGameState() {
  GameState.money        = 100;
  GameState.hp           = 100;
  GameState.maxHp        = 100;
  GameState.energy       = 100;
  GameState.maxEnergy    = 100;
  GameState.xp           = 0;
  GameState.jobRank      = 0;
  GameState.shiftsWorked = 0;
  GameState.hour         = 8;
  GameState.minute       = 0;
  GameState.day          = 1;
  GameState._clockMs     = 0;
  GameState._energyFrac  = 0;
  GameState._restFrac    = 0;
  GameState._restingAtHome = false;
  mockEmit.mockClear();
}

beforeEach(resetGameState);

// ── addMoney ──────────────────────────────────────────────────────────────────

describe('addMoney', () => {
  test('adds positive amount', () => {
    GameState.addMoney(50);
    expect(GameState.money).toBe(150);
  });

  test('subtracts negative amount', () => {
    GameState.addMoney(-30);
    expect(GameState.money).toBe(70);
  });

  test('floors at 0, never goes negative', () => {
    GameState.addMoney(-9999);
    expect(GameState.money).toBe(0);
  });

  test('emits moneyChanged event', () => {
    GameState.addMoney(10);
    expect(mockEmit).toHaveBeenCalledWith('moneyChanged', 110);
  });
});

// ── addHp ─────────────────────────────────────────────────────────────────────

describe('addHp', () => {
  test('adds HP', () => {
    GameState.hp = 50;
    GameState.addHp(20);
    expect(GameState.hp).toBe(70);
  });

  test('clamps at maxHp', () => {
    GameState.addHp(999);
    expect(GameState.hp).toBe(GameState.maxHp);
  });

  test('clamps at 0', () => {
    GameState.addHp(-9999);
    expect(GameState.hp).toBe(0);
  });

  test('emits hpChanged event', () => {
    GameState.addHp(-10);
    expect(mockEmit).toHaveBeenCalledWith('hpChanged', 90);
  });
});

// ── addEnergy ─────────────────────────────────────────────────────────────────

describe('addEnergy', () => {
  test('adds energy', () => {
    GameState.energy = 50;
    GameState.addEnergy(25);
    expect(GameState.energy).toBe(75);
  });

  test('clamps at maxEnergy', () => {
    GameState.addEnergy(999);
    expect(GameState.energy).toBe(GameState.maxEnergy);
  });

  test('clamps at 0', () => {
    GameState.addEnergy(-9999);
    expect(GameState.energy).toBe(0);
  });
});

// ── advanceHours ──────────────────────────────────────────────────────────────

describe('advanceHours', () => {
  test('advances hour within same day', () => {
    GameState.hour = 10;
    GameState.advanceHours(4);
    expect(GameState.hour).toBe(14);
    expect(GameState.day).toBe(1);
  });

  test('rolls over midnight into next day', () => {
    GameState.hour = 22;
    GameState.advanceHours(4);
    expect(GameState.hour).toBe(2);
    expect(GameState.day).toBe(2);
  });

  test('handles multi-day advance', () => {
    GameState.hour = 0;
    GameState.day  = 1;
    GameState.advanceHours(50);
    expect(GameState.day).toBe(3);
    expect(GameState.hour).toBe(2);
  });

  test('emits timeChanged event', () => {
    GameState.advanceHours(1);
    expect(mockEmit).toHaveBeenCalledWith('timeChanged', expect.objectContaining({ hour: 9 }));
  });
});

// ── rank promotion ────────────────────────────────────────────────────────────

describe('_updateRank', () => {
  test('rank 0 when shiftsWorked < 5', () => {
    GameState.shiftsWorked = 4;
    GameState._updateRank();
    expect(GameState.jobRank).toBe(0);
  });

  test('rank 1 when shiftsWorked >= 5', () => {
    GameState.shiftsWorked = 5;
    GameState._updateRank();
    expect(GameState.jobRank).toBe(1);
  });

  test('rank 2 when shiftsWorked >= 15', () => {
    GameState.shiftsWorked = 15;
    GameState._updateRank();
    expect(GameState.jobRank).toBe(2);
  });

  test('rank 2 at exactly 15 shifts', () => {
    GameState.shiftsWorked = 15;
    GameState._updateRank();
    expect(GameState.jobRank).toBe(2);
  });
});

// ── derived getters ───────────────────────────────────────────────────────────

describe('dayName', () => {
  test('day 1 is Monday', () => {
    GameState.day = 1;
    expect(GameState.dayName).toBe('Monday');
  });

  test('day 7 is Sunday', () => {
    GameState.day = 7;
    expect(GameState.dayName).toBe('Sunday');
  });

  test('wraps after 7 days', () => {
    GameState.day = 8;
    expect(GameState.dayName).toBe('Monday');
  });
});

describe('isWeekend', () => {
  test('Saturday (day 6) is weekend', () => {
    GameState.day = 6;
    expect(GameState.isWeekend).toBe(true);
  });

  test('Sunday (day 7) is weekend', () => {
    GameState.day = 7;
    expect(GameState.isWeekend).toBe(true);
  });

  test('Monday (day 1) is not weekend', () => {
    GameState.day = 1;
    expect(GameState.isWeekend).toBe(false);
  });

  test('Friday (day 5) is not weekend', () => {
    GameState.day = 5;
    expect(GameState.isWeekend).toBe(false);
  });
});

describe('isDay', () => {
  test('hour 6 is daytime', () => {
    GameState.hour = 6;
    expect(GameState.isDay).toBe(true);
  });

  test('hour 17 is daytime', () => {
    GameState.hour = 17;
    expect(GameState.isDay).toBe(true);
  });

  test('hour 18 is nighttime', () => {
    GameState.hour = 18;
    expect(GameState.isDay).toBe(false);
  });

  test('hour 5 is nighttime', () => {
    GameState.hour = 5;
    expect(GameState.isDay).toBe(false);
  });
});

describe('dateStr', () => {
  test('day 1 returns Jul 3', () => {
    GameState.day = 1;
    expect(GameState.dateStr).toBe('Jul 3');
  });

  test('day 4 returns Jul 6 (Thursday start)', () => {
    GameState.day = 4;
    expect(GameState.dateStr).toBe('Jul 6');
  });

  test('day 29 rolls into August', () => {
    GameState.day = 29;
    expect(GameState.dateStr).toBe('Jul 31');
  });

  test('day 30 becomes Aug 1', () => {
    GameState.day = 30;
    expect(GameState.dateStr).toBe('Aug 1');
  });
});

describe('rankName and profitCut', () => {
  test('rank 0 is Trainee with 20% cut', () => {
    GameState.jobRank = 0;
    expect(GameState.rankName).toBe('Trainee');
    expect(GameState.profitCut).toBeCloseTo(0.20);
  });

  test('rank 1 is Lead Cook with 25% cut', () => {
    GameState.jobRank = 1;
    expect(GameState.rankName).toBe('Lead Cook');
    expect(GameState.profitCut).toBeCloseTo(0.25);
  });

  test('rank 2 is Manager with 35% cut', () => {
    GameState.jobRank = 2;
    expect(GameState.rankName).toBe('Manager');
    expect(GameState.profitCut).toBeCloseTo(0.35);
  });
});

// ── applyWorldTick ────────────────────────────────────────────────────────────

describe('applyWorldTick', () => {
  test('syncs time from server tick', () => {
    GameState.applyWorldTick({ hour: 14, minute: 30, day: 5 });
    expect(GameState.hour).toBe(14);
    expect(GameState.minute).toBe(30);
    expect(GameState.day).toBe(5);
  });

  test('accumulates energy decay over multiple ticks', () => {
    GameState._restingAtHome = false;
    GameState._energyFrac = 0;
    // 0.066 per tick; 16 ticks => 1.056 => lose 1 energy
    for (let i = 0; i < 16; i++) {
      GameState.applyWorldTick({ hour: 8, minute: i, day: 1 });
    }
    expect(GameState.energy).toBeLessThan(100);
  });

  test('resting recovers energy instead of decaying', () => {
    GameState._restingAtHome = true;
    GameState.energy = 50;
    GameState._restFrac = 0;
    // 0.25 per tick; 4 ticks => 1.0 => gain 1 energy
    for (let i = 0; i < 4; i++) {
      GameState.applyWorldTick({ hour: 8, minute: i, day: 1 });
    }
    expect(GameState.energy).toBeGreaterThan(50);
  });
});

// ── syncWorldTime ─────────────────────────────────────────────────────────────

describe('syncWorldTime', () => {
  test('updates time fields', () => {
    GameState.syncWorldTime({ hour: 20, minute: 45, day: 10 });
    expect(GameState.hour).toBe(20);
    expect(GameState.minute).toBe(45);
    expect(GameState.day).toBe(10);
  });

  test('emits timeChanged', () => {
    GameState.syncWorldTime({ hour: 9, minute: 0, day: 2 });
    expect(mockEmit).toHaveBeenCalledWith('timeChanged', { hour: 9, minute: 0, day: 2 });
  });
});
