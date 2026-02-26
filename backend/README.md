# Enroll Notify Backend (FastAPI)

## Local run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
uvicorn app.main:app --reload --port 8000
```

Set `ENVIRONMENT=development` in `.env` for local auto-scheduler behavior.

## Required env vars

- `ENVIRONMENT` (`development` or `production`)
- `BACKEND_API_KEY`
- `SCHEDULER_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGIN` (e.g. `http://localhost:3000`)
- `LOCAL_SCHEDULER_ENABLED` (optional; defaults to `true` in local `development`, `false` on Cloud Run)
- `LOCAL_SCHEDULER_INTERVAL_SECONDS` (optional; defaults to `60`)

Alert channel envs (configure at least one):

- Gmail email: `GMAIL_SENDER`, `GMAIL_APP_PASSWORD`, optional `ALERT_TO_EMAIL`
- Twilio SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, optional `ALERT_TO_NUMBER`

Security recommendations:

- Use 32+ char random values for `BACKEND_API_KEY` and `SCHEDULER_TOKEN`.
- In production, set `ENVIRONMENT=production`.
- Keep `LOCAL_SCHEDULER_ENABLED=false` on Cloud Run; use Cloud Scheduler instead.

## DB schema

Run SQL in `db/migrations/001_init.sql` using Supabase SQL Editor.

## Local scheduler behavior

- In development (`ENVIRONMENT=development`), the backend automatically runs scheduler ticks on a loop.
- This means notifier checks happen locally even without Cloud Scheduler or Cloud Run.
- For Cloud Run production, set `LOCAL_SCHEDULER_ENABLED=false` and use Cloud Scheduler.

## Smoke test API before deploy

With backend running locally:

```bash
cd backend
BACKEND_API_KEY=your_api_key_here bash scripts/smoke_notifier_api.sh
```

Optional overrides:

- `BACKEND_BASE_URL` (default `http://127.0.0.1:8000`)
- `COURSE_NUMBER` (default `31`)
- `TERM_CODE` (default `26S`)
- `ALERT_TARGET` (default: `PHONE_TO` or `ALERT_TO_EMAIL` or `ALERT_TO_NUMBER`)
- `INTERVAL_SECONDS` (default `60`)
