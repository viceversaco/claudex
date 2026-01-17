from __future__ import annotations

from typing import TYPE_CHECKING

from app.models.db_models.enums import ModelProvider
from app.models.types import JSONList
from app.services.ai_model import AIModelService

if TYPE_CHECKING:
    from app.models.db_models import UserSettings
    from app.services.base import SessionFactoryType


class APIKeyValidationError(ValueError):
    pass


def normalize_json_list(value: JSONList | None) -> JSONList:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    raise ValueError(f"Expected list or None, got {type(value).__name__}")


async def validate_model_api_keys(
    user_settings: UserSettings,
    model_id: str,
    session_factory: "SessionFactoryType | None" = None,
) -> None:
    ai_model_service = AIModelService(session_factory=session_factory)
    provider = await ai_model_service.get_model_provider(model_id)

    if provider == ModelProvider.ZAI:
        if not user_settings.z_ai_api_key:
            raise APIKeyValidationError(
                f"Z.AI API key is required for model '{model_id}'. "
                "Please configure your Z.AI API key in Settings."
            )
    elif provider == ModelProvider.OPENROUTER:
        if not user_settings.openrouter_api_key:
            raise APIKeyValidationError(
                f"OpenRouter API key is required for model '{model_id}'. "
                "Please configure your OpenRouter API key in Settings."
            )
    else:
        if not user_settings.claude_code_oauth_token:
            raise APIKeyValidationError(
                f"Claude Code Auth Token is required for model '{model_id}'. "
                "Please configure your Claude Code Auth Token in Settings."
            )
