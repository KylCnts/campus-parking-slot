from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.serializers import clean_vehicle_color, validate_plate

from .models import (
    ActivityLog,
    AuditLog,
    Category,
    IncidentReport,
    Notification,
    ParkingArea,
    ParkingSettings,
    ParkingSpace,
    ParkingTransaction,
    Vehicle,
)

User = get_user_model()


class ParkingAreaSerializer(serializers.ModelSerializer):
    total_spaces = serializers.IntegerField(read_only=True)
    available_spaces = serializers.IntegerField(read_only=True)
    occupied_spaces = serializers.IntegerField(read_only=True)
    event_reserved_spaces = serializers.IntegerField(read_only=True)

    class Meta:
        model = ParkingArea
        fields = [
            "id",
            "name",
            "code",
            "location",
            "description",
            "is_active",
            "created_at",
            "updated_at",
            "total_spaces",
            "available_spaces",
            "occupied_spaces",
            "event_reserved_spaces",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_code(self, v):
        return v.strip().upper()


class ActiveTxnMiniSerializer(serializers.ModelSerializer):
    plate_number = serializers.CharField(source="vehicle.plate_number")
    owner = serializers.CharField(source="vehicle.owner_display")

    class Meta:
        model = ParkingTransaction
        fields = ["id", "plate_number", "owner", "entry_time"]


class ParkingSpaceSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source="area.name", read_only=True)
    area_code = serializers.CharField(source="area.code", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    current_transaction = serializers.SerializerMethodField()

    class Meta:
        model = ParkingSpace
        fields = [
            "id",
            "slot_number",
            "area",
            "area_name",
            "area_code",
            "category",
            "category_display",
            "slot_type",
            "status",
            "notes",
            "map_x",
            "map_y",
            "map_w",
            "map_h",
            "created_at",
            "updated_at",
            "current_transaction",
        ]
        # Status is derived from parking sessions and events; it is never set by hand.
        read_only_fields = ["status", "created_at", "updated_at"]

    def get_current_transaction(self, obj):
        # Only staff see who is parked where; students/faculty just see status.
        user = self.context.get("request").user if self.context.get("request") else None
        if not user or not user.is_admin:
            return None
        active = getattr(obj, "active_txns", None)
        txn = active[0] if active else None
        return ActiveTxnMiniSerializer(txn).data if txn else None

    def validate_slot_number(self, v):
        return v.strip().upper()

    def validate(self, attrs):
        inst = self.instance
        if inst and "category" in attrs and attrs["category"] != inst.category:
            if inst.transactions.filter(status=ParkingTransaction.Status.ACTIVE).exists():
                raise serializers.ValidationError({"category": "Cannot change category while a vehicle is parked."})
        return attrs


class VehicleSerializer(serializers.ModelSerializer):
    owner_display = serializers.CharField(read_only=True)
    owner_email = serializers.CharField(source="owner.email", read_only=True, default=None)
    owner_id_number = serializers.CharField(source="owner.id_number", read_only=True, default=None)
    owner_department = serializers.CharField(source="owner.department", read_only=True, default=None)
    owner_contact = serializers.CharField(source="owner.contact_number", read_only=True, default=None)
    owner_active = serializers.BooleanField(source="owner.is_active", read_only=True, default=None)
    owner_role = serializers.CharField(source="owner.role", read_only=True, default=None)
    owner_role_display = serializers.CharField(source="owner.get_role_display", read_only=True, default=None)
    owner_account_status = serializers.CharField(source="owner.account_status", read_only=True, default=None)
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    vehicle_type_display = serializers.CharField(source="get_vehicle_type_display", read_only=True)
    color = serializers.CharField(max_length=40, required=False, allow_blank=True)
    is_parked = serializers.SerializerMethodField()

    class Meta:
        model = Vehicle
        fields = [
            "id",
            "plate_number",
            "owner",
            "owner_name",
            "owner_display",
            "owner_email",
            "owner_id_number",
            "owner_department",
            "owner_contact",
            "owner_active",
            "owner_role",
            "owner_role_display",
            "owner_account_status",
            "category",
            "category_display",
            "vehicle_type",
            "vehicle_type_display",
            "color",
            "brand_model",
            "is_active",
            "is_parked",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_is_parked(self, obj):
        return obj.transactions.filter(status=ParkingTransaction.Status.ACTIVE).exists()

    def validate_plate_number(self, value):
        plate = validate_plate(value)
        qs = Vehicle.objects.filter(plate_number=plate)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This plate number is already registered.")
        return plate

    def validate_color(self, value):
        # Older records may hold a free-text color; it is kept until someone changes it.
        if self.instance is not None and value == self.instance.color:
            return value
        return clean_vehicle_color(value)

    def validate(self, attrs):
        if self.instance is None and not attrs.get("color"):
            raise serializers.ValidationError({"color": "Select a vehicle color from the list."})
        owner = attrs.get("owner", getattr(self.instance, "owner", None))
        owner_name = attrs.get("owner_name", getattr(self.instance, "owner_name", ""))
        if not owner and not owner_name:
            raise serializers.ValidationError({"owner_name": "Provide a linked account or the owner's name."})
        if owner and owner.role in (User.Role.STUDENT, User.Role.FACULTY):
            attrs["category"] = owner.role
        if not attrs.get("category") and not self.instance:
            raise serializers.ValidationError({"category": "User category is required."})
        category = attrs.get("category", getattr(self.instance, "category", None))
        vehicle_type = attrs.get("vehicle_type", getattr(self.instance, "vehicle_type", Vehicle.VehicleType.CAR))
        changed = not self.instance or category != self.instance.category or vehicle_type != self.instance.vehicle_type
        if changed and category == Category.STUDENT and vehicle_type != Vehicle.VehicleType.MOTORCYCLE:
            raise serializers.ValidationError({"vehicle_type": "Student assistants may only register motorcycles."})
        return attrs


class ParkingTransactionSerializer(serializers.ModelSerializer):
    plate_number = serializers.CharField(source="vehicle.plate_number", read_only=True)
    owner = serializers.CharField(source="vehicle.owner_display", read_only=True)
    owner_id_number = serializers.CharField(source="vehicle.owner.id_number", read_only=True, default=None)
    vehicle_type = serializers.CharField(source="vehicle.get_vehicle_type_display", read_only=True)
    vehicle_color = serializers.CharField(source="vehicle.color", read_only=True)
    slot_number = serializers.CharField(source="space.slot_number", read_only=True)
    area_name = serializers.CharField(source="space.area.name", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    entry_recorded_by_name = serializers.CharField(source="entry_recorded_by.full_name", read_only=True, default=None)
    exit_recorded_by_name = serializers.CharField(source="exit_recorded_by.full_name", read_only=True, default=None)
    duration_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = ParkingTransaction
        fields = [
            "id",
            "vehicle",
            "plate_number",
            "owner",
            "owner_id_number",
            "vehicle_type",
            "vehicle_color",
            "space",
            "slot_number",
            "area_name",
            "category",
            "category_display",
            "entry_time",
            "exit_time",
            "status",
            "source",
            "estimated_departure",
            "extension_count",
            "release_type",
            "release_reason",
            "duration_minutes",
            "entry_recorded_by_name",
            "exit_recorded_by_name",
            "remarks",
        ]
        read_only_fields = fields


class VehicleEntrySerializer(serializers.Serializer):
    """Vehicle entry recorded by the Admin / Security Guard for a registered vehicle."""

    plate_number = serializers.CharField(max_length=20)
    space = serializers.PrimaryKeyRelatedField(queryset=ParkingSpace.objects.all(), required=False, allow_null=True)
    remarks = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_plate_number(self, v):
        return validate_plate(v)


class IncidentReportSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.CharField(source="reported_by.full_name", read_only=True, default=None)
    resolved_by_name = serializers.CharField(source="resolved_by.full_name", read_only=True, default=None)
    slot_number = serializers.CharField(source="space.slot_number", read_only=True, default=None)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = IncidentReport
        fields = [
            "id",
            "kind",
            "kind_display",
            "subject",
            "description",
            "transaction",
            "space",
            "slot_number",
            "plate_number",
            "status",
            "admin_response",
            "reported_by",
            "reported_by_name",
            "resolved_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["reported_by", "resolved_at", "created_at", "updated_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "message", "level", "link", "is_read", "created_at"]
        read_only_fields = ["id", "title", "message", "level", "link", "created_at"]


class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True, default="System")
    user_role = serializers.CharField(source="user.role", read_only=True, default=None)

    class Meta:
        model = ActivityLog
        fields = ["id", "user", "user_name", "user_role", "action", "description", "ip_address", "created_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "actor_name", "actor_email", "action", "target_type", "target_id", "target_label",
            "previous_value", "new_value", "reason", "ip_address", "created_at",
        ]
        read_only_fields = fields


class ParkingSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParkingSettings
        fields = [
            "campus_name",
            "opening_time",
            "closing_time",
            "low_availability_threshold",
            "session_reminder_minutes",
            "session_grace_minutes",
            "allow_cross_category_parking",
            "guidelines",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_low_availability_threshold(self, v):
        if v > 100:
            raise serializers.ValidationError("Must be between 0 and 100.")
        return v
