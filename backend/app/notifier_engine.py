import re
import smtplib
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import TYPE_CHECKING, Any

import requests

if TYPE_CHECKING:
    from .config import Settings
    from .scraper import CourseStatus


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def is_notifier_due(notifier: dict[str, Any], now: datetime) -> bool:
    interval = max(int(notifier.get("interval_seconds") or 60), 1)
    last_checked_at = parse_timestamp(notifier.get("last_checked_at"))
    if last_checked_at is None:
        return True
    return now - last_checked_at >= timedelta(seconds=interval)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_email_target(target: str) -> bool:
    return bool(EMAIL_RE.fullmatch(target.strip()))


def build_alert_message(term: str, course: "CourseStatus") -> str:
    from .scraper import build_cs_results_url

    results_url = build_cs_results_url(term)
    return (
        f"UCLA {term} alert: COM SCI {course.course_number} is enrollable now. "
        f"{results_url}"
    )


def send_sms(*, settings: "Settings", to_number: str, message: str) -> str:
    if (
        not settings.twilio_account_sid
        or not settings.twilio_auth_token
        or not settings.twilio_from_number
    ):
        raise RuntimeError(
            "Missing Twilio config. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER."
        )

    response = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json",
        auth=(settings.twilio_account_sid, settings.twilio_auth_token),
        data={
            "From": settings.twilio_from_number,
            "To": to_number,
            "Body": message,
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    return payload.get("sid", "")


def send_email(*, settings: "Settings", to_email: str, message: str) -> str:
    if not settings.gmail_sender or not settings.gmail_app_password:
        raise RuntimeError("Missing Gmail config. Set GMAIL_SENDER and GMAIL_APP_PASSWORD.")

    subject = "BruinWatch: Course Open"
    email = EmailMessage()
    email["From"] = settings.gmail_sender
    email["To"] = to_email
    email["Subject"] = subject
    email.set_content(message)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as client:
        client.ehlo()
        client.starttls()
        client.ehlo()
        client.login(settings.gmail_sender, settings.gmail_app_password)
        client.send_message(email)

    return f"email:{int(time.time())}"


async def run_scheduler_tick(settings: "Settings") -> dict[str, Any]:
    from . import database
    from .scraper import fetch_course_statuses

    now = datetime.now(UTC)
    now_iso = now.isoformat()

    active_notifiers = database.list_notifiers(active_only=True)
    due_notifiers = [n for n in active_notifiers if is_notifier_due(n, now)]

    status_lookup: dict[tuple[str, str], CourseStatus] = {}
    grouped: dict[str, set[str]] = defaultdict(set)
    for notifier in due_notifiers:
        grouped[notifier["term"]].add(str(notifier["course_number"]))

    for term, courses in grouped.items():
        statuses = await fetch_course_statuses(sorted(courses), term)
        for status in statuses:
            status_lookup[(term, status.course_number)] = status

    sms_sent_count = 0
    error_count = 0

    for notifier in due_notifiers:
        started = time.perf_counter()

        notifier_id = notifier["id"]
        term = notifier["term"]
        course_number = str(notifier["course_number"])
        target = notifier.get("phone_to") or settings.alert_to_email or settings.alert_to_number

        is_enrollable: bool | None = None
        sms_sent = False
        twilio_sid: str | None = None
        error_text: str | None = None

        try:
            course_status = status_lookup.get((term, course_number))
            if course_status is None:
                raise RuntimeError(f"No course status returned for COM SCI {course_number}.")

            is_enrollable = course_status.is_enrollable
            previous_state = notifier.get("last_known_enrollable")

            if is_enrollable and (previous_state is False or previous_state is None):
                if not target:
                    raise RuntimeError("Missing alert target for notifier.")
                message = build_alert_message(term, course_status)
                if is_email_target(str(target)):
                    twilio_sid = send_email(settings=settings, to_email=str(target), message=message)
                else:
                    twilio_sid = send_sms(settings=settings, to_number=str(target), message=message)
                sms_sent = True
                sms_sent_count += 1

            update_payload: dict[str, Any] = {
                "last_known_enrollable": is_enrollable,
                "last_checked_at": now_iso,
                "updated_at": now_iso,
            }
            if sms_sent:
                update_payload["last_alerted_at"] = now_iso
            database.update_notifier(notifier_id, update_payload)
        except Exception as exc:  # noqa: BLE001
            error_text = str(exc)
            error_count += 1
            database.update_notifier(
                notifier_id,
                {
                    "last_checked_at": now_iso,
                    "updated_at": now_iso,
                },
            )

        duration_ms = int((time.perf_counter() - started) * 1000)
        database.insert_notifier_run(
            {
                "notifier_id": notifier_id,
                "checked_at": now_iso,
                "is_enrollable": is_enrollable,
                "sms_sent": sms_sent,
                "twilio_sid": twilio_sid,
                "error_text": error_text,
                "duration_ms": duration_ms,
            }
        )

    return {
        "checked_at": now,
        "total_active": len(active_notifiers),
        "due_count": len(due_notifiers),
        "processed_count": len(due_notifiers),
        "sms_sent_count": sms_sent_count,
        "error_count": error_count,
    }
