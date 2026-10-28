# DeKs

Internal workspace app: dashboard, messenger, page parsing, and an Obsidian note index with optional local-model search.

## Architecture

```text
React (Vite)  →  FastAPI  →  SQLite
                    ├── workspace / messenger / profile
                    ├── Obsidian Local REST API ↔ markdown vault (HAC/)
                    └── /api/intelligence (sync, embeddings, graph, RAG)
                              ↓
                         Ollama (chat + embed)
```

Session auth uses an httpOnly cookie. Almost all API routes require a logged-in user; `/health`, `/api/login`, and `/api/register` are public. The Obsidian webhook (`POST /api/intelligence/webhook`) is authenticated with `WEBHOOK_SECRET` (header `X-Webhook-Secret` or HMAC `X-Hub-Signature-256`), not a user session.

## Requirements

- Docker Compose (preferred), or Python 3.11+ and Node 20+
- [Ollama](https://ollama.com) with a chat model and an embed model (defaults: `qwen2.5:1.5b`, `nomic-embed-text`)
- [Obsidian](https://obsidian.md) with the **Local REST API** community plugin installed and configured (do not vendor the plugin binary into the repo)
- Demo vault: markdown under `HAC/` only

## Run

Copy `.env.example` to `.env` and set at least `OBSIDIAN_API_KEY` / vault path as needed.

```bash
docker compose up -d --build
```

UI: `http://localhost:5173` · API: `http://localhost:3001` · health: `GET /health`

Helpers:

```bash
make up          # docker compose
make api         # local uvicorn on :3001
make client      # local Vite on :5173
make test
```

Windows batch files (`start-all.bat`, `start-server.bat`, `start-client.bat`) remain for a non-Docker local start.

### Environment notes

| Variable | Purpose |
| --- | --- |
| `COOKIE_SECURE` | Set `true` / `1` behind HTTPS so the session cookie is Secure |
| `CLIENT_ORIGIN` | Comma-separated browser origins for CORS (credentials enabled) |
| `WEBHOOK_SECRET` | Required for vault change webhooks |
| `EMBEDDING_FALLBACK` | Empty = require Ollama embeddings (else 503). `hash` = token-hash search with an honest `embeddingBackend: "hash"` label |
| `OLLAMA_*` / `OBSIDIAN_*` | Local model and vault connectivity |

CORS method/header lists are fixed for the app; do not widen them to `*` for production. Keep `CLIENT_ORIGIN` explicit.

Passwords are bcrypt only. If an old DB still has plaintext hashes, run once:

```bash
python scripts/migrate_passwords_to_bcrypt.py
```

## Limitations

Semantic search and related intelligence features need a reachable Ollama embed model. Without it, those endpoints return HTTP 503 unless `EMBEDDING_FALLBACK=hash` is set, in which case results are labeled as hash search and must not be treated as embeddings. Vault sync still indexes markdown and wikilinks without embeddings. The demo vault is sample markdown for local development; it is not a production knowledge base, and any “demo detector” tooling elsewhere does not apply to this repository.
