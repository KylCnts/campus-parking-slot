from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .services import PARKING_GROUP, availability_summary


@database_sync_to_async
def _user_from_token(raw):
    try:
        token = AccessToken(raw)
        return get_user_model().objects.filter(pk=token["user_id"], is_active=True).first()
    except (TokenError, KeyError):
        return None


@database_sync_to_async
def _summary():
    return availability_summary()


class ParkingConsumer(AsyncJsonWebsocketConsumer):
    """ws://host/ws/parking/?token=<JWT access token>

    Pushes `parking.update` whenever a space changes and `notification.new` for the user.
    """

    async def connect(self):
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        self.user = await _user_from_token((qs.get("token") or [""])[0])
        if not self.user:
            await self.close(code=4401)
            return
        self.user_group = f"user_{self.user.pk}"
        await self.channel_layer.group_add(PARKING_GROUP, self.channel_name)
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()
        await self.send_json({"type": "parking.update", "event": "connected", "summary": await _summary()})

    async def disconnect(self, code):
        if getattr(self, "user", None):
            await self.channel_layer.group_discard(PARKING_GROUP, self.channel_name)
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def parking_update(self, event):
        await self.send_json(event)

    async def notification_new(self, event):
        await self.send_json(event)

    async def account_disabled(self, event):
        await self.close(code=4403)
