import asyncio
from typing import Any

from app.core.celery import celery_app
from app.db.session import get_celery_session
from app.services.scheduler import (
    check_due_tasks,
    cleanup_expired_tokens_async,
    execute_scheduled_task_async,
)


@celery_app.task(name="check_scheduled_tasks")
def check_scheduled_tasks() -> dict[str, Any]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(_check_scheduled_tasks_wrapper())
    finally:
        loop.close()


async def _check_scheduled_tasks_wrapper() -> dict[str, Any]:
    async with get_celery_session() as (session_factory, _):
        return await check_due_tasks(
            session_factory=session_factory,
            execute_task_trigger=execute_scheduled_task.delay,
        )


@celery_app.task(bind=True, name="execute_scheduled_task")
def execute_scheduled_task(self: Any, task_id: str) -> dict[str, Any]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(_execute_scheduled_task_wrapper(self, task_id))
    finally:
        loop.close()


async def _execute_scheduled_task_wrapper(task: Any, task_id: str) -> dict[str, Any]:
    async with get_celery_session() as (session_factory, _):
        return await execute_scheduled_task_async(
            task=task,
            task_id=task_id,
            session_factory=session_factory,
        )


@celery_app.task(name="cleanup_expired_refresh_tokens")
def cleanup_expired_refresh_tokens() -> dict[str, Any]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(_cleanup_tokens_wrapper())
    finally:
        loop.close()


async def _cleanup_tokens_wrapper() -> dict[str, Any]:
    async with get_celery_session() as (session_factory, _):
        return await cleanup_expired_tokens_async(session_factory=session_factory)
