# City RPG

## Running the game

```bash
make install      # first time only — installs all dependencies
make serve        # starts server on port 8080
make serve PORT=3000  # custom port
```

Open `http://localhost:8080`, enter a username, and play.
Player positions and wallets are persisted in `player_data.json`.

## Sharing with a friend (public URL)

```bash
make tunnel   # runs: ngrok http 8080
```

Ngrok prints a public `https://xxx.ngrok.io` URL — send that to your friend.
They open it, enter a username, and see your character in real time.

## Asset generation

```bash
python3 generate_assets.py   # regenerates tilesets and player sprite
python3 generate_map.py      # regenerates city.json
```
