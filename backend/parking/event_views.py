"""Administrator event parking endpoints."""
from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import IsAdmin

from .events import dispatch_notifications, find_conflicts, queue_notifications, sync_event_spaces
from .models import EventNotification, ParkingEvent, ParkingSpace
from .scheduling import lock_spaces, process_schedule
from .services import audit, log_activity, snapshot

class ParkingEventSerializer(serializers.ModelSerializer):
    space_ids = serializers.PrimaryKeyRelatedField(
        source="spaces", many=True, queryset=ParkingSpace.objects.filter(is_archived=False), required=False
    )
    slot_numbers = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    notifications_total = serializers.IntegerField(read_only=True, default=0)
    notifications_failed = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ParkingEvent
        fields = [
            "id", "name", "description", "event_date", "start_time", "end_time", "starts_at", "ends_at",
            "status", "revision", "space_ids", "slot_numbers", "created_by_name", "published_at",
            "cancelled_at", "released_at", "created_at", "updated_at", "notifications_total", "notifications_failed",
        ]
        read_only_fields = [
            "starts_at", "ends_at", "status", "revision", "published_at", "cancelled_at", "released_at", "created_at", "updated_at",
        ]

    def get_slot_numbers(self, obj):
        return sorted(s.slot_number for s in obj.spaces.all())

    def validate_name(self, value):
        return " ".join(value.split())

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))
        if get("start_time") and get("end_time") and get("end_time") <= get("start_time"):
            raise ValidationError({"end_time": "End time must be later than the start time."})
        return attrs


class ParkingEventViewSet(viewsets.ModelViewSet):
    """Administrator-only event parking management."""

    permission_classes = [IsAdmin]
    serializer_class = ParkingEventSerializer
    filterset_fields = ["status", "event_date"]
    search_fields = ["name", "description", "spaces__slot_number"]
    ordering_fields = ["starts_at", "created_at", "name"]
    ordering = ["starts_at"]
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        process_schedule()
        return (
            ParkingEvent.objects.select_related("created_by")
            .prefetch_related("spaces")
            .annotate(
                notifications_total=Count("notifications", distinct=True),
                notifications_failed=Count("notifications", filter=Q(notifications__status="FAILED"), distinct=True),
            )
            .distinct()
        )

    def _respond(self, pk, code=status.HTTP_200_OK):
        return Response(self.get_serializer(self.get_queryset().get(pk=pk)).data, status=code)

    @staticmethod
    def _window(event_date, start_time, end_time):
        tz = timezone.get_current_timezone()
        return (
            timezone.make_aware(datetime.combine(event_date, start_time), tz),
            timezone.make_aware(datetime.combine(event_date, end_time), tz),
        )

    @staticmethod
    def _raise_conflicts(conflicts):
        if conflicts:
            exc = ValidationError({"detail": "Some parking spaces conflict with this event.", "conflicts": conflicts})
            exc.status_code = status.HTTP_409_CONFLICT
            raise exc

    @staticmethod
    def _event_snapshot(event):
        data = snapshot(event, ("name", "event_date", "start_time", "end_time", "status"))
        data["parking_spaces"] = sorted(event.spaces.values_list("slot_number", flat=True))
        return data

    def _publish(self, event):
        slot_ids = list(event.spaces.values_list("pk", flat=True))
        if not slot_ids:
            raise ValidationError({"space_ids": "Select at least one parking space."})
        if event.ends_at <= timezone.now():
            raise ValidationError({"end_time": "This event's schedule has already passed."})
        lock_spaces(slot_ids)
        self._raise_conflicts(find_conflicts(slot_ids, event.starts_at, event.ends_at, event.pk))
        event.status = ParkingEvent.Status.PUBLISHED
        event.revision += 1
        event.published_at = timezone.now()
        event.save()
        sync_event_spaces(slot_ids)
        queue_notifications(event, EventNotification.Kind.PUBLISHED)
        audit(self.request, "EVENT_PUBLISHED", event, new=self._event_snapshot(event))
        log_activity(self.request.user, "EVENT_PUBLISH", f"Published event {event.name}: {len(slot_ids)} spaces reserved.", self.request)

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        starts, ends = self._window(d["event_date"], d["start_time"], d["end_time"])
        with transaction.atomic():
            event = s.save(created_by=request.user, starts_at=starts, ends_at=ends)
            if str(request.data.get("publish", "")).lower() in ("1", "true"):
                self._publish(event)
            else:
                audit(request, "EVENT_CREATED", event, new=self._event_snapshot(event))
                log_activity(request.user, "EVENT_CREATE", f"Saved draft event {event.name}.", request)
        return self._respond(event.pk, status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        event = self.get_object()
        if event.status not in (ParkingEvent.Status.DRAFT, ParkingEvent.Status.PUBLISHED):
            raise ValidationError({"detail": f"A {event.status.lower()} event can no longer be edited."})
        s = self.get_serializer(event, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        before_slots = set(event.spaces.values_list("pk", flat=True))
        after_slots = {x.pk for x in d["spaces"]} if "spaces" in d else before_slots
        date_, start, end = (d.get("event_date", event.event_date), d.get("start_time", event.start_time), d.get("end_time", event.end_time))
        starts, ends = self._window(date_, start, end)
        materially_changed = (
            before_slots != after_slots or starts != event.starts_at or ends != event.ends_at or d.get("name", event.name) != event.name
        )
        was_published = event.status == ParkingEvent.Status.PUBLISHED

        with transaction.atomic():
            lock_spaces(sorted(before_slots | after_slots))
            before = self._event_snapshot(event)
            if was_published:
                if not after_slots:
                    raise ValidationError({"space_ids": "Select at least one parking space."})
                if ends <= timezone.now():
                    raise ValidationError({"end_time": "The event must end in the future."})
                self._raise_conflicts(find_conflicts(after_slots, starts, ends, event.pk))
            event = s.save(starts_at=starts, ends_at=ends)
            if was_published:
                if materially_changed:
                    event.revision += 1
                    event.save(update_fields=["revision", "updated_at"])
                    queue_notifications(event, EventNotification.Kind.UPDATED)
                sync_event_spaces(sorted(before_slots | after_slots))
            audit(request, "EVENT_UPDATED", event, before, self._event_snapshot(event))
            log_activity(request.user, "EVENT_UPDATE", f"Updated event {event.name}.", request)
        return self._respond(event.pk)

    def destroy(self, request, *args, **kwargs):
        event = self.get_object()
        if event.status != ParkingEvent.Status.DRAFT:
            raise ValidationError({"detail": "Only draft events can be deleted. Cancel a published event instead."})
        audit(request, "EVENT_DELETED", event, self._event_snapshot(event))
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        event = self.get_object()
        if event.status != ParkingEvent.Status.DRAFT:
            raise ValidationError({"detail": "Only draft events can be published."})
        with transaction.atomic():
            event = ParkingEvent.objects.select_for_update().get(pk=event.pk)
            if event.status != ParkingEvent.Status.DRAFT:
                raise ValidationError({"detail": "This event was already published."})
            self._publish(event)
        return self._respond(event.pk)

    def _close(self, event_id, new_status):
        with transaction.atomic():
            event = ParkingEvent.objects.select_for_update().get(pk=event_id)
            if event.status != ParkingEvent.Status.PUBLISHED and not (
                new_status == ParkingEvent.Status.CANCELLED and event.status == ParkingEvent.Status.DRAFT
            ):
                raise ValidationError({"detail": f"This event is already {event.status.lower()}."})
            was_published = event.status == ParkingEvent.Status.PUBLISHED
            before = self._event_snapshot(event)
            event.status = new_status
            event.released_at = timezone.now()
            if new_status == ParkingEvent.Status.CANCELLED:
                event.cancelled_at = timezone.now()
            event.save()
            sync_event_spaces(list(event.spaces.values_list("pk", flat=True)))
            action = "EVENT_CANCELLED" if new_status == ParkingEvent.Status.CANCELLED else "EVENT_RELEASED"
            audit(self.request, action, event, before, self._event_snapshot(event))
            if was_published and new_status == ParkingEvent.Status.CANCELLED:
                queue_notifications(event, EventNotification.Kind.CANCELLED)
        return event

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        event = self._close(self.get_object().pk, ParkingEvent.Status.CANCELLED)
        log_activity(request.user, "EVENT_CANCEL", f"Cancelled event {event.name}.", request)
        return self._respond(event.pk)

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        """Finish an event early and release its parking spaces now."""
        event = self._close(self.get_object().pk, ParkingEvent.Status.COMPLETED)
        log_activity(request.user, "EVENT_RELEASE", f"Released the parking spaces of event {event.name}.", request)
        return self._respond(event.pk)


class EventNotificationSerializer(serializers.ModelSerializer):
    event_name = serializers.CharField(source="event.name", read_only=True)
    recipient_name = serializers.CharField(source="recipient.full_name", read_only=True, default=None)

    class Meta:
        model = EventNotification
        fields = [
            "id", "event", "event_name", "recipient_name", "recipient_email", "kind", "revision",
            "subject", "status", "error", "attempts", "sent_at", "created_at",
        ]
        read_only_fields = fields


class EventNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """Email notification history (administrators only)."""

    permission_classes = [IsAdmin]
    serializer_class = EventNotificationSerializer
    filterset_fields = ["status", "kind", "event"]
    search_fields = ["recipient_email", "recipient__full_name", "event__name", "subject"]
    ordering_fields = ["created_at", "sent_at", "status"]

    def get_queryset(self):
        return EventNotification.objects.select_related("event", "recipient")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["email_delivery_enabled"] = not settings.EMAIL_BACKEND.endswith("console.EmailBackend")
        return response

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        n = self.get_object()
        if n.status != EventNotification.Status.FAILED:
            raise ValidationError({"detail": "Only failed emails can be retried."})
        n.status = EventNotification.Status.PENDING
        n.save(update_fields=["status"])
        dispatch_notifications([n.pk])
        return Response(self.get_serializer(n).data)
