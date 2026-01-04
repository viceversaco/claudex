from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from redis.asyncio import Redis

from app.constants import (
    REDIS_KEY_CHAT_REVOKED,
    REDIS_KEY_CHAT_STREAM,
    REDIS_KEY_CHAT_TASK,
)
from app.core.config import get_settings
from app.services.streaming.events import StreamEvent

if TYPE_CHECKING:
    from celery import Task

logger = logging.getLogger(__name__)
settings = get_settings()

STREAM_MAX_LEN = 10_000


class StreamPublisher:
    def __init__(self, chat_id: str) -> None:
        self.chat_id = chat_id
        self._redis: Redis[str] | None = None

    async def connect(
        self, task: Task[Any, Any], skip_stream_delete: bool = False
    ) -> None:
        try:
            self._redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            if not skip_stream_delete:
                await self._redis.delete(
                    REDIS_KEY_CHAT_STREAM.format(chat_id=self.chat_id)
                )
            await self._redis.setex(
                REDIS_KEY_CHAT_TASK.format(chat_id=self.chat_id),
                settings.TASK_TTL_SECONDS,
                task.request.id,
            )
        except Exception as exc:
            logger.error("Failed to connect to Redis: %s", exc)
            self._redis = None

    @property
    def redis(self) -> Redis[str] | None:
        return self._redis

    async def publish(
        self, kind: str, payload: dict[str, Any] | str | None = None
    ) -> None:
        if not self._redis:
            return

        fields: dict[str, str | int | float] = {"kind": kind}
        if payload is not None:
            if isinstance(payload, str):
                fields["payload"] = payload
            else:
                fields["payload"] = json.dumps(payload, ensure_ascii=False)

        try:
            await self._redis.xadd(
                REDIS_KEY_CHAT_STREAM.format(chat_id=self.chat_id),
                fields,
                maxlen=STREAM_MAX_LEN,
                approximate=True,
            )
        except Exception as exc:
            logger.warning(
                "Failed to append stream entry for chat %s: %s", self.chat_id, exc
            )

    async def publish_event(self, event: StreamEvent) -> None:
        await self.publish("content", {"event": event})

    async def publish_complete(self) -> None:
        await self.publish("complete")

    async def publish_error(self, error: str) -> None:
        await self.publish("error", {"error": error})

    async def publish_queue_event(
        self,
        queued_message_id: str,
        user_message_id: str,
        assistant_message_id: str,
        content: str,
        model_id: str,
        attachments: list[dict[str, Any]] | None = None,
        injected_inline: bool = False,
    ) -> None:
        event_type = "queue_injected" if injected_inline else "queue_processing"
        payload: dict[str, Any] = {
            "queued_message_id": queued_message_id,
            "user_message_id": user_message_id,
            "assistant_message_id": assistant_message_id,
            "content": content,
            "model_id": model_id,
            "attachments": attachments,
        }
        if injected_inline:
            payload["injected_inline"] = True
        await self.publish(event_type, payload)

    async def clear_stream(self) -> None:
        if not self._redis:
            return
        try:
            await self._redis.delete(REDIS_KEY_CHAT_STREAM.format(chat_id=self.chat_id))
        except Exception as exc:
            logger.warning("Failed to clear stream for chat %s: %s", self.chat_id, exc)

    async def cleanup(self) -> None:
        if not self._redis:
            return

        try:
            await self._redis.delete(REDIS_KEY_CHAT_TASK.format(chat_id=self.chat_id))
            await self._redis.delete(
                REDIS_KEY_CHAT_REVOKED.format(chat_id=self.chat_id)
            )
        except Exception as exc:
            logger.error("Failed to cleanup Redis keys: %s", exc)

        try:
            await self._redis.close()
        except Exception as exc:
            logger.debug("Error closing Redis client: %s", exc)

        self._redis = None
