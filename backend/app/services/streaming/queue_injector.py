from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.models.db_models import Message, MessageRole, MessageStreamStatus
from app.services.message import MessageService
from app.services.queue import QueueService, serialize_message_attachments
from app.services.streaming.events import StreamEvent
from app.utils.redis import redis_connection

if TYPE_CHECKING:
    from app.services.streaming.publisher import StreamPublisher
    from app.services.transports.base import BaseSandboxTransport


class QueueInjector:
    def __init__(
        self,
        chat_id: str,
        transport: BaseSandboxTransport,
        publisher: StreamPublisher,
        session_factory: Any,
        session_id: str | None = None,
    ) -> None:
        self.chat_id = chat_id
        self.transport = transport
        self.publisher = publisher
        self.session_factory = session_factory
        self.session_id = session_id

    async def check_and_inject(self) -> str | None:
        async with redis_connection() as redis:
            queue_service = QueueService(redis)
            if not await queue_service.has_messages(self.chat_id):
                return None

            queued_msg = await queue_service.pop_next_message(self.chat_id)
            if not queued_msg:
                return None

        messages = await self._create_queue_messages(queued_msg)
        if not messages:
            return None

        user_message, assistant_message = messages

        await self._publish_injection_event(queued_msg, user_message, assistant_message)

        injection_msg = self._build_injection_message(queued_msg, self.session_id)

        await self.transport.write(json.dumps(injection_msg) + "\n")
        return str(assistant_message.id)

    async def _create_queue_messages(
        self,
        queued_msg: dict[str, Any],
    ) -> tuple[Message, Message] | None:
        message_service = MessageService(session_factory=self.session_factory)

        attachments = queued_msg.get("attachments")

        user_message = await message_service.create_message(
            UUID(self.chat_id),
            queued_msg["content"],
            MessageRole.USER,
            attachments=attachments,
        )

        assistant_message = await message_service.create_message(
            UUID(self.chat_id),
            "",
            MessageRole.ASSISTANT,
            model_id=queued_msg["model_id"],
            stream_status=MessageStreamStatus.IN_PROGRESS,
        )

        return user_message, assistant_message

    async def _publish_injection_event(
        self,
        queued_msg: dict[str, Any],
        user_message: Message,
        assistant_message: Message,
    ) -> None:
        await self.publisher.publish_queue_event(
            queued_message_id=queued_msg["id"],
            user_message_id=str(user_message.id),
            assistant_message_id=str(assistant_message.id),
            content=queued_msg["content"],
            model_id=queued_msg["model_id"],
            attachments=serialize_message_attachments(queued_msg, user_message),
            injected_inline=True,
        )

    def _build_injection_message(
        self,
        queued_msg: dict[str, Any],
        session_id: str | None = None,
    ) -> dict[str, Any]:
        prompt = self._prepare_user_prompt(
            queued_msg["content"],
            queued_msg.get("attachments"),
        )

        return {
            "type": "user",
            "message": {"role": "user", "content": prompt},
            "parent_tool_use_id": None,
            "session_id": session_id,
        }

    def _prepare_user_prompt(
        self,
        content: str,
        attachments: list[dict[str, Any]] | None = None,
    ) -> str:
        if not attachments:
            return f"<user_prompt>{content}</user_prompt>"

        files_list = "\n".join(
            f"- /home/user/{att['file_path'].split('/')[-1]}" for att in attachments
        )
        return (
            f"<user_attachments>\nUser uploaded the following files\n{files_list}\n</user_attachments>\n\n"
            f"<user_prompt>{content}</user_prompt>"
        )

    @staticmethod
    def should_try_injection(event: StreamEvent) -> bool:
        if event.get("type") != "tool_completed":
            return False

        tool = event.get("tool", {})
        if tool.get("parent_id"):
            return False

        return True
