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

  // Start: Thursday July 6 = day 4. Offset so day 1 = July 3 (Monday).
  get dateStr() {
    const epoch = new Date(2025, 6, 3); // July 3, 2025
    const d = new Date(epoch);
    d.setDate(d.getDate() + (this.day - 1));
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
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

  /** Emit a Phaser game event if the game instance is available. */
  _emit(event, value) {
    if (window._phaserGame) window._phaserGame.events.emit(event, value);
  },

  /** Add (positive) or subtract (negative) money; floor at 0. */
  addMoney(amount) {
    this.money = Math.max(0, this.money + amount);
    this._emit('moneyChanged', this.money);
  },

  /** Restore (positive) or reduce HP; clamped to [0, maxHp]. */
  addHp(amount) {
    this.hp = Math.min(this.maxHp, Math.max(0, this.hp + amount));
    this._emit('hpChanged', this.hp);
  },

  /** Restore (positive) or reduce energy; clamped to [0, maxEnergy]. */
  addEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, Math.max(0, this.energy + amount));
    this._emit('energyChanged', this.energy);
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
    this._emit('timeChanged', { hour: this.hour, minute: this.minute, day: this.day });
  },

  _updateRank() {
    if      (this.shiftsWorked >= 15) this.jobRank = 2;
    else if (this.shiftsWorked >= 5)  this.jobRank = 1;
    else                              this.jobRank = 0;
  },

  /**
   * Called once per server world_tick (every real second = 1 game minute).
   * Updates time from server data, applies energy decay, emits events.
   */
  applyWorldTick(tick) {
    this.hour   = tick.hour;
    this.minute = tick.minute;
    this.day    = tick.day;
    this._emit('timeChanged', { hour: this.hour, minute: this.minute, day: this.day });

    // Energy passive decay: 0.066E per game-minute (95E lost over 1,440 min)
    if (!this._restingAtHome) {
      this._energyFrac = (this._energyFrac || 0) + 0.066;
      if (this._energyFrac >= 1) {
        const lose = Math.floor(this._energyFrac);
        this._energyFrac -= lose;
        this.addEnergy(-lose);
      }
    } else {
      // Resting: +15E per in-game hour = 0.25E per minute
      this._restFrac = (this._restFrac || 0) + 0.25;
      if (this._restFrac >= 1) {
        const gain = Math.floor(this._restFrac);
        this._restFrac -= gain;
        this.addEnergy(gain);
      }
    }
  },

  /**
   * Apply the server world time immediately (called on login, no decay).
   */
  syncWorldTime(tick) {
    this.hour   = tick.hour;
    this.minute = tick.minute;
    this.day    = tick.day;
    this._emit('timeChanged', { hour: this.hour, minute: this.minute, day: this.day });
  },
};
