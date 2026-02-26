from datetime import UTC, datetime, timedelta
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.notifier_engine import is_email_target, is_notifier_due, parse_timestamp


def test_parse_timestamp_handles_z_suffix() -> None:
    parsed = parse_timestamp("2026-02-26T12:00:00Z")
    assert parsed is not None
    assert parsed.tzinfo is not None


def test_notifier_due_when_never_checked() -> None:
    now = datetime.now(UTC)
    notifier = {"interval_seconds": 60, "last_checked_at": None}
    assert is_notifier_due(notifier, now)


def test_notifier_not_due_before_interval() -> None:
    now = datetime.now(UTC)
    last_checked = (now - timedelta(seconds=30)).isoformat()
    notifier = {"interval_seconds": 60, "last_checked_at": last_checked}
    assert not is_notifier_due(notifier, now)


def test_notifier_due_after_interval() -> None:
    now = datetime.now(UTC)
    last_checked = (now - timedelta(seconds=61)).isoformat()
    notifier = {"interval_seconds": 60, "last_checked_at": last_checked}
    assert is_notifier_due(notifier, now)


def test_is_email_target_true() -> None:
    assert is_email_target("student@example.com")


def test_is_email_target_false_for_phone() -> None:
    assert not is_email_target("+15551234567")
