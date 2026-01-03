import json
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from redis.asyncio import Redis

from app.constants import (
    QUEUE_MESSAGE_TTL_SECONDS,
    REDIS_KEY_CHAT_QUEUE,
)
from app.models.schemas.queue import QueuedMessage, QueueUpsertResponse

if TYPE_CHECKING:
    from app.models.db_models import Message

logger = logging.getLogger(__name__)


def serialize_message_attachments(
    queued_msg: dict[str, Any],
    user_message: "Message",
) -> list[dict[str, Any]] | None:
    if not queued_msg.get("attachments") or not user_message.attachments:
        return None

    return [
        {
            "id": str(att.id),
            "message_id": str(att.message_id),
            "file_url": att.file_url,
            "file_type": att.file_type,
            "filename": att.filename,
            "created_at": att.created_at.isoformat(),
        }
        for att in user_message.attachments
    ]


class QueueService:
    def __init__(self, redis_client: "Redis[str]"):
        self.redis = redis_client

    def _queue_key(self, chat_id: str) -> str:
        return REDIS_KEY_CHAT_QUEUE.format(chat_id=chat_id)

    async def upsert_message(
        self,
        chat_id: str,
        content: str,
        model_id: str,
        permission_mode: str = "auto",
        thinking_mode: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> QueueUpsertResponse:
        key = self._queue_key(chat_id)
        raw = await self.redis.get(key)

        if raw:
            data = json.loads(raw)
            data["content"] = data["content"] + "\n" + content

            if attachments:
                existing_attachments = data.get("attachments") or []
                data["attachments"] = existing_attachments + attachments

            await self.redis.set(key, json.dumps(data), ex=QUEUE_MESSAGE_TTL_SECONDS)
            return QueueUpsertResponse(
                id=UUID(data["id"]),
                created=False,
                content=data["content"],
                attachments=data.get("attachments"),
            )

        message_id = uuid4()
        message_data: dict[str, Any] = {
            "id": str(message_id),
            "content": content,
            "model_id": model_id,
            "permission_mode": permission_mode,
            "thinking_mode": thinking_mode,
            "queued_at": datetime.now(timezone.utc).isoformat(),
            "attachments": attachments,
        }

        await self.redis.set(
            key, json.dumps(message_data), ex=QUEUE_MESSAGE_TTL_SECONDS
        )
        return QueueUpsertResponse(
            id=message_id,
            created=True,
            content=content,
            attachments=attachments,
        )

    async def get_message(self, chat_id: str) -> QueuedMessage | None:
        key = self._queue_key(chat_id)
        raw = await self.redis.get(key)

        if not raw:
            return None

        data = json.loads(raw)
        return QueuedMessage(
            id=UUID(data["id"]),
            content=data["content"],
            model_id=data["model_id"],
            permission_mode=data.get("permission_mode", "auto"),
            thinking_mode=data.get("thinking_mode"),
            queued_at=datetime.fromisoformat(data["queued_at"]),
            attachments=data.get("attachments"),
        )

    async def update_message(self, chat_id: str, content: str) -> QueuedMessage | None:
        key = self._queue_key(chat_id)
        raw = await self.redis.get(key)

        if not raw:
            return None

        data = json.loads(raw)
        data["content"] = content
        await self.redis.set(key, json.dumps(data), ex=QUEUE_MESSAGE_TTL_SECONDS)

        return QueuedMessage(
            id=UUID(data["id"]),
            content=data["content"],
            model_id=data["model_id"],
            permission_mode=data.get("permission_mode", "auto"),
            thinking_mode=data.get("thinking_mode"),
            queued_at=datetime.fromisoformat(data["queued_at"]),
            attachments=data.get("attachments"),
        )

    async def clear_queue(self, chat_id: str) -> bool:
        key = self._queue_key(chat_id)
        deleted = await self.redis.delete(key)
        return deleted > 0

    async def pop_next_message(self, chat_id: str) -> dict[str, Any] | None:
        key = self._queue_key(chat_id)
        raw = await self.redis.getdel(key)

        if not raw:
            return None

        return json.loads(raw)

    async def has_messages(self, chat_id: str) -> bool:
        key = self._queue_key(chat_id)
        return await self.redis.exists(key) > 0
