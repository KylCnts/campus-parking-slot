from django.core.management.base import BaseCommand

from parking.scheduling import process_schedule


class Command(BaseCommand):
    help = "Expire overdue parking sessions and release parking spaces of finished events."

    def handle(self, *args, **options):
        changed = process_schedule()
        self.stdout.write(self.style.SUCCESS(f"Released {len(changed)} parking space(s)."))
