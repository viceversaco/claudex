from __future__ import annotations

import math
from typing import cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import (
    ScheduledTask,
    TaskExecution,
    TaskStatus,
)
from app.models.schemas import (
    PaginatedTaskExecutions,
    PaginationParams,
    ScheduledTaskBase,
    ScheduledTaskUpdate,
    TaskExecutionResponse,
    TaskToggleResponse,
)
from app.services.base import BaseDbService, SessionFactoryType
from app.services.exceptions import SchedulerException
from app.services.scheduler.recurrence import (
    calculate_initial_next_execution,
    validate_recurrence_constraints,
)

MAX_TASKS_PER_USER = 10


class SchedulerService(BaseDbService[ScheduledTask]):
    def __init__(self, session_factory: SessionFactoryType | None = None) -> None:
        super().__init__(session_factory)

    async def _validate_task_limit(
        self,
        user_id: UUID,
        db: AsyncSession,
        exclude_task_id: UUID | None = None,
    ) -> bool:
        query = select(func.count(ScheduledTask.id)).where(
            ScheduledTask.user_id == user_id,
            ScheduledTask.enabled,
            ScheduledTask.status.in_([TaskStatus.ACTIVE, TaskStatus.PENDING]),
        )

        if exclude_task_id:
            query = query.where(ScheduledTask.id != exclude_task_id)

        result = await db.execute(query)
        count = result.scalar() or 0

        return count < MAX_TASKS_PER_USER

    async def _get_user_task(
        self, task_id: UUID, user_id: UUID, db: AsyncSession
    ) -> ScheduledTask | None:
        query = select(ScheduledTask).where(
            ScheduledTask.id == task_id,
            ScheduledTask.user_id == user_id,
        )
        result = await db.execute(query)
        return cast(ScheduledTask | None, result.scalar_one_or_none())

    async def _enable_task(
        self,
        task: ScheduledTask,
        user_id: UUID,
        db: AsyncSession,
        recurrence_changed: bool = False,
        time_changed: bool = False,
        day_changed: bool = False,
        skip_validation: bool = False,
    ) -> None:
        if not skip_validation:
            validate_recurrence_constraints(task.recurrence_type, task.scheduled_day)

            can_enable = await self._validate_task_limit(
                user_id, db, exclude_task_id=task.id
            )
            if not can_enable:
                raise SchedulerException(
                    "Maximum number of active tasks (10) reached. "
                    "Please disable another task first."
                )

        task.enabled = True
        task.status = TaskStatus.ACTIVE
        task.last_error = None

        if (
            task.next_execution is None
            or recurrence_changed
            or time_changed
            or day_changed
        ):
            task.next_execution = calculate_initial_next_execution(
                task.recurrence_type,
                task.scheduled_time,
                task.scheduled_day,
            )

    async def create_task(
        self, user_id: UUID, task_data: ScheduledTaskBase, db: AsyncSession
    ) -> ScheduledTask:
        can_create = await self._validate_task_limit(user_id, db)
        if not can_create:
            raise SchedulerException(
                "Maximum number of active tasks (10) reached. "
                "Please delete or disable an existing task."
            )

        validate_recurrence_constraints(
            task_data.recurrence_type, task_data.scheduled_day
        )

        next_execution = calculate_initial_next_execution(
            task_data.recurrence_type,
            task_data.scheduled_time,
            task_data.scheduled_day,
        )

        task = ScheduledTask(
            user_id=user_id,
            task_name=task_data.task_name,
            prompt_message=task_data.prompt_message,
            recurrence_type=task_data.recurrence_type,
            scheduled_time=task_data.scheduled_time,
            scheduled_day=task_data.scheduled_day,
            next_execution=next_execution,
            model_id=task_data.model_id,
            permission_mode="auto",
            thinking_mode="ultra",
            status=TaskStatus.ACTIVE,
            enabled=True,
        )

        db.add(task)
        await db.commit()
        await db.refresh(task)

        return task

    async def get_tasks(self, user_id: UUID, db: AsyncSession) -> list[ScheduledTask]:
        query = (
            select(ScheduledTask)
            .where(ScheduledTask.user_id == user_id)
            .order_by(ScheduledTask.next_execution.asc().nulls_last())
        )

        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_task(
        self, task_id: UUID, user_id: UUID, db: AsyncSession
    ) -> ScheduledTask:
        task = await self._get_user_task(task_id, user_id, db)
        if not task:
            raise SchedulerException("Scheduled task not found")
        return task

    async def update_task(
        self,
        task_id: UUID,
        user_id: UUID,
        task_update: ScheduledTaskUpdate,
        db: AsyncSession,
    ) -> ScheduledTask:
        task = await self._get_user_task(task_id, user_id, db)
        if not task:
            raise SchedulerException("Scheduled task not found")

        update_data = task_update.model_dump(exclude_unset=True)

        recurrence_changed = False
        time_changed = False
        day_changed = False

        enabled_sentinel = object()
        enabled_value = update_data.pop("enabled", enabled_sentinel)

        for field, value in update_data.items():
            if field == "recurrence_type":
                recurrence_changed = True
            elif field == "scheduled_time":
                time_changed = True
            elif field == "scheduled_day":
                day_changed = True

            setattr(task, field, value)

        if recurrence_changed or time_changed or day_changed:
            validate_recurrence_constraints(task.recurrence_type, task.scheduled_day)
            task.next_execution = calculate_initial_next_execution(
                task.recurrence_type,
                task.scheduled_time,
                task.scheduled_day,
            )

        if enabled_value is not enabled_sentinel:
            if not isinstance(enabled_value, bool):
                raise SchedulerException("enabled must be a boolean value")

            if enabled_value:
                await self._enable_task(
                    task,
                    user_id,
                    db,
                    recurrence_changed=recurrence_changed,
                    time_changed=time_changed,
                    day_changed=day_changed,
                    skip_validation=task.enabled,
                )
            else:
                task.enabled = False
                task.status = TaskStatus.PAUSED

        db.add(task)
        await db.commit()
        await db.refresh(task)

        return task

    async def delete_task(self, task_id: UUID, user_id: UUID, db: AsyncSession) -> None:
        task = await self._get_user_task(task_id, user_id, db)
        if not task:
            raise SchedulerException("Scheduled task not found")

        await db.delete(task)
        await db.commit()

    async def toggle_task(
        self, task_id: UUID, user_id: UUID, db: AsyncSession
    ) -> TaskToggleResponse:
        task = await self._get_user_task(task_id, user_id, db)
        if not task:
            raise SchedulerException("Scheduled task not found")

        was_enabled = task.enabled

        if not was_enabled:
            await self._enable_task(
                task,
                user_id,
                db,
                recurrence_changed=True,
                time_changed=True,
                day_changed=True,
            )
        else:
            task.enabled = False
            task.status = TaskStatus.PAUSED

        db.add(task)
        await db.commit()
        await db.refresh(task)

        return TaskToggleResponse(
            id=task.id,
            enabled=task.enabled,
            message=f"Task {'enabled' if task.enabled else 'disabled'} successfully",
        )

    async def get_execution_history(
        self,
        task_id: UUID,
        user_id: UUID,
        pagination: PaginationParams,
        db: AsyncSession,
    ) -> PaginatedTaskExecutions:
        task = await self._get_user_task(task_id, user_id, db)
        if not task:
            raise SchedulerException("Scheduled task not found")

        count_query = select(func.count(TaskExecution.id)).where(
            TaskExecution.task_id == task_id
        )
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0

        offset = (pagination.page - 1) * pagination.per_page
        query = (
            select(TaskExecution)
            .where(TaskExecution.task_id == task_id)
            .order_by(TaskExecution.executed_at.desc())
            .offset(offset)
            .limit(pagination.per_page)
        )

        result = await db.execute(query)
        executions = result.scalars().all()

        return PaginatedTaskExecutions(
            items=[TaskExecutionResponse.model_validate(e) for e in executions],
            page=pagination.page,
            per_page=pagination.per_page,
            total=total,
            pages=math.ceil(total / pagination.per_page) if total > 0 else 0,
        )
