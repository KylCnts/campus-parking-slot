from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from parking.models import AuditLog, ParkingTransaction, Vehicle


class Command(BaseCommand):
    help = "Remove every Student Assistant account while keeping vehicle and parking history."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true", help="Required. This permanently removes the accounts.")

    @transaction.atomic
    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError("Add --confirm to remove all Student Assistant accounts.")
        User = get_user_model()
        accounts = list(User.objects.filter(role=User.Role.STUDENT))
        vehicles = sessions = 0
        for user in accounts:
            for vehicle in user.vehicles.all():
                # The record stays for history, keeps the owner's name, and can no longer park.
                vehicle.owner_name = user.full_name
                vehicle.is_active = False
                vehicle.save(update_fields=["owner_name", "is_active", "updated_at"])
                vehicles += 1
                sessions += ParkingTransaction.objects.filter(vehicle=vehicle).count()
            AuditLog.objects.create(
                actor_name="System maintenance",
                action="STUDENT_ASSISTANT_REMOVED",
                target_type="User",
                target_id=str(user.pk),
                target_label=f"{user.full_name} <{user.email}>",
                previous_value={"role": user.role, "account_status": user.account_status},
                reason="Existing Student Assistant accounts were removed before three authorized accounts are created.",
            )
            user.delete()
        parked = ParkingTransaction.objects.filter(status="ACTIVE", vehicle__owner__isnull=True, vehicle__is_active=False).count()
        self.stdout.write(
            f"Removed {len(accounts)} accounts. Kept {vehicles} vehicle records and {sessions} parking records. "
            f"{parked} retired vehicles are still recorded as parked. Remaining inactive vehicles: {Vehicle.objects.filter(is_active=False).count()}."
        )
