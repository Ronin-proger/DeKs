# API

Backend корпоративного аналитического сервиса DeKs.

Запуск из корня репозитория описан в основном `README.md`. Локально:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload
```

Требования: Python 3.11+, SQLite из стандартной библиотеки. Для ассистента и смысловых связей нужна локальная модель. Для обмена заметками — хранилище в каталоге `HAC` и ключ в `.env` в корне проекта.
