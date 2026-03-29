# Request: Implement Real-Time Multiplayer with Socket.io

## 1. Context
I have a local game currently served via `python -m http.server`. It is a client-side game where a player can move around. I want to transform this into a multiplayer game where:
1. I can share a link with a friend.
2. Users "log in" using only a **Username** (no password).
3. If a username exists, they resume that character; if not, a new one is created.
4. Players can see each other and move in real-time on the same screen.

## 2. Technical Requirements
- **Backend:** Python (Flask-SocketIO or FastAPI).
- **Frontend:** Vanilla JavaScript (or my existing framework) using the Socket.io client.
- **Communication:** WebSockets for real-time position updates.
- **Data Persistence:** A simple JSON file or dictionary to store player positions by username.

## 3. Implementation Tasks
Please provide the following:

### A. The Server (`app.py`)
- Create a Flask-SocketIO server.
- Handle a `login` event: Check if the username exists in a `players` dictionary.
- Handle a `move` event: Receive X/Y coordinates and broadcast them to all other connected clients.
- Handle `disconnect`: Remove or de-activate players when they leave.

### B. The Client-Side Logic (`game.js`)
- Integration of the Socket.io CDN script.
- A simple HTML/JS overlay for the "Username" login.
- Logic to `emit` the player's position to the server whenever they move.
- Logic to `listen` for other players moving and render their characters on my screen.

### C. Deployment Instructions
- Briefly explain how to use **Localtunnel** or **Ngrok** so I can send a public URL to my friend.

