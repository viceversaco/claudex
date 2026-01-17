import asyncio
from typing import Any

from app.core.celery import celery_app
from app.services.scheduler import (
    check_due_tasks,
    cleanup_expired_tokens,
    run_scheduled_task,
)


@celery_app.task(name="check_scheduled_tasks")
def check_scheduled_tasks() -> dict[str, Any]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            check_due_tasks(execute_task_trigger=execute_scheduled_task.delay)
        )
    finally:
        loop.close()


@celery_app.task(bind=True, name="execute_scheduled_task")
def execute_scheduled_task(self: Any, task_id: str) -> dict[str, Any]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(run_scheduled_task(task=self, task_id=task_id))
    finally:
        loop.close()


@celery_app.task(name="cleanup_expired_refresh_tokens")
def cleanup_expired_refresh_tokens() -> dict[str, Any]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(cleanup_expired_tokens())
    finally:
        loop.close()
