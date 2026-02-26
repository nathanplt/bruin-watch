import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas import NotifierCreateRequest, normalize_course_number, normalize_term


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("31", "31"),
        (" COM SCI 32 ", "32"),
        ("003", "003"),
    ],
)
def test_normalize_course_number_valid(raw: str, expected: str) -> None:
    assert normalize_course_number(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc", "M51A", "31A", "31.5"])
def test_normalize_course_number_invalid(raw: str) -> None:
    with pytest.raises(ValueError):
        normalize_course_number(raw)


@pytest.mark.parametrize("raw", ["26S", "26W"])
def test_normalize_term_valid(raw: str) -> None:
    assert normalize_term(raw) == raw


@pytest.mark.parametrize("raw", ["2026S", "26", "S26"])
def test_normalize_term_invalid(raw: str) -> None:
    with pytest.raises(ValueError):
        normalize_term(raw)


def test_notifier_create_accepts_email_target() -> None:
    payload = NotifierCreateRequest(
        course_number="31",
        term="26S",
        phone_to="student@example.com",
        interval_seconds=60,
    )
    assert payload.phone_to == "student@example.com"


def test_notifier_create_accepts_phone_target() -> None:
    payload = NotifierCreateRequest(
        course_number="31",
        term="26S",
        phone_to="+15551234567",
        interval_seconds=60,
    )
    assert payload.phone_to == "+15551234567"


def test_notifier_create_rejects_invalid_target() -> None:
    with pytest.raises(ValueError):
        NotifierCreateRequest(
            course_number="31",
            term="26S",
            phone_to="not-a-phone-or-email",
            interval_seconds=60,
        )
