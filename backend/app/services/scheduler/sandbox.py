from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.db_models import (
    Chat,
    Message,
    MessageRole,
    MessageStreamStatus,
    ScheduledTask,
    TaskExecution,
    TaskExecutionStatus,
    User,
    UserSettings,
)
from app.services.scheduler.execution import update_task_after_execution
from app.services.user import UserService
from app.services.sandbox import SandboxService
from app.services.sandbox_providers import (
    SandboxProviderType,
    create_sandbox_provider,
)
from app.utils.validators import APIKeyValidationError, validate_model_api_keys

logger = logging.getLogger(__name__)
settings = get_settings()


async def create_task_chat_and_messages(
    db: AsyncSession,
    scheduled_task: ScheduledTask,
    user: User,
    sandbox_id: str,
) -> tuple[Chat, Message, Message]:
    chat = Chat(
        title=scheduled_task.task_name,
        user_id=user.id,
        sandbox_id=sandbox_id,
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)

    user_message = Message(
        chat_id=chat.id,
        content=scheduled_task.prompt_message,
        role=MessageRole.USER,
    )
    db.add(user_message)
    await db.commit()
    await db.refresh(user_message)

    assistant_message = Message(
        chat_id=chat.id,
        content="",
        role=MessageRole.ASSISTANT,
        model_id=scheduled_task.model_id,
        stream_status=MessageStreamStatus.IN_PROGRESS,
    )
    db.add(assistant_message)
    await db.commit()
    await db.refresh(assistant_message)

    return chat, user_message, assistant_message


async def validate_user_api_keys(
    db: AsyncSession,
    user: User,
    scheduled_task: ScheduledTask,
    task_uuid: UUID,
    start_time: datetime,
    model_id: str,
    session_factory: Any,
) -> tuple[Any, dict[str, Any] | None]:
    user_service = UserService()

    try:
        user_settings = await user_service.get_user_settings(user.id, db=db)
        validate_model_api_keys(user_settings, model_id)
        return user_settings, None
    except (ValueError, APIKeyValidationError) as e:
        logger.error("API keys not configured for user %s: %s", user.id, e)
        execution = TaskExecution(
            task_id=scheduled_task.id,
            executed_at=start_time,
            completed_at=datetime.now(timezone.utc),
            status=TaskExecutionStatus.FAILED,
            error_message=str(e),
        )
        db.add(execution)
        await update_task_after_execution(
            db, task_uuid, start_time, success=False, error_message=str(e)
        )
        await db.commit()
        return None, {"error": str(e)}


async def create_and_initialize_sandbox(
    user_settings: UserSettings,
    user: User,
    session_factory: Any,
) -> tuple[SandboxService, str]:
    api_key = None
    if user_settings.sandbox_provider == SandboxProviderType.E2B.value:
        api_key = user_settings.e2b_api_key
    elif user_settings.sandbox_provider == SandboxProviderType.MODAL.value:
        api_key = user_settings.modal_api_key
    provider = create_sandbox_provider(
        provider_type=user_settings.sandbox_provider,
        api_key=api_key,
    )
    sandbox_service = SandboxService(provider, session_factory=session_factory)
    sandbox_id = await sandbox_service.create_sandbox()

    await sandbox_service.initialize_sandbox(
        sandbox_id=sandbox_id,
        github_token=user_settings.github_personal_access_token,
        custom_env_vars=user_settings.custom_env_vars,
        custom_skills=user_settings.custom_skills,
        custom_slash_commands=user_settings.custom_slash_commands,
        custom_agents=user_settings.custom_agents,
        user_id=str(user.id),
        auto_compact_disabled=user_settings.auto_compact_disabled,
        attribution_disabled=user_settings.attribution_disabled,
        custom_providers=user_settings.custom_providers,
    )

    return sandbox_service, sandbox_id


async def setup_execution_chat_context(
    session_factory: Any,
    scheduled_task: ScheduledTask,
    user: User,
    sandbox_id: str,
    execution_id: UUID,
) -> tuple[Chat, Message, Message]:
    async with session_factory() as db:
        chat, user_message, assistant_message = await create_task_chat_and_messages(
            db, scheduled_task, user, sandbox_id
        )
        chat_id = chat.id
        message_id = user_message.id

    async with session_factory() as db:
        exec_query = select(TaskExecution).where(TaskExecution.id == execution_id)
        exec_result = await db.execute(exec_query)
        execution = exec_result.scalar_one_or_none()
        if execution:
            execution.chat_id = chat_id
            execution.message_id = message_id
            db.add(execution)
            await db.commit()

    return chat, user_message, assistant_message
