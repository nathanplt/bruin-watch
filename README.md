# BruinWatch

Automated UCLA COM SCI course enrollment tracker with instant email/SMS alerts.

## Overview

BruinWatch monitors UCLA Computer Science course availability and sends instant notifications when courses transition from closed to available (open or waitlist).

**Key Features:**
- Real-time web scraping of UCLA enrollment data
- Email and SMS alert support
- Configurable check intervals (15 seconds to 1 hour)
- Admin dashboard for managing multiple course notifiers
- Production-ready deployment on Google Cloud Run and Vercel

## Architecture

- **Backend**: FastAPI + Playwright web scraper (Google Cloud Run)
- **Frontend**: Next.js 14 admin dashboard (Vercel)
- **Database**: Supabase PostgreSQL
- **Scheduler**: Google Cloud Scheduler (triggers checks every minute)
- **Alerts**: Gmail SMTP or Twilio SMS

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
```

Configure required variables in `.env`:

**Security:**
- `BACKEND_API_KEY` - Random 32+ character string
- `SCHEDULER_TOKEN` - Random 32+ character string
- `SESSION_SECRET` - Random 32+ character string

**Database:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

**Authentication:**
- `ADMIN_EMAIL` - Admin login email
- `ADMIN_PASSWORD_HASH` - Bcrypt hash of admin password

**Alert Channel (choose one):**
- Gmail: `GMAIL_SENDER`, `GMAIL_APP_PASSWORD`, `ALERT_TO_EMAIL`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

Generate secure tokens:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Generate password hash:
```bash
cd frontend
node -e "console.log(require('bcryptjs').hashSync('your-password', 12))"
```

### 2. Database Setup

Execute the migration SQL in Supabase SQL Editor:
```
backend/db/migrations/001_init.sql
```

### 3. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
uvicorn app.main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Access dashboard at `http://localhost:3000`

## API Endpoints

**Public Routes** (require `X-API-Key` header):
- `GET /healthz` - Health check
- `POST /api/v1/check` - Check course status once
- `GET /api/v1/notifiers` - List notifiers
- `POST /api/v1/notifiers` - Create notifier
- `PATCH /api/v1/notifiers/{id}` - Update notifier
- `DELETE /api/v1/notifiers/{id}` - Delete notifier

**Internal Routes** (require `X-Scheduler-Token` header):
- `POST /internal/scheduler-tick` - Trigger scheduler run

## Production Deployment

### Backend (Cloud Run)

See detailed instructions: [`backend/deploy/cloud_run_scheduler.md`](backend/deploy/cloud_run_scheduler.md)

1. Store secrets in Google Secret Manager
2. Deploy to Cloud Run
3. Configure Cloud Scheduler job for `/internal/scheduler-tick`

### Frontend (Vercel)

1. Connect repository to Vercel
2. Set root directory to `frontend/`
3. Configure environment variables
4. Deploy

## How It Works

**Course Detection:**
- Playwright scrapes UCLA enrollment pages in real-time
- "Open" and "Waitlist" statuses count as available
- Only "Closed..." statuses are unavailable
- Tracks lecture and discussion sections independently

**Alert Logic:**
- Monitors at configurable intervals (default: 60 seconds)
- Sends notification on unavailable → available transition
- Prevents duplicate alerts
- Stores run history with timestamps and error tracking

**Security:**
- Bcrypt password hashing
- JWT session tokens (7-day expiry)
- Rate limiting (10 login attempts per 15 minutes)
- CORS restricted to configured origin
- Security headers (X-Frame-Options, CSP)

## Testing

```bash
cd backend
pytest tests/
```

Test coverage includes:
- Scraper status detection logic
- Schema validation
- Notifier timing calculations
- Email/phone detection

## License

MIT
