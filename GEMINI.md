# GEMINI.md - City RPG Project Guide

This file serves as a reference for development and architectural standards for the City RPG project.

## Project Overview
City RPG is a 2D web-based role-playing game featuring real-time multiplayer, mini-games, and a persistent world state.

- **Frontend**: Phaser 3 (2D game engine) with DOM-based HUD.
- **Backend**: Python/Flask with Flask-SocketIO for real-time communication.
- **Persistence**: Player data is stored in `player_data.json` on the server.
- **Multiplayer**: Real-time movement, shared world clock, and player-to-player chat.

## Tech Stack & Dependencies
- **Game Engine**: Phaser 3 (located in `vendor/phaser.min.js`).
- **Real-time Communication**: Socket.io (server: `flask-socketio`, client: `vendor/socket.io.min.js`).
- **Backend Framework**: Flask.
- **Testing**: Jest for JavaScript logic (`tests/*.test.js`), Pytest for Python backend (`tests/test_app.py`).

## Core Architecture

### Backend (`app.py`)
- Manages Socket.IO events for registration, login, movement, and chat.
- Runs a background thread for the **World Clock** (1 real-second = 1 in-game minute).
- Persists player stats (money, hp, energy, xp, jobRank) to `player_data.json`.
- Supports "Guest" logins which are never persisted.

### Global State (`js/GameState.js`)
- Singleton object holding current character stats and time.
- Methods like `addMoney()`, `addHp()`, and `addEnergy()` emit Phaser events for the HUD to update.
- `applyWorldTick(tick)` synchronizes the client with the server's clock and handles passive energy decay.

### Persistence (`js/SaveManager.js`)
- Emits `save_state` to the server via Socket.IO.
- Autosaves every 60 world-ticks in `GameScene` and on `beforeunload` (tab close).

### Scenes (`js/scenes/`)
- `BootScene`: Initial loading of assets and transitions to `GameScene`.
- `GameScene`: The main world map where players interact and move.
- **Venues**: Mini-games are launched as separate scenes on top of `GameScene`.
  - `CasinoLobbyScene` -> `RouletteScene` / `BlackjackScene`
  - `PizzeriaScene` / `DinerScene`: Job-related mini-games.
  - `BasketballScene`: 1-on-1 sports mini-game with custom perspective gravity.
    - **Movement (SF-style Combos)**: Sequential input buffer (0.6s window).
      - Crossover: `↓`, then `←` or `→`, then `D`.
      - Spin: `←` then `→` or `→` then `←`, then `S`.
    - **Shooting (3-Step Sequence)**:
      1. **Trigger (Tap Space)**: Plants feet (locks movement) and starts Trajectory swing.
      2. **Aim (Tap Space)**: Stops Trajectory line to set horizontal accuracy.
      3. **Power (Hold/Release Space)**: Fills vertical bar (ping-pong). Must release at the distance-based sweet spot.
    - **Difficulty**: Move success chances scale with rounds (Easy: ~35% fail, Hard: ~80% fail).
    - **Defender**: Stays at stumble position when beaten until possession ends.
  - `HomeScene`: Used for resting and recovering energy.

## Asset Generation
The project uses custom Python scripts to generate assets from primitive data:
- `python3 generate_assets.py`: Generates `assets/tilesets/city_tiles.png` and `assets/sprites/player.png`.
- `python3 generate_map.py`: Generates the tilemap JSON `assets/tilemaps/city.json`.

## Development Workflows

### Running the Project
```bash
make install      # Install dependencies (Python & JS)
make serve        # Start the Flask-SocketIO server on port 8080
python3 app.py    # Manual server start
```

### Testing
```bash
npm test          # Run Jest tests
pytest            # Run Python tests
```

### Adding a New Scene
1. Create the scene file in `js/scenes/`.
2. Reference the new scene file in `index.html` (before `js/main.js`).
3. Register the scene class in the `scene` array within `js/main.js`.

## Code Standards
- **Phaser Physics**: Arcade physics is the default. Gravity is 0 unless specified (e.g., in `BasketballScene`).
- **HUD**: Keep HUD elements in the `#hud` DOM overlay in `index.html`, styled in `style.css`.
- **Socket Communication**: Prefer `socketio.emit()` for cross-socket messages in the backend to ensure reliable delivery in threading mode.
- **Consistency**: Follow the existing pattern of using `GameState` for shared logic and stats.
