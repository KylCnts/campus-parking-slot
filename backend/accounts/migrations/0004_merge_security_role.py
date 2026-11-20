from django.db import migrations


def forward(apps, schema_editor):
    """The administrator is the security guard: former security accounts become administrators."""
    User = apps.get_model("accounts", "User")
    AuditLog = apps.get_model("parking", "AuditLog")
    for user in User.objects.filter(role="SECURITY"):
        user.role = "ADMIN"
        user.is_staff = True
        user.save(update_fields=["role", "is_staff"])
        AuditLog.objects.create(
            actor_name="System migration",
            action="ROLE_CONSOLIDATED",
            target_type="User",
            target_id=str(user.pk),
            target_label=user.email,
            previous_value={"role": "SECURITY"},
            new_value={"role": "ADMIN"},
            reason="Administrator and Security Guard were combined into one role.",
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_existing_accounts_status"),
        ("parking", "0008_audit_trail_immutable"),
    ]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
