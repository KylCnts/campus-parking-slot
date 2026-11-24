from django.conf import settings
from django.db import models
from django.db.models import Q

from accounts.storage import private_storage


class Category(models.TextChoices):
    STUDENT = "STUDENT", "Student Assistant Parking"
    FACULTY = "FACULTY", "Faculty Parking"


class ParkingArea(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    location = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ParkingSpace(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        OCCUPIED = "OCCUPIED", "Occupied"
        EVENT_RESERVED = "EVENT_RESERVED", "Reserved for Event"

    class SlotType(models.TextChoices):
        CAR = "CAR", "Car"
        MOTORCYCLE = "MOTORCYCLE", "Motorcycle"

    slot_number = models.CharField(max_length=20, unique=True)
    area = models.ForeignKey(ParkingArea, on_delete=models.PROTECT, related_name="spaces")
    category = models.CharField(max_length=10, choices=Category.choices)
    slot_type = models.CharField(max_length=10, choices=SlotType.choices, default=SlotType.CAR)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.AVAILABLE)
    notes = models.CharField(max_length=255, blank=True)
    # Retired slots are kept only so that past transactions stay intact.
    is_archived = models.BooleanField(default=False)
    # Position on the 2D map (SVG units). Empty means "not placed on the map yet".
    map_x = models.FloatField(null=True, blank=True)
    map_y = models.FloatField(null=True, blank=True)
    map_w = models.FloatField(null=True, blank=True)
    map_h = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["area__name", "slot_number"]

    def __str__(self):
        return self.slot_number


class Vehicle(models.Model):
    class VehicleType(models.TextChoices):
        CAR = "CAR", "Car"
        MOTORCYCLE = "MOTORCYCLE", "Motorcycle"
        SUV = "SUV", "SUV"
        VAN = "VAN", "Van"
        PICKUP = "PICKUP", "Pickup Truck"
        OTHER = "OTHER", "Other"

    plate_number = models.CharField(max_length=20, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vehicles",
    )
    # Used when the vehicle was registered at the gate and has no linked account.
    owner_name = models.CharField(max_length=150, blank=True)
    category = models.CharField(max_length=10, choices=Category.choices)
    vehicle_type = models.CharField(max_length=12, choices=VehicleType.choices, default=VehicleType.CAR)
    color = models.CharField(max_length=40, blank=True)
    brand_model = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        self.plate_number = normalize_plate(self.plate_number)
        super().save(*args, **kwargs)

    @property
    def owner_display(self):
        return self.owner.full_name if self.owner else (self.owner_name or "Unregistered")

    @property
    def is_retired(self):
        """Left behind by a removed account: kept for history, and its plate may be registered again."""
        return self.owner_id is None and not self.is_active and not self.transactions.filter(status="ACTIVE").exists()

    @property
    def required_slot_type(self):
        return "MOTORCYCLE" if self.vehicle_type == self.VehicleType.MOTORCYCLE else "CAR"

    def __str__(self):
        return self.plate_number


def normalize_plate(value: str) -> str:
    return " ".join((value or "").upper().split())


class ParkingTransaction(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active (Parked)"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Source(models.TextChoices):
        GATE = "GATE", "Recorded at the gate"
        SELF = "SELF", "Reported by the user"

    class ReleaseType(models.TextChoices):
        USER = "USER", "Released by the user"
        GATE = "GATE", "Exit recorded at the gate"
        ADMIN = "ADMIN", "Released by an administrator"
        AUTO = "AUTO", "Released automatically after the grace period"
        CANCELLED = "CANCELLED", "Record cancelled by an administrator"

    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="transactions")
    space = models.ForeignKey(ParkingSpace, on_delete=models.PROTECT, related_name="transactions")
    category = models.CharField(max_length=10, choices=Category.choices)
    entry_time = models.DateTimeField()
    exit_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    entry_recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    exit_recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    remarks = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=4, choices=Source.choices, default=Source.GATE)
    estimated_departure = models.DateTimeField(null=True, blank=True, db_index=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    extension_count = models.PositiveIntegerField(default=0)
    release_type = models.CharField(max_length=10, choices=ReleaseType.choices, blank=True)
    release_reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-entry_time"]
        constraints = [
            # A vehicle can only have one active parking transaction at a time.
            models.UniqueConstraint(
                fields=["vehicle"], condition=Q(status="ACTIVE"), name="one_active_txn_per_vehicle"
            ),
            # A space can only hold one active transaction at a time.
            models.UniqueConstraint(
                fields=["space"], condition=Q(status="ACTIVE"), name="one_active_txn_per_space"
            ),
        ]

    @property
    def duration_minutes(self):
        from django.utils import timezone

        end = self.exit_time or timezone.now()
        return int((end - self.entry_time).total_seconds() // 60)

    def __str__(self):
        return f"TXN-{self.pk:06d} {self.vehicle}"


class ParkingSessionLog(models.Model):
    """Every change to a parking session, in order."""

    class Action(models.TextChoices):
        STARTED = "STARTED", "Session started"
        REMINDER = "REMINDER", "Departure reminder sent"
        EXTENDED = "EXTENDED", "Session extended"
        RELEASED = "RELEASED", "Parking space released"
        EXPIRED = "EXPIRED", "Session expired"

    session = models.ForeignKey(ParkingTransaction, on_delete=models.CASCADE, related_name="session_logs")
    action = models.CharField(max_length=10, choices=Action.choices)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actor_name = models.CharField(max_length=150, default="System")
    previous_departure = models.DateTimeField(null=True, blank=True)
    new_departure = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class AuditLog(models.Model):
    """Append-only record of administrative actions. A database trigger also blocks changes."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_constraint=False, null=True, blank=True, related_name="+"
    )
    actor_name = models.CharField(max_length=150)
    actor_email = models.EmailField(blank=True)
    action = models.CharField(max_length=50, db_index=True)
    target_type = models.CharField(max_length=50)
    target_id = models.CharField(max_length=50, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    previous_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    reason = models.CharField(max_length=500, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionError("Audit trail records cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Audit trail records cannot be deleted.")


class Reservation(models.Model):
    """Historical records of the retired reservation feature. No new rows are created."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        FULFILLED = "FULFILLED", "Fulfilled"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="reservations")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="reservations")
    space = models.ForeignKey(ParkingSpace, on_delete=models.PROTECT, related_name="reservations")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    arrival_time = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)
    transaction = models.ForeignKey(
        ParkingTransaction, on_delete=models.SET_NULL, null=True, blank=True, related_name="reservations"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["space"], condition=Q(status="ACTIVE"), name="one_active_reservation_per_space"),
            models.UniqueConstraint(fields=["vehicle"], condition=Q(status="ACTIVE"), name="one_active_reservation_per_vehicle"),
            models.UniqueConstraint(fields=["user"], condition=Q(status="ACTIVE"), name="one_active_reservation_per_user"),
        ]


class ParkingEvent(models.Model):
    """An event that holds selected parking slots."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    event_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(db_index=True)
    spaces = models.ManyToManyField(ParkingSpace, related_name="events", blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    revision = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    published_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at"]
        constraints = [
            models.CheckConstraint(condition=Q(end_time__gt=models.F("start_time")), name="event_end_after_start"),
        ]

    def __str__(self):
        return self.name


class EventNotification(models.Model):
    """History of every event email, one row per recipient and event revision."""

    class Kind(models.TextChoices):
        PUBLISHED = "PUBLISHED", "Event published"
        UPDATED = "UPDATED", "Event updated"
        CANCELLED = "CANCELLED", "Event cancelled"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        LOGGED = "LOGGED", "Console only (not delivered)"
        FAILED = "FAILED", "Failed"

    event = models.ForeignKey(ParkingEvent, on_delete=models.CASCADE, related_name="notifications")
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="event_notifications"
    )
    recipient_email = models.EmailField()
    kind = models.CharField(max_length=10, choices=Kind.choices)
    revision = models.PositiveIntegerField()
    subject = models.CharField(max_length=255)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    error = models.TextField(blank=True)
    attempts = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "recipient_email", "kind", "revision"], name="one_email_per_event_revision"
            ),
        ]


class IncidentReport(models.Model):
    """Security personnel report incorrect parking records to the administrator."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_REVIEW = "IN_REVIEW", "In Review"
        RESOLVED = "RESOLVED", "Resolved"
        DISMISSED = "DISMISSED", "Dismissed"

    class Kind(models.TextChoices):
        WRONG_SPACE = "WRONG_SPACE", "Vehicle in wrong space"
        WRONG_RECORD = "WRONG_RECORD", "Incorrect transaction record"
        MISSING_EXIT = "MISSING_EXIT", "Missing exit record"
        UNREGISTERED = "UNREGISTERED", "Unregistered vehicle"
        OTHER = "OTHER", "Other"

    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="incident_reports"
    )
    kind = models.CharField(max_length=15, choices=Kind.choices, default=Kind.WRONG_RECORD)
    subject = models.CharField(max_length=200)
    description = models.TextField()
    transaction = models.ForeignKey(
        ParkingTransaction, on_delete=models.SET_NULL, null=True, blank=True, related_name="reports"
    )
    space = models.ForeignKey(ParkingSpace, on_delete=models.SET_NULL, null=True, blank=True, related_name="reports")
    plate_number = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    admin_response = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class UserReport(models.Model):
    """A report or concern sent by a Student Assistant or Faculty Member to the administrator."""

    class Category(models.TextChoices):
        PARKING_SPACE = "PARKING_SPACE", "Parking space concern"
        PARKING_RECORD = "PARKING_RECORD", "Incorrect parking record"
        VEHICLE = "VEHICLE", "Vehicle registration"
        ACCOUNT = "ACCOUNT", "Account or access"
        SAFETY = "SAFETY", "Safety or security"
        FACILITY = "FACILITY", "Facility or maintenance"
        SUGGESTION = "SUGGESTION", "Suggestion"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        RESOLVED = "RESOLVED", "Resolved"
        REJECTED = "REJECTED", "Rejected"

    CLOSED_STATUSES = (Status.RESOLVED, Status.REJECTED)

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="user_reports"
    )
    # Kept on the report so the administrator can still identify the sender if the account is removed later.
    reporter_name = models.CharField(max_length=150)
    reporter_email = models.EmailField()
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    title = models.CharField(max_length=150)
    description = models.TextField()
    attachment = models.FileField(storage=private_storage, upload_to="report_attachments/", null=True, blank=True, max_length=255)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.SUBMITTED, db_index=True)
    admin_response = models.TextField(blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    handled_by_name = models.CharField(max_length=150, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"RPT-{self.pk:05d} {self.title}" if self.pk else self.title


class Notification(models.Model):
    class Level(models.TextChoices):
        INFO = "INFO", "Info"
        SUCCESS = "SUCCESS", "Success"
        WARNING = "WARNING", "Warning"
        ALERT = "ALERT", "Alert"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=150)
    message = models.TextField()
    level = models.CharField(max_length=10, choices=Level.choices, default=Level.INFO)
    link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ActivityLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="activity_logs"
    )
    action = models.CharField(max_length=50)
    description = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ParkingSettings(models.Model):
    """Singleton row holding configurable parking settings."""

    campus_name = models.CharField(max_length=150, default="University Campus")
    opening_time = models.TimeField(default="06:00")
    closing_time = models.TimeField(default="19:30")
    low_availability_threshold = models.PositiveIntegerField(
        default=10, help_text="Notify admins and security when availability falls below this percentage."
    )
    session_reminder_minutes = models.PositiveIntegerField(
        default=15, help_text="How long before the estimated departure time the reminder is sent."
    )
    session_grace_minutes = models.PositiveIntegerField(
        default=15, help_text="How long after the estimated departure time a session is released automatically."
    )
    allow_cross_category_parking = models.BooleanField(
        default=False, help_text="Allow students to park in faculty spaces and vice versa."
    )
    guidelines = models.TextField(
        default=(
            "Always park within the marked lines of your assigned slot.\n"
            "Students may only park in Student Parking areas; faculty in Faculty Parking areas.\n"
            "Present your vehicle to security personnel upon entry and exit.\n"
            "Observe the campus speed limit of 15 km/h.\n"
            "Overnight parking is not allowed without prior approval.\n"
            "Report any damage or incident to the security office immediately."
        )
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Parking settings"

    @classmethod
    def load(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        if created:
            obj.refresh_from_db()  # turn the text defaults into real time values
        return obj
