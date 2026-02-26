# Cloud Run + Scheduler Setup

## 1) Create strong tokens

```bash
python3 - <<'PY'
import secrets
print("BACKEND_API_KEY=" + secrets.token_urlsafe(32))
print("SCHEDULER_TOKEN=" + secrets.token_urlsafe(32))
PY
```

## 2) Store secrets in Secret Manager (recommended)

Create secrets for at least:

- `enroll-notify-backend-api-key`
- `enroll-notify-scheduler-token`
- `enroll-notify-supabase-service-role-key`
- `enroll-notify-gmail-app-password` (or Twilio auth token)

Then add versions (example for one secret):

```bash
printf '%s' '<secret-value>' | gcloud secrets create enroll-notify-backend-api-key --replication-policy=automatic --data-file=-
```

If the secret already exists, add a new version:

```bash
printf '%s' '<secret-value>' | gcloud secrets versions add enroll-notify-backend-api-key --data-file=-
```

## 3) Deploy backend to Cloud Run

```bash
gcloud run deploy enroll-notify-api \
  --source backend \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars FRONTEND_ORIGIN=https://<your-vercel-domain> \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars LOCAL_SCHEDULER_ENABLED=false \
  --set-env-vars SUPABASE_URL=<supabase-url> \
  --set-env-vars GMAIL_SENDER=<gmail-address> \
  --set-env-vars ALERT_TO_EMAIL=<default-alert-email> \
  --set-secrets BACKEND_API_KEY=enroll-notify-backend-api-key:latest \
  --set-secrets SCHEDULER_TOKEN=enroll-notify-scheduler-token:latest \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=enroll-notify-supabase-service-role-key:latest \
  --set-secrets GMAIL_APP_PASSWORD=enroll-notify-gmail-app-password:latest
```

If you want SMS instead of email, set Twilio vars (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ALERT_TO_NUMBER`) instead of Gmail vars.

## 4) Create Cloud Scheduler job (every minute)

Replace `<cloud-run-url>` with your deployed service URL.

```bash
gcloud scheduler jobs create http enroll-notify-tick \
  --schedule="* * * * *" \
  --uri="<cloud-run-url>/internal/scheduler-tick" \
  --http-method=POST \
  --headers="X-Scheduler-Token=<scheduler-token>"
```

## 5) Verify

```bash
curl <cloud-run-url>/healthz
curl -X POST <cloud-run-url>/internal/scheduler-tick \
  -H "X-Scheduler-Token: <scheduler-token>"
```
