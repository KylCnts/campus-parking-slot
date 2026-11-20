from django.conf import settings
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Send one test message through the configured email server."

    def add_arguments(self, parser):
        parser.add_argument("recipient")

    def handle(self, *args, **options):
        if settings.EMAIL_BACKEND.endswith("console.EmailBackend"):
            raise CommandError("SMTP is not configured. Set EMAIL_HOST, EMAIL_HOST_USER and EMAIL_HOST_PASSWORD in backend/.env.")
        self.stdout.write(f"Connecting to {settings.EMAIL_HOST}:{settings.EMAIL_PORT} as {settings.EMAIL_HOST_USER or 'anonymous'}...")
        message = EmailMessage(
            "Campus Parking - SMTP Test",
            "This message confirms that the Campus Parking Management System can send email.",
            settings.DEFAULT_FROM_EMAIL,
            [options["recipient"]],
        )
        try:
            message.send(fail_silently=False)
        except Exception as exc:
            raise CommandError(f"Email could not be sent ({exc.__class__.__name__}): {exc}")
        self.stdout.write(self.style.SUCCESS(f"Test email accepted by the server for {options['recipient']}."))
