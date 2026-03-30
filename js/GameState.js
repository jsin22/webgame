/**
 * GameState — shared global state accessible from every Phaser scene.
 * Acts as a lightweight store for character, time, and job data.
 */
const GameState = {
  // ── Character ──────────────────────────────────────────────────────────────
  money:     100,
  hp:        100,
  maxHp:     100,
  energy:    100,
  maxEnergy: 100,
  xp:        0,

  // ── Job ────────────────────────────────────────────────────────────────────
  jobRank:      0,   // 0=Trainee, 1=Lead Cook, 2=Manager
  shiftsWorked: 0,

  // ── Time ───────────────────────────────────────────────────────────────────
  hour:   8,   // 0–23
  minute: 0,   // 0–59
  day:    1,   // 1-indexed; day 1 = Monday

  // Internal: accumulated real-world ms toward next in-game minute
  _clockMs: 0,

  // ── Derived helpers ────────────────────────────────────────────────────────
  get dayName() {
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return days[(this.day - 1) % 7];
  },

  get isWeekend() {
    const d = (this.day - 1) % 7;
    return d === 5 || d === 6;  // Saturday or Sunday
  },

  get isDay() {
    return this.hour >= 6 && this.hour < 18;
  },

  get rankName() {
    return ['Trainee', 'Lead Cook', 'Manager'][this.jobRank] || 'Trainee';
  },

  get profitCut() {
    return [0.20, 0.25, 0.35][this.jobRank] || 0.20;
  },

  // ── Methods ────────────────────────────────────────────────────────────────

  /** Add (positive) or subtract (negative) money; floor at 0. */
  addMoney(amount) {
    this.money = Math.max(0, this.money + amount);
    if (window._phaserGame) {
      window._phaserGame.events.emit('moneyChanged', this.money);
    }
  },

  /** Restore (positive) or reduce HP; clamped to [0, maxHp]. */
  addHp(amount) {
    this.hp = Math.min(this.maxHp, Math.max(0, this.hp + amount));
    if (window._phaserGame) {
      window._phaserGame.events.emit('hpChanged', this.hp);
    }
  },

  /** Restore (positive) or reduce energy; clamped to [0, maxEnergy]. */
  addEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, Math.max(0, this.energy + amount));
    if (window._phaserGame) {
      window._phaserGame.events.emit('energyChanged', this.energy);
    }
  },

  /**
   * Advance in-game clock by a number of whole hours.
   * Also updates job rank based on total shifts worked.
   */
  advanceHours(hours) {
    this.hour += hours;
    if (this.hour >= 24) {
      this.day += Math.floor(this.hour / 24);
      this.hour  = this.hour % 24;
    }
    this._updateRank();
    if (window._phaserGame) {
      window._phaserGame.events.emit('timeChanged', { hour: this.hour, minute: this.minute, day: this.day });
    }
  },

  _updateRank() {
    if      (this.shiftsWorked >= 15) this.jobRank = 2;
    else if (this.shiftsWorked >= 5)  this.jobRank = 1;
    else                              this.jobRank = 0;
  },

  /**
   * Called every frame from GameScene.update() with the frame delta (ms).
   * 1 real second = 1 in-game minute  →  60 real seconds = 1 in-game hour.
   */
  tickClock(deltaMs) {
    const MS_PER_GAME_MINUTE = 1000; // 1 real second per game minute
    this._clockMs += deltaMs;
    if (this._clockMs >= MS_PER_GAME_MINUTE) {
      const minutesToAdd = Math.floor(this._clockMs / MS_PER_GAME_MINUTE);
      this._clockMs %= MS_PER_GAME_MINUTE;
      this.minute += minutesToAdd;
      if (this.minute >= 60) {
        const hoursToAdd = Math.floor(this.minute / 60);
        this.minute %= 60;
        this.advanceHours(hoursToAdd);
      } else if (window._phaserGame) {
        window._phaserGame.events.emit('timeChanged', { hour: this.hour, minute: this.minute, day: this.day });
      }
    }
  },
};
