from datetime import time

from django.db import migrations

from parking.layout import build_slots


def forward(apps, schema_editor):
    Area = apps.get_model("parking", "ParkingArea")
    Space = apps.get_model("parking", "ParkingSpace")
    Settings = apps.get_model("parking", "ParkingSettings")

    # Only position and ownership change; slot status and history are left alone.
    for s in build_slots():
        Space.objects.filter(slot_number=s["slot_number"], is_archived=False).update(
            category=s["category"], map_x=s["map_x"], map_y=s["map_y"], map_w=s["map_w"], map_h=s["map_h"]
        )
    Area.objects.filter(code="D").update(
        name="Offices Row", location="In front of the Offices", description="In front of the Offices"
    )
    Settings.objects.update(closing_time=time(19, 30))


class Migration(migrations.Migration):
    dependencies = [("parking", "0005_landscape_settings")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
