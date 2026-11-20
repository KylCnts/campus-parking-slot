"""Event parking: conflict checks, publishing, cancelling and SMTP email notifications."""
import logging
import threading

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMessage, get_connection
from django.db import close_old_connections, transaction
from django.utils import timezone

from .models import EventNotification, ParkingEvent
from .scheduling import lock_spaces, sync_space
from .services import broadcast_parking_update

log = logging.getLogger(__name__)
Kind = EventNotification.Kind
MAX_EMAIL_ATTEMPTS = 3


def find_conflicts(space_ids, starts_at, ends_at, exclude_event_id=None):
    """Return [{slot, reason}] for slots already held by another event at this time."""
    conflicts = []
    events = ParkingEvent.objects.filter(
        status=ParkingEvent.Status.PUBLISHED, spaces__in=space_ids, starts_at__lt=ends_at, ends_at__gt=starts_at
    ).distinct()
    if exclude_event_id:
        events = events.exclude(pk=exclude_event_id)
    for event in events.prefetch_related("spaces"):
        for space in event.spaces.all():
            if space.pk in space_ids:
                conflicts.append({"slot": space.slot_number, "reason": f"Already reserved for the event “{event.name}”."})
    # Parked vehicles are not a conflict: they stay on record and the zone is flagged as over capacity.
    return conflicts


def sync_event_spaces(space_ids):
    changed = [s.slot_number for s in lock_spaces(space_ids) if sync_space(s)]
    if changed:
        broadcast_parking_update("event.changed", {"slots": changed})


def _clean(value):
    return " ".join(str(value).split())


def _event_details(event):
    spaces = event.spaces.select_related("area").order_by("slot_number")
    start = event.start_time.strftime("%I:%M %p").lstrip("0")
    end = event.end_time.strftime("%I:%M %p").lstrip("0")
    return (
        "Event Information:\n\n"
        f"- Event Name: {_clean(event.name)}\n"
        f"- Event Description: {_clean(event.description) or 'None provided'}\n"
        f"- Event Date: {event.event_date.strftime('%B %d, %Y')}\n"
        f"- Event Time: {start} – {end}\n"
        f"- Affected Parking Areas: {', '.join(sorted({s.area.name for s in spaces}))}\n"
        f"- Affected Parking Spaces: {', '.join(s.slot_number for s in spaces)}\n\n"
    )


def build_email(event, kind):
    closing = "Thank you for your understanding.\n\nCampus Parking Management System\n"
    advice = (
        "Please be advised that the identified parking spaces will be temporarily unavailable during the scheduled event.\n\n"
        "We encourage you to check the parking map before entering the campus to avoid inconvenience.\n\n"
    )
    if kind == Kind.CANCELLED:
        subject = "Campus Parking Advisory – Event Canceled"
        intro = "Please be informed that the campus event below has been canceled.\n\n"
        advice = "The affected parking spaces will return to normal availability, unless they are currently occupied.\n\n"
    elif kind == Kind.UPDATED:
        subject = "Campus Parking Advisory – Updated Event Details"
        intro = "Please be informed that the schedule or affected parking spaces of an upcoming campus event have changed.\n\n"
    else:
        subject = "Campus Parking Advisory – Upcoming Event"
        intro = "Please be informed that an upcoming campus event will temporarily affect parking availability.\n\n"
    return subject, f"Dear Student / Faculty Member,\n\n{intro}{_event_details(event)}{advice}{closing}"


def eligible_recipients():
    """Only approved, active student assistants and faculty members are notified."""
    User = get_user_model()
    recipients = User.objects.filter(
        role__in=[User.Role.STUDENT, User.Role.FACULTY], account_status=User.AccountStatus.APPROVED, is_active=True
    ).exclude(email="")
    for domain in settings.EMAIL_BLOCKED_DOMAINS:
        recipients = recipients.exclude(email__iendswith=f"@{domain}")
    return recipients


def queue_notifications(event, kind):
    """Create one record per recipient. The unique constraint prevents duplicates."""
    subject, body = build_email(event, kind)
    ids = []
    for user in eligible_recipients():
        n, created = EventNotification.objects.get_or_create(
            event=event,
            recipient_email=user.email,
            kind=kind,
            revision=event.revision,
            defaults={"recipient": user, "subject": subject, "body": body},
        )
        if created:
            ids.append(n.pk)
    if ids:
        transaction.on_commit(lambda: dispatch_notifications(ids))
    return ids


def deliver_notifications(ids):
    """Send each email separately and record the outcome. One failure never stops the rest."""
    console = settings.EMAIL_BACKEND.endswith("console.EmailBackend")
    connection = get_connection(fail_silently=False)
    allowed = {email.lower() for email in eligible_recipients().values_list("email", flat=True)}
    try:
        for n in EventNotification.objects.filter(pk__in=ids).exclude(status=EventNotification.Status.SENT):
            n.attempts += 1
            if n.recipient_email.lower() not in allowed:
                n.status = EventNotification.Status.FAILED
                n.attempts = MAX_EMAIL_ATTEMPTS
                n.error = "Not sent: this account is no longer eligible for event notices."
                n.save(update_fields=["attempts", "status", "error"])
                continue
            try:
                EmailMessage(n.subject, n.body, settings.DEFAULT_FROM_EMAIL, [n.recipient_email], connection=connection).send(fail_silently=False)
                n.status = EventNotification.Status.LOGGED if console else EventNotification.Status.SENT
                n.sent_at = timezone.now()
                n.error = ""
            except Exception as exc:
                log.warning("Event email %s failed: %s", n.pk, exc.__class__.__name__)
                n.status = EventNotification.Status.FAILED
                n.error = f"{exc.__class__.__name__}: {exc}"[:500]
                try:
                    connection.close()  # the next message starts on a fresh connection
                except Exception:
                    pass
            n.save(update_fields=["attempts", "status", "sent_at", "error"])
    finally:
        try:
            connection.close()
        except Exception:
            pass


def dispatch_notifications(ids):
    """Send in the background so publishing an event never waits on the mail server."""
    if settings.EMAIL_BACKEND.endswith("locmem.EmailBackend"):
        deliver_notifications(ids)
        return

    def run():
        try:
            deliver_notifications(ids)
        except Exception:
            log.exception("Event email delivery stopped unexpectedly")
        finally:
            close_old_connections()

    threading.Thread(target=run, name="event-emails", daemon=True).start()
