import asyncio
from typing import Any

from app.core.celery import celery_app
from app.services.streaming import ContextUsageTracker, initialize_and_run_chat


@celery_app.task(bind=True)
def process_chat(
    self: Any,
    prompt: str,
    system_prompt: str,
    custom_instructions: str | None,
    chat_data: dict[str, Any],
    model_id: str,
    permission_mode: str = "auto",
    session_id: str | None = None,
    assistant_message_id: str | None = None,
    thinking_mode: str | None = None,
    attachments: list[dict[str, Any]] | None = None,
    is_custom_prompt: bool = False,
    is_queue_continuation: bool = False,
) -> str:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(
            initialize_and_run_chat(
                task=self,
                prompt=prompt,
                system_prompt=system_prompt,
                custom_instructions=custom_instructions,
                chat_data=chat_data,
                model_id=model_id,
                permission_mode=permission_mode,
                session_id=session_id,
                assistant_message_id=assistant_message_id,
                thinking_mode=thinking_mode,
                attachments=attachments,
                context_usage_trigger=fetch_context_token_usage.delay,
                is_custom_prompt=is_custom_prompt,
                is_queue_continuation=is_queue_continuation,
            )
        )
    finally:
        loop.close()


@celery_app.task(bind=True, ignore_result=True)
def fetch_context_token_usage(
    self: Any,
    chat_id: str,
    session_id: str,
    sandbox_id: str,
    sandbox_provider: str,
    user_id: str,
    model_id: str,
) -> None:
    tracker = ContextUsageTracker(
        chat_id=chat_id,
        session_id=session_id,
        sandbox_id=sandbox_id,
        sandbox_provider=sandbox_provider,
        user_id=user_id,
        model_id=model_id,
    )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(tracker.poll_while_streaming())
    finally:
        loop.close()
