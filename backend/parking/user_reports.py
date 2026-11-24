"""Reports and concerns sent by Student Assistants and Faculty Members to the administrator."""
import logging

from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.images import clean_image, image_content_type
from accounts.models import User
from accounts.permissions import IsAdmin

from .models import Notification, UserReport
from .services import audit, log_activity, notify, notify_roles

log = logging.getLogger(__name__)
Status = UserReport.Status


class UserReportSerializer(serializers.ModelSerializer):
    reference = serializers.SerializerMethodField()
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    has_attachment = serializers.SerializerMethodField()
    reporter_details = serializers.SerializerMethodField()
    attachment = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = UserReport
        fields = [
            "id", "reference", "category", "category_display", "title", "description", "attachment", "has_attachment",
            "status", "status_display", "admin_response", "handled_by_name", "responded_at", "resolved_at",
            "reporter_name", "reporter_email", "reporter_details", "created_at", "updated_at",
        ]
        read_only_fields = [
            "status", "admin_response", "handled_by_name", "responded_at", "resolved_at", "reporter_name", "reporter_email",
            "created_at", "updated_at",
        ]

    def get_reference(self, obj):
        return f"RPT-{obj.pk:05d}"

    def get_has_attachment(self, obj):
        return bool(obj.attachment)

    def get_reporter_details(self, obj):
        """Account details that help the administrator identify the sender."""
        request = self.context.get("request")
        if not request or not request.user.is_admin or not obj.reporter:
            return None
        u = obj.reporter
        vehicle = next(iter(u.vehicles.all()), None)
        return {
            "id": u.pk,
            "role": u.role,
            "role_display": u.get_role_display(),
            "id_number": u.id_number,
            "department": u.department,
            "contact_number": u.contact_number,
            "account_status": u.account_status,
            "plate_number": vehicle.plate_number if vehicle else None,
        }

    def validate_title(self, value):
        value = " ".join(value.split())
        if len(value) < 5:
            raise serializers.ValidationError("Enter a short title of at least 5 characters.")
        return value

    def validate_description(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Describe the concern in at least 10 characters.")
        if len(value) > 3000:
            raise serializers.ValidationError("Keep the description under 3000 characters.")
        return value

    def validate_attachment(self, value):
        if not value:
            return None
        return clean_image(value, min_side=40, too_small="The image is too small. Upload a clearer photo.")


class UserReportReviewSerializer(serializers.ModelSerializer):
    """The fields an administrator changes while handling a report."""

    class Meta:
        model = UserReport
        fields = ["status", "admin_response"]

    def validate_admin_response(self, value):
        value = value.strip()
        if len(value) > 3000:
            raise serializers.ValidationError("Keep the response under 3000 characters.")
        return value

    def validate(self, attrs):
        status = attrs.get("status", self.instance.status)
        response = attrs.get("admin_response", self.instance.admin_response)
        if status in UserReport.CLOSED_STATUSES and len(response.strip()) < 5:
            raise serializers.ValidationError({"admin_response": "Enter a response or resolution note before closing the report."})
        return attrs


class UserReportViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Members create and read their own reports. Administrators read every report and update its status."""

    serializer_class = UserReportSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["status", "category"]
    search_fields = ["title", "description", "reporter_name", "reporter_email", "admin_response"]
    ordering_fields = ["created_at", "updated_at", "status", "category"]
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        qs = UserReport.objects.select_related("reporter").prefetch_related("reporter__vehicles")
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(reporter=user)
        # state=pending | ongoing | open | closed groups the statuses for tracking.
        state = self.request.query_params.get("state") if self.action == "list" else None
        groups = {
            "pending": [Status.SUBMITTED],
            "ongoing": [Status.UNDER_REVIEW, Status.IN_PROGRESS],
            "open": [Status.SUBMITTED, Status.UNDER_REVIEW, Status.IN_PROGRESS],
            "closed": list(UserReport.CLOSED_STATUSES),
        }
        if state in groups:
            qs = qs.filter(status__in=groups[state])
        return qs

    def get_permissions(self):
        if self.action == "partial_update":
            return [IsAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        user = self.request.user
        if user.role not in (User.Role.STUDENT, User.Role.FACULTY):
            raise PermissionDenied("Only Student Assistants and Faculty Members can submit reports.")
        report = serializer.save(reporter=user, reporter_name=user.full_name, reporter_email=user.email)
        log_activity(user, "USER_REPORT_CREATE", f"Submitted report RPT-{report.pk:05d}: {report.title}", self.request)
        notify_roles(
            [User.Role.ADMIN],
            "New user report",
            f"{user.full_name}: {report.title}",
            Notification.Level.ALERT,
            "/user-reports",
        )

    def partial_update(self, request, *args, **kwargs):
        report = self.get_object()
        s = UserReportReviewSerializer(report, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        before = {"status": report.status, "admin_response": report.admin_response}
        status = s.validated_data.get("status", report.status)
        response = s.validated_data.get("admin_response", report.admin_response)
        if before == {"status": status, "admin_response": response}:
            return Response(self.get_serializer(report).data)

        now = timezone.now()
        report.status = status
        report.admin_response = response
        report.handled_by = request.user
        report.handled_by_name = request.user.full_name
        if response != before["admin_response"]:
            report.responded_at = now
        report.resolved_at = now if status in UserReport.CLOSED_STATUSES else None
        report.save()

        after = {"status": status, "admin_response": response}
        changed_prev = {k: v for k, v in before.items() if after[k] != v}
        changed_new = {k: after[k] for k in changed_prev}
        audit(request, "USER_REPORT_UPDATED", report, changed_prev, changed_new)
        log_activity(request.user, "USER_REPORT_UPDATE", f"RPT-{report.pk:05d} set to {report.get_status_display()}.", request)
        if report.reporter:
            level = Notification.Level.SUCCESS if status == Status.RESOLVED else Notification.Level.INFO
            notify(
                report.reporter,
                f"Report RPT-{report.pk:05d}: {report.get_status_display()}",
                response or f"Your report “{report.title}” is now {report.get_status_display().lower()}.",
                level,
                "/my-reports",
            )
        return Response(self.get_serializer(self.get_queryset().get(pk=report.pk)).data)

    @action(detail=True, methods=["get"])
    def attachment(self, request, pk=None):
        report = self.get_object()  # owner or administrator only
        if not report.attachment:
            raise Http404("This report has no attachment.")
        try:
            handle = report.attachment.open("rb")
        except OSError:
            log.exception("Attachment of report %s could not be opened", report.pk)
            raise Http404("The attachment could not be found.")
        response = FileResponse(handle)
        response["Content-Type"] = image_content_type(report.attachment.name)
        response["Content-Disposition"] = "inline"
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Counts per status, for the report tracking tabs."""
        agg = self.get_queryset().aggregate(
            total=Count("id"),
            **{s.lower(): Count("id", filter=Q(status=s)) for s in Status.values},
        )
        agg["pending"] = agg["submitted"]
        agg["ongoing"] = agg["under_review"] + agg["in_progress"]
        agg["closed"] = agg["resolved"] + agg["rejected"]
        return Response(agg)
