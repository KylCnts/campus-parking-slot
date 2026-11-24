"""Choice lists used by the registration and vehicle forms."""

COURSES = [
    "Bachelor of Arts in English Language Studies (ABELS)",
    "Bachelor of Science in Accountancy (BSA)",
    "Bachelor of Science in Entrepreneurship (BSE)",
    "Bachelor of Science in Information Technology (BSIT)",
    "Bachelor of Science in Public Administration (BSPA)",
    "Bachelor of Science in Social Work (BSSW)",
    "Bachelor of Science in Accounting Information System (BSAIS)",
    "Bachelor of Technical-Vocational Teacher Education (BTVTEd)",
    "Diploma in Hotel and Restaurant Services (DHRS)",
]

# Vehicle colors accepted by every vehicle form: (stored name, swatch color shown in the interface).
VEHICLE_COLORS = [
    ("White", "#f8fafc"),
    ("Black", "#111827"),
    ("Silver", "#c0c6cf"),
    ("Gray", "#6b7280"),
    ("Red", "#dc2626"),
    ("Maroon", "#7f1d1d"),
    ("Orange", "#ea580c"),
    ("Yellow", "#facc15"),
    ("Gold", "#b8912f"),
    ("Beige", "#d6c7a1"),
    ("Brown", "#78462a"),
    ("Green", "#16a34a"),
    ("Blue", "#2563eb"),
    ("Navy Blue", "#1e3a8a"),
    ("Purple", "#7c3aed"),
    ("Pink", "#ec4899"),
    ("Multicolor", "linear-gradient(135deg, #dc2626, #facc15, #16a34a, #2563eb)"),
]
VEHICLE_COLOR_NAMES = [name for name, _ in VEHICLE_COLORS]
