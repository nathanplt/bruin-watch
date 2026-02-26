# Enroll Notify

Production-oriented UCLA COM SCI enrollment notifier.

## Architecture

- `frontend/`: Next.js App Router UI (deploy on Vercel)
- `backend/`: FastAPI API + scheduler tick endpoint (deploy on Cloud Run)
- `Supabase Postgres`: persistent notifier configs and run history
- `Cloud Scheduler`: calls backend `/internal/scheduler-tick` every minute
- `Gmail SMTP or Twilio`: alerts when a course transitions from not-enrollable to enrollable

## Quick Start (Local)

## 1) Environment

Copy and fill env vars:

```bash
cp .env.example .env
```

Fastest alert channel for local testing: Gmail App Password (`GMAIL_SENDER`, `GMAIL_APP_PASSWORD`, `ALERT_TO_EMAIL`).

Security requirements:

- `BACKEND_API_KEY` and `SCHEDULER_TOKEN` should be high-entropy random values (32+ chars).
- `SESSION_SECRET` must be 32+ chars.
- Use `ADMIN_PASSWORD_HASH` in production (bcrypt hash). Plain `ADMIN_PASSWORD` is for local dev only.

Generate an admin password hash (recommended):

```bash
cd frontend
node -e "console.log(require('bcryptjs').hashSync('your-password', 12))"
```

## 2) Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
uvicorn app.main:app --reload --port 8000
```

Local dev behavior:

- If `ENVIRONMENT=development`, backend runs scheduler ticks automatically every 60s.
- You can also trigger a tick from the dashboard with `Run Checks Now`.

Run SQL migration once in Supabase SQL editor:

- `backend/db/migrations/001_init.sql`

Smoke test backend APIs:

```bash
cd backend
BACKEND_API_KEY=your_api_key_here bash scripts/smoke_notifier_api.sh
```

## 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

For the dashboard `Run Checks Now` button, frontend server env must include `SCHEDULER_TOKEN`.

## API Summary

- `GET /healthz`
- `POST /api/v1/check`
- `GET /api/v1/notifiers`
- `POST /api/v1/notifiers`
- `PATCH /api/v1/notifiers/{id}`
- `DELETE /api/v1/notifiers/{id}`
- `POST /internal/scheduler-tick` (requires `X-Scheduler-Token`)

All `/api/v1/*` routes require `X-API-Key`.

## Deployment

- Backend deployment and scheduler commands: `backend/deploy/cloud_run_scheduler.md`
- Frontend deploy: connect `frontend/` directory to Vercel project.
