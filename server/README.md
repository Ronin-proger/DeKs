# API

FastAPI backend for DeKs. Run from the repository root via Docker Compose or `make api`.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload
```

Requires Python 3.11+, SQLite, and (for intelligence features) a local Ollama instance with chat and embed models. Vault path and keys live in the root `.env`.
