import asyncio
import json
import logging
import uuid
from typing import TYPE_CHECKING, Any

from redis.asyncio import Redis
from sqlalchemy import select

from app.constants import (
    REDIS_KEY_CHAT_CONTEXT_USAGE,
    REDIS_KEY_CHAT_REVOKED,
    REDIS_KEY_CHAT_TASK,
)
from app.core.config import get_settings
from app.db.session import get_celery_session
from app.models.db_models import Chat
from app.services.claude_agent import ClaudeAgentService
from app.services.streaming.events import StreamEvent
from app.services.user import UserService
from app.tasks.chat_streaming import _publish_stream_entry

if TYPE_CHECKING:
    from app.models.types import JSONDict

logger = logging.getLogger(__name__)

settings = get_settings()


async def _is_stream_active(chat_id: str, redis_client: "Redis[str]") -> bool:
    try:
        task_key = REDIS_KEY_CHAT_TASK.format(chat_id=chat_id)
        revoked_key = REDIS_KEY_CHAT_REVOKED.format(chat_id=chat_id)

        task_exists = (await redis_client.get(task_key)) is not None
        is_revoked = (await redis_client.get(revoked_key)) in ("1", b"1")

        return task_exists and not is_revoked
    except Exception:
        return False


async def fetch_and_broadcast_context_usage(
    chat_id: str,
    session_id: str,
    sandbox_id: str,
    sandbox_provider: str,
    user_id: str,
    model_id: str,
    redis_client: "Redis[str]",
    session_factory: Any,
) -> dict[str, Any] | None:
    try:
        user_service = UserService(session_factory=session_factory)
        user_settings = await user_service.get_user_settings(uuid.UUID(user_id))

        e2b_api_key = (
            user_settings.e2b_api_key if sandbox_provider != "docker" else None
        )

        async with ClaudeAgentService(session_factory=session_factory) as ai_service:
            token_usage = await ai_service.get_context_token_usage(
                session_id=session_id,
                sandbox_id=sandbox_id,
                sandbox_provider=sandbox_provider,
                model_id=model_id,
                user_settings=user_settings,
                e2b_api_key=e2b_api_key,
            )

            if token_usage is None:
                return None

            context_window = settings.CONTEXT_WINDOW_TOKENS
            percentage = (
                min((token_usage / context_window) * 100, 100.0)
                if context_window > 0
                else 0.0
            )

            context_data: JSONDict = {
                "tokens_used": token_usage,
                "context_window": context_window,
                "percentage": percentage,
            }

            async with session_factory() as db:
                result = await db.execute(
                    select(Chat).filter(Chat.id == uuid.UUID(chat_id))
                )
                chat_to_update = result.scalar_one_or_none()
                if chat_to_update:
                    chat_to_update.context_token_usage = token_usage
                    db.add(chat_to_update)
                    await db.commit()

            cache_key = REDIS_KEY_CHAT_CONTEXT_USAGE.format(chat_id=chat_id)
            await redis_client.setex(
                cache_key,
                settings.CONTEXT_USAGE_CACHE_TTL_SECONDS,
                json.dumps(context_data),
            )

            system_event: StreamEvent = {
                "type": "system",
                "data": {"context_usage": context_data, "chat_id": chat_id},
            }
            await _publish_stream_entry(
                redis_client,
                chat_id,
                "content",
                {"event": system_event},
            )

            return context_data

    except Exception as e:
        logger.error("Failed to fetch context token usage for chat %s: %s", chat_id, e)

    return None


async def _poll_context_usage_while_streaming(
    chat_id: str,
    session_id: str,
    sandbox_id: str,
    sandbox_provider: str,
    user_id: str,
    model_id: str,
) -> None:
    redis_client: Redis[str] | None = None

    try:
        redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

        async with get_celery_session() as (session_factory, _):
            async with session_factory() as db:
                result = await db.execute(
                    select(Chat).filter(
                        Chat.id == uuid.UUID(chat_id),
                        Chat.user_id == uuid.UUID(user_id),
                    )
                )
                chat = result.scalar_one_or_none()
                if not chat:
                    logger.warning(
                        "Chat %s not found or not owned by user %s", chat_id, user_id
                    )
                    return

            while True:
                await fetch_and_broadcast_context_usage(
                    chat_id=chat_id,
                    session_id=session_id,
                    sandbox_id=sandbox_id,
                    sandbox_provider=sandbox_provider,
                    user_id=user_id,
                    model_id=model_id,
                    redis_client=redis_client,
                    session_factory=session_factory,
                )

                if not await _is_stream_active(chat_id, redis_client):
                    break

                await asyncio.sleep(settings.CONTEXT_USAGE_POLL_INTERVAL_SECONDS)

    except Exception as e:
        logger.error("Context usage polling failed for chat %s: %s", chat_id, e)
    finally:
        if redis_client:
            await redis_client.close()
