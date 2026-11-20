import os
import sys

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402
from django.urls import path  # noqa: E402

from parking.consumers import ParkingConsumer  # noqa: E402

if "test" not in sys.argv:
    from parking.scheduling import start_scheduler

    start_scheduler()  # expires parking sessions and releases finished events automatically

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # JWT is checked inside the consumer; browser origins must match ALLOWED_HOSTS.
        "websocket": AllowedHostsOriginValidator(URLRouter([path("ws/parking/", ParkingConsumer.as_asgi())])),
    }
)
