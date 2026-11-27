import os
import sys

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402
from django.urls import path  # noqa: E402

from parking.consumers import ParkingConsumer  # noqa: E402

if "test" not in sys.argv:
    from parking.scheduling import start_scheduler

    start_scheduler()  # expires parking sessions and releases finished events automatically


class FrontendOriginValidator(OriginValidator):
    """Accept WebSocket connections from the backend's own hosts and from the trusted frontend origins.

    In production the frontend (Vercel) is served from a different domain than this backend (Render), so its
    browser Origin is never one of ALLOWED_HOSTS. The frontend origins are already listed in CORS_ALLOWED_ORIGINS
    for the HTTP API; the same list is trusted here. Any other origin is still refused.
    The lists are read from settings on each connection, so they always match the current configuration.
    """

    def __init__(self, application):
        super().__init__(application, [])

    @property
    def allowed_origins(self):
        hosts = list(settings.ALLOWED_HOSTS)
        if settings.DEBUG and not hosts:
            hosts = ["localhost", "127.0.0.1", "[::1]"]
        return hosts + [o for o in getattr(settings, "CORS_ALLOWED_ORIGINS", []) if o.strip()]

    @allowed_origins.setter
    def allowed_origins(self, _value):
        pass  # computed from settings; see the property above


application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # JWT is checked inside the consumer; the browser origin must be this backend or a trusted frontend.
        "websocket": FrontendOriginValidator(URLRouter([path("ws/parking/", ParkingConsumer.as_asgi())])),
    }
)
