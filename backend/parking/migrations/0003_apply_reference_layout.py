from django.db import migrations

from parking.layout import AREAS, apply_layout, build_slots


def forward(apps, schema_editor):
    Area = apps.get_model("parking", "ParkingArea")
    Space = apps.get_model("parking", "ParkingSpace")
    Txn = apps.get_model("parking", "ParkingTransaction")

    # Keep the old slots (and all parking history) but take them out of service.
    Space.objects.update(is_archived=True, status="AVAILABLE", admin_reserved=False)
    Area.objects.update(is_active=False)
    layout_numbers = {s["slot_number"] for s in build_slots()}
    for old in Space.objects.filter(slot_number__in=layout_numbers):
        old.slot_number = f"OLD-{old.slot_number}"[:20]
        old.save(update_fields=["slot_number"])

    apply_layout(Area, Space)
    Area.objects.filter(code__in=[a["code"] for a in AREAS]).update(is_active=True)

    # Vehicles parked right now move to a matching slot on the new map.
    free = list(Space.objects.filter(is_archived=False).order_by("slot_number"))
    for txn in Txn.objects.filter(status="ACTIVE").select_related("vehicle").order_by("entry_time"):
        slot_type = "MOTORCYCLE" if txn.vehicle.vehicle_type == "MOTORCYCLE" else "CAR"
        matches = [s for s in free if s.slot_type == slot_type]
        slot = next((s for s in matches if s.category == txn.category), matches[0] if matches else None)
        if slot:
            free.remove(slot)
            txn.space = slot
            txn.save(update_fields=["space"])
            slot.status = "OCCUPIED"
            slot.save(update_fields=["status"])


class Migration(migrations.Migration):
    dependencies = [("parking", "0002_parking_map_reservations_events")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
