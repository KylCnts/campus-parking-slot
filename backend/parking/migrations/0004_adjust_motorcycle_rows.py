from django.db import migrations

from parking.layout import build_slots


def forward(apps, schema_editor):
    Space = apps.get_model("parking", "ParkingSpace")
    for s in build_slots():
        if s["area"] == "MC":
            Space.objects.filter(slot_number=s["slot_number"], is_archived=False).update(map_y=s["map_y"], map_h=s["map_h"])


class Migration(migrations.Migration):
    dependencies = [("parking", "0003_apply_reference_layout")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
