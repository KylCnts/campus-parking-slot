"""The campus authorizes a fixed number of Student Assistant accounts."""
from django.db import connection
from rest_framework.exceptions import ValidationError

from .constants import MAX_STUDENT_ASSISTANTS, STUDENT_LIMIT_MESSAGE
from .models import User

# Accounts awaiting review or temporarily suspended still hold one of the authorized places.
SEAT_STATUSES = [User.AccountStatus.PENDING, User.AccountStatus.APPROVED, User.AccountStatus.SUSPENDED]
_SEAT_LOCK_ID = 724001


def student_seats_used():
    return User.objects.filter(role=User.Role.STUDENT, account_status__in=SEAT_STATUSES).count()


def student_registration_open():
    return student_seats_used() < MAX_STUDENT_ASSISTANTS


def reserve_student_seat():
    """Call inside a transaction. The lock stops simultaneous requests from exceeding the limit."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [_SEAT_LOCK_ID])
    if not student_registration_open():
        raise ValidationError({"detail": STUDENT_LIMIT_MESSAGE})
