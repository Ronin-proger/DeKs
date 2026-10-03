# DeKs

Веб-приложение для рабочего пространства и управления знаниями: мессенджер, задачи, календарь, хранилище файлов, база знаний и AI-ассистент.

## Стек

- Frontend: React, Vite
- Backend: Python, FastAPI
- База: SQLite
- Заметки: Obsidian (Local REST API), хранилище в папке `HAC`
- AI: Ollama

## Запуск

Скопируйте `.env.example` в `.env` и подставьте свой ключ Obsidian.

Сервер:

```bash
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 5174 --reload
```

Клиент:

```bash
cd client
npm install
npm run dev -- --port 3000
```

Либо через Docker: `docker-compose up -d`.
