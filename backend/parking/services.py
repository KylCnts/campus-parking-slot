"""Shared helpers: availability stats, realtime broadcasts, logging, notifications."""
import logging
import threading

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMessage
from django.db import close_old_connections
from django.db import transaction as db_transaction
from django.db.models import Count, Q
from django.utils import timezone

from .models import ActivityLog, AuditLog, Category, Notification, ParkingSettings, ParkingSpace, ParkingTransaction

log = logging.getLogger(__name__)
PARKING_GROUP = "parking_updates"


def _pct(part, whole):
    return round(part * 100 / whole, 1) if whole else 0.0


def category_stats(category=None, slot_type=None):
    qs = ParkingSpace.objects.filter(is_archived=False)
    if category:
        qs = qs.filter(category=category)
    if slot_type:
        qs = qs.filter(slot_type=slot_type)
    agg = qs.aggregate(
        total=Count("id"),
        available=Count("id", filter=Q(status=ParkingSpace.Status.AVAILABLE)),
        occupied=Count("id", filter=Q(status=ParkingSpace.Status.OCCUPIED)),
        event_reserved=Count("id", filter=Q(status=ParkingSpace.Status.EVENT_RESERVED)),
    )
    agg["availability_pct"] = _pct(agg["available"], agg["total"])
    agg["occupancy_pct"] = _pct(agg["occupied"], agg["total"])
    last = qs.order_by("-updated_at").values_list("updated_at", flat=True).first()
    agg["last_updated"] = last.isoformat() if last else None
    return agg


def availability_summary():
    return {
        "overall": category_stats(),
        "student": category_stats(Category.STUDENT),
        "faculty": category_stats(Category.FACULTY),
        "car": category_stats(slot_type=ParkingSpace.SlotType.CAR),
        "motorcycle": category_stats(slot_type=ParkingSpace.SlotType.MOTORCYCLE),
        "currently_parked": ParkingTransaction.objects.filter(status=ParkingTransaction.Status.ACTIVE).count(),
        "timestamp": timezone.now().isoformat(),
    }


def _send(group, payload):
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(group, payload)
    except Exception:  # never let a realtime hiccup break a DB write
        log.exception("Realtime broadcast failed")


def broadcast_parking_update(event="parking.changed", detail=None):
    """Push the latest availability summary to every connected dashboard.

    Runs after the DB transaction commits so clients never see uncommitted state.
    """

    def _do():
        _send(
            PARKING_GROUP,
            {"type": "parking.update", "event": event, "detail": detail or {}, "summary": availability_summary()},
        )
        _check_low_availability()

    db_transaction.on_commit(_do)


def notify(user, title, message, level=Notification.Level.INFO, link=""):
    n = Notification.objects.create(user=user, title=title, message=message, level=level, link=link)
    db_transaction.on_commit(
        lambda: _send(
            f"user_{user.pk}",
            {
                "type": "notification.new",
                "notification": {
                    "id": n.pk,
                    "title": n.title,
                    "message": n.message,
                    "level": n.level,
                    "link": n.link,
                    "is_read": False,
                    "created_at": n.created_at.isoformat(),
                },
            },
        )
    )
    return n


def notify_roles(roles, title, message, level=Notification.Level.INFO, link=""):
    User = get_user_model()
    for u in User.objects.filter(role__in=roles, is_active=True):
        notify(u, title, message, level, link)


_low_flags = {}


def _check_low_availability():
    """Alert admins/security once when a category drops below the configured threshold."""
    threshold = ParkingSettings.load().low_availability_threshold
    User = get_user_model()
    for cat, label in Category.choices:
        s = category_stats(cat)
        is_low = s["total"] > 0 and s["availability_pct"] < threshold
        if is_low and not _low_flags.get(cat):
            notify_roles(
                [User.Role.ADMIN],
                f"Low availability: {label}",
                f"Only {s['available']} of {s['total']} spaces ({s['availability_pct']}%) are available.",
                Notification.Level.WARNING,
                "/parking-spaces",
            )
        _low_flags[cat] = is_low


def send_user_email(recipient, subject, body, on_result=None):
    """Send one email after commit without making the request wait for the mail server."""

    def deliver():
        console = settings.EMAIL_BACKEND.endswith("console.EmailBackend")
        try:
            EmailMessage(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient]).send(fail_silently=False)
            result = "LOGGED" if console else "SENT"
        except Exception:  # a mail outage must never undo the action that triggered the email
            log.exception("Email delivery failed")
            result = "FAILED"
        if on_result:
            on_result(result)

    def run():
        try:
            deliver()
        finally:
            close_old_connections()

    if settings.EMAIL_BACKEND.endswith("locmem.EmailBackend"):
        db_transaction.on_commit(deliver)
    else:
        db_transaction.on_commit(lambda: threading.Thread(target=run, name="user-email", daemon=True).start())


def close_user_connections(user_id):
    """Disconnect the live dashboards of an account that lost access."""
    db_transaction.on_commit(lambda: _send(f"user_{user_id}", {"type": "account.disabled"}))


def snapshot(obj, fields):
    return {f: (str(v) if (v := getattr(obj, f, None)) is not None else None) for f in fields}


def audit(request, action, target, previous=None, new=None, reason=""):
    """Append one administrative action to the audit trail."""
    user = getattr(request, "user", None)
    AuditLog.objects.create(
        actor=user if user and user.is_authenticated else None,
        actor_name=user.full_name if user and user.is_authenticated else "System",
        actor_email=user.email if user and user.is_authenticated else "",
        action=action,
        target_type=target.__class__.__name__,
        target_id=str(target.pk or ""),
        target_label=str(target)[:255],
        previous_value=previous,
        new_value=new,
        reason=reason[:500],
        ip_address=client_ip(request),
    )


def client_ip(request):
    if request is None:
        return None
    fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    return fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR")


def log_activity(user, action, description, request=None):
    ActivityLog.objects.create(
        user=user if (user and user.is_authenticated) else None,
        action=action,
        description=description,
        ip_address=client_ip(request),
    )
