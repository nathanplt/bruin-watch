from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from .config import get_settings


class DatabaseError(RuntimeError):
    pass


def _error_text(exc: Exception) -> str:
    message = getattr(exc, "message", None)
    if isinstance(message, str) and message.strip():
        return message.strip()

    detail = getattr(exc, "details", None)
    if isinstance(detail, str) and detail.strip():
        return detail.strip()

    return str(exc).strip() or exc.__class__.__name__


@lru_cache
def get_supabase_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def list_notifiers(*, active_only: bool | None = None) -> list[dict[str, Any]]:
    client = get_supabase_client()
    try:
        query = client.table("notifiers").select("*").order("created_at", desc=True)
        if active_only is not None:
            query = query.eq("active", active_only)
        result = query.execute()
        return result.data or []
    except Exception as exc:  # noqa: BLE001
        raise DatabaseError(f"Failed to list notifiers: {_error_text(exc)}") from exc


def get_notifier(notifier_id: str) -> dict[str, Any] | None:
    client = get_supabase_client()
    try:
        result = client.table("notifiers").select("*").eq("id", notifier_id).limit(1).execute()
        if not result.data:
            return None
        return result.data[0]
    except Exception as exc:  # noqa: BLE001
        raise DatabaseError(f"Failed to get notifier {notifier_id}: {_error_text(exc)}") from exc


def create_notifier(payload: dict[str, Any]) -> dict[str, Any]:
    client = get_supabase_client()
    try:
        result = client.table("notifiers").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        raise DatabaseError(f"Failed to create notifier: {_error_text(exc)}") from exc

    if not result.data:
        raise DatabaseError(
            "Failed to create notifier: empty database response. "
            "Verify db/migrations/001_init.sql has been applied."
        )
    return result.data[0]


def update_notifier(notifier_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    client = get_supabase_client()
    try:
        result = client.table("notifiers").update(payload).eq("id", notifier_id).execute()
        if not result.data:
            return None
        return result.data[0]
    except Exception as exc:  # noqa: BLE001
        raise DatabaseError(f"Failed to update notifier {notifier_id}: {_error_text(exc)}") from exc


def delete_notifier(notifier_id: str) -> bool:
    client = get_supabase_client()
    try:
        result = client.table("notifiers").delete().eq("id", notifier_id).execute()
        return bool(result.data)
    except Exception as exc:  # noqa: BLE001
        raise DatabaseError(f"Failed to delete notifier {notifier_id}: {_error_text(exc)}") from exc


def insert_notifier_run(payload: dict[str, Any]) -> dict[str, Any]:
    client = get_supabase_client()
    try:
        result = client.table("notifier_runs").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        raise DatabaseError(f"Failed to insert notifier run: {_error_text(exc)}") from exc

    if not result.data:
        raise DatabaseError(
            "Failed to insert notifier run: empty database response. "
            "Verify db/migrations/001_init.sql has been applied."
        )
    return result.data[0]


def latest_runs_by_notifier(notifier_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not notifier_ids:
        return {}

    client = get_supabase_client()
    try:
        result = (
            client.table("notifier_runs")
            .select("*")
            .in_("notifier_id", notifier_ids)
            .order("checked_at", desc=True)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise DatabaseError(f"Failed to query notifier runs: {_error_text(exc)}") from exc

    latest: dict[str, dict[str, Any]] = {}
    for row in result.data or []:
        notifier_id = row["notifier_id"]
        if notifier_id not in latest:
            latest[notifier_id] = row
    return latest
