PORT ?= 8080

install:
	bash install.sh

serve:
	python3 app.py --port $(PORT)

tunnel:
	ngrok http $(PORT)

start:
	@echo "Starting server on port $(PORT) and opening ngrok tunnel..."
	@python3 app.py --port $(PORT) & echo $$! > .server.pid
	@sleep 1
	@ngrok http $(PORT)
	@kill $$(cat .server.pid) 2>/dev/null; rm -f .server.pid

.PHONY: install serve tunnel start
