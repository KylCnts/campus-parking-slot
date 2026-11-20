import logging

from django.db import OperationalError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

log = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Return a clear JSON error when PostgreSQL cannot be reached."""
    if isinstance(exc, OperationalError):
        log.exception("Database unavailable")
        return Response(
            {"detail": "The database is currently unavailable. Please try again shortly."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return exception_handler(exc, context)
