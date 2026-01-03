from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.models.db_models import (
    Chat,
    Message,
    ScheduledTask,
    TaskExecution,
    TaskExecutionStatus,
    User,
)
from app.services.scheduler.execution import (
    check_duplicate_execution,
    complete_task_execution,
    load_task_and_user,
    update_task_after_execution,
)
from app.services.scheduler.sandbox import (
    create_and_initialize_sandbox,
    setup_execution_chat_context,
    validate_user_api_keys,
)

if TYPE_CHECKING:
    from app.services.sandbox import SandboxService

logger = logging.getLogger(__name__)


async def execute_task_in_sandbox(
    task: Any,
    scheduled_task: ScheduledTask,
    user: User,
    chat: Chat,
    assistant_message: Message,
    user_settings: Any,
    model_id: str,
    sandbox_service: SandboxService,
) -> None:
    from app.prompts.system_prompt import build_system_prompt_for_chat
    from app.services.streaming.orchestrator import run_chat_stream

    chat_data = {
        "id": str(chat.id),
        "user_id": str(user.id),
        "title": chat.title,
        "sandbox_id": chat.sandbox_id,
        "session_id": None,
        "sandbox_provider": chat.sandbox_provider,
    }

    system_prompt = build_system_prompt_for_chat(chat.sandbox_id, user_settings)
    custom_instructions = user_settings.custom_instructions

    await run_chat_stream(
        task,
        prompt=scheduled_task.prompt_message,
        system_prompt=system_prompt,
        custom_instructions=custom_instructions,
        chat_data=chat_data,
        model_id=model_id,
        sandbox_service=sandbox_service,
        permission_mode="auto",
        session_id=None,
        assistant_message_id=str(assistant_message.id),
        thinking_mode="ultra",
        attachments=None,
    )


async def execute_scheduled_task_async(
    task: Any,
    task_id: str,
    session_factory: Any,
) -> dict[str, Any]:
    start_time = datetime.now(timezone.utc)
    execution_id: UUID | None = None
    sandbox_service: SandboxService | None = None
    task_uuid: UUID | None = None

    try:
        async with session_factory() as db:
            task_uuid = UUID(task_id)

            if await check_duplicate_execution(db, task_uuid, start_time):
                return {"status": "skipped", "reason": "already_executing"}

            scheduled_task, user = await load_task_and_user(db, task_uuid)

            if not scheduled_task:
                logger.error("Scheduled task %s not found", task_id)
                return {"error": "Task not found"}

            if not user:
                logger.error(
                    "User %s not found for task %s", scheduled_task.user_id, task_id
                )
                return {"error": "User not found"}

            if not scheduled_task.enabled:
                return {"status": "skipped", "reason": "disabled"}

            model_id = scheduled_task.model_id or "claude-sonnet-4-5"

            user_settings, error = await validate_user_api_keys(
                db,
                user,
                scheduled_task,
                task_uuid,
                start_time,
                model_id,
                session_factory,
            )
            if error:
                return error

            execution = TaskExecution(
                task_id=scheduled_task.id,
                executed_at=start_time,
                status=TaskExecutionStatus.RUNNING,
            )
            db.add(execution)
            await db.commit()
            await db.refresh(execution)
            execution_id = execution.id

        sandbox_service, sandbox_id = await create_and_initialize_sandbox(
            user_settings, user, session_factory
        )

        try:
            (
                chat,
                _,
                assistant_message,
            ) = await setup_execution_chat_context(
                session_factory, scheduled_task, user, sandbox_id, execution_id
            )

            try:
                await execute_task_in_sandbox(
                    task,
                    scheduled_task,
                    user,
                    chat,
                    assistant_message,
                    user_settings,
                    model_id,
                    sandbox_service,
                )

                async with session_factory() as db:
                    await complete_task_execution(
                        db, execution_id, TaskExecutionStatus.SUCCESS
                    )
                    await update_task_after_execution(
                        db, task_uuid, start_time, success=True
                    )
                    await db.commit()

                return {
                    "status": "success",
                    "task_id": task_id,
                    "chat_id": str(chat.id),
                    "execution_id": str(execution_id),
                }

            except Exception as e:
                logger.error("Error executing scheduled task %s: %s", task_id, e)

                async with session_factory() as db:
                    if execution_id:
                        await complete_task_execution(
                            db,
                            execution_id,
                            TaskExecutionStatus.FAILED,
                            error_message=str(e),
                        )
                    await update_task_after_execution(
                        db,
                        task_uuid,
                        start_time,
                        success=False,
                        error_message=str(e),
                    )
                    await db.commit()

                return {"error": str(e)}

        finally:
            await sandbox_service.delete_sandbox(sandbox_id)
            await sandbox_service.cleanup()

    except Exception as e:
        logger.error("Fatal error in execute_scheduled_task: %s", e)
        return {"error": str(e)}


async def cleanup_expired_tokens_async(session_factory: Any) -> dict[str, Any]:
    from app.services.refresh_token import RefreshTokenService

    try:
        refresh_token_service = RefreshTokenService(session_factory=session_factory)
        deleted_count = await refresh_token_service.cleanup_expired_tokens()
        logger.info("Cleaned up %s expired refresh tokens", deleted_count)
        return {"deleted_count": deleted_count}
    except Exception as e:
        logger.error("Error cleaning up expired refresh tokens: %s", e)
        return {"error": str(e)}
