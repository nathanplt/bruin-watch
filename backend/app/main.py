import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from . import database
from .config import Settings, get_settings
from .notifier_engine import run_scheduler_tick
from .schemas import (
    CheckRequest,
    CheckResponse,
    DeleteResponse,
    NotifierCreateRequest,
    NotifierListResponse,
    NotifierOut,
    NotifierPatchRequest,
    SchedulerTickResponse,
    notifier_to_response,
)
from .scraper import CourseStatus, fetch_course_statuses
from .security import require_api_key, require_scheduler_token

logger = logging.getLogger(__name__)


def database_error_detail(settings: Settings, exc: Exception) -> str:
    if settings.is_production():
        return "Database operation failed."
    return str(exc)


def to_check_response(*, course: CourseStatus, term: str) -> CheckResponse:
    sections = []
    for group in course.groups:
        sections.append(
            {
                "section": group.primary.section,
                "kind": "lecture",
                "status": group.primary.status,
                "is_open": group.primary.is_open,
                "enrollable_path": group.is_enrollable,
            }
        )
        for discussion in group.discussions:
            sections.append(
                {
                    "section": discussion.section,
                    "kind": "discussion",
                    "status": discussion.status,
                    "is_open": discussion.is_open,
                    "enrollable_path": None,
                }
            )

    return CheckResponse(
        checked_at=datetime.now(UTC),
        course_number=course.course_number,
        course_title=course.course_title,
        term=term,
        enrollable=course.is_enrollable,
        sections=sections,
    )


app = FastAPI(title="BruinWatch API", version="1.0.0")


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.scheme == "https":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=63072000; includeSubDomains; preload",
        )
    if request.url.path.startswith("/api/") or request.url.path.startswith("/internal/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


def resolve_local_scheduler_interval(settings: Settings) -> int:
    return max(settings.local_scheduler_interval_seconds, settings.min_interval_seconds)


async def local_scheduler_loop(
    *,
    settings: Settings,
    stop_event: asyncio.Event,
    interval_seconds: int,
) -> None:
    logger.info("Local scheduler started (interval=%ss)", interval_seconds)
    while not stop_event.is_set():
        try:
            summary = await run_scheduler_tick(settings)
            logger.info(
                "Local scheduler tick complete (due=%s processed=%s sms_sent=%s errors=%s)",
                summary.get("due_count"),
                summary.get("processed_count"),
                summary.get("sms_sent_count"),
                summary.get("error_count"),
            )
        except Exception:  # noqa: BLE001
            logger.exception("Local scheduler tick failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue

    logger.info("Local scheduler stopped")


@app.on_event("startup")
async def on_startup() -> None:
    settings = get_settings()
    app.title = settings.app_name
    app.state.local_scheduler_task = None
    app.state.local_scheduler_stop_event = None

    if settings.use_local_scheduler():
        interval_seconds = resolve_local_scheduler_interval(settings)
        stop_event = asyncio.Event()
        app.state.local_scheduler_stop_event = stop_event
        app.state.local_scheduler_task = asyncio.create_task(
            local_scheduler_loop(
                settings=settings,
                stop_event=stop_event,
                interval_seconds=interval_seconds,
            )
        )


@app.on_event("shutdown")
async def on_shutdown() -> None:
    stop_event = getattr(app.state, "local_scheduler_stop_event", None)
    task = getattr(app.state, "local_scheduler_task", None)

    if stop_event is not None:
        stop_event.set()
    if task is not None:
        await task


@app.get("/healthz")
async def healthz(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    local_scheduler_enabled = settings.use_local_scheduler()
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "local_scheduler_enabled": "true" if local_scheduler_enabled else "false",
        "local_scheduler_interval_seconds": str(resolve_local_scheduler_interval(settings)),
    }


@app.post("/api/v1/check", dependencies=[Depends(require_api_key)], response_model=CheckResponse)
async def check_course(
    payload: CheckRequest,
) -> CheckResponse:
    course_statuses = await fetch_course_statuses([payload.course_number], payload.term)
    return to_check_response(course=course_statuses[0], term=payload.term)


@app.get(
    "/api/v1/notifiers",
    dependencies=[Depends(require_api_key)],
    response_model=NotifierListResponse,
)
async def list_notifiers(settings: Settings = Depends(get_settings)) -> NotifierListResponse:
    try:
        notifiers = database.list_notifiers(active_only=None)
        notifier_ids = [row["id"] for row in notifiers]
        latest_runs = database.latest_runs_by_notifier(notifier_ids)
    except database.DatabaseError as exc:
        logger.exception("Database error while listing notifiers")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=database_error_detail(settings, exc),
        ) from exc

    response_rows: list[NotifierOut] = []
    for notifier in notifiers:
        response_rows.append(notifier_to_response(notifier, latest_runs.get(notifier["id"])))

    return NotifierListResponse(notifiers=response_rows)


@app.post(
    "/api/v1/notifiers",
    dependencies=[Depends(require_api_key)],
    response_model=NotifierOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_notifier(
    payload: NotifierCreateRequest,
    settings: Settings = Depends(get_settings),
) -> NotifierOut:
    target = payload.phone_to or settings.alert_to_email or settings.alert_to_number
    if not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "phone_to is required unless ALERT_TO_EMAIL or ALERT_TO_NUMBER "
                "is set in backend env."
            ),
        )

    now_iso = datetime.now(UTC).isoformat()
    try:
        inserted = database.create_notifier(
            {
                "course_number": payload.course_number,
                "term": payload.term,
                "phone_to": target,
                "interval_seconds": payload.interval_seconds,
                "active": True,
                "last_known_enrollable": None,
                "last_checked_at": None,
                "last_alerted_at": None,
                "created_at": now_iso,
                "updated_at": now_iso,
            }
        )
    except database.DatabaseError as exc:
        logger.exception("Database error while creating notifier")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=database_error_detail(settings, exc),
        ) from exc

    return notifier_to_response(inserted, None)


@app.patch(
    "/api/v1/notifiers/{notifier_id}",
    dependencies=[Depends(require_api_key)],
    response_model=NotifierOut,
)
async def patch_notifier(
    notifier_id: str,
    payload: NotifierPatchRequest,
    settings: Settings = Depends(get_settings),
) -> NotifierOut:
    now_iso = datetime.now(UTC).isoformat()
    try:
        updated = database.update_notifier(
            notifier_id,
            {
                "active": payload.active,
                "updated_at": now_iso,
            },
        )
    except database.DatabaseError as exc:
        logger.exception("Database error while updating notifier %s", notifier_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=database_error_detail(settings, exc),
        ) from exc

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notifier not found.")

    try:
        latest = database.latest_runs_by_notifier([notifier_id]).get(notifier_id)
    except database.DatabaseError as exc:
        logger.exception("Database error while loading latest run for notifier %s", notifier_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=database_error_detail(settings, exc),
        ) from exc

    return notifier_to_response(updated, latest)


@app.delete(
    "/api/v1/notifiers/{notifier_id}",
    dependencies=[Depends(require_api_key)],
    response_model=DeleteResponse,
)
async def remove_notifier(
    notifier_id: str,
    settings: Settings = Depends(get_settings),
) -> DeleteResponse:
    try:
        deleted = database.delete_notifier(notifier_id)
    except database.DatabaseError as exc:
        logger.exception("Database error while deleting notifier %s", notifier_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=database_error_detail(settings, exc),
        ) from exc

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notifier not found.")
    return DeleteResponse(deleted=True)


@app.post(
    "/internal/scheduler-tick",
    dependencies=[Depends(require_scheduler_token)],
    response_model=SchedulerTickResponse,
)
async def scheduler_tick(settings: Settings = Depends(get_settings)) -> SchedulerTickResponse:
    try:
        summary: dict[str, Any] = await run_scheduler_tick(settings)
    except database.DatabaseError as exc:
        logger.exception("Database error during scheduler tick")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=database_error_detail(settings, exc),
        ) from exc

    return SchedulerTickResponse.model_validate(summary)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
