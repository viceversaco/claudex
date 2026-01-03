from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable
from uuid import UUID

from sqlalchemy import select

from app.models.db_models import Chat, Message

logger = logging.getLogger(__name__)


def hydrate_chat(chat_data: dict[str, Any]) -> Chat:
    return Chat(
        id=UUID(chat_data["id"]),
        user_id=UUID(chat_data["user_id"]),
        title=chat_data["title"],
        sandbox_id=chat_data.get("sandbox_id"),
        session_id=chat_data.get("session_id"),
        sandbox_provider=chat_data.get("sandbox_provider"),
    )


class SessionUpdateCallback:
    def __init__(
        self,
        chat_id: str,
        assistant_message_id: str | None,
        session_factory: Any,
        session_container: dict[str, Any],
        sandbox_id: str,
        sandbox_provider: str,
        user_id: str,
        model_id: str,
        context_usage_trigger: Callable[..., Any] | None = None,
    ) -> None:
        self.chat_id = chat_id
        self.assistant_message_id = assistant_message_id
        self.session_factory = session_factory
        self.session_container = session_container
        self.sandbox_id = sandbox_id
        self.sandbox_provider = sandbox_provider
        self.user_id = user_id
        self.model_id = model_id
        self._context_usage_trigger = context_usage_trigger

    def __call__(self, new_session_id: str) -> None:
        self.session_container["session_id"] = new_session_id
        asyncio.create_task(self._update_session_id(new_session_id))

        if self.sandbox_id and self._context_usage_trigger:
            self._context_usage_trigger(
                chat_id=self.chat_id,
                session_id=new_session_id,
                sandbox_id=self.sandbox_id,
                sandbox_provider=self.sandbox_provider,
                user_id=self.user_id,
                model_id=self.model_id,
            )

    async def _update_session_id(self, session_id: str) -> None:
        if not self.session_factory:
            return

        try:
            async with self.session_factory() as db:
                chat_uuid = UUID(self.chat_id)
                chat_query = select(Chat).filter(Chat.id == chat_uuid)
                chat_result = await db.execute(chat_query)
                chat_record = chat_result.scalar_one_or_none()
                if chat_record:
                    chat_record.session_id = session_id
                    db.add(chat_record)

                if self.assistant_message_id:
                    message_uuid = UUID(self.assistant_message_id)
                    message_query = select(Message).filter(Message.id == message_uuid)
                    message_result = await db.execute(message_query)
                    message = message_result.scalar_one_or_none()
                    if message:
                        message.session_id = session_id
                        db.add(message)

                await db.commit()
        except Exception as exc:
            logger.error("Failed to update session_id: %s", exc)
