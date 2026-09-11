"""Notification interface (spec §2) — Telegram default, swappable for Slack/Discord/email."""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("notifications")


class Notifier:
    async def notify(self, event: str, text: str) -> None:  # noqa: ARG002
        raise NotImplementedError


class NullNotifier(Notifier):
    """Fallback when no backend is configured — logs instead of sending."""

    async def notify(self, event: str, text: str) -> None:
        logger.info("notify[%s]: %s", event, text.replace("\n", " | "))


class TelegramNotifier(Notifier):
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=10)
        return self._client

    async def notify(self, event: str, text: str) -> None:
        try:
            resp = await self._get_client().post(
                f"https://api.telegram.org/bot{self.bot_token}/sendMessage",
                json={"chat_id": self.chat_id, "text": text, "disable_web_page_preview": True},
            )
            if resp.status_code != 200:
                logger.warning("telegram notify %s failed: %s", event, resp.text[:200])
        except httpx.HTTPError as exc:
            logger.warning("telegram notify %s error: %s", event, exc)

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()


_notifier: Notifier | None = None


def get_notifier() -> Notifier:
    global _notifier
    if _notifier is None:
        s = get_settings()
        if s.telegram_bot_token and s.telegram_chat_id:
            _notifier = TelegramNotifier(s.telegram_bot_token, s.telegram_chat_id)
        else:
            _notifier = NullNotifier()
    return _notifier


def reset_notifier() -> None:
    """Used by tests to re-read config."""
    global _notifier
    _notifier = None
