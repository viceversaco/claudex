from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class QueuedMessageBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=100000)
    model_id: str = Field(..., min_length=1, max_length=100)
    permission_mode: Literal["plan", "ask", "auto"] = "auto"
    thinking_mode: str | None = None


class QueueMessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=100000)


class QueuedMessage(QueuedMessageBase):
    id: UUID
    position: int
    queued_at: datetime
    attachments: list[dict[str, Any]] | None = None


class QueueListResponse(BaseModel):
    items: list[QueuedMessage]
    count: int


class QueueAddResponse(BaseModel):
    id: UUID
    position: int
    attachments: list[dict[str, Any]] | None = None
