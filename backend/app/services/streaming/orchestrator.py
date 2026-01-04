from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager, suppress
from copy import deepcopy
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, AsyncIterator, Callable
from uuid import UUID

from celery.exceptions import Ignore
from sqlalchemy import select

from app.db.session import get_celery_session
from app.models.db_models import Chat, Message, MessageRole, MessageStreamStatus, User
from app.prompts.system_prompt import build_system_prompt_for_chat
from app.services.exceptions import ClaudeAgentException, UserException
from app.services.message import MessageService
from app.services.queue import QueueService, serialize_message_attachments
from app.services.sandbox import SandboxService
from app.services.sandbox_providers import create_sandbox_provider
from app.services.streaming.cancellation import CancellationHandler, StreamCancelled
from app.services.streaming.events import StreamEvent
from app.services.streaming.publisher import StreamPublisher
from app.services.streaming.queue_injector import QueueInjector
from app.services.streaming.session import SessionUpdateCallback, hydrate_chat
from app.services.user import UserService
from app.utils.redis import redis_connection

if TYPE_CHECKING:
    from celery import Task

    from app.services.claude_agent import ClaudeAgentService

SessionFactoryType = Callable[[], Any]

logger = logging.getLogger(__name__)


@dataclass
class StreamContext:
    chat_id: str
    stream: AsyncIterator[StreamEvent]
    task: Task[Any, Any]
    ai_service: ClaudeAgentService
    assistant_message_id: str | None
    sandbox_service: SandboxService | None
    chat: Chat
    session_factory: Any
    events: list[StreamEvent] = field(default_factory=list)


@dataclass
class StreamOutcome:
    events: list[StreamEvent]
    final_content: str
    total_cost: float


class StreamOrchestrator:
    def __init__(
        self,
        publisher: StreamPublisher,
        cancellation: CancellationHandler,
    ) -> None:
        self.publisher = publisher
        self.cancellation = cancellation

    async def process_stream(self, ctx: StreamContext) -> StreamOutcome:
        try:
            await self._process_stream_events(ctx)

            if self.cancellation.was_cancelled:
                if not self.cancellation.cancel_requested:
                    await ctx.ai_service.cancel_active_stream()
                await self._update_message_status(
                    ctx.assistant_message_id,
                    MessageStreamStatus.INTERRUPTED,
                    ctx.session_factory,
                )
                outcome = await self._finalize_stream(
                    ctx, MessageStreamStatus.INTERRUPTED
                )
                raise StreamCancelled(outcome.final_content)

            if not ctx.events:
                raise ClaudeAgentException("Stream completed without any events")

            return await self._finalize_stream(ctx, MessageStreamStatus.COMPLETED)

        except StreamCancelled:
            raise
        except Exception as exc:
            logger.error("Error in stream processing: %s", exc)

            await self.publisher.publish_error(str(exc))
            await self._update_message_status(
                ctx.assistant_message_id,
                MessageStreamStatus.FAILED,
                ctx.session_factory,
            )

            if ctx.assistant_message_id and ctx.events:
                await self._save_message_content(
                    ctx.assistant_message_id,
                    ctx.events,
                    ctx.ai_service.get_total_cost_usd(),
                    MessageStreamStatus.FAILED,
                    ctx.session_factory,
                )

            raise

    async def _process_stream_events(self, ctx: StreamContext) -> None:
        stream_iter = ctx.stream.__aiter__()
        current_task = asyncio.current_task()
        revocation_task = self.cancellation.create_monitor_task(
            current_task, ctx.ai_service
        )

        queue_injector: QueueInjector | None = None

        try:
            while True:
                try:
                    event = await stream_iter.__anext__()
                except StopAsyncIteration:
                    break
                except asyncio.CancelledError:
                    if self.cancellation.was_cancelled:
                        await self.cancellation.cancel_stream(ctx.ai_service)
                        break
                    raise

                ctx.events.append(deepcopy(event))
                await self.publisher.publish_event(event)

                if QueueInjector.should_try_injection(event):
                    if queue_injector is None:
                        queue_injector = self._create_queue_injector(ctx)

                    if queue_injector:
                        try:
                            new_assistant_id = await queue_injector.check_and_inject()
                            if new_assistant_id:
                                if ctx.assistant_message_id and ctx.events:
                                    await self._save_message_content(
                                        ctx.assistant_message_id,
                                        ctx.events,
                                        ctx.ai_service.get_total_cost_usd(),
                                        MessageStreamStatus.COMPLETED,
                                        ctx.session_factory,
                                    )
                                await self.publisher.clear_stream()
                                ctx.assistant_message_id = new_assistant_id
                                ctx.events.clear()
                        except Exception as e:
                            logger.warning("Queue injection failed: %s", e)

                ctx.task.update_state(
                    state="PROGRESS",
                    meta={"status": "Processing", "events_emitted": len(ctx.events)},
                )
        finally:
            if revocation_task:
                revocation_task.cancel()
                with suppress(asyncio.CancelledError):
                    await revocation_task

    def _create_queue_injector(self, ctx: StreamContext) -> QueueInjector | None:
        transport = ctx.ai_service.get_active_transport()
        if not transport:
            return None

        return QueueInjector(
            chat_id=ctx.chat_id,
            transport=transport,
            publisher=self.publisher,
            session_factory=ctx.session_factory,
            session_id=ctx.chat.session_id,
        )

    async def _finalize_stream(
        self, ctx: StreamContext, status: MessageStreamStatus
    ) -> StreamOutcome:
        total_cost = ctx.ai_service.get_total_cost_usd()
        final_content = json.dumps(ctx.events, ensure_ascii=False)

        if ctx.assistant_message_id and ctx.events:
            await self._save_message_content(
                ctx.assistant_message_id,
                ctx.events,
                total_cost,
                status,
                ctx.session_factory,
            )

        if status == MessageStreamStatus.COMPLETED:
            await self._create_checkpoint_if_needed(
                ctx.sandbox_service,
                ctx.chat,
                ctx.assistant_message_id,
                ctx.session_factory,
            )
            queue_processed = await self._process_queue_if_available(ctx)
            if not queue_processed:
                await self.publisher.publish_complete()
        else:
            await self.publisher.publish_complete()

        return StreamOutcome(
            events=ctx.events,
            final_content=final_content,
            total_cost=total_cost,
        )

    async def _update_message_status(
        self,
        assistant_message_id: str | None,
        stream_status: MessageStreamStatus,
        session_factory: Any,
    ) -> None:
        if not assistant_message_id:
            return

        try:
            async with session_factory() as db:
                message_uuid = UUID(assistant_message_id)
                query = select(Message).filter(Message.id == message_uuid)
                result = await db.execute(query)
                message = result.scalar_one_or_none()

                if message:
                    message.stream_status = stream_status
                    db.add(message)
                    await db.commit()
        except Exception as exc:
            logger.error("Failed to update message status: %s", exc)

    async def _save_message_content(
        self,
        assistant_message_id: str,
        events: list[StreamEvent],
        total_cost_usd: float,
        stream_status: MessageStreamStatus,
        session_factory: Any,
    ) -> None:
        if not assistant_message_id or not events:
            return

        try:
            async with session_factory() as db:
                message_uuid = UUID(assistant_message_id)
                query = select(Message).filter(Message.id == message_uuid)
                result = await db.execute(query)
                message = result.scalar_one_or_none()

                if message:
                    message.content = json.dumps(events, ensure_ascii=False)
                    message.total_cost_usd = total_cost_usd
                    message.stream_status = stream_status
                    db.add(message)
                    await db.commit()
        except Exception as exc:
            logger.error("Failed to save message content: %s", exc)

    async def _create_checkpoint_if_needed(
        self,
        sandbox_service: SandboxService | None,
        chat: Chat,
        assistant_message_id: str | None,
        session_factory: Any,
    ) -> None:
        if not (sandbox_service and chat.sandbox_id and assistant_message_id):
            return

        try:
            checkpoint_id = await sandbox_service.create_checkpoint(
                chat.sandbox_id, assistant_message_id
            )
            if not checkpoint_id:
                return

            async with session_factory() as db:
                message_uuid = UUID(assistant_message_id)
                query = select(Message).filter(Message.id == message_uuid)
                result = await db.execute(query)
                message = result.scalar_one_or_none()
                if message:
                    message.checkpoint_id = checkpoint_id
                    db.add(message)
                    await db.commit()
        except Exception as exc:
            logger.warning("Failed to create checkpoint: %s", exc)

    async def _process_queue_if_available(self, ctx: StreamContext) -> bool:
        """Check for queued messages and process the next one if available."""
        try:
            next_msg = await self._pop_next_queued_message(ctx.chat_id)
            if not next_msg:
                return False

            messages = await self._create_queue_messages(ctx, next_msg)
            if not messages:
                return False

            user_message, assistant_message = messages

            await self._publish_queue_processing_event(
                next_msg, user_message, assistant_message
            )

            await self._spawn_queue_continuation_task(ctx, next_msg, assistant_message)

            logger.info(
                "Queued message %s for chat %s has been processed",
                next_msg["id"],
                ctx.chat_id,
            )
            return True

        except Exception as exc:
            logger.error("Failed to process queued message: %s", exc)
            return False

    async def _pop_next_queued_message(self, chat_id: str) -> dict[str, Any] | None:
        """Pop the next message from the queue if available."""
        async with redis_connection() as redis:
            queue_service = QueueService(redis)
            if not await queue_service.has_messages(chat_id):
                return None
            return await queue_service.pop_next_message(chat_id)

    async def _create_queue_messages(
        self,
        ctx: StreamContext,
        next_msg: dict[str, Any],
    ) -> tuple[Message, Message] | None:
        """Create user and assistant message records for the queued message."""
        message_service = MessageService(session_factory=ctx.session_factory)

        attachments = next_msg.get("attachments")

        user_message = await message_service.create_message(
            UUID(ctx.chat_id),
            next_msg["content"],
            MessageRole.USER,
            attachments=attachments,
        )

        assistant_message = await message_service.create_message(
            UUID(ctx.chat_id),
            "",
            MessageRole.ASSISTANT,
            model_id=next_msg["model_id"],
            stream_status=MessageStreamStatus.IN_PROGRESS,
        )

        return user_message, assistant_message

    async def _publish_queue_processing_event(
        self,
        next_msg: dict[str, Any],
        user_message: Message,
        assistant_message: Message,
    ) -> None:
        await self.publisher.publish_queue_event(
            queued_message_id=next_msg["id"],
            user_message_id=str(user_message.id),
            assistant_message_id=str(assistant_message.id),
            content=next_msg["content"],
            model_id=next_msg["model_id"],
            attachments=serialize_message_attachments(next_msg, user_message),
        )

    async def _spawn_queue_continuation_task(
        self,
        ctx: StreamContext,
        next_msg: dict[str, Any],
        assistant_message: Message,
    ) -> None:
        """Spawn Celery task to process the queued message."""
        from app.tasks.chat_processor import process_chat

        user_service = UserService(session_factory=ctx.session_factory)
        user_settings = await user_service.get_user_settings(ctx.chat.user_id, db=None)

        system_prompt = build_system_prompt_for_chat(
            ctx.chat.sandbox_id or "",
            user_settings,
        )

        process_chat.delay(
            prompt=next_msg["content"],
            system_prompt=system_prompt,
            custom_instructions=user_settings.custom_instructions
            if user_settings
            else None,
            chat_data={
                "id": ctx.chat_id,
                "user_id": str(ctx.chat.user_id),
                "title": ctx.chat.title,
                "sandbox_id": ctx.chat.sandbox_id,
                "session_id": ctx.chat.session_id,
                "sandbox_provider": ctx.chat.sandbox_provider,
            },
            permission_mode=next_msg.get("permission_mode", "auto"),
            model_id=next_msg["model_id"],
            session_id=ctx.chat.session_id,
            assistant_message_id=str(assistant_message.id),
            thinking_mode=next_msg.get("thinking_mode"),
            attachments=next_msg.get("attachments"),
            is_custom_prompt=False,
            is_queue_continuation=True,
        )


@asynccontextmanager
async def _get_session_factory(
    session_factory: SessionFactoryType | None,
) -> AsyncIterator[SessionFactoryType]:
    if session_factory is not None:
        yield session_factory
    else:
        async with get_celery_session() as (session_local, _):
            yield session_local


async def run_chat_stream(
    task: Task[Any, Any],
    prompt: str,
    system_prompt: str,
    custom_instructions: str | None,
    chat_data: dict[str, Any],
    model_id: str,
    sandbox_service: SandboxService,
    context_usage_trigger: Callable[..., Any] | None = None,
    permission_mode: str = "auto",
    session_id: str | None = None,
    assistant_message_id: str | None = None,
    thinking_mode: str | None = None,
    attachments: list[dict[str, Any]] | None = None,
    is_custom_prompt: bool = False,
    session_factory: SessionFactoryType | None = None,
    is_queue_continuation: bool = False,
) -> str:
    from app.services.claude_agent import ClaudeAgentService

    chat = hydrate_chat(chat_data)

    chat_id = str(chat.id)
    session_container: dict[str, Any] = {"session_id": session_id}
    events: list[StreamEvent] = []

    publisher = StreamPublisher(chat_id)
    result: str = ""

    try:
        await publisher.connect(task, skip_stream_delete=is_queue_continuation)

        async with _get_session_factory(session_factory) as session_local:
            cancellation = CancellationHandler(chat_id, publisher.redis)
            orchestrator = StreamOrchestrator(publisher, cancellation)

            task.update_state(
                state="PROGRESS", meta={"status": "Starting AI processing"}
            )

            async with ClaudeAgentService(session_factory=session_local) as ai_service:
                session_callback = SessionUpdateCallback(
                    chat_id=chat_id,
                    assistant_message_id=assistant_message_id,
                    session_factory=session_local,
                    session_container=session_container,
                    sandbox_id=str(chat.sandbox_id) if chat.sandbox_id else "",
                    sandbox_provider=chat.sandbox_provider or "docker",
                    user_id=str(chat.user_id),
                    model_id=model_id,
                    context_usage_trigger=context_usage_trigger,
                )

                user = User(id=chat.user_id)

                stream = ai_service.get_ai_stream(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    custom_instructions=custom_instructions,
                    user=user,
                    chat=chat,
                    permission_mode=permission_mode,
                    model_id=model_id,
                    session_id=session_id,
                    session_callback=session_callback,
                    thinking_mode=thinking_mode,
                    attachments=attachments,
                    is_custom_prompt=is_custom_prompt,
                )

                sandbox_id_str = str(chat.sandbox_id) if chat.sandbox_id else ""
                if session_id and sandbox_id_str and context_usage_trigger:
                    context_usage_trigger(
                        chat_id=chat_id,
                        session_id=session_id,
                        sandbox_id=sandbox_id_str,
                        sandbox_provider=chat.sandbox_provider or "docker",
                        user_id=str(chat.user_id),
                        model_id=model_id,
                    )

                ctx = StreamContext(
                    chat_id=chat_id,
                    stream=stream,
                    task=task,
                    ai_service=ai_service,
                    assistant_message_id=assistant_message_id,
                    sandbox_service=sandbox_service,
                    chat=chat,
                    session_factory=session_local,
                    events=events,
                )

                try:
                    outcome = await orchestrator.process_stream(ctx)
                except StreamCancelled:
                    raise Ignore()

                task.update_state(
                    state="SUCCESS",
                    meta={
                        "status": "Completed",
                        "content": outcome.final_content,
                        "session_id": session_container["session_id"],
                    },
                )

                result = outcome.final_content
    finally:
        await publisher.cleanup()

    return result


async def initialize_and_run_chat(
    task: Task[Any, Any],
    prompt: str,
    system_prompt: str,
    custom_instructions: str | None,
    chat_data: dict[str, Any],
    model_id: str,
    permission_mode: str,
    session_id: str | None,
    assistant_message_id: str | None,
    thinking_mode: str | None,
    attachments: list[dict[str, Any]] | None,
    context_usage_trigger: Callable[..., Any] | None = None,
    is_custom_prompt: bool = False,
    is_queue_continuation: bool = False,
) -> str:
    async with get_celery_session() as (SessionFactory, _):
        async with SessionFactory() as db:
            user_id = UUID(chat_data["user_id"])
            user_service = UserService(session_factory=SessionFactory)

            try:
                user_settings = await user_service.get_user_settings(user_id, db=db)
            except UserException:
                raise UserException("User settings not found")

            provider_type = (
                chat_data.get("sandbox_provider") or user_settings.sandbox_provider
            )
            provider = create_sandbox_provider(
                provider_type=provider_type,
                api_key=user_settings.e2b_api_key,
            )

        sandbox_service = SandboxService(
            provider=provider, session_factory=SessionFactory
        )
        try:
            return await run_chat_stream(
                task,
                prompt=prompt,
                system_prompt=system_prompt,
                custom_instructions=custom_instructions,
                chat_data=chat_data,
                model_id=model_id,
                sandbox_service=sandbox_service,
                context_usage_trigger=context_usage_trigger,
                permission_mode=permission_mode,
                session_id=session_id,
                assistant_message_id=assistant_message_id,
                thinking_mode=thinking_mode,
                attachments=attachments,
                is_custom_prompt=is_custom_prompt,
                is_queue_continuation=is_queue_continuation,
            )
        finally:
            await sandbox_service.cleanup()
