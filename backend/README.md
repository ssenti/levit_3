# Always AI Supplement Assistant MVP - Backend

Run locally

```
source /Users/jinhongkim/levit_3/backend/.venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Env vars are read from `.env` at repo root via `python-dotenv`.

APIs
- `POST /api/clarify` → ask for up to 2 clarifying questions
- `POST /api/recommend` → fetch, rank and summarize top 3 products
- `GET /healthz` → health check

