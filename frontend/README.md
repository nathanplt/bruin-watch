# Enroll Notify Frontend (Next.js)

## Local run

```bash
cd frontend
npm install
npm run dev
```

## Required env vars

- `NEXT_PUBLIC_APP_NAME`
- `BACKEND_BASE_URL` (recommended local value: `http://127.0.0.1:8000`)
- `BACKEND_API_KEY` (server-side only)
- `SCHEDULER_TOKEN` (server-side only; for dashboard `Run Checks Now`)
- `SESSION_SECRET` (32+ chars)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` (local dev convenience) or `ADMIN_PASSWORD_HASH` (production required)

Notes:
- Frontend will also read `../.env` automatically via `next.config.mjs`.
- If using bcrypt hash directly in `.env`, escape `$` as `\\$`.
- Notifier `Alert To` accepts either email or phone. Gmail is fastest to test.

## Vercel

- Set project root to `frontend/`.
- Configure all env vars in Vercel project settings.
- Deploy.
