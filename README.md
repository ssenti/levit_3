# AI 영양제 맞춤 비서

This repository contains a minimal full‑stack service that helps users find dietary supplement information and suggestions based on their goals and constraints.

Components
- Frontend: Next.js App Router interface for submitting queries and viewing results
- Backend: FastAPI service that provides endpoints for clarifying questions, recommendations, and health checks

Local Development
- Start backend: activate the Python venv and run `uvicorn main:app --reload --host 0.0.0.0 --port 8000` inside `backend/`
- Start frontend: run `npm run dev` inside `frontend/` and open http://localhost:3000

Environment
- Backend reads environment variables from a `.env` at the repo root (e.g., API keys)
- Frontend expects the backend at `http://localhost:8000` by default or can be configured in the app

License
- This project is provided as-is for demonstration and development purposes.


## Tech Stack
- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS v4 (+ `@tailwindcss/postcss`), Radix UI primitives, `clsx`, `class-variance-authority`, `tailwind-merge`, `lucide-react`, Markdown via `marked` + `dompurify`
- **Backend**: FastAPI, Uvicorn, Pydantic v2, `httpx`, `python-dotenv`
- **LLM APIs**: Perplexity API, Gemini API
- **Tooling**: ESLint, TypeScript, npm
