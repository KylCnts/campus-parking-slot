"""Single source of truth for a slot's status, plus time-based releases."""
import logging
import threading
import time as time_module
from datetime import timedelta

from django.db import close_old_connections, transaction
from django.utils import timezone

from .models import (
    EventNotification,
    Notification,
    ParkingArea,
    ParkingEvent,
    ParkingSessionLog,
    ParkingSettings,
    ParkingSpace,
    ParkingTransaction,
)
from .services import broadcast_parking_update, notify, send_user_email

log = logging.getLogger(__name__)
SCHEDULER_INTERVAL_SECONDS = 20
ZONE_FULL_MESSAGE = "This parking zone has reached its capacity because of a campus event."


def resolve_status(space, now=None):
    """Occupied beats event-reserved, which beats available."""
    now = now or timezone.now()
    if ParkingTransaction.objects.filter(space=space, status=ParkingTransaction.Status.ACTIVE).exists():
        return ParkingSpace.Status.OCCUPIED
    # Event slots stay usable until the day of the event.
    if space.events.filter(
        status=ParkingEvent.Status.PUBLISHED, event_date__lte=timezone.localdate(now), ends_at__gt=now
    ).exists():
        return ParkingSpace.Status.EVENT_RESERVED
    return ParkingSpace.Status.AVAILABLE


def sync_space(space, now=None):
    """Persist the resolved status. The caller should hold a row lock on `space`."""
    status = resolve_status(space, now)
    if space.status == status:
        return False
    space.status = status
    space.save(update_fields=["status", "updated_at"])
    return True


def lock_spaces(ids):
    """Lock slot rows in a consistent order so concurrent requests cannot deadlock."""
    return list(ParkingSpace.objects.select_for_update().filter(pk__in=ids).order_by("pk"))


def restricted_space_ids(now=None):
    """Slots taken out of capacity by an event happening today."""
    now = now or timezone.now()
    ids = ParkingEvent.objects.filter(
        status=ParkingEvent.Status.PUBLISHED, event_date__lte=timezone.localdate(now), ends_at__gt=now
    ).values_list("spaces__pk", flat=True)
    return {pk for pk in ids if pk}


def zone_stats(now=None):
    """Count-based capacity of every zone, including any event reduction."""
    restricted = restricted_space_ids(now)
    zones = {}
    rows = ParkingSpace.objects.filter(is_archived=False, area__is_active=True).order_by().values_list("pk", "area_id", "status")
    for pk, area_id, status in rows:
        z = zones.setdefault(area_id, {"maximum": 0, "restricted": 0, "occupied": 0, "free": 0})
        z["maximum"] += 1
        z["restricted"] += pk in restricted
        z["occupied"] += status == ParkingSpace.Status.OCCUPIED
        z["free"] += status == ParkingSpace.Status.AVAILABLE and pk not in restricted
    for z in zones.values():
        z["effective_capacity"] = z["maximum"] - z["restricted"]
        z["available"] = min(z.pop("free"), max(0, z["effective_capacity"] - z["occupied"]))
        z["over_capacity"] = max(0, z["occupied"] - z["effective_capacity"])
    return zones


def lock_zone(area_id):
    """Serialize capacity decisions for one zone. Always taken before any slot lock."""
    ParkingArea.objects.select_for_update().get(pk=area_id)


def zone_has_room(area_id):
    return zone_stats().get(int(area_id), {}).get("available", 0) > 0


def pick_slot(category, slot_type, area_id=None):
    """Claim the first free slot in a zone that still has capacity. Call inside a transaction."""
    candidates = ParkingSpace.objects.filter(
        is_archived=False, area__is_active=True, category=category, slot_type=slot_type, status=ParkingSpace.Status.AVAILABLE
    ).order_by("area__name", "slot_number").values_list("pk", "area_id")
    if area_id:
        candidates = candidates.filter(area_id=area_id)
    locked = set()
    for pk, zone in candidates:
        if zone not in locked:
            lock_zone(zone)
            locked.add(zone)
        if not zone_has_room(zone):
            continue
        space = ParkingSpace.objects.select_for_update(of=("self",)).get(pk=pk)
        sync_space(space)
        if space.status == ParkingSpace.Status.AVAILABLE:
            return space
    return None


def log_session(session, action, actor=None, previous_departure=None, new_departure=None, note=""):
    return ParkingSessionLog.objects.create(
        session=session,
        action=action,
        actor=actor,
        actor_name=actor.full_name if actor else "System",
        previous_departure=previous_departure,
        new_departure=new_departure,
        note=note,
    )


def _process_sessions(now, changed):
    cfg = ParkingSettings.load()
    grace = timedelta(minutes=cfg.session_grace_minutes)
    remind_window = timedelta(minutes=cfg.session_reminder_minutes)
    active = ParkingTransaction.objects.select_for_update(skip_locked=True, of=("self",)).filter(
        status=ParkingTransaction.Status.ACTIVE, source=ParkingTransaction.Source.SELF, estimated_departure__isnull=False
    )
    # Only user-reported sessions expire, and the deadline is re-read while the row is locked.
    for session in active.filter(estimated_departure__lte=now - grace).select_related("vehicle__owner", "space"):
        session.status = ParkingTransaction.Status.COMPLETED
        session.exit_time = now
        session.release_type = ParkingTransaction.ReleaseType.AUTO
        session.save()
        space = lock_spaces([session.space_id])[0]
        if sync_space(space, now):
            changed.append(space.slot_number)
        log_session(session, ParkingSessionLog.Action.EXPIRED, note="Released after the grace period.")
        if session.vehicle.owner:
            notify(session.vehicle.owner, "Parking session ended", f"Your session at {space.slot_number} was released after the grace period.", Notification.Level.WARNING, "/my-parking")

    due = active.filter(reminder_sent_at__isnull=True, estimated_departure__gt=now, estimated_departure__lte=now + remind_window)
    for session in due.select_related("vehicle__owner", "space"):
        session.reminder_sent_at = now
        session.save(update_fields=["reminder_sent_at", "updated_at"])
        log_session(session, ParkingSessionLog.Action.REMINDER)
        owner = session.vehicle.owner
        if owner:
            when = timezone.localtime(session.estimated_departure).strftime("%I:%M %p").lstrip("0")
            message = f"Your parking session at {session.space.slot_number} ends at {when}. Extend it or release the space when you leave."
            notify(owner, "Parking session ending soon", message, Notification.Level.WARNING, "/my-parking")
            send_user_email(owner.email, "Campus Parking - Session Ending Soon", f"Dear {owner.full_name},\n\n{message}\n\nParking Management System\n")


def process_schedule():
    """Expire overdue sessions and release slots of finished events."""
    now = timezone.now()
    changed = []

    with transaction.atomic():
        finished = list(
            ParkingEvent.objects.select_for_update(skip_locked=True, of=("self",)).filter(
                status=ParkingEvent.Status.PUBLISHED, ends_at__lte=now
            )
        )
        for event in finished:
            event.status = ParkingEvent.Status.COMPLETED
            event.released_at = now
            event.save(update_fields=["status", "released_at", "updated_at"])
            for space in lock_spaces(list(event.spaces.values_list("pk", flat=True))):
                if sync_space(space, now):
                    changed.append(space.slot_number)

        _process_sessions(now, changed)

        # Turn slots blue once the day of their event arrives.
        due = (
            ParkingSpace.objects.filter(
                events__status=ParkingEvent.Status.PUBLISHED,
                events__event_date__lte=timezone.localdate(now),
                events__ends_at__gt=now,
                status=ParkingSpace.Status.AVAILABLE,
            )
            .order_by()
            .values_list("pk", flat=True)
            .distinct()
        )
        for space in lock_spaces(list(due)):
            if sync_space(space, now):
                changed.append(space.slot_number)

        if changed:
            broadcast_parking_update("schedule.released", {"slots": changed})
    return changed


def _retry_stuck_emails():
    from .events import deliver_notifications

    cutoff = timezone.now() - timedelta(minutes=2)
    ids = list(
        EventNotification.objects.filter(
            status__in=[EventNotification.Status.PENDING, EventNotification.Status.FAILED], created_at__lte=cutoff, attempts__lt=3
        ).values_list("pk", flat=True)[:50]
    )
    if ids:
        deliver_notifications(ids)


def _loop():
    while True:
        time_module.sleep(SCHEDULER_INTERVAL_SECONDS)
        try:
            close_old_connections()
            process_schedule()
            _retry_stuck_emails()
        except Exception:  # keep the loop alive through a temporary database outage
            log.exception("Parking schedule run failed")
        finally:
            close_old_connections()


_started = False


def start_scheduler():
    global _started
    if not _started:
        _started = True
        threading.Thread(target=_loop, name="parking-scheduler", daemon=True).start()
