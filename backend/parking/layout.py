"""The physical parking layout, traced from the campus reference drawing.

Coordinates are in the map's SVG units (landscape viewBox 0 0 1800 1400). The frontend
draws the site (gates, buildings, walkway, trees); each slot's position lives in the database.

All slots belong to faculty, except the three motorcycle slots students may use.
"""

STUDENT, FACULTY = "STUDENT", "FACULTY"
STUDENT_SLOTS = {"MC-01", "MC-02", "MC-03"}
PORTRAIT_WIDTH = 1400
CAR_WIDTH, CAR_HEIGHT, CAR_PITCH = 118, 150, 158
CAR, MOTORCYCLE = "CAR", "MOTORCYCLE"

AREAS = [
    {"code": "MC", "name": "Motorcycle Parking", "location": "Beside the Guard House, near the gates"},
    {"code": "A", "name": "Main Building Row", "location": "Along the Hallway (Main Building)"},
    {"code": "B", "name": "Center Row", "location": "Center of the parking area, beside the trees"},
    {"code": "C", "name": "DFA Building Row", "location": "Along the pedestrian walkway to the DFA Building"},
    {"code": "D", "name": "Offices Row", "location": "In front of the Offices"},
]


def _slot(area, number, slot_type, x, y, w, h):
    """Positions are traced upright from the drawing, then turned 90 degrees into landscape."""
    slot_number = f"{area}-{number:02d}"
    return {
        "area": area,
        "slot_number": slot_number,
        "category": STUDENT if slot_number in STUDENT_SLOTS else FACULTY,
        "slot_type": slot_type,
        "map_x": y,
        "map_y": PORTRAIT_WIDTH - (x + w),
        "map_w": h,
        "map_h": w,
    }


def _car(area, number, x, y):
    slot_number = f"{area}-{number:02d}"
    return {
        "area": area,
        "slot_number": slot_number,
        "category": FACULTY,
        "slot_type": CAR,
        "map_x": x,
        "map_y": y,
        "map_w": CAR_WIDTH,
        "map_h": CAR_HEIGHT,
    }


def build_slots():
    slots = []
    # Motorcycle parking: two rows beside the guard house (13 + 12).
    for i in range(13):
        slots.append(_slot("MC", i + 1, MOTORCYCLE, 548 + i * 32, 88, 26, 58))
    for i in range(12):
        slots.append(_slot("MC", i + 14, MOTORCYCLE, 564 + i * 32, 178, 26, 58))
    # Car rows are aligned on shared columns, and every box is the same size.
    for i in range(6):
        slots.append(_car("A", i + 1, 458 + i * CAR_PITCH, 1140))
    for i in range(7):
        slots.append(_car("B", i + 1, 300 + i * CAR_PITCH, 641))
    for i in range(7):
        slots.append(_car("C", i + 1, 300 + i * CAR_PITCH, 196))
    for i in range(4):
        slots.append(_car("D", i + 1, 1512, 680 - i * 160))
    return slots


def apply_layout(area_model, space_model):
    """Create the areas and slots that do not exist yet. Safe to run repeatedly."""
    areas = {}
    for a in AREAS:
        area, _ = area_model.objects.get_or_create(
            code=a["code"], defaults={"name": a["name"], "location": a["location"], "description": a["location"]}
        )
        areas[a["code"]] = area
    for s in build_slots():
        values = {k: v for k, v in s.items() if k not in ("area", "slot_number")}
        space_model.objects.get_or_create(slot_number=s["slot_number"], defaults={"area": areas[s["area"]], **values})
