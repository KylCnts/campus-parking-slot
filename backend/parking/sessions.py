"""A user's own parking sessions. Entry and exit are recorded only by the Admin / Security Guard."""
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import ParkingSessionLog, ParkingTransaction

ACTIVE = ParkingTransaction.Status.ACTIVE


class SessionLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = ParkingSessionLog
        fields = ["id", "action", "action_display", "actor_name", "previous_departure", "new_departure", "note", "created_at"]


class ParkingSessionSerializer(serializers.ModelSerializer):
    plate_number = serializers.CharField(source="vehicle.plate_number", read_only=True)
    vehicle_type = serializers.CharField(source="vehicle.get_vehicle_type_display", read_only=True)
    brand_model = serializers.CharField(source="vehicle.brand_model", read_only=True)
    vehicle_color = serializers.CharField(source="vehicle.color", read_only=True)
    slot_number = serializers.CharField(source="space.slot_number", read_only=True)
    area_name = serializers.CharField(source="space.area.name", read_only=True)
    duration_minutes = serializers.IntegerField(read_only=True)
    release_display = serializers.CharField(source="get_release_type_display", read_only=True)
    logs = SessionLogSerializer(source="session_logs", many=True, read_only=True)

    class Meta:
        model = ParkingTransaction
        fields = [
            "id", "plate_number", "vehicle_type", "brand_model", "vehicle_color", "slot_number", "area_name", "status", "source",
            "entry_time", "exit_time", "estimated_departure", "extension_count", "release_type", "release_display",
            "release_reason", "duration_minutes", "logs",
        ]
        read_only_fields = fields


class ParkingSessionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Read-only view of the signed-in user's parking activity."""

    serializer_class = ParkingSessionSerializer
    filterset_fields = ["status"]
    ordering = ["-entry_time"]

    def get_queryset(self):
        return (
            ParkingTransaction.objects.filter(vehicle__owner=self.request.user)
            .select_related("vehicle", "space__area")
            .prefetch_related("session_logs")
        )

    @action(detail=False, methods=["get"])
    def current(self, request):
        session = self.get_queryset().filter(status=ACTIVE).first()
        return Response(self.get_serializer(session).data if session else None)
