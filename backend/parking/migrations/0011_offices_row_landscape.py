from django.db import migrations

# The four Offices Row boxes turn from upright (118 x 150) to landscape (150 x 118).
# Each box keeps its vertical centre, so it stays in front of the same part of the Offices;
# the column moves 10 units left so the wider boxes clear the Offices wall corner (x=1640).
# Only the map position changes; slot status, category and parking history are left alone.
LANDSCAPE = {
    "D-01": (1486.0, 696.0, 150.0, 118.0),
    "D-02": (1486.0, 536.0, 150.0, 118.0),
    "D-03": (1486.0, 376.0, 150.0, 118.0),
    "D-04": (1486.0, 216.0, 150.0, 118.0),
}
PORTRAIT = {
    "D-01": (1512.0, 680.0, 118.0, 150.0),
    "D-02": (1512.0, 520.0, 118.0, 150.0),
    "D-03": (1512.0, 360.0, 118.0, 150.0),
    "D-04": (1512.0, 200.0, 118.0, 150.0),
}


def _apply(positions):
    def run(apps, schema_editor):
        Space = apps.get_model("parking", "ParkingSpace")
        for slot, (x, y, w, h) in positions.items():
            Space.objects.filter(slot_number=slot, is_archived=False).update(map_x=x, map_y=y, map_w=w, map_h=h)

    return run


class Migration(migrations.Migration):
    dependencies = [("parking", "0010_role_and_reservation_cleanup")]
    operations = [migrations.RunPython(_apply(LANDSCAPE), _apply(PORTRAIT))]
