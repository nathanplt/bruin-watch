import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

COURSE_RE = re.compile(r"^\d{1,3}$")
TERM_RE = re.compile(r"^\d{2}[A-Z]$")
PHONE_RE = re.compile(r"^\+?[1-9]\d{7,14}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class APIModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


def normalize_course_number(value: str) -> str:
    normalized = value.upper().replace("COM SCI", "").strip()
    if not COURSE_RE.fullmatch(normalized):
        raise ValueError("course_number must be COM SCI numeric format (e.g. 31).")
    return normalized


def normalize_term(value: str) -> str:
    normalized = value.upper().strip()
    if not TERM_RE.fullmatch(normalized):
        raise ValueError("term must be format like 26S.")
    return normalized


class SectionOut(APIModel):
    section: str
    kind: str
    status: str
    is_open: bool
    enrollable_path: bool | None = None


class CheckRequest(APIModel):
    course_number: str = Field(min_length=1, max_length=10)
    term: str = Field(default="26S")

    @field_validator("course_number")
    @classmethod
    def _validate_course_number(cls, value: str) -> str:
        return normalize_course_number(value)

    @field_validator("term")
    @classmethod
    def _validate_term(cls, value: str) -> str:
        return normalize_term(value)


class CheckResponse(APIModel):
    checked_at: datetime
    course_number: str
    course_title: str
    term: str
    enrollable: bool
    sections: list[SectionOut]


class NotifierCreateRequest(APIModel):
    course_number: str = Field(min_length=1, max_length=10)
    term: str = Field(default="26S")
    phone_to: str | None = None
    interval_seconds: int = Field(default=60, ge=15, le=3600)

    @field_validator("course_number")
    @classmethod
    def _validate_course_number(cls, value: str) -> str:
        return normalize_course_number(value)

    @field_validator("term")
    @classmethod
    def _validate_term(cls, value: str) -> str:
        return normalize_term(value)

    @field_validator("phone_to")
    @classmethod
    def _validate_phone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        normalized = value.strip()
        if PHONE_RE.fullmatch(normalized) or EMAIL_RE.fullmatch(normalized):
            return normalized
        raise ValueError("phone_to must be E.164 phone or email address")


class NotifierPatchRequest(APIModel):
    active: bool


class NotifierRunOut(APIModel):
    id: int
    notifier_id: str
    checked_at: datetime
    is_enrollable: bool | None
    sms_sent: bool
    twilio_sid: str | None
    error_text: str | None
    duration_ms: int


class NotifierOut(APIModel):
    id: str
    course_number: str
    term: str
    phone_to: str
    interval_seconds: int
    active: bool
    last_known_enrollable: bool | None
    last_checked_at: datetime | None
    last_alerted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    latest_run: NotifierRunOut | None = None


class NotifierListResponse(APIModel):
    notifiers: list[NotifierOut]


class DeleteResponse(APIModel):
    deleted: bool


class SchedulerTickResponse(APIModel):
    checked_at: datetime
    total_active: int
    due_count: int
    processed_count: int
    sms_sent_count: int
    error_count: int


class ErrorResponse(APIModel):
    detail: str


def notifier_to_response(
    notifier: dict[str, Any],
    latest_run: dict[str, Any] | None,
) -> NotifierOut:
    payload = dict(notifier)
    payload["latest_run"] = latest_run
    return NotifierOut.model_validate(payload)
