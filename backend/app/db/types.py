import json
import uuid as uuid_module
from typing import Any

from cryptography.fernet import InvalidToken
from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.types import TypeDecorator


class GUID(UUID):
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return value
        return str(value)

    def process_result_value(
        self, value: Any, dialect: Dialect
    ) -> uuid_module.UUID | None:
        if value is None:
            return value
        if not isinstance(value, uuid_module.UUID):
            return uuid_module.UUID(value)
        return value


class EncryptedString(TypeDecorator[str]):
    impl = String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Dialect) -> str | None:
        # Local import to avoid circular import
        from app.core.security import encrypt_value

        if value is None:
            return None
        return encrypt_value(value)

    def process_result_value(self, value: str | None, dialect: Dialect) -> str | None:
        # Local import to avoid circular import
        from app.core.security import decrypt_value

        if value is None:
            return None
        try:
            return decrypt_value(value)
        except InvalidToken:
            return value


class EncryptedJSON(TypeDecorator[Any]):
    impl = JSON
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        # Local import to avoid circular import
        from app.core.security import encrypt_value

        if value is None:
            return None
        if isinstance(value, str):
            serialized = value
        else:
            serialized = json.dumps(value, separators=(",", ":"), ensure_ascii=True)
        return encrypt_value(serialized)

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        # Local import to avoid circular import
        from app.core.security import decrypt_value

        if value is None:
            return None
        if isinstance(value, (list, dict)):
            return value
        if isinstance(value, str):
            try:
                decrypted = decrypt_value(value)
            except InvalidToken:
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value
            try:
                return json.loads(decrypted)
            except json.JSONDecodeError:
                return decrypted
        return value
