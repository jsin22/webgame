/**
 * SaveManager — pushes game state to the server via socket.
 * Call SaveManager.save() to push a snapshot of GameState.
 * Call SaveManager.loadFromServer(playerData) on login to restore state.
 */
const SaveManager = {
  /** Restore all GameState fields from the player record sent by the server. */
  loadFromServer(data) {
    if (!data) return;
    if (data.money        !== undefined) GameState.money        = data.money;
    if (data.hp           !== undefined) GameState.hp           = data.hp;
    if (data.energy       !== undefined) GameState.energy       = data.energy;
    if (data.xp           !== undefined) GameState.xp           = data.xp;
    if (data.jobRank      !== undefined) GameState.jobRank      = data.jobRank;
    if (data.shiftsWorked !== undefined) GameState.shiftsWorked = data.shiftsWorked;
    if (data.hour         !== undefined) GameState.hour         = data.hour;
    if (data.minute       !== undefined) GameState.minute       = data.minute;
    if (data.day          !== undefined) GameState.day          = data.day;
    if (data._clockMs     !== undefined) GameState._clockMs     = data._clockMs;
  },

  /** Push all saveable GameState fields to the server. */
  save() {
    if (!window.socket) return;
    window.socket.emit('save_state', {
      money:        GameState.money,
      hp:           GameState.hp,
      energy:       GameState.energy,
      xp:           GameState.xp,
      jobRank:      GameState.jobRank,
      shiftsWorked: GameState.shiftsWorked,
      hour:         GameState.hour,
      minute:       GameState.minute,
      day:          GameState.day,
      _clockMs:     GameState._clockMs,
    });
  },
};
