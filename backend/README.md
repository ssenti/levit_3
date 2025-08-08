# Always AI Supplement Assistant MVP - Backend

Run locally

```
source /Users/jinhongkim/levit_3/backend/.venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Env vars are read from `.env` at repo root via `python-dotenv`. If health check fails, export vars in shell for quick test:

```
export GOOGLE_API_KEY=...; export PERPLEXITY_API_KEY=...
uvicorn main:app --reload --port 8000
```

APIs
- `POST /api/clarify` → ask for up to 2 clarifying questions
- `POST /api/recommend` → fetch, rank and summarize top 3 products
- `GET /healthz` → health check

