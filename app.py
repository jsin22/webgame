"""
Flask-SocketIO server for City RPG multiplayer.

Setup:
    pip install -r requirements.txt
    python3 app.py            # default port 8080
    python3 app.py --port 3000

Sharing with friends (pick one):
    ngrok http 8080
    Send the resulting URL to your friend — they open it in a browser.
"""

import argparse
import json
import os

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit

# ── App setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading',
                    allow_upgrades=False)

# ── Player store ───────────────────────────────────────────────────────────────
# username → {x, y, facing, money}   (sid added while connected, stripped on save)
players: dict = {}
sid_to_username: dict = {}

SAVE_FILE = os.path.join(os.path.dirname(__file__), 'player_data.json')

DEFAULT_PLAYER = {'x': 976.0, 'y': 976.0, 'facing': 'down', 'money': 100}


def _load():
    if os.path.exists(SAVE_FILE):
        try:
            with open(SAVE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save():
    to_disk = {
        uname: {k: v for k, v in data.items() if k != 'sid'}
        for uname, data in players.items()
    }
    try:
        with open(SAVE_FILE, 'w') as f:
            json.dump(to_disk, f, indent=2)
    except Exception as e:
        print(f'[save] warning: {e}')


def _public(data: dict) -> dict:
    """Strip internal fields before sending to clients."""
    return {k: v for k, v in data.items() if k != 'sid'}


# Load persisted player data on startup
for _uname, _data in _load().items():
    players[_uname] = dict(_data)


# ── Static file serving ────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)


# ── Socket events ──────────────────────────────────────────────────────────────
@socketio.on('login')
def handle_login(data):
    username = str(data.get('username', '')).strip()[:20]
    if not username:
        return

    sid = request.sid
    sid_to_username[sid] = username

    # Create new player or restore existing
    if username not in players:
        players[username] = dict(DEFAULT_PLAYER)
    players[username]['sid'] = sid

    # Currently online players (excluding self)
    others = {
        uname: _public(pdata)
        for uname, pdata in players.items()
        if uname != username and 'sid' in pdata
    }

    # Reply to logging-in client
    emit('login_success', {
        'username': username,
        'player':   _public(players[username]),
        'others':   others,
    })

    # Announce arrival to everyone else
    emit('player_joined', {
        'username': username,
        'player':   _public(players[username]),
    }, broadcast=True, include_self=False)

    print(f'[+] {username} connected  ({len(others)} others online)')


@socketio.on('move')
def handle_move(data):
    sid      = request.sid
    username = sid_to_username.get(sid)
    if not username:
        return

    players[username]['x']      = float(data.get('x', DEFAULT_PLAYER['x']))
    players[username]['y']      = float(data.get('y', DEFAULT_PLAYER['y']))
    players[username]['facing'] = str(data.get('facing', 'down'))

    emit('player_moved', {
        'username': username,
        'x':        players[username]['x'],
        'y':        players[username]['y'],
        'facing':   players[username]['facing'],
    }, broadcast=True, include_self=False)


@socketio.on('save_state')
def handle_save_state(data):
    """Client emits this after earning/spending money (casino, pizzeria)."""
    sid      = request.sid
    username = sid_to_username.get(sid)
    if not username:
        return
    if 'money' in data:
        players[username]['money'] = int(data['money'])
    _save()


@socketio.on('disconnect')
def handle_disconnect():
    sid      = request.sid
    username = sid_to_username.pop(sid, None)
    if not username:
        return
    if username in players:
        players[username].pop('sid', None)
    _save()
    emit('player_left', {'username': username}, broadcast=True)
    print(f'[-] {username} disconnected')


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()

    print(f'City RPG server running on http://0.0.0.0:{args.port}')
    print('To share with a friend: ngrok http {port}'.format(port=args.port))
    socketio.run(app, host='0.0.0.0', port=args.port, allow_unsafe_werkzeug=True)
