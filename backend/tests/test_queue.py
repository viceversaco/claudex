from __future__ import annotations

import uuid

from httpx import AsyncClient

from app.models.db_models import Chat, User
from app.services.sandbox import SandboxService


class TestQueueMessage:
    async def test_queue_message(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "Test queued message",
                "model_id": "claude-haiku-4-5",
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["created"] is True
        assert data["content"] == "Test queued message"
        assert "id" in data
        assert uuid.UUID(data["id"])

    async def test_queue_message_appends(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "First message",
                "model_id": "claude-haiku-4-5",
            },
            headers=auth_headers,
        )

        response = await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "Second message",
                "model_id": "claude-haiku-4-5",
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["created"] is False
        assert "First message" in data["content"]
        assert "Second message" in data["content"]

    async def test_queue_message_with_options(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "Message with options",
                "model_id": "claude-haiku-4-5",
                "permission_mode": "plan",
                "thinking_mode": "extended",
            },
            headers=auth_headers,
        )

        assert response.status_code == 201

        get_response = await async_client.get(
            f"/api/v1/chat/chats/{chat.id}/queue",
            headers=auth_headers,
        )

        data = get_response.json()
        assert data["permission_mode"] == "plan"
        assert data["thinking_mode"] == "extended"

    async def test_queue_message_chat_not_found(
        self,
        async_client: AsyncClient,
        integration_user_fixture: User,
        auth_headers: dict[str, str],
    ) -> None:
        fake_chat_id = uuid.uuid4()

        response = await async_client.post(
            f"/api/v1/chat/chats/{fake_chat_id}/queue",
            data={
                "content": "Test message",
                "model_id": "claude-haiku-4-5",
            },
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_queue_message_unauthorized(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "Test message",
                "model_id": "claude-haiku-4-5",
            },
        )

        assert response.status_code == 401


class TestGetQueue:
    async def test_get_queue(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "Queued content",
                "model_id": "claude-haiku-4-5",
                "permission_mode": "plan",
            },
            headers=auth_headers,
        )

        response = await async_client.get(
            f"/api/v1/chat/chats/{chat.id}/queue",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["content"] == "Queued content"
        assert data["model_id"] == "claude-haiku-4-5"
        assert data["permission_mode"] == "plan"
        assert "id" in data
        assert "queued_at" in data

    async def test_get_queue_empty(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.get(
            f"/api/v1/chat/chats/{chat.id}/queue",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json() is None

    async def test_get_queue_unauthorized(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.get(
            f"/api/v1/chat/chats/{chat.id}/queue",
        )

        assert response.status_code == 401


class TestUpdateQueuedMessage:
    async def test_update_queued_message(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "Original content",
                "model_id": "claude-haiku-4-5",
            },
            headers=auth_headers,
        )

        response = await async_client.patch(
            f"/api/v1/chat/chats/{chat.id}/queue",
            json={"content": "Updated content"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["content"] == "Updated content"

    async def test_update_queued_message_not_found(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.patch(
            f"/api/v1/chat/chats/{chat.id}/queue",
            json={"content": "Updated content"},
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_update_queued_message_unauthorized(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.patch(
            f"/api/v1/chat/chats/{chat.id}/queue",
            json={"content": "Updated content"},
        )

        assert response.status_code == 401


class TestClearQueue:
    async def test_clear_queue(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        await async_client.post(
            f"/api/v1/chat/chats/{chat.id}/queue",
            data={
                "content": "To be cleared",
                "model_id": "claude-haiku-4-5",
            },
            headers=auth_headers,
        )

        response = await async_client.delete(
            f"/api/v1/chat/chats/{chat.id}/queue",
            headers=auth_headers,
        )

        assert response.status_code == 204

        get_response = await async_client.get(
            f"/api/v1/chat/chats/{chat.id}/queue",
            headers=auth_headers,
        )
        assert get_response.json() is None

    async def test_clear_queue_not_found(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
        auth_headers: dict[str, str],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.delete(
            f"/api/v1/chat/chats/{chat.id}/queue",
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_clear_queue_unauthorized(
        self,
        async_client: AsyncClient,
        integration_chat_fixture: tuple[User, Chat, SandboxService],
    ) -> None:
        _, chat, _ = integration_chat_fixture

        response = await async_client.delete(
            f"/api/v1/chat/chats/{chat.id}/queue",
        )

        assert response.status_code == 401
