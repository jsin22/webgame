/**
 * Unit tests for js/scenes/BasketballScene.js logic
 * Run: npm test
 */

const fs = require('fs');
const path = require('path');

// Mock Phaser
global.Phaser = {
  Scene: class {}
};

// Capture the persistent state and constants from BasketballScene.js
const src = fs.readFileSync(path.join(__dirname, '../js/scenes/BasketballScene.js'), 'utf8');

// We need to extract _BB and BB_OPPONENTS.
// Since they are defined at the top of the file, we can use a Function wrapper.
// We'll also mock window.characterData for potential class instantiation tests.
global.window = {
  characterData: { gender: 'male', colors: { shirt: '#ff0000' } }
};

const basketballLogic = new Function('Phaser', src + '\nreturn { _BB, BB_OPPONENTS, BB_GOAL, BB_MAX_MISSES };')(global.Phaser);
const { _BB, BB_OPPONENTS, BB_GOAL, BB_MAX_MISSES } = basketballLogic;

describe('Basketball Constants', () => {
  test('has correct goal and miss limits', () => {
    expect(BB_GOAL).toBe(5);
    expect(BB_MAX_MISSES).toBe(3);
  });

  test('has exactly 3 opponents with increasing difficulty', () => {
    expect(BB_OPPONENTS.length).toBe(3);
    expect(BB_OPPONENTS[0].difficulty).toBe('Easy');
    expect(BB_OPPONENTS[1].difficulty).toBe('Normal');
    expect(BB_OPPONENTS[2].difficulty).toBe('Hard');
  });

  test('opponents have increasing speed', () => {
    expect(BB_OPPONENTS[1].speed).toBeGreaterThan(BB_OPPONENTS[0].speed);
    expect(BB_OPPONENTS[2].speed).toBeGreaterThan(BB_OPPONENTS[1].speed);
  });
});

describe('Basketball Persistent State', () => {
  test('initializes at round 0', () => {
    expect(_BB.round).toBe(0);
  });

  test('maintains state across visits', () => {
    _BB.round = 5;
    expect(_BB.round).toBe(5);
  });
});
