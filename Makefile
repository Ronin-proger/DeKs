.PHONY: up down logs api client test lint install

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

install:
	cd server && python -m pip install -r requirements.txt
	cd client && npm install

api:
	cd server && python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload

client:
	cd client && npm run dev

test:
	cd server && python -m pytest -q
	cd client && npm test

lint:
	cd server && python -m compileall -q .
	cd client && npm run build
