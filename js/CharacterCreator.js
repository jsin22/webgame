/**
 * CharacterCreator — DOM overlay for player registration and login.
 * Handles two flows: "Create New Player" and "Returning Player".
 * On success, calls onComplete({ username, gender, colors }).
 */
const CharacterCreator = {
  _onComplete: null,
  _state: {
    gender: 'male',
    colors: { shirt: '#2855d4', pants: '#1a1a1a', shoes: '#6a3010' },
  },
  _canvas: null,
  _ctx: null,

  PALETTE: [
    { name: 'Red',    hex: '#d93030' },
    { name: 'Blue',   hex: '#2855d4' },
    { name: 'Green',  hex: '#2a9040' },
    { name: 'Yellow', hex: '#c4b020' },
    { name: 'Orange', hex: '#d46010' },
    { name: 'Purple', hex: '#7722bb' },
    { name: 'Pink',   hex: '#cc5080' },
    { name: 'Brown',  hex: '#6a3010' },
    { name: 'Black',  hex: '#1a1a1a' },
    { name: 'White',  hex: '#d8d8d8' },
  ],

  show() {
    if (document.getElementById('creator-overlay')) return; // already shown
    this._buildOverlay();
    this._renderPreview();
  },

  showError(msg) {
    let overlay = document.getElementById('creator-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'creator-overlay';
      overlay.innerHTML = `<div id="creator-box">
        <div id="creator-title">⚔ CITY RPG</div>
        <div class="cc-status error" id="cc-conn-err"></div>
      </div>`;
      (document.getElementById('game-container') || document.body).appendChild(overlay);
    }
    const el = document.getElementById('cc-conn-err');
    if (el) el.textContent = msg;
  },

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'creator-overlay';
    overlay.innerHTML = `
      <div id="creator-box">
        <div id="creator-title">⚔ CITY RPG</div>

        <!-- Main view -->
        <div id="cc-view-main">
          <div class="creator-subtitle">Choose your path</div>
          <button class="cc-btn" id="cc-btn-new">Create New Player</button>
          <button class="cc-btn" id="cc-btn-returning" style="background:#0d0d20;border-color:#3a3a6a;color:#aaa">Returning Player</button>
        </div>

        <!-- Create view -->
        <div id="cc-view-create" style="display:none;width:100%;display:none;flex-direction:column;gap:8px;align-items:center">
          <div class="creator-subtitle">Create your character</div>
          <input class="cc-input" id="cc-uname" type="text" placeholder="Username" maxlength="20" autocomplete="off" spellcheck="false">
          <input class="cc-input" id="cc-pass" type="password" placeholder="Password" maxlength="40" autocomplete="new-password">
          <input class="cc-input" id="cc-confirm" type="password" placeholder="Confirm Password" maxlength="40">
          <div id="cc-gender-row">
            <button class="gender-btn active" data-g="male">♂ Male</button>
            <button class="gender-btn" data-g="female">♀ Female</button>
          </div>
          <div id="cc-colors"></div>
          <canvas id="cc-preview" width="80" height="120"></canvas>
          <button class="cc-btn" id="cc-btn-create">Create Character</button>
          <button class="cc-btn-secondary" id="cc-back-create">← Back</button>
          <div class="cc-status" id="cc-status"></div>
        </div>

        <!-- Login view -->
        <div id="cc-view-login" style="display:none;width:100%;flex-direction:column;gap:8px;align-items:center">
          <div class="creator-subtitle">Welcome back</div>
          <input class="cc-input" id="cl-uname" type="text" placeholder="Username" maxlength="20" autocomplete="off" spellcheck="false">
          <input class="cc-input" id="cl-pass" type="password" placeholder="Password" maxlength="40">
          <button class="cc-btn" id="cc-btn-login">Enter City</button>
          <button class="cc-btn-secondary" id="cc-back-login">← Back</button>
          <div class="cc-status" id="cl-status"></div>
        </div>
      </div>
    `;

    // Append to game container so it overlays the canvas
    (document.getElementById('game-container') || document.body).appendChild(overlay);

    // Build color pickers
    this._buildColorPickers();

    // Canvas preview
    this._canvas = document.getElementById('cc-preview');
    this._ctx    = this._canvas.getContext('2d');

    // Prevent Phaser from eating keystrokes inside inputs
    overlay.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', e => e.stopPropagation());
    });

    // Main view buttons
    document.getElementById('cc-btn-new').addEventListener('click', () => this._showView('create'));
    document.getElementById('cc-btn-returning').addEventListener('click', () => this._showView('login'));

    // Gender toggle
    document.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._state.gender = btn.dataset.g;
        this._renderPreview();
      });
    });

    // Create / back
    document.getElementById('cc-btn-create').addEventListener('click', () => this._doRegister());
    document.getElementById('cc-back-create').addEventListener('click', () => this._showView('main'));
    document.getElementById('cc-uname').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('cc-pass').focus(); });
    document.getElementById('cc-pass').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('cc-confirm').focus(); });
    document.getElementById('cc-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') this._doRegister(); });

    // Login / back
    document.getElementById('cc-btn-login').addEventListener('click', () => this._doLogin());
    document.getElementById('cc-back-login').addEventListener('click', () => this._showView('main'));
    document.getElementById('cl-uname').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('cl-pass').focus(); });
    document.getElementById('cl-pass').addEventListener('keydown', e => { if (e.key === 'Enter') this._doLogin(); });
  },

  _buildColorPickers() {
    const container = document.getElementById('cc-colors');
    ['shirt', 'pants', 'shoes'].forEach(item => {
      const row = document.createElement('div');
      row.className = 'cc-color-row';

      const label = document.createElement('span');
      label.className = 'cc-color-label';
      label.textContent = item.charAt(0).toUpperCase() + item.slice(1);

      const swatches = document.createElement('div');
      swatches.className = 'cc-swatches';

      this.PALETTE.forEach(color => {
        const sw = document.createElement('div');
        sw.className = 'cc-swatch' + (this._state.colors[item] === color.hex ? ' selected' : '');
        sw.style.backgroundColor = color.hex;
        sw.title = color.name;
        sw.addEventListener('click', () => {
          swatches.querySelectorAll('.cc-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
          this._state.colors[item] = color.hex;
          this._renderPreview();
        });
        swatches.appendChild(sw);
      });

      row.appendChild(label);
      row.appendChild(swatches);
      container.appendChild(row);
    });
  },

  _showView(name) {
    ['main', 'create', 'login'].forEach(v => {
      const el = document.getElementById(`cc-view-${v}`);
      if (el) el.style.display = (v === name ? 'flex' : 'none');
    });
    if (name === 'create') {
      document.getElementById('cc-uname').focus();
      this._renderPreview();
    }
    if (name === 'login') document.getElementById('cl-uname').focus();
  },

  _doRegister() {
    const username = document.getElementById('cc-uname').value.trim();
    const password = document.getElementById('cc-pass').value;
    const confirm  = document.getElementById('cc-confirm').value;
    const status   = document.getElementById('cc-status');
    const btn      = document.getElementById('cc-btn-create');

    if (password !== confirm) {
      status.textContent = 'Passwords do not match.';
      status.className = 'cc-status error';
      return;
    }

    btn.disabled = true;
    status.textContent = 'Creating account…';
    status.className = 'cc-status';

    window.socket.emit('register', {
      username, password,
      gender: this._state.gender,
      colors: { ...this._state.colors },
    });

    window.socket.once('register_success', data => {
      this._complete(data);
    });
    window.socket.once('register_error', data => {
      status.textContent = data.error;
      status.className = 'cc-status error';
      btn.disabled = false;
    });
  },

  _doLogin() {
    const username = document.getElementById('cl-uname').value.trim();
    const password = document.getElementById('cl-pass').value;
    const status   = document.getElementById('cl-status');
    const btn      = document.getElementById('cc-btn-login');

    btn.disabled = true;
    status.textContent = 'Logging in…';
    status.className = 'cc-status';

    window.socket.emit('login', { username, password });

    window.socket.once('login_success', data => {
      this._complete(data);
    });
    window.socket.once('login_error', data => {
      status.textContent = data.error;
      status.className = 'cc-status error';
      btn.disabled = false;
    });
  },

  _complete(loginData) {
    window.characterData = loginData.player;
    const overlay = document.getElementById('creator-overlay');
    if (overlay) overlay.remove();
    if (window._phaserGame) {
      window._phaserGame.events.emit('multiplayerLogin', loginData);
    }
  },

  _renderPreview() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const W = 80, H = 120;
    ctx.clearRect(0, 0, W, H);

    const female = this._state.gender === 'female';
    const skin   = female ? '#a06e46' : '#cda073';
    const hair   = female ? '#281606' : '#321e0a';
    const shirt  = this._state.colors.shirt;
    const pants  = this._state.colors.pants;
    const shoes  = this._state.colors.shoes;

    const cx = W / 2;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, H - 5, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shoes
    ctx.fillStyle = shoes;
    ctx.fillRect(cx - 16, H - 20, 13, 10);
    ctx.fillRect(cx + 3,  H - 20, 13, 10);

    // Pants
    ctx.fillStyle = pants;
    ctx.fillRect(cx - 15, H - 48, 13, 30);
    ctx.fillRect(cx + 2,  H - 48, 13, 30);

    // Shirt / torso
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 18, H - 74, 36, 28);
    // Arms
    ctx.fillRect(cx - 24, H - 72, 8, 18);
    ctx.fillRect(cx + 16, H - 72, 8, 18);

    // Neck (skin)
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 5, H - 82, 10, 10);

    // Head circle (skin)
    ctx.beginPath();
    ctx.arc(cx, H - 96, 16, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();

    // Ears (small — 3×5)
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 20, H - 100, 3, 5);
    ctx.fillRect(cx + 17, H - 100, 3, 5);

    // Hair cap (top half only — stops at hairline, does not cover face)
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, H - 96, 16, Math.PI, 0);
    ctx.fill();

    if (female) {
      // Shoulder-length side curtains (beside face, below hairline)
      ctx.fillRect(cx - 20, H - 94, 6, 18);
      ctx.fillRect(cx + 14, H - 94, 6, 18);
    }

    // Eyes — moved 2px higher than before
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 9, H - 96, 5, 5);
    ctx.fillRect(cx + 4, H - 96, 5, 5);
    ctx.fillStyle = '#1e1e3c';
    ctx.fillRect(cx - 8, H - 95, 3, 3);
    ctx.fillRect(cx + 5, H - 95, 3, 3);

    // Nose — centered below eyes (moved up 2px)
    ctx.fillStyle = '#1e1e3c';
    ctx.fillRect(cx - 1, H - 89, 3, 2);

    // Mouth (moved up 2px)
    ctx.fillStyle = '#be5a50';
    ctx.fillRect(cx - 4, H - 84, 8, 2);
  },
};
