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
import base64
import json
import os
import re
import threading
import time as _time

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit

# ── App setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading',
                    allow_upgrades=False)

# ── World clock ────────────────────────────────────────────────────────────────
# Single authoritative time for all players. Start state: Thursday July 6th = day 4.
# 1 real second = 1 in-game minute.
world_time: dict = {'hour': 8, 'minute': 0, 'day': 4}

def _run_world_clock():
    while True:
        _time.sleep(1)
        world_time['minute'] += 1
        if world_time['minute'] >= 60:
            world_time['minute'] = 0
            world_time['hour'] += 1
        if world_time['hour'] >= 24:
            world_time['hour'] = 0
            world_time['day'] += 1
        socketio.emit('world_tick', dict(world_time))

_clock_thread = threading.Thread(target=_run_world_clock, daemon=True)

# ── Player store ───────────────────────────────────────────────────────────────
# key (lowercase username) → full player record
players: dict = {}
sid_to_key: dict = {}

SAVE_FILE = os.path.join(os.path.dirname(__file__), 'player_data.json')

DEFAULT_PLAYER = {
    'x': 976.0, 'y': 976.0, 'facing': 'down',
    'money': 100, 'hp': 100, 'energy': 100, 'xp': 0,
    'jobRank': 0, 'shiftsWorked': 0,
    'hour': 8, 'minute': 0, 'day': 1, '_clockMs': 0,
}


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
        key: {k: v for k, v in data.items() if k != 'sid'}
        for key, data in players.items()
    }
    try:
        with open(SAVE_FILE, 'w') as f:
            json.dump(to_disk, f, indent=2)
    except Exception as e:
        print(f'[save] warning: {e}')


def _public(data: dict) -> dict:
    """Strip internal fields before sending to clients."""
    return {k: v for k, v in data.items() if k not in ('sid', 'password')}


def _finish_login(key: str):
    """Shared logic after register or login succeeds."""
    sid = request.sid
    sid_to_key[sid] = key
    players[key]['sid'] = sid

    others = {
        k: _public(p)
        for k, p in players.items()
        if k != key and 'sid' in p
    }
    return others


# Load persisted player data on startup
for _key, _data in _load().items():
    players[_key] = dict(_data)


# ── Static file serving ────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)


# ── Socket events ──────────────────────────────────────────────────────────────

@socketio.on('register')
def handle_register(data):
    username = str(data.get('username', '')).strip()[:20]
    password = str(data.get('password', ''))
    gender   = str(data.get('gender', 'male'))
    colors   = data.get('colors', {})

    if len(username) < 2:
        emit('register_error', {'error': 'Username must be at least 2 characters.'})
        return
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        emit('register_error', {'error': 'Username: letters, numbers, _ only.'})
        return
    if len(password) < 4:
        emit('register_error', {'error': 'Password must be at least 4 characters.'})
        return

    key = username.lower()
    if key in players:
        emit('register_error', {'error': 'Username already taken.'})
        return

    players[key] = {
        **dict(DEFAULT_PLAYER),
        'username': username,
        'password': base64.b64encode(password.encode()).decode(),
        'gender':   gender,
        'colors':   colors,
    }
    _save()

    others = _finish_login(key)
    emit('register_success', {
        'username':   username,
        'player':     _public(players[key]),
        'others':     others,
        'world_time': dict(world_time),
    })
    emit('player_joined', {'username': username, 'player': _public(players[key])},
         broadcast=True, include_self=False)
    print(f'[+] {username} registered')


@socketio.on('login')
def handle_login(data):
    username = str(data.get('username', '')).strip()[:20]
    password = str(data.get('password', ''))

    key = username.lower()
    rec = players.get(key)

    if not rec:
        emit('login_error', {'error': 'Username not found.'})
        return
    if 'password' not in rec:
        emit('login_error', {'error': 'Account has no password — please re-register.'})
        return

    try:
        stored = base64.b64decode(rec['password'].encode()).decode()
    except Exception:
        emit('login_error', {'error': 'Incorrect password.'})
        return
    if stored != password:
        emit('login_error', {'error': 'Incorrect password.'})
        return

    others = _finish_login(key)
    emit('login_success', {
        'username':   rec.get('username', username),
        'player':     _public(players[key]),
        'others':     others,
        'world_time': dict(world_time),
    })
    emit('player_joined', {'username': rec.get('username', username), 'player': _public(players[key])},
         broadcast=True, include_self=False)
    print(f'[+] {rec.get("username", username)} connected  ({len(others)} others online)')


@socketio.on('move')
def handle_move(data):
    key = sid_to_key.get(request.sid)
    if not key:
        return

    players[key]['x']      = float(data.get('x', DEFAULT_PLAYER['x']))
    players[key]['y']      = float(data.get('y', DEFAULT_PLAYER['y']))
    players[key]['facing'] = str(data.get('facing', 'down'))

    emit('player_moved', {
        'username': players[key].get('username', key),
        'x':        players[key]['x'],
        'y':        players[key]['y'],
        'facing':   players[key]['facing'],
    }, broadcast=True, include_self=False)


@socketio.on('save_state')
def handle_save_state(data):
    """Client emits this after earning/spending money or finishing a shift."""
    key = sid_to_key.get(request.sid)
    if not key:
        return

    saveable = ('money', 'hp', 'energy', 'xp', 'jobRank',
                'shiftsWorked', 'hour', 'minute', 'day', '_clockMs')
    for field in saveable:
        if field in data:
            players[key][field] = data[field]
    _save()


@socketio.on('chat_request')
def handle_chat_request(data):
    """Player A requests to chat with Player B."""
    from_key = sid_to_key.get(request.sid)
    if not from_key:
        return
    to_key = str(data.get('to', '')).lower()
    target = players.get(to_key)
    if not target or 'sid' not in target:
        emit('chat_error', {'error': 'Player is not online.'})
        return
    from_name = players[from_key].get('username', from_key)
    emit('chat_incoming', {'from': from_name}, to=target['sid'])


@socketio.on('chat_accept')
def handle_chat_accept(data):
    """Target accepts a chat request — notify both parties."""
    acceptor_key = sid_to_key.get(request.sid)
    if not acceptor_key:
        return
    requester_key = str(data.get('with', '')).lower()
    requester = players.get(requester_key)
    if not requester or 'sid' not in requester:
        return
    acceptor_name  = players[acceptor_key].get('username', acceptor_key)
    requester_name = requester.get('username', requester_key)
    emit('chat_started', {'with': acceptor_name},  to=requester['sid'])
    emit('chat_started', {'with': requester_name}, to=request.sid)


@socketio.on('chat_message')
def handle_chat_message(data):
    """Relay a chat message to the target player."""
    from_key = sid_to_key.get(request.sid)
    if not from_key:
        return
    to_key = str(data.get('to', '')).lower()
    target = players.get(to_key)
    if not target or 'sid' not in target:
        return
    from_name = players[from_key].get('username', from_key)
    emit('chat_message', {'from': from_name, 'text': str(data.get('text', ''))[:200]},
         to=target['sid'])
    emit('chat_message', {'from': from_name, 'text': str(data.get('text', ''))[:200]})


@socketio.on('chat_close')
def handle_chat_close(data):
    """Notify the other party that chat was closed."""
    from_key = sid_to_key.get(request.sid)
    if not from_key:
        return
    to_key = str(data.get('to', '')).lower()
    target = players.get(to_key)
    if target and 'sid' in target:
        emit('chat_closed', {}, to=target['sid'])


@socketio.on('disconnect')
def handle_disconnect():
    key = sid_to_key.pop(request.sid, None)
    if not key:
        return
    username = players[key].get('username', key) if key in players else key
    if key in players:
        players[key].pop('sid', None)
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
    _clock_thread.start()
    socketio.run(app, host='0.0.0.0', port=args.port, allow_unsafe_werkzeug=True)
