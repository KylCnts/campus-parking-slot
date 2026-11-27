from django.contrib import admin

from . import models


@admin.register(models.ParkingArea)
class AreaAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "location", "is_active"]


@admin.register(models.ParkingSpace)
class SpaceAdmin(admin.ModelAdmin):
    list_display = ["slot_number", "area", "category", "status", "updated_at"]
    list_filter = ["category", "status", "area"]
    search_fields = ["slot_number"]


@admin.register(models.Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ["plate_number", "owner", "owner_name", "category", "vehicle_type", "color"]
    search_fields = ["plate_number", "owner__full_name", "owner_name"]


@admin.register(models.ParkingTransaction)
class TxnAdmin(admin.ModelAdmin):
    list_display = ["id", "vehicle", "space", "category", "entry_time", "exit_time", "status"]
    list_filter = ["status", "category"]


@admin.register(models.AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "actor_name", "action", "target_label"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(models.ParkingSessionLog)
admin.site.register(models.Reservation)
admin.site.register(models.ParkingEvent)
admin.site.register(models.EventNotification)
admin.site.register(models.IncidentReport)
admin.site.register(models.Notification)
admin.site.register(models.ActivityLog)
admin.site.register(models.ParkingSettings)
