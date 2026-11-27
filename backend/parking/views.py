from collections import Counter, defaultdict
from datetime import datetime, time, timedelta

import django_filters
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Prefetch, Q
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.constants import COURSES, VEHICLE_COLORS
from accounts.models import AccountVerification
from accounts.permissions import IsAdmin, IsAdminOrReadOnly

from .models import (
    ActivityLog,
    AuditLog,
    Category,
    IncidentReport,
    Notification,
    ParkingArea,
    ParkingEvent,
    ParkingSettings,
    ParkingSpace,
    ParkingTransaction,
    Vehicle,
    normalize_plate,
)
from .scheduling import (
    ZONE_FULL_MESSAGE,
    lock_zone,
    log_session,
    pick_slot,
    process_schedule,
    sync_space,
    zone_has_room,
    zone_stats,
)
from .serializers import (
    ActivityLogSerializer,
    AuditLogSerializer,
    IncidentReportSerializer,
    NotificationSerializer,
    ParkingAreaSerializer,
    ParkingSettingsSerializer,
    ParkingSpaceSerializer,
    ParkingTransactionSerializer,
    VehicleEntrySerializer,
    VehicleSerializer,
)
from .services import (
    audit,
    availability_summary,
    snapshot,
    broadcast_parking_update,
    category_stats,
    log_activity,
    notify,
    notify_roles,
)

User = get_user_model()
ACTIVE = ParkingTransaction.Status.ACTIVE
AREA_FIELDS = ("name", "code", "location", "description", "is_active")
SPACE_FIELDS = ("slot_number", "area", "category", "slot_type", "status", "notes")


def areas_with_counts(category=None):
    f = Q(spaces__is_archived=False) & (Q(spaces__category=category) if category else Q())
    return ParkingArea.objects.filter(is_active=True).annotate(
        total_spaces=Count("spaces", filter=f),
        available_spaces=Count("spaces", filter=f & Q(spaces__status=ParkingSpace.Status.AVAILABLE)),
        occupied_spaces=Count("spaces", filter=f & Q(spaces__status=ParkingSpace.Status.OCCUPIED)),
        event_reserved_spaces=Count("spaces", filter=f & Q(spaces__status=ParkingSpace.Status.EVENT_RESERVED)),
    )


def _role_category(user):
    """Students/faculty only see their own parking category."""
    if user.role == User.Role.STUDENT:
        return Category.STUDENT
    if user.role == User.Role.FACULTY:
        return Category.FACULTY
    return None


# ---------------------------------------------------------------------------
# Parking areas & spaces
# ---------------------------------------------------------------------------
class ParkingAreaViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = ParkingAreaSerializer
    search_fields = ["name", "code", "location"]
    filterset_fields = ["is_active"]
    pagination_class = None

    def get_queryset(self):
        return areas_with_counts(_role_category(self.request.user))

    def perform_create(self, s):
        a = s.save()
        audit(self.request, "ZONE_CREATED", a, new=snapshot(a, AREA_FIELDS))
        log_activity(self.request.user, "AREA_CREATE", f"Created parking area {a.name}.", self.request)

    def perform_update(self, s):
        before = snapshot(s.instance, AREA_FIELDS)
        a = s.save()
        audit(self.request, "ZONE_UPDATED", a, before, snapshot(a, AREA_FIELDS))
        log_activity(self.request.user, "AREA_UPDATE", f"Updated parking area {a.name}.", self.request)

    def destroy(self, request, *args, **kwargs):
        area = self.get_object()
        if area.spaces.exists():
            return Response({"detail": "Remove or move this area's parking spaces before deleting it."}, status=400)
        audit(request, "ZONE_DELETED", area, snapshot(area, AREA_FIELDS))
        log_activity(request.user, "AREA_DELETE", f"Deleted parking area {area.name}.", request)
        area.delete()
        broadcast_parking_update("area.deleted")
        return Response(status=204)


class ParkingSpaceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = ParkingSpaceSerializer
    filterset_fields = ["status", "category", "area", "slot_type"]
    search_fields = ["slot_number", "area__name", "notes"]
    ordering_fields = ["slot_number", "status", "updated_at", "created_at", "area__name"]

    def get_queryset(self):
        qs = ParkingSpace.objects.filter(is_archived=False).select_related("area").prefetch_related(
            Prefetch(
                "transactions",
                queryset=ParkingTransaction.objects.filter(status=ACTIVE).select_related("vehicle__owner"),
                to_attr="active_txns",
            )
        )
        cat = _role_category(self.request.user)
        return qs.filter(category=cat) if cat else qs

    @action(detail=False, methods=["get"])
    def map(self, request):
        """Every slot on the 2D map, with only the details this viewer may see."""
        process_schedule()
        user = request.user
        staff = user.is_admin
        spaces = list(self.get_map_queryset())
        now = timezone.now()
        event_names = dict(
            ParkingEvent.objects.filter(status=ParkingEvent.Status.PUBLISHED, ends_at__gt=now)
            .order_by("-starts_at")
            .values_list("spaces__pk", "name")
        )
        rows = []
        for s in spaces:
            active = s.active_txns[0] if s.active_txns else None
            mine = bool(active and active.vehicle.owner_id == user.pk)
            row = {
                "id": s.pk,
                "slot_number": s.slot_number,
                "slot_type": s.slot_type,
                "category": s.category,
                "category_display": s.get_category_display(),
                "area_name": s.area.name,
                "status": s.status,
                "map_x": s.map_x,
                "map_y": s.map_y,
                "map_w": s.map_w,
                "map_h": s.map_h,
                "updated_at": s.updated_at,
                "event_name": event_names.get(s.pk) if s.status == ParkingSpace.Status.EVENT_RESERVED else None,
                "is_mine": mine,
                "my_session_id": active.pk if mine else None,
                "current_transaction": (
                    {"id": active.pk, "plate_number": active.vehicle.plate_number, "owner": active.vehicle.owner_display, "entry_time": active.entry_time}
                    if active and staff
                    else None
                ),
            }
            rows.append(row)
        return Response(rows)

    def get_map_queryset(self):
        return ParkingSpace.objects.filter(is_archived=False).select_related("area").prefetch_related(
            Prefetch(
                "transactions",
                queryset=ParkingTransaction.objects.filter(status=ACTIVE).select_related("vehicle__owner"),
                to_attr="active_txns",
            )
        ).order_by("slot_number")

    def perform_create(self, s):
        sp = s.save()
        audit(self.request, "CAPACITY_SLOT_ADDED", sp, new=snapshot(sp, SPACE_FIELDS))
        log_activity(self.request.user, "SPACE_CREATE", f"Added parking space {sp.slot_number}.", self.request)
        broadcast_parking_update("space.created", {"slot": sp.slot_number})

    def perform_update(self, s):
        before = s.instance.status
        previous = snapshot(s.instance, SPACE_FIELDS)
        sp = s.save()
        sync_space(sp)
        audit(self.request, "PARKING_SPACE_UPDATED", sp, previous, snapshot(sp, SPACE_FIELDS))
        msg = f"Updated parking space {sp.slot_number}."
        if before != sp.status:
            msg += f" Status {before} → {sp.status}."
        log_activity(self.request.user, "SPACE_UPDATE", msg, self.request)
        broadcast_parking_update("space.updated", {"slot": sp.slot_number, "status": sp.status})

    def destroy(self, request, *args, **kwargs):
        sp = self.get_object()
        if sp.transactions.exists() or sp.reservations.exists() or sp.events.exists():
            return Response(
                {"detail": "This space has parking or event history and cannot be deleted."},
                status=400,
            )
        slot = sp.slot_number
        audit(request, "CAPACITY_SLOT_REMOVED", sp, snapshot(sp, SPACE_FIELDS))
        sp.delete()
        log_activity(request.user, "SPACE_DELETE", f"Deleted parking space {slot}.", request)
        broadcast_parking_update("space.deleted", {"slot": slot})
        return Response(status=204)

    @action(detail=False, methods=["post"], url_path="bulk-create", permission_classes=[IsAdmin])
    def bulk_create(self, request):
        """Create a run of slots, e.g. prefix=A count=10 start=1 -> A-01..A-10."""
        try:
            area = ParkingArea.objects.get(pk=request.data.get("area"))
            count = int(request.data.get("count", 0))
            start = int(request.data.get("start", 1))
        except (ParkingArea.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"detail": "Provide a valid area, start and count."})
        prefix = (request.data.get("prefix") or area.code).strip().upper()
        category = request.data.get("category")
        slot_type = request.data.get("slot_type", ParkingSpace.SlotType.CAR)
        if slot_type not in ParkingSpace.SlotType.values:
            raise ValidationError({"detail": "Choose a valid slot type."})
        if category not in Category.values or not (1 <= count <= 200):
            raise ValidationError({"detail": "Choose a category and a count between 1 and 200."})
        created, skipped = [], []
        with transaction.atomic():
            for i in range(start, start + count):
                slot = f"{prefix}-{i:02d}"
                if ParkingSpace.objects.filter(slot_number=slot).exists():
                    skipped.append(slot)
                    continue
                ParkingSpace.objects.create(slot_number=slot, area=area, category=category, slot_type=slot_type)
                created.append(slot)
        audit(request, "CAPACITY_SLOTS_ADDED", area, new={"parking_spaces": created})
        log_activity(request.user, "SPACE_BULK_CREATE", f"Added {len(created)} spaces in {area.name}.", request)
        broadcast_parking_update("space.created")
        return Response({"created": created, "skipped": skipped}, status=201)


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------
class VehicleViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    filterset_fields = ["category", "vehicle_type", "is_active"]
    search_fields = ["plate_number", "owner__full_name", "owner_name", "owner__id_number", "color", "brand_model"]
    ordering_fields = ["plate_number", "created_at", "category"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "mine"):
            return [IsAuthenticated()]
        if self.action in ("create", "lookup"):
            return [IsAdmin()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = Vehicle.objects.select_related("owner")
        u = self.request.user
        if u.is_admin:
            return qs
        return qs.filter(owner=u)

    def perform_create(self, s):
        v = s.save()
        log_activity(self.request.user, "VEHICLE_CREATE", f"Registered vehicle {v.plate_number}.", self.request)

    def perform_update(self, s):
        v = s.save()
        log_activity(self.request.user, "VEHICLE_UPDATE", f"Updated vehicle {v.plate_number}.", self.request)

    def destroy(self, request, *args, **kwargs):
        v = self.get_object()
        if v.transactions.exists():
            return Response(
                {"detail": "This vehicle has parking history. Mark it inactive instead of deleting it."}, status=400
            )
        plate = v.plate_number
        v.delete()
        log_activity(request.user, "VEHICLE_DELETE", f"Deleted vehicle {plate}.", request)
        return Response(status=204)

    @action(detail=False, methods=["get"])
    def mine(self, request):
        return Response(VehicleSerializer(Vehicle.objects.filter(owner=request.user), many=True).data)

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        """Search by plate (exact first, then partial) and return owner + active transaction."""
        q = normalize_plate(request.query_params.get("plate", ""))
        if not q:
            raise ValidationError({"plate": "Enter a plate number."})
        exact = Vehicle.objects.select_related("owner").filter(plate_number=q).first()
        matches = (
            [exact]
            if exact
            else list(Vehicle.objects.select_related("owner").filter(plate_number__icontains=q.replace(" ", ""))[:10])
            or list(Vehicle.objects.select_related("owner").filter(plate_number__icontains=q)[:10])
        )
        results = []
        for v in matches:
            txn = v.transactions.filter(status=ACTIVE).select_related("space__area").first()
            results.append(
                {
                    "vehicle": VehicleSerializer(v).data,
                    "active_transaction": ParkingTransactionSerializer(txn).data if txn else None,
                }
            )
        return Response({"query": q, "results": results})


# ---------------------------------------------------------------------------
# Transactions (entry / exit)
# ---------------------------------------------------------------------------
class TransactionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(method="filter_from")
    date_to = django_filters.DateFilter(method="filter_to")

    class Meta:
        model = ParkingTransaction
        fields = ["status", "category", "space", "vehicle"]

    def filter_from(self, qs, name, value):
        return qs.filter(entry_time__gte=timezone.make_aware(datetime.combine(value, time.min)))

    def filter_to(self, qs, name, value):
        return qs.filter(entry_time__lte=timezone.make_aware(datetime.combine(value, time.max)))


class ParkingTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = ParkingTransactionSerializer
    filterset_class = TransactionFilter
    search_fields = ["vehicle__plate_number", "vehicle__owner__full_name", "vehicle__owner_name", "space__slot_number"]
    ordering_fields = ["id", "entry_time", "exit_time", "status", "vehicle__plate_number", "space__slot_number"]

    def get_queryset(self):
        return ParkingTransaction.objects.select_related(
            "vehicle__owner", "space__area", "entry_recorded_by", "exit_recorded_by"
        )

    @action(detail=False, methods=["get"])
    def active(self, request):
        qs = self.filter_queryset(self.get_queryset().filter(status=ACTIVE))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=False, methods=["post"])
    def entry(self, request):
        s = VehicleEntrySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        cfg = ParkingSettings.load()
        process_schedule()

        try:
            with transaction.atomic():
                vehicle = Vehicle.objects.select_related("owner").filter(plate_number=d["plate_number"]).first()
                if vehicle is None or vehicle.owner is None:
                    raise ValidationError({"detail": "No registered vehicle matches this plate number."})
                owner = vehicle.owner
                if owner.role not in (User.Role.STUDENT, User.Role.FACULTY) or vehicle.category != owner.role:
                    raise ValidationError({"detail": "This vehicle does not belong to a Student Assistant or Faculty Member."})
                if owner.account_status != User.AccountStatus.APPROVED or not owner.is_active:
                    raise ValidationError({"detail": f"The account of {owner.full_name} is not approved and active."})
                if vehicle.category == Category.STUDENT and vehicle.required_slot_type != ParkingSpace.SlotType.MOTORCYCLE:
                    raise ValidationError({"detail": "Student assistants may only bring motorcycles inside the campus."})
                if not vehicle.is_active:
                    raise ValidationError({"detail": f"Vehicle {vehicle.plate_number} is marked inactive."})

                existing = ParkingTransaction.objects.filter(vehicle=vehicle, status=ACTIVE).select_related("space").first()
                if existing:
                    raise ValidationError(
                        {"detail": f"{vehicle.plate_number} is already parked at {existing.space.slot_number} (TXN-{existing.pk:06d})."}
                    )

                space_q = ParkingSpace.objects.select_for_update(of=("self",)).filter(is_archived=False)
                if d.get("space"):
                    lock_zone(d["space"].area_id)
                    space = space_q.filter(pk=d["space"].pk).first()
                    if not space:
                        raise ValidationError({"detail": "This parking space is no longer in use."})
                    if space.status == ParkingSpace.Status.AVAILABLE and not zone_has_room(space.area_id):
                        raise ValidationError({"detail": ZONE_FULL_MESSAGE})
                else:
                    space = pick_slot(vehicle.category, vehicle.required_slot_type)
                    if not space:
                        if vehicle.category == Category.STUDENT:
                            raise ValidationError({"detail": "All student assistant motorcycle spaces are currently in use."})
                        raise ValidationError({"detail": f"No available {vehicle.get_category_display()} {vehicle.required_slot_type.lower()} spaces."})

                if space.status != ParkingSpace.Status.AVAILABLE:
                    raise ValidationError({"detail": "Sorry! This parking space is no longer available. Please select another available parking space."})
                if space.slot_type != vehicle.required_slot_type:
                    raise ValidationError({"detail": f"{space.slot_number} is a {space.get_slot_type_display().lower()} slot and does not fit this vehicle."})
                if vehicle.category == Category.STUDENT and space.category != Category.STUDENT:
                    raise ValidationError({"detail": "Student assistants may only use the designated motorcycle spaces."})
                if space.category != vehicle.category and not cfg.allow_cross_category_parking:
                    raise ValidationError(
                        {"detail": f"{space.slot_number} is {space.get_category_display()}; this vehicle is {vehicle.get_category_display()}."}
                    )

                txn = ParkingTransaction.objects.create(
                    vehicle=vehicle,
                    space=space,
                    category=vehicle.category,
                    entry_time=timezone.now(),
                    entry_recorded_by=request.user,
                    remarks=d.get("remarks", ""),
                )
                sync_space(space)
                log_session(txn, "STARTED", request.user, note="Vehicle entry recorded by the Admin / Security Guard.")
        except IntegrityError:
            raise ValidationError({"detail": "This vehicle or space was just updated by another user. Please try again."})

        log_activity(request.user, "VEHICLE_ENTRY", f"{vehicle.plate_number} entered and parked at {space.slot_number}.", request)
        if vehicle.owner:
            notify(
                vehicle.owner,
                "Vehicle entry recorded",
                f"Your vehicle {vehicle.plate_number} entered campus and is parked at {space.slot_number} ({space.area.name}).",
                Notification.Level.SUCCESS,
            )
        broadcast_parking_update("vehicle.entry", {"slot": space.slot_number, "plate": vehicle.plate_number})
        txn = self.get_queryset().get(pk=txn.pk)
        return Response(self.get_serializer(txn).data, status=status.HTTP_201_CREATED)

    def _close(self, request, pk, new_status, action_name, verb, release_type, reason=""):
        with transaction.atomic():
            txn = get_object_or_404(ParkingTransaction.objects.select_for_update(), pk=pk)
            if txn.status != ACTIVE:
                raise ValidationError({"detail": f"Transaction is already {txn.status}."})
            txn.exit_time = timezone.now()
            txn.status = new_status
            txn.exit_recorded_by = request.user
            txn.release_type = release_type
            txn.release_reason = reason
            if request.data.get("remarks"):
                txn.remarks = (txn.remarks + " | " if txn.remarks else "") + str(request.data["remarks"])[:200]
            txn.save()
            sync_space(ParkingSpace.objects.select_for_update(of=("self",)).get(pk=txn.space_id))
            log_session(txn, "RELEASED", request.user, note=reason or verb)
            if release_type in (ParkingTransaction.ReleaseType.ADMIN, ParkingTransaction.ReleaseType.CANCELLED):
                audit(request, "PARKING_MANUAL_RELEASE" if release_type == ParkingTransaction.ReleaseType.ADMIN else "PARKING_RECORD_CANCELLED", txn, {"status": ACTIVE}, {"status": new_status}, reason)
        txn = self.get_queryset().get(pk=txn.pk)
        log_activity(request.user, action_name, f"{txn.vehicle.plate_number} {verb} from {txn.space.slot_number}.", request)
        if txn.vehicle.owner and new_status == ParkingTransaction.Status.COMPLETED:
            notify(
                txn.vehicle.owner,
                "Vehicle exit recorded",
                f"Your vehicle {txn.vehicle.plate_number} exited from {txn.space.slot_number}. Duration: {txn.duration_minutes} min.",
            )
        broadcast_parking_update("vehicle.exit", {"slot": txn.space.slot_number, "plate": txn.vehicle.plate_number})
        return Response(self.get_serializer(txn).data)

    @action(detail=True, methods=["post"])
    def exit(self, request, pk=None):
        return self._close(request, pk, ParkingTransaction.Status.COMPLETED, "VEHICLE_EXIT", "exited", ParkingTransaction.ReleaseType.GATE)

    @action(detail=True, methods=["post"], permission_classes=[IsAdmin])
    def release(self, request, pk=None):
        """Administrator release after confirming with the user that the vehicle has left."""
        reason = " ".join(str(request.data.get("reason", "")).split())[:500]
        if len(reason) < 5 or str(request.data.get("confirmed_left", "")).lower() != "true":
            raise ValidationError({"reason": "Confirm that the vehicle has left and enter the reason."})
        return self._close(request, pk, ParkingTransaction.Status.COMPLETED, "ADMIN_RELEASE", "released by an administrator", ParkingTransaction.ReleaseType.ADMIN, reason)

    @action(detail=True, methods=["post"], permission_classes=[IsAdmin])
    def cancel(self, request, pk=None):
        """Admin correction for an incorrect active record."""
        reason = " ".join(str(request.data.get("remarks", "Cancelled by administrator")).split())[:500]
        return self._close(request, pk, ParkingTransaction.Status.CANCELLED, "TXN_CANCEL", "transaction cancelled", ParkingTransaction.ReleaseType.CANCELLED, reason)


# ---------------------------------------------------------------------------
# Incident reports, notifications, logs, settings
# ---------------------------------------------------------------------------
class IncidentReportViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    permission_classes = [IsAdmin]
    serializer_class = IncidentReportSerializer
    filterset_fields = ["status", "kind"]
    search_fields = ["subject", "description", "plate_number"]
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        qs = IncidentReport.objects.select_related("reported_by", "resolved_by", "space")
        return qs if self.request.user.is_admin else qs.filter(reported_by=self.request.user)

    def perform_create(self, s):
        r = s.save(reported_by=self.request.user)
        log_activity(self.request.user, "REPORT_CREATE", f"Reported: {r.subject}", self.request)
        notify_roles([User.Role.ADMIN], "New parking record report", f"{self.request.user.full_name}: {r.subject}", Notification.Level.ALERT, "/incident-reports")

    def perform_update(self, s):
        if not self.request.user.is_admin:
            raise PermissionDenied("Only administrators can update reports.")
        extra = {}
        if s.validated_data.get("status") in (IncidentReport.Status.RESOLVED, IncidentReport.Status.DISMISSED):
            extra = {"resolved_by": self.request.user, "resolved_at": timezone.now()}
        r = s.save(**extra)
        log_activity(self.request.user, "REPORT_UPDATE", f"Report #{r.pk} set to {r.status}.", self.request)
        if r.reported_by:
            notify(r.reported_by, f"Report #{r.pk} {r.get_status_display().lower()}", r.admin_response or r.subject, link="/incident-reports")


class NotificationViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    filterset_fields = ["is_read"]
    http_method_names = ["get", "patch", "post", "delete"]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        resp = super().list(request, *args, **kwargs)
        resp.data["unread"] = self.get_queryset().filter(is_read=False).count()
        return resp

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"detail": "ok"})


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = ActivityLogSerializer
    filterset_fields = ["action", "user"]
    search_fields = ["description", "action", "user__full_name", "user__email"]
    ordering_fields = ["created_at", "action"]

    def get_queryset(self):
        qs = ActivityLog.objects.select_related("user")
        df, dt = self.request.query_params.get("date_from"), self.request.query_params.get("date_to")
        if df:
            qs = qs.filter(created_at__date__gte=df)
        if dt:
            qs = qs.filter(created_at__date__lte=dt)
        return qs

    @action(detail=False, methods=["get"])
    def actions(self, request):
        return Response(sorted(ActivityLog.objects.values_list("action", flat=True).distinct()))


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only: no API, role or admin screen can change the audit trail."""

    permission_classes = [IsAdmin]
    serializer_class = AuditLogSerializer
    filterset_fields = ["action", "target_type"]
    search_fields = ["actor_name", "actor_email", "action", "target_label", "reason"]
    ordering_fields = ["created_at", "action"]

    def get_queryset(self):
        qs = AuditLog.objects.all()
        df, dt = self.request.query_params.get("date_from"), self.request.query_params.get("date_to")
        if df:
            qs = qs.filter(created_at__date__gte=df)
        if dt:
            qs = qs.filter(created_at__date__lte=dt)
        return qs

    @action(detail=False, methods=["get"])
    def actions(self, request):
        return Response(sorted(AuditLog.objects.order_by().values_list("action", flat=True).distinct()))


@api_view(["GET", "PUT", "PATCH"])
def parking_settings(request):
    cfg = ParkingSettings.load()
    if request.method == "GET":
        return Response(ParkingSettingsSerializer(cfg).data)
    if not request.user.is_admin:
        raise PermissionDenied("Administrator access required.")
    before = dict(ParkingSettingsSerializer(cfg).data)
    s = ParkingSettingsSerializer(cfg, data=request.data, partial=True)
    s.is_valid(raise_exception=True)
    s.save()
    changed = {k: v for k, v in s.data.items() if before.get(k) != v and k != "updated_at"}
    if changed:
        audit(request, "PARKING_SETTINGS_UPDATED", cfg, {k: before.get(k) for k in changed}, changed)
    log_activity(request.user, "SETTINGS_UPDATE", "Updated parking settings.", request)
    broadcast_parking_update("settings.updated")
    return Response(s.data)


# ---------------------------------------------------------------------------
# Dashboard, analytics & reports
# ---------------------------------------------------------------------------
@api_view(["GET"])
def dashboard_summary(request):
    data = availability_summary()
    if request.user.is_admin:
        data["users"] = User.objects.aggregate(
            students=Count("id", filter=Q(role=User.Role.STUDENT, is_active=True)),
            faculty=Count("id", filter=Q(role=User.Role.FACULTY, is_active=True)),
        )
        today = timezone.localdate()
        data["today"] = {
            "entries": ParkingTransaction.objects.filter(entry_time__date=today).count(),
            "exits": ParkingTransaction.objects.filter(exit_time__date=today, status=ParkingTransaction.Status.COMPLETED).count(),
        }
        data["pending_verifications"] = AccountVerification.objects.filter(status=AccountVerification.Status.PENDING).count()
        data["open_reports"] = IncidentReport.objects.filter(status__in=["OPEN", "IN_REVIEW"]).count()
        data["registered_vehicles"] = Vehicle.objects.count()
        data["upcoming_events"] = ParkingEvent.objects.filter(
            status=ParkingEvent.Status.PUBLISHED, ends_at__gt=timezone.now()
        ).count()
    else:
        # Students/faculty only get the summary for their own category.
        cat = _role_category(request.user)
        data = {"category": cat, "stats": category_stats(cat), "timestamp": data["timestamp"]}
    stats = zone_stats()
    data["areas"] = [{**row, **stats.get(row["id"], {})} for row in ParkingAreaSerializer(areas_with_counts(), many=True).data]
    data["over_capacity_zones"] = [a["name"] for a in data["areas"] if a.get("over_capacity")]
    return Response(data)


def _daily_counts(start_date, end_date):
    tz = timezone.get_current_timezone()
    rng = (
        timezone.make_aware(datetime.combine(start_date, time.min)),
        timezone.make_aware(datetime.combine(end_date, time.max)),
    )
    entries = dict(
        ParkingTransaction.objects.filter(entry_time__range=rng)
        .annotate(d=TruncDate("entry_time", tzinfo=tz))
        .values("d")
        .annotate(c=Count("id"))
        .values_list("d", "c")
    )
    exits = dict(
        ParkingTransaction.objects.filter(exit_time__range=rng, status=ParkingTransaction.Status.COMPLETED)
        .annotate(d=TruncDate("exit_time", tzinfo=tz))
        .values("d")
        .annotate(c=Count("id"))
        .values_list("d", "c")
    )
    return entries, exits


@api_view(["GET"])
@permission_classes([IsAdmin])
def analytics(request):
    today = timezone.localdate()

    # Daily (last 14 days)
    start = today - timedelta(days=13)
    entries, exits = _daily_counts(start, today)
    daily = [
        {"date": (start + timedelta(days=i)).isoformat(), "entries": entries.get(start + timedelta(days=i), 0), "exits": exits.get(start + timedelta(days=i), 0)}
        for i in range(14)
    ]

    # Weekly (last 8 weeks, Monday-based)
    wk_start = today - timedelta(days=today.weekday()) - timedelta(weeks=7)
    e, x = _daily_counts(wk_start, today)
    weekly = []
    for w in range(8):
        ws = wk_start + timedelta(weeks=w)
        days = [ws + timedelta(days=i) for i in range(7)]
        weekly.append({"week": ws.strftime("%b %d"), "entries": sum(e.get(d, 0) for d in days), "exits": sum(x.get(d, 0) for d in days)})

    # Monthly (last 12 months)
    first = today.replace(day=1)
    months = []
    y, m = first.year, first.month
    for _ in range(12):
        months.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()
    m_start = datetime(months[0][0], months[0][1], 1).date()
    e, x = _daily_counts(m_start, today)
    monthly = []
    for (yy, mm) in months:
        label = datetime(yy, mm, 1).strftime("%b %Y")
        monthly.append(
            {
                "month": label,
                "entries": sum(c for d, c in e.items() if d.year == yy and d.month == mm),
                "exits": sum(c for d, c in x.items() if d.year == yy and d.month == mm),
            }
        )

    # Hourly entries today (peak hours)
    hourly = Counter(timezone.localtime(t).hour for t in ParkingTransaction.objects.filter(entry_time__date=today).values_list("entry_time", flat=True))
    hourly_list = [{"hour": f"{h:02d}:00", "entries": hourly.get(h, 0)} for h in range(6, 23)]

    summary = availability_summary()
    live = Q(spaces__is_archived=False)
    by_area = list(
        ParkingArea.objects.filter(is_active=True).annotate(
            total=Count("spaces", filter=live),
            occupied=Count("spaces", filter=live & Q(spaces__status=ParkingSpace.Status.OCCUPIED)),
            available=Count("spaces", filter=live & Q(spaces__status=ParkingSpace.Status.AVAILABLE)),
        ).values("name", "total", "occupied", "available")
    )
    return Response(
        {
            "summary": summary,
            "daily": daily,
            "weekly": weekly,
            "monthly": monthly,
            "hourly_today": hourly_list,
            "by_area": by_area,
        }
    )


def _utilization(txns, start, end, space_count):
    """Occupied minutes ÷ available space-minutes in the window."""
    if not space_count:
        return 0.0
    now = timezone.now()
    occupied = 0
    for t in txns:
        s = max(t.entry_time, start)
        e = min(t.exit_time or now, end)
        if e > s:
            occupied += (e - s).total_seconds()
    capacity = space_count * (min(end, now) - start).total_seconds()
    return round(occupied * 100 / capacity, 1) if capacity > 0 else 0.0


@api_view(["GET"])
@permission_classes([IsAdmin])
def reports(request):
    """period=daily|weekly|monthly, date=YYYY-MM-DD anchor, category=STUDENT|FACULTY (optional)."""
    period = request.query_params.get("period", "daily")
    category = request.query_params.get("category") or None
    try:
        anchor = datetime.strptime(request.query_params.get("date", ""), "%Y-%m-%d").date()
    except ValueError:
        anchor = timezone.localdate()

    if period == "weekly":
        start_d = anchor - timedelta(days=anchor.weekday())
        end_d = start_d + timedelta(days=6)
    elif period == "monthly":
        start_d = anchor.replace(day=1)
        nxt = (start_d + timedelta(days=32)).replace(day=1)
        end_d = nxt - timedelta(days=1)
    else:
        period = "daily"
        start_d = end_d = anchor
    start = timezone.make_aware(datetime.combine(start_d, time.min))
    end = timezone.make_aware(datetime.combine(end_d, time.max))

    base = ParkingTransaction.objects.select_related("vehicle__owner", "space__area", "entry_recorded_by", "exit_recorded_by")
    if category:
        base = base.filter(category=category)
    in_window = base.filter(entry_time__lte=end).filter(Q(exit_time__gte=start) | Q(exit_time__isnull=True))
    entered = base.filter(entry_time__range=(start, end))
    exited = base.filter(exit_time__range=(start, end), status=ParkingTransaction.Status.COMPLETED)

    completed = [t for t in exited]
    avg_minutes = round(sum((t.exit_time - t.entry_time).total_seconds() for t in completed) / 60 / len(completed), 1) if completed else 0
    hours = Counter(timezone.localtime(t).hour for t in entered.values_list("entry_time", flat=True))
    peak = max(hours.items(), key=lambda kv: kv[1]) if hours else None

    entries, exits_ = _daily_counts(start_d, end_d)
    # _daily_counts is category-agnostic; recompute per day when filtered
    per_day = []
    d = start_d
    while d <= end_d:
        if category:
            day_rng = (timezone.make_aware(datetime.combine(d, time.min)), timezone.make_aware(datetime.combine(d, time.max)))
            per_day.append(
                {"date": d.isoformat(), "entries": entered.filter(entry_time__range=day_rng).count(), "exits": exited.filter(exit_time__range=day_rng).count()}
            )
        else:
            per_day.append({"date": d.isoformat(), "entries": entries.get(d, 0), "exits": exits_.get(d, 0)})
        d += timedelta(days=1)

    window_txns = list(in_window)
    cats = [category] if category else [Category.STUDENT, Category.FACULTY]
    by_category = []
    for c in cats:
        spaces = ParkingSpace.objects.filter(category=c, is_archived=False).count()
        ctx = [t for t in window_txns if t.category == c]
        by_category.append(
            {
                "category": c,
                "label": Category(c).label,
                "spaces": spaces,
                "entries": sum(1 for t in ctx if start <= t.entry_time <= end),
                "utilization_pct": _utilization(ctx, start, end, spaces),
            }
        )

    by_area = []
    for area in ParkingArea.objects.filter(is_active=True):
        sp_qs = area.spaces.filter(is_archived=False)
        if category:
            sp_qs = sp_qs.filter(category=category)
        n = sp_qs.count()
        if not n:
            continue
        atx = [t for t in window_txns if t.space.area_id == area.pk]
        by_area.append(
            {"area": area.name, "spaces": n, "entries": sum(1 for t in atx if start <= t.entry_time <= end), "utilization_pct": _utilization(atx, start, end, n)}
        )

    rows = ParkingTransactionSerializer(entered.order_by("entry_time")[:1000], many=True).data
    return Response(
        {
            "period": period,
            "category": category,
            "start": start_d.isoformat(),
            "end": end_d.isoformat(),
            "generated_at": timezone.now().isoformat(),
            "totals": {
                "entries": entered.count(),
                "exits": exited.count(),
                "unique_vehicles": entered.values("vehicle").distinct().count(),
                "still_parked": base.filter(status=ACTIVE, entry_time__lte=end).count(),
                "avg_duration_minutes": avg_minutes,
                "peak_hour": f"{peak[0]:02d}:00" if peak else None,
                "peak_hour_entries": peak[1] if peak else 0,
            },
            "per_day": per_day,
            "by_category": by_category,
            "by_area": by_area,
            "transactions": rows,
        }
    )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def meta(request):
    """Choice lists for forms."""
    return Response(
        {
            "categories": [{"value": v, "label": l} for v, l in Category.choices],
            "space_statuses": [{"value": v, "label": l} for v, l in ParkingSpace.Status.choices],
            "slot_types": [{"value": v, "label": l} for v, l in ParkingSpace.SlotType.choices],
            "vehicle_types": [{"value": v, "label": l} for v, l in Vehicle.VehicleType.choices],
            "roles": [{"value": v, "label": l} for v, l in User.Role.choices],
            "report_kinds": [{"value": v, "label": l} for v, l in IncidentReport.Kind.choices],
            "courses": COURSES,
            "vehicle_colors": [{"value": name, "label": name, "swatch": swatch} for name, swatch in VEHICLE_COLORS],
        }
    )
