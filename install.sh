#!/usr/bin/env bash
# install.sh — set up City RPG on a new machine
# Supports: Debian/Ubuntu (apt), macOS (brew), or any system with pip3

set -e

echo "=== City RPG — Dependency Installer ==="

# ── Detect OS ─────────────────────────────────────────────────────────────────
OS="$(uname -s)"

install_python_deps_pip() {
  echo ">> Installing Python packages via pip..."
  pip3 install flask flask-socketio simple-websocket
}

install_python_deps_apt() {
  echo ">> Installing Python packages via apt..."
  sudo apt-get update -q
  sudo apt-get install -y python3-flask python3-flask-socketio python3-eventlet python3-pip
  # simple-websocket is not in apt, install via pip
  python3 -m pip install simple-websocket --break-system-packages 2>/dev/null \
    || python3 -m pip install simple-websocket
}

install_python_deps_brew() {
  echo ">> Installing Python packages via pip3 (Homebrew Python)..."
  pip3 install flask flask-socketio simple-websocket
}

# ── Python packages ───────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found. Please install Python 3.9+ first."
  exit 1
fi

echo ">> Python: $(python3 --version)"

# Check if Flask is already installed
if python3 -c "import flask" &>/dev/null; then
  echo ">> Python packages already installed, skipping."
else
  if [ "$OS" = "Darwin" ]; then
    install_python_deps_brew
  elif command -v apt-get &>/dev/null; then
    install_python_deps_apt
  elif command -v pip3 &>/dev/null; then
    install_python_deps_pip
  else
    echo "ERROR: Could not find apt-get or pip3. Install Flask manually:"
    echo "  pip3 install flask flask-socketio simple-websocket"
    exit 1
  fi
fi

# Verify required packages
echo ">> Verifying Python packages..."
python3 -c "import flask, flask_socketio, simple_websocket" \
  && echo "   OK: flask, flask-socketio, simple-websocket" \
  || { echo "ERROR: Python package verification failed."; exit 1; }

# ── ngrok ─────────────────────────────────────────────────────────────────────
if command -v ngrok &>/dev/null; then
  echo ">> ngrok: $(ngrok --version 2>&1 | head -1) — already installed"
else
  echo ""
  echo ">> ngrok not found."
  echo "   To share the game with friends, install ngrok from: https://ngrok.com/download"
  echo "   (free account required for tunneling)"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "=== Installation complete ==="
echo ""
echo "Run the game:"
echo "  make serve          # start server on port 8080"
echo "  make serve PORT=3000  # custom port"
echo ""
echo "Share with a friend:"
echo "  make tunnel         # start ngrok tunnel"
