from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import event_views, sessions, user_reports, views

router = DefaultRouter()
router.register("areas", views.ParkingAreaViewSet, basename="area")
router.register("spaces", views.ParkingSpaceViewSet, basename="space")
router.register("vehicles", views.VehicleViewSet, basename="vehicle")
router.register("transactions", views.ParkingTransactionViewSet, basename="transaction")
router.register("incident-reports", views.IncidentReportViewSet, basename="incident-report")
router.register("user-reports", user_reports.UserReportViewSet, basename="user-report")
router.register("notifications", views.NotificationViewSet, basename="notification")
router.register("activity-logs", views.ActivityLogViewSet, basename="activity-log")
router.register("audit-trail", views.AuditLogViewSet, basename="audit-trail")
router.register("sessions", sessions.ParkingSessionViewSet, basename="session")
router.register("events", event_views.ParkingEventViewSet, basename="event")
router.register("event-notifications", event_views.EventNotificationViewSet, basename="event-notification")

urlpatterns = [
    path("dashboard/summary/", views.dashboard_summary),
    path("analytics/", views.analytics),
    path("reports/", views.reports),
    path("settings/", views.parking_settings),
    path("meta/", views.meta),
    path("", include(router.urls)),
]
