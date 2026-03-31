"""
Unit tests for app.py — backend socket handlers and helper functions.
Run: python3 -m unittest tests/test_app.py -v
"""

import base64
import json
import os
import sys
import tempfile
import unittest

# ── Isolate from real save file ────────────────────────────────────────────────
_tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
_tmp.close()
os.environ['_TEST_SAVE_FILE'] = _tmp.name

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as _app_module
_app_module.SAVE_FILE = _tmp.name   # redirect saves away from player_data.json

from app import app, socketio, players, sid_to_key, DEFAULT_PLAYER, _public


def _clear():
    """Reset global state between tests."""
    players.clear()
    sid_to_key.clear()


class TestPublicHelper(unittest.TestCase):
    def test_strips_sid(self):
        data = {'username': 'Alice', 'sid': 'abc123', 'money': 50}
        result = _public(data)
        self.assertNotIn('sid', result)
        self.assertEqual(result['username'], 'Alice')

    def test_strips_password(self):
        data = {'username': 'Bob', 'password': 'secret', 'hp': 100}
        result = _public(data)
        self.assertNotIn('password', result)
        self.assertEqual(result['hp'], 100)

    def test_keeps_other_fields(self):
        data = {'x': 1.0, 'y': 2.0, 'money': 99, 'guest': True}
        result = _public(data)
        self.assertEqual(result, data)


class TestLoadSave(unittest.TestCase):
    def setUp(self):
        _clear()

    def test_save_and_load_roundtrip(self):
        players['alice'] = {**DEFAULT_PLAYER, 'username': 'Alice', 'money': 250}
        _app_module._save()
        loaded = _app_module._load()
        self.assertIn('alice', loaded)
        self.assertEqual(loaded['alice']['money'], 250)

    def test_save_strips_sid(self):
        players['bob'] = {**DEFAULT_PLAYER, 'username': 'Bob', 'sid': 'xyz'}
        _app_module._save()
        loaded = _app_module._load()
        self.assertNotIn('sid', loaded['bob'])

    def test_load_returns_empty_on_missing_file(self):
        _app_module.SAVE_FILE = '/tmp/nonexistent_webgame_test_12345.json'
        result = _app_module._load()
        _app_module.SAVE_FILE = _tmp.name
        self.assertEqual(result, {})


class TestRegister(unittest.TestCase):
    def setUp(self):
        _clear()
        self.client = socketio.test_client(app)

    def tearDown(self):
        self.client.disconnect()
        _clear()

    def _emit(self, event, data=None):
        self.client.emit(event, data or {})
        return self.client.get_received()

    def test_register_success(self):
        msgs = self._emit('register', {
            'username': 'Alice', 'password': 'pass1', 'gender': 'female', 'colors': {}
        })
        events = [m['name'] for m in msgs]
        self.assertIn('register_success', events)
        self.assertIn('alice', players)

    def test_register_creates_default_stats(self):
        self._emit('register', {'username': 'Alice', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        self.assertEqual(players['alice']['money'], DEFAULT_PLAYER['money'])
        self.assertEqual(players['alice']['hp'], DEFAULT_PLAYER['hp'])

    def test_register_duplicate_username(self):
        self._emit('register', {'username': 'Alice', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        msgs = self._emit('register', {'username': 'alice', 'password': 'pass2', 'gender': 'male', 'colors': {}})
        events = [m['name'] for m in msgs]
        self.assertIn('register_error', events)

    def test_register_short_username(self):
        msgs = self._emit('register', {'username': 'A', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        events = [m['name'] for m in msgs]
        self.assertIn('register_error', events)

    def test_register_invalid_chars(self):
        msgs = self._emit('register', {'username': 'bad name!', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        events = [m['name'] for m in msgs]
        self.assertIn('register_error', events)

    def test_register_short_password(self):
        msgs = self._emit('register', {'username': 'Alice', 'password': 'pw', 'gender': 'male', 'colors': {}})
        events = [m['name'] for m in msgs]
        self.assertIn('register_error', events)

    def test_register_stores_password_encoded(self):
        self._emit('register', {'username': 'Alice', 'password': 'mypassword', 'gender': 'male', 'colors': {}})
        stored = players['alice']['password']
        decoded = base64.b64decode(stored.encode()).decode()
        self.assertEqual(decoded, 'mypassword')


class TestLogin(unittest.TestCase):
    def setUp(self):
        _clear()
        self.client = socketio.test_client(app)
        # Register a user first
        self.client.emit('register', {'username': 'Alice', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        self.client.get_received()
        self.client.disconnect()
        _clear_sids()

    def tearDown(self):
        try:
            self.client.disconnect()
        except RuntimeError:
            pass
        _clear()

    def _fresh_client(self):
        return socketio.test_client(app)

    def test_login_success(self):
        c = self._fresh_client()
        c.emit('login', {'username': 'Alice', 'password': 'pass1'})
        msgs = c.get_received()
        events = [m['name'] for m in msgs]
        self.assertIn('login_success', events)
        c.disconnect()

    def test_login_wrong_password(self):
        c = self._fresh_client()
        c.emit('login', {'username': 'Alice', 'password': 'wrongpass'})
        msgs = c.get_received()
        events = [m['name'] for m in msgs]
        self.assertIn('login_error', events)
        c.disconnect()

    def test_login_unknown_user(self):
        c = self._fresh_client()
        c.emit('login', {'username': 'Ghost', 'password': 'pass1'})
        msgs = c.get_received()
        events = [m['name'] for m in msgs]
        self.assertIn('login_error', events)
        c.disconnect()

    def test_login_returns_player_data(self):
        c = self._fresh_client()
        c.emit('login', {'username': 'Alice', 'password': 'pass1'})
        msgs = c.get_received()
        success = next(m for m in msgs if m['name'] == 'login_success')
        self.assertIn('player', success['args'][0])
        self.assertNotIn('password', success['args'][0]['player'])
        c.disconnect()


class TestGuestLogin(unittest.TestCase):
    def setUp(self):
        _clear()

    def tearDown(self):
        _clear()

    def test_guest_login_creates_player(self):
        c = socketio.test_client(app)
        c.emit('guest_login')
        msgs = c.get_received()
        events = [m['name'] for m in msgs]
        self.assertIn('login_success', events)
        c.disconnect()

    def test_guest_is_marked(self):
        c = socketio.test_client(app)
        c.emit('guest_login')
        msgs = c.get_received()
        success = next(m for m in msgs if m['name'] == 'login_success')
        username = success['args'][0]['username'].lower()
        self.assertTrue(players[username].get('guest'))
        c.disconnect()

    def test_guest_removed_on_disconnect(self):
        c = socketio.test_client(app)
        c.emit('guest_login')
        msgs = c.get_received()
        success = next(m for m in msgs if m['name'] == 'login_success')
        key = success['args'][0]['username'].lower()
        self.assertIn(key, players)
        c.disconnect()
        self.assertNotIn(key, players)


class TestMove(unittest.TestCase):
    def setUp(self):
        _clear()
        self.client = socketio.test_client(app)
        self.client.emit('register', {'username': 'Alice', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        self.client.get_received()

    def tearDown(self):
        self.client.disconnect()
        _clear()

    def test_move_updates_position(self):
        self.client.emit('move', {'x': 500.0, 'y': 300.0, 'facing': 'right'})
        self.client.get_received()
        self.assertEqual(players['alice']['x'], 500.0)
        self.assertEqual(players['alice']['y'], 300.0)
        self.assertEqual(players['alice']['facing'], 'right')


class TestSaveState(unittest.TestCase):
    def setUp(self):
        _clear()
        self.client = socketio.test_client(app)
        self.client.emit('register', {'username': 'Alice', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        self.client.get_received()

    def tearDown(self):
        self.client.disconnect()
        _clear()

    def test_save_state_updates_money(self):
        self.client.emit('save_state', {'money': 500, 'hp': 80})
        self.client.get_received()
        self.assertEqual(players['alice']['money'], 500)
        self.assertEqual(players['alice']['hp'], 80)

    def test_save_state_ignores_unknown_fields(self):
        original_keys = set(players['alice'].keys())
        self.client.emit('save_state', {'money': 10, 'hacked_field': 'bad'})
        self.client.get_received()
        self.assertNotIn('hacked_field', players['alice'])

    def test_save_state_ignored_for_guests(self):
        _clear()
        c = socketio.test_client(app)
        c.emit('guest_login')
        msgs = c.get_received()
        key = next(m for m in msgs if m['name'] == 'login_success')['args'][0]['username'].lower()
        original_money = players[key]['money']
        c.emit('save_state', {'money': 9999})
        c.get_received()
        self.assertEqual(players[key]['money'], original_money)
        c.disconnect()


class TestDisconnect(unittest.TestCase):
    def setUp(self):
        _clear()

    def tearDown(self):
        _clear()

    def test_registered_player_persists_after_disconnect(self):
        c = socketio.test_client(app)
        c.emit('register', {'username': 'Alice', 'password': 'pass1', 'gender': 'male', 'colors': {}})
        c.get_received()
        c.disconnect()
        self.assertIn('alice', players)
        self.assertNotIn('sid', players.get('alice', {}))

    def test_guest_removed_after_disconnect(self):
        c = socketio.test_client(app)
        c.emit('guest_login')
        msgs = c.get_received()
        key = next(m for m in msgs if m['name'] == 'login_success')['args'][0]['username'].lower()
        c.disconnect()
        self.assertNotIn(key, players)


def _clear_sids():
    sid_to_key.clear()
    for p in players.values():
        p.pop('sid', None)


if __name__ == '__main__':
    unittest.main()
