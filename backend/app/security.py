import secrets

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


async def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    if not x_api_key or not secrets.compare_digest(x_api_key, settings.backend_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )


async def require_scheduler_token(
    x_scheduler_token: str | None = Header(default=None, alias="X-Scheduler-Token"),
    settings: Settings = Depends(get_settings),
) -> None:
    if not x_scheduler_token or not secrets.compare_digest(
        x_scheduler_token, settings.scheduler_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid scheduler token.",
        )
