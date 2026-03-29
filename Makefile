PORT ?= 8080

install:
	bash install.sh

serve:
	python3 app.py --port $(PORT)

tunnel:
	ngrok http $(PORT)

.PHONY: install serve tunnel
