from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_celery_session
from app.models.db_models import (
    ScheduledTask,
    TaskExecution,
    TaskExecutionStatus,
    TaskStatus,
    User,
)
from app.services.scheduler.recurrence import calculate_next_execution

logger = logging.getLogger(__name__)


async def check_duplicate_execution(
    db: AsyncSession, task_uuid: uuid.UUID, start_time: datetime
) -> bool:
    existing_exec = await db.execute(
        select(TaskExecution).where(
            TaskExecution.task_id == task_uuid,
            TaskExecution.executed_at >= start_time - timedelta(minutes=2),
            TaskExecution.status.in_(
                [TaskExecutionStatus.RUNNING, TaskExecutionStatus.SUCCESS]
            ),
        )
    )
    return existing_exec.scalar_one_or_none() is not None


async def load_task_and_user(
    db: AsyncSession, task_uuid: uuid.UUID
) -> tuple[ScheduledTask | None, User | None]:
    query = select(ScheduledTask).where(ScheduledTask.id == task_uuid)
    result = await db.execute(query)
    scheduled_task = result.scalar_one_or_none()

    if not scheduled_task:
        return None, None

    user_query = select(User).where(User.id == scheduled_task.user_id)
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()

    return scheduled_task, user


async def complete_task_execution(
    db: AsyncSession,
    execution_id: uuid.UUID,
    status: TaskExecutionStatus,
    error_message: str | None = None,
) -> None:
    exec_query = select(TaskExecution).where(TaskExecution.id == execution_id)
    exec_result = await db.execute(exec_query)
    execution = exec_result.scalar_one_or_none()

    if execution:
        execution.status = status
        execution.completed_at = datetime.now(timezone.utc)
        execution.duration_ms = int(
            (execution.completed_at - execution.executed_at).total_seconds() * 1000
        )
        if error_message:
            execution.error_message = error_message
        db.add(execution)


async def update_task_after_execution(
    db: AsyncSession,
    task_uuid: uuid.UUID,
    start_time: datetime,
    success: bool,
    error_message: str | None = None,
) -> None:
    task_query = select(ScheduledTask).where(ScheduledTask.id == task_uuid)
    task_result = await db.execute(task_query)
    scheduled_task = task_result.scalar_one_or_none()

    if not scheduled_task:
        return

    if success:
        scheduled_task.execution_count += 1
        scheduled_task.last_execution = start_time
        scheduled_task.last_error = None
    else:
        scheduled_task.failure_count += 1
        scheduled_task.last_error = error_message

    next_exec = calculate_next_execution(scheduled_task, from_time=start_time)

    if next_exec is None:
        scheduled_task.enabled = False
        scheduled_task.status = TaskStatus.COMPLETED
        scheduled_task.next_execution = None
    else:
        scheduled_task.next_execution = next_exec

    db.add(scheduled_task)


async def check_due_tasks(
    execute_task_trigger: Callable[[str], Any],
) -> dict[str, Any]:
    async with get_celery_session() as (session_factory, _):
        try:
            async with session_factory() as db:
                now = datetime.now(timezone.utc)

                query = (
                    select(ScheduledTask)
                    .where(
                        ScheduledTask.enabled,
                        ScheduledTask.status == TaskStatus.ACTIVE,
                        ScheduledTask.next_execution <= now,
                        ScheduledTask.next_execution.isnot(None),
                    )
                    .order_by(ScheduledTask.next_execution)
                    .limit(100)
                )

                result = await db.execute(query)
                tasks = result.scalars().all()

                for task in tasks:
                    next_exec = calculate_next_execution(task, from_time=now)

                    if next_exec is None:
                        task.next_execution = None
                        task.status = TaskStatus.PENDING
                    else:
                        task.next_execution = next_exec

                    db.add(task)

                await db.commit()

                for task in tasks:
                    execute_task_trigger(str(task.id))

                return {"tasks_triggered": len(tasks)}

        except Exception as e:
            logger.error("Error checking scheduled tasks: %s", e)
            return {"error": str(e)}
