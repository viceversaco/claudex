import json
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from redis.asyncio import Redis

from app.constants import (
    MAX_QUEUE_SIZE,
    QUEUE_MESSAGE_TTL_SECONDS,
    REDIS_KEY_CHAT_QUEUE,
)
from app.models.schemas.queue import QueuedMessage, QueueListResponse

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

    async def add_message(
        self,
        chat_id: str,
        content: str,
        model_id: str,
        permission_mode: str = "auto",
        thinking_mode: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> tuple[UUID, int]:
        key = self._queue_key(chat_id)
        current_len = await self.redis.llen(key)

        if current_len >= MAX_QUEUE_SIZE:
            raise ValueError(f"Queue is full (max {MAX_QUEUE_SIZE} messages)")

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

        await self.redis.rpush(key, json.dumps(message_data))
        await self.redis.expire(key, QUEUE_MESSAGE_TTL_SECONDS)

        position = current_len
        return message_id, position

    async def get_queue(self, chat_id: str) -> QueueListResponse:
        key = self._queue_key(chat_id)
        raw_items = await self.redis.lrange(key, 0, -1)

        items: list[QueuedMessage] = []
        for idx, raw in enumerate(raw_items):
            data = json.loads(raw)
            items.append(
                QueuedMessage(
                    id=UUID(data["id"]),
                    content=data["content"],
                    model_id=data["model_id"],
                    permission_mode=data.get("permission_mode", "auto"),
                    thinking_mode=data.get("thinking_mode"),
                    position=idx,
                    queued_at=datetime.fromisoformat(data["queued_at"]),
                    attachments=data.get("attachments"),
                )
            )

        return QueueListResponse(items=items, count=len(items))

    async def update_message(
        self, chat_id: str, message_id: UUID, content: str
    ) -> QueuedMessage | None:
        key = self._queue_key(chat_id)
        raw_items = await self.redis.lrange(key, 0, -1)

        for idx, raw in enumerate(raw_items):
            data = json.loads(raw)
            if data["id"] == str(message_id):
                data["content"] = content
                await self.redis.lset(key, idx, json.dumps(data))
                return QueuedMessage(
                    id=UUID(data["id"]),
                    content=data["content"],
                    model_id=data["model_id"],
                    permission_mode=data.get("permission_mode", "auto"),
                    thinking_mode=data.get("thinking_mode"),
                    position=idx,
                    queued_at=datetime.fromisoformat(data["queued_at"]),
                    attachments=data.get("attachments"),
                )

        return None

    async def append_to_message(
        self,
        chat_id: str,
        message_id: UUID,
        content: str,
        attachments: list[dict[str, Any]] | None = None,
    ) -> QueuedMessage | None:
        key = self._queue_key(chat_id)
        raw_items = await self.redis.lrange(key, 0, -1)

        for idx, raw in enumerate(raw_items):
            data = json.loads(raw)
            if data["id"] == str(message_id):
                data["content"] = data["content"] + "\n" + content

                if attachments:
                    existing_attachments = data.get("attachments") or []
                    data["attachments"] = existing_attachments + attachments

                await self.redis.lset(key, idx, json.dumps(data))
                return QueuedMessage(
                    id=UUID(data["id"]),
                    content=data["content"],
                    model_id=data["model_id"],
                    permission_mode=data.get("permission_mode", "auto"),
                    thinking_mode=data.get("thinking_mode"),
                    position=idx,
                    queued_at=datetime.fromisoformat(data["queued_at"]),
                    attachments=data.get("attachments"),
                )

        return None

    async def remove_message(self, chat_id: str, message_id: UUID) -> bool:
        key = self._queue_key(chat_id)
        raw_items = await self.redis.lrange(key, 0, -1)

        for raw in raw_items:
            data = json.loads(raw)
            if data["id"] == str(message_id):
                await self.redis.lrem(key, 1, raw)
                return True

        return False

    async def pop_next_message(self, chat_id: str) -> dict[str, Any] | None:
        key = self._queue_key(chat_id)
        raw = await self.redis.lpop(key)

        if not raw:
            return None

        return json.loads(raw)

    async def has_messages(self, chat_id: str) -> bool:
        key = self._queue_key(chat_id)
        length = await self.redis.llen(key)
        return length > 0
