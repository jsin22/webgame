/**
 * PlayerAuth — manages player accounts in localStorage.
 * Passwords are obfuscated with btoa() (client-only storage, not real encryption).
 * Storage key: cityRPG_players → { [username_lower]: { username, password, gender, colors } }
 */
const PlayerAuth = {
  _key: 'cityRPG_players',

  _load() {
    try { return JSON.parse(localStorage.getItem(this._key)) || {}; }
    catch { return {}; }
  },

  _store(db) {
    localStorage.setItem(this._key, JSON.stringify(db));
  },

  /** Register a new player. Returns { ok, error, player }. */
  register(username, password, gender, colors) {
    if (!username || username.length < 2)
      return { ok: false, error: 'Username must be at least 2 characters.' };
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return { ok: false, error: 'Username: letters, numbers, _ only.' };
    if (!password || password.length < 4)
      return { ok: false, error: 'Password must be at least 4 characters.' };

    const db  = this._load();
    const key = username.toLowerCase();
    if (db[key]) return { ok: false, error: 'Username already taken.' };

    db[key] = { username, password: btoa(password), gender, colors };
    this._store(db);
    return { ok: true, player: db[key] };
  },

  /** Login. Returns { ok, error, player }. */
  login(username, password) {
    const db  = this._load();
    const key = username.toLowerCase();
    const rec = db[key];
    if (!rec) return { ok: false, error: 'Username not found.' };
    try {
      if (atob(rec.password) !== password)
        return { ok: false, error: 'Incorrect password.' };
    } catch {
      return { ok: false, error: 'Incorrect password.' };
    }
    return { ok: true, player: rec };
  },

  /** Persist updated player data. */
  save(player) {
    const db  = this._load();
    const key = player.username.toLowerCase();
    if (db[key]) { db[key] = { ...db[key], ...player }; this._store(db); }
  },
};
