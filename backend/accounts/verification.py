"""Administrator review of registrations and school ID photos."""
import logging

from django.db import transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from parking.services import audit, close_user_connections, log_activity, send_user_email

from .models import AccountVerification, User
from .permissions import IsAdmin

log = logging.getLogger(__name__)


class VerificationSerializer(serializers.ModelSerializer):
    user_type = serializers.CharField(source="get_user_type_display", read_only=True)
    id_number = serializers.CharField(source="user.id_number", read_only=True, default=None)
    department = serializers.CharField(source="user.department", read_only=True, default=None)
    year_level = serializers.CharField(source="user.year_level", read_only=True, default=None)
    has_image = serializers.SerializerMethodField()
    vehicle = serializers.SerializerMethodField()

    class Meta:
        model = AccountVerification
        fields = [
            "id", "user", "applicant_name", "applicant_email", "user_type", "id_number", "department", "year_level",
            "vehicle", "status", "has_image", "image_deleted_at", "decided_by_name", "decided_at",
            "rejection_reason", "email_status", "submitted_at",
        ]
        read_only_fields = fields

    def get_has_image(self, obj):
        return bool(obj.school_id_image)

    def get_vehicle(self, obj):
        vehicle = next(iter(obj.user.vehicles.all()), None) if obj.user else None
        if not vehicle:
            return None
        return {"plate_number": vehicle.plate_number, "vehicle_type": vehicle.get_vehicle_type_display(), "brand_model": vehicle.brand_model}


def _delete_image(verification):
    image = verification.school_id_image
    if not image:
        return
    name, storage = image.name, image.storage
    verification.school_id_image = None
    verification.image_deleted_at = timezone.now()

    def remove():
        try:
            storage.delete(name)
        except OSError:
            log.exception("Could not delete school ID image for verification %s", verification.pk)

    transaction.on_commit(remove)


class VerificationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAdmin]
    serializer_class = VerificationSerializer
    filterset_fields = ["status", "user_type"]
    search_fields = ["applicant_name", "applicant_email", "user__id_number", "user__vehicles__plate_number"]
    ordering_fields = ["submitted_at", "decided_at"]
    ordering = ["-submitted_at"]

    def get_queryset(self):
        return AccountVerification.objects.select_related("user").prefetch_related("user__vehicles").distinct()

    @action(detail=True, methods=["get"])
    def image(self, request, pk=None):
        verification = self.get_object()
        if not verification.school_id_image:
            raise Http404("This image has been deleted.")
        response = FileResponse(verification.school_id_image.open("rb"))
        content_type = "image/png" if verification.school_id_image.name.endswith(".png") else "image/jpeg"
        response["Content-Type"] = content_type
        response["Content-Disposition"] = "inline"
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        audit(request, "SCHOOL_ID_VIEWED", verification, reason="School ID opened for verification.")
        return response

    def _decide(self, request, pk, status, reason=""):
        with transaction.atomic():
            verification = AccountVerification.objects.select_for_update(of=("self",)).select_related("user").get(pk=pk)
            if verification.status != AccountVerification.Status.PENDING:
                raise ValidationError({"detail": f"This registration was already {verification.status.lower()}."})
            user = User.objects.select_for_update().get(pk=verification.user_id)
            previous = user.account_status
            verification.status = status
            verification.decided_by = request.user
            verification.decided_by_name = request.user.full_name
            verification.decided_at = timezone.now()
            verification.rejection_reason = reason
            _delete_image(verification)
            verification.save()
            user.account_status = status
            user.status_reason = reason
            user.save(update_fields=["account_status", "status_reason", "is_active", "updated_at"])
            action_name = "ACCOUNT_APPROVED" if status == User.AccountStatus.APPROVED else "ACCOUNT_REJECTED"
            audit(request, action_name, user, {"account_status": previous}, {"account_status": status}, reason)
            log_activity(request.user, action_name, f"{status.title()} the registration of {user.email}.", request)
        if status == User.AccountStatus.APPROVED:
            subject = "Campus Parking - Account Approved"
            body = f"Dear {user.full_name},\n\nYour registration has been approved. You can now sign in to the parking system.\n\nParking Management System\n"
        else:
            close_user_connections(user.pk)
            subject = "Campus Parking - Registration Rejected"
            body = f"Dear {user.full_name},\n\nYour registration was rejected for the following reason:\n\n{reason}\n\nParking Management System\n"
        send_user_email(
            user.email, subject, body,
            on_result=lambda result: AccountVerification.objects.filter(pk=verification.pk).update(email_status=result),
        )
        return Response(self.get_serializer(self.get_queryset().get(pk=pk)).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._decide(request, self.get_object().pk, AccountVerification.Status.APPROVED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        reason = " ".join(str(request.data.get("reason", "")).split())
        if len(reason) < 5:
            raise ValidationError({"reason": "Enter the reason for rejecting this registration."})
        return self._decide(request, self.get_object().pk, AccountVerification.Status.REJECTED, reason[:500])
