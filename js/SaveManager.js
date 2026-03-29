/**
 * SaveManager — handles persistence via localStorage.
 * Call SaveManager.save() to snapshot GameState.
 * Call SaveManager.load() on startup to restore it.
 */
const SaveManager = {
  KEY: 'cityRPG_save',

  save() {
    const snapshot = {
      // Character
      money:        GameState.money,
      hp:           GameState.hp,
      energy:       GameState.energy,
      xp:           GameState.xp,
      // Job
      jobRank:      GameState.jobRank,
      shiftsWorked: GameState.shiftsWorked,
      // Time
      hour:    GameState.hour,
      minute:  GameState.minute,
      day:     GameState.day,
      _clockMs: GameState._clockMs,
      // World (extendable)
      mapId: 'city',
    };
    try {
      localStorage.setItem(this.KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.warn('SaveManager: could not write to localStorage', e);
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);

      // Restore character
      if (s.money        !== undefined) GameState.money        = s.money;
      if (s.hp           !== undefined) GameState.hp           = s.hp;
      if (s.energy       !== undefined) GameState.energy       = s.energy;
      if (s.xp           !== undefined) GameState.xp           = s.xp;
      // Restore job
      if (s.jobRank      !== undefined) GameState.jobRank      = s.jobRank;
      if (s.shiftsWorked !== undefined) GameState.shiftsWorked = s.shiftsWorked;
      // Restore time
      if (s.hour         !== undefined) GameState.hour         = s.hour;
      if (s.minute       !== undefined) GameState.minute       = s.minute;
      if (s.day          !== undefined) GameState.day          = s.day;
      if (s._clockMs     !== undefined) GameState._clockMs     = s._clockMs;

      return true;
    } catch (e) {
      console.warn('SaveManager: could not read save', e);
      return false;
    }
  },

  /** Remove save data (for testing / new game). */
  clear() {
    localStorage.removeItem(this.KEY);
  },
};
