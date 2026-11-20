from django.db import migrations


def forward(apps, schema_editor):
    """Accounts that already existed keep their access; deactivated ones become suspended."""
    User = apps.get_model("accounts", "User")
    User.objects.filter(is_active=True).update(account_status="APPROVED")
    User.objects.filter(is_active=False).update(account_status="SUSPENDED")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_audit_verification_sessions")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
