import logging
from datetime import datetime, timezone
from typing import cast
from uuid import UUID

from sqlalchemy import select, delete, update, or_, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.db_models import (
    Message,
    MessageAttachment,
    MessageRole,
    MessageStreamStatus,
)
from app.models.schemas import CursorPaginatedMessages
from app.models.types import MessageAttachmentDict
from app.services.base import BaseDbService, SessionFactoryType
from app.services.exceptions import MessageException, ErrorCode
from app.utils.cursor import encode_cursor, decode_cursor, InvalidCursorError

settings = get_settings()
logger = logging.getLogger(__name__)


class MessageService(BaseDbService[Message]):
    def __init__(self, session_factory: SessionFactoryType | None = None) -> None:
        super().__init__(session_factory)

    async def create_message(
        self,
        chat_id: UUID,
        content: str,
        role: MessageRole,
        attachments: list[MessageAttachmentDict] | None = None,
        model_id: str | None = None,
        session_id: str | None = None,
        stream_status: MessageStreamStatus | None = None,
    ) -> Message:
        async with self.session_factory() as db:
            message_kwargs: dict[str, UUID | str | MessageRole | None] = {
                "chat_id": chat_id,
                "content": content,
                "role": role,
                "model_id": model_id,
                "session_id": session_id,
            }
            if stream_status is not None:
                message_kwargs["stream_status"] = stream_status

            message = Message(**message_kwargs)
            db.add(message)
            await db.commit()
            await db.refresh(message)

            if attachments:
                for attachment_data in attachments:
                    attachment = MessageAttachment(
                        message_id=message.id,
                        file_url=attachment_data["file_url"],
                        file_path=attachment_data.get("file_path"),
                        file_type=attachment_data["file_type"],
                        filename=attachment_data.get("filename"),
                    )
                    db.add(attachment)
                    await db.flush()

                    attachment.file_url = f"{settings.BASE_URL}/api/v1/attachments/{attachment.id}/preview"

                await db.commit()
                await db.refresh(message, ["attachments"])

            return message

    async def get_message(self, message_id: UUID) -> Message | None:
        async with self.session_factory() as db:
            query = (
                select(Message)
                .options(selectinload(Message.attachments))
                .filter(Message.id == message_id)
            )
            result = await db.execute(query)
            return cast(Message | None, result.scalar_one_or_none())

    async def update_message_content(self, message_id: UUID, content: str) -> Message:
        async with self.session_factory() as db:
            query = (
                select(Message)
                .options(selectinload(Message.attachments))
                .filter(Message.id == message_id)
            )
            result = await db.execute(query)
            message = result.scalar_one_or_none()

            if not message:
                raise MessageException(
                    "Message not found",
                    error_code=ErrorCode.MESSAGE_NOT_FOUND,
                    details={"message_id": str(message_id)},
                    status_code=404,
                )

            message.content = content
            message.updated_at = datetime.now(timezone.utc)

            db.add(message)
            await db.commit()
            await db.refresh(message, ["attachments"])

            return cast(Message, message)

    async def update_message_status(
        self, message_id: UUID, status: MessageStreamStatus
    ) -> Message:
        async with self.session_factory() as db:
            query = select(Message).filter(Message.id == message_id)
            result = await db.execute(query)
            message = result.scalar_one_or_none()

            if not message:
                raise MessageException(
                    "Message not found",
                    error_code=ErrorCode.MESSAGE_NOT_FOUND,
                    details={"message_id": str(message_id)},
                    status_code=404,
                )

            message.stream_status = status
            message.updated_at = datetime.now(timezone.utc)

            db.add(message)
            await db.commit()
            await db.refresh(message)

            return cast(Message, message)

    async def get_chat_messages(
        self, chat_id: UUID, cursor: str | None = None, limit: int = 20
    ) -> CursorPaginatedMessages:
        async with self.session_factory() as db:
            query = (
                select(Message)
                .options(selectinload(Message.attachments))
                .filter(Message.chat_id == chat_id, Message.deleted_at.is_(None))
                .order_by(Message.created_at.desc(), Message.id.desc())
                .limit(limit + 1)
            )

            if cursor:
                try:
                    ts, mid = decode_cursor(cursor)
                except InvalidCursorError:
                    raise MessageException(
                        "Invalid pagination cursor",
                        error_code=ErrorCode.VALIDATION_ERROR,
                        status_code=400,
                    )
                query = query.filter(
                    or_(
                        Message.created_at < ts,
                        and_(Message.created_at == ts, Message.id < mid),
                    )
                )

            result = await db.execute(query)
            rows = list(result.scalars().all())

            has_more = len(rows) > limit
            items = rows[:limit]

            next_cursor = None
            if has_more and items:
                last = items[-1]
                next_cursor = encode_cursor(last.created_at, last.id)

            return CursorPaginatedMessages(
                items=items,
                next_cursor=next_cursor,
                has_more=has_more,
            )

    async def get_latest_assistant_message(self, chat_id: UUID) -> Message | None:
        async with self.session_factory() as db:
            query = (
                select(Message)
                .filter(
                    Message.chat_id == chat_id,
                    Message.role == MessageRole.ASSISTANT,
                    Message.deleted_at.is_(None),
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            result = await db.execute(query)
            return cast(Message | None, result.scalar_one_or_none())

    async def delete_messages_after(self, chat_id: UUID, message: Message) -> int:
        async with self.session_factory() as db:
            delete_stmt = delete(Message).filter(
                Message.chat_id == chat_id, Message.created_at > message.created_at
            )
            result = await db.execute(delete_stmt)
            await db.commit()
            return int(getattr(result, "rowcount", 0))

    async def get_attachment(
        self, attachment_id: UUID, db: AsyncSession
    ) -> MessageAttachment | None:
        result = await db.execute(
            select(MessageAttachment)
            .options(selectinload(MessageAttachment.message).selectinload(Message.chat))
            .where(MessageAttachment.id == attachment_id)
        )
        return cast(MessageAttachment | None, result.scalar_one_or_none())

    async def soft_delete_messages_for_chat(self, chat_id: UUID) -> int:
        async with self.session_factory() as db:
            now = datetime.now(timezone.utc)
            stmt = (
                update(Message)
                .where(Message.chat_id == chat_id, Message.deleted_at.is_(None))
                .values(deleted_at=now)
            )
            result = await db.execute(stmt)
            await db.commit()
            return int(getattr(result, "rowcount", 0))

    async def soft_delete_message(self, message_id: UUID) -> bool:
        async with self.session_factory() as db:
            now = datetime.now(timezone.utc)
            stmt = (
                update(Message)
                .where(Message.id == message_id, Message.deleted_at.is_(None))
                .values(deleted_at=now)
            )
            result = await db.execute(stmt)
            await db.commit()
            return int(getattr(result, "rowcount", 0)) > 0
