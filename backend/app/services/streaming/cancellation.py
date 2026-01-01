from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from redis.asyncio import Redis

from app.constants import REDIS_KEY_CHAT_REVOKED
from app.core.config import get_settings

if TYPE_CHECKING:
    from app.services.claude_agent import ClaudeAgentService

logger = logging.getLogger(__name__)
settings = get_settings()


class StreamCancelled(Exception):
    def __init__(self, final_content: str) -> None:
        super().__init__("Stream cancelled")
        self.final_content = final_content


class CancellationHandler:
    def __init__(self, chat_id: str, redis_client: Redis[str] | None) -> None:
        self.chat_id = chat_id
        self._redis = redis_client
        self.was_cancelled = False
        self.cancel_requested = False

    async def check_revoked(self) -> bool:
        if not self._redis:
            return False

        try:
            revoked = await self._redis.get(
                REDIS_KEY_CHAT_REVOKED.format(chat_id=self.chat_id)
            )
            return revoked in ("1", b"1")
        except Exception as exc:
            logger.error("Failed to check revocation status: %s", exc)
            return False

    async def wait_for_revocation(self) -> None:
        while True:
            if await self.check_revoked():
                return
            await asyncio.sleep(settings.REVOCATION_POLL_INTERVAL_SECONDS)

    async def cancel_stream(self, ai_service: ClaudeAgentService) -> None:
        if self.cancel_requested:
            return

        self.cancel_requested = True
        try:
            await ai_service.cancel_active_stream()
        except Exception as exc:
            logger.error("Failed to cancel active stream: %s", exc)

    def create_monitor_task(
        self,
        main_task: asyncio.Task[None] | None,
        ai_service: ClaudeAgentService,
    ) -> asyncio.Task[None] | None:
        if not self._redis:
            return None

        return asyncio.create_task(
            self._monitor_revocation(main_task, ai_service)
        )

    async def _monitor_revocation(
        self,
        main_task: asyncio.Task[None] | None,
        ai_service: ClaudeAgentService,
    ) -> None:
        try:
            await self.wait_for_revocation()
        except asyncio.CancelledError:
            raise

        self.was_cancelled = True
        await self.cancel_stream(ai_service)

        if main_task:
            main_task.cancel()
