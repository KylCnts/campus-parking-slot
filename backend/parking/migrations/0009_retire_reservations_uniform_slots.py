from django.db import migrations

from parking.layout import build_slots


def forward(apps, schema_editor):
    Reservation = apps.get_model("parking", "Reservation")
    Space = apps.get_model("parking", "ParkingSpace")

    # Reservation history is kept, but nothing can remain active.
    Reservation.objects.filter(status="ACTIVE").update(status="CANCELLED")
    Space.objects.filter(status="RESERVED").update(status="AVAILABLE")

    # Every car box now has the same size. Slot status and history are untouched.
    for s in build_slots():
        Space.objects.filter(slot_number=s["slot_number"], is_archived=False).update(
            map_x=s["map_x"], map_y=s["map_y"], map_w=s["map_w"], map_h=s["map_h"]
        )


class Migration(migrations.Migration):
    dependencies = [("parking", "0008_audit_trail_immutable")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
