import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Set a one-time temporary password for an administrator, who must change it at next sign-in."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, **options):
        User = get_user_model()
        user = User.objects.filter(email__iexact=options["email"], role=User.Role.ADMIN).first()
        if not user:
            raise CommandError("No administrator account uses that email address.")
        temporary = secrets.token_urlsafe(14)
        user.set_password(temporary)
        user.must_change_password = True
        user.account_status = User.AccountStatus.APPROVED
        user.save()
        self.stdout.write(f"Temporary password for {user.email} (shown once): {temporary}")
