PORT ?= 8080

install:
	sudo apt-get install -y python3-flask python3-flask-socketio python3-eventlet python3-pip
	python3 -m pip install simple-websocket --break-system-packages

serve:
	python3 app.py --port $(PORT)

tunnel:
	ngrok http $(PORT)

.PHONY: install serve tunnel
