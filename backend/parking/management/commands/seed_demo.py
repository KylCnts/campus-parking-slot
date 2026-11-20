"""Populate the database with demo accounts, parking areas, spaces and history.

    python manage.py seed_demo            # add demo data (skips if already seeded)
    python manage.py seed_demo --reset    # wipe parking data + demo users first
"""
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.constants import COURSES
from parking.layout import apply_layout
from parking.models import (
    ActivityLog,
    Category,
    EventNotification,
    IncidentReport,
    Notification,
    ParkingArea,
    ParkingEvent,
    ParkingSettings,
    ParkingSpace,
    ParkingTransaction,
    Reservation,
    Vehicle,
)

User = get_user_model()
PASSWORD = "Parking@2026"

FIRST = ["Juan", "Maria", "Jose", "Ana", "Mark", "Grace", "Paolo", "Carla", "Miguel", "Bea", "Rafael", "Joy",
         "Kevin", "Trisha", "Daniel", "Nicole", "Carlo", "Angela", "Jerome", "Faith", "Ivan", "Kim", "Leo", "Mae"]
LAST = ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Villanueva",
        "Castro", "Aquino", "Navarro", "Domingo", "Lopez", "Dela Cruz"]
BRANDS = {"MOTORCYCLE": ["Honda Click 125i", "Yamaha Mio", "Yamaha NMAX", "Honda Beat", "Suzuki Raider 150"], "CAR": ["Toyota Vios", "Honda City", "Mitsubishi Mirage"]}
DEPTS = ["College of Computing", "College of Engineering", "College of Nursing", "College of Business", "College of Arts & Sciences"]
COLORS = ["White", "Black", "Silver", "Gray", "Red", "Blue", "Maroon"]
TYPES = [Vehicle.VehicleType.CAR, Vehicle.VehicleType.CAR, Vehicle.VehicleType.MOTORCYCLE, Vehicle.VehicleType.SUV, Vehicle.VehicleType.VAN]


def plate(rng):
    letters = "".join(rng.choice("ABCDEFGHJKLMNPRSTUVWXYZ") for _ in range(3))
    return f"{letters} {rng.randint(1000, 9999)}"


class Command(BaseCommand):
    help = "Seed demo data for the campus parking system."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing parking data and demo users first.")

    @transaction.atomic
    def handle(self, *args, **opts):
        rng = random.Random(42)
        if opts["reset"]:
            for m in (EventNotification, ParkingEvent, Reservation, IncidentReport, Notification, ActivityLog, ParkingTransaction, Vehicle, ParkingSpace, ParkingArea):
                m.objects.all().delete()
            User.objects.filter(email__endswith="@campus.edu").delete()
        elif ParkingArea.objects.exists():
            self.stdout.write(self.style.WARNING("Data already present. Use --reset to re-seed."))
            return

        ParkingSettings.load()

        admin = User.objects.create_superuser(email="admin@campus.edu", password=PASSWORD, full_name="Admin Dela Cruz", id_number="EMP-0001", department="Campus Administration", contact_number="09171234567")
        guards = [admin]

        used_plates = set()

        def new_plate():
            while True:
                p = plate(rng)
                if p not in used_plates:
                    used_plates.add(p)
                    return p

        people = []
        for i in range(13):
            role = User.Role.STUDENT if i < 3 else User.Role.FACULTY
            name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            if i == 0:
                email, name = "student@campus.edu", "Juan Santos"
            elif i == 3:
                email, name = "faculty@campus.edu", "Dr. Maria Reyes"
            else:
                email = f"{name.lower().replace(' ', '.').replace('dr..', '')}{i}@campus.edu"
            u = User.objects.create_user(
                email=email,
                password=PASSWORD,
                full_name=name,
                role=role,
                id_number=(f"2023-{10000 + i}" if role == User.Role.STUDENT else f"EMP-{1000 + i}"),
                department=rng.choice(COURSES if role == User.Role.STUDENT else DEPTS),
                contact_number=f"09{rng.randint(100000000, 999999999)}",
            )
            vehicle_type = Vehicle.VehicleType.MOTORCYCLE if role == User.Role.STUDENT else rng.choice(TYPES)
            brand = rng.choice(BRANDS["MOTORCYCLE" if vehicle_type == Vehicle.VehicleType.MOTORCYCLE else "CAR"])
            v = Vehicle.objects.create(plate_number=new_plate(), owner=u, category=role, vehicle_type=vehicle_type, color=rng.choice(COLORS), brand_model=brand)
            people.append(v)
        # A few gate-registered visitors without accounts
        for i in range(4):
            people.append(Vehicle.objects.create(plate_number=new_plate(), owner_name=f"{rng.choice(FIRST)} {rng.choice(LAST)}", category=Category.STUDENT, vehicle_type=Vehicle.VehicleType.MOTORCYCLE, color=rng.choice(COLORS)))

        apply_layout(ParkingArea, ParkingSpace)
        spaces = {}
        for s in ParkingSpace.objects.all():
            spaces.setdefault((s.category, s.slot_type), []).append(s)

        # 60 days of completed history
        now = timezone.now()
        today = timezone.localdate()
        hist = []
        for day_offset in range(60, 0, -1):
            day = today - timedelta(days=day_offset)
            weekend = day.weekday() >= 5
            count = rng.randint(3, 8) if weekend else rng.randint(14, 28)
            for v in rng.sample(people, min(count, len(people))):
                sp = rng.choice(spaces[(v.category, v.required_slot_type)])
                hour = rng.choice([6, 7, 7, 8, 8, 8, 9, 9, 10, 11, 12, 13, 14, 15])
                entry = timezone.make_aware(timezone.datetime(day.year, day.month, day.day, hour, rng.randint(0, 59)))
                exit_ = entry + timedelta(minutes=rng.randint(45, 9 * 60))
                hist.append(ParkingTransaction(vehicle=v, space=sp, category=v.category, entry_time=entry, exit_time=exit_, status="COMPLETED", entry_recorded_by=rng.choice(guards), exit_recorded_by=rng.choice(guards)))
        ParkingTransaction.objects.bulk_create(hist)

        # Today: some completed and some currently parked
        rng.shuffle(people)
        active_count = 0
        for v in people[:22]:
            free = [s for s in spaces[(v.category, v.required_slot_type)] if s.status == ParkingSpace.Status.AVAILABLE]
            if not free:
                continue
            sp = rng.choice(free)
            entry = now - timedelta(minutes=rng.randint(20, 300))
            if entry.date() != now.date():
                entry = now - timedelta(minutes=rng.randint(5, 30))
            if active_count < 17:
                ParkingTransaction.objects.create(vehicle=v, space=sp, category=v.category, entry_time=entry, status="ACTIVE", entry_recorded_by=guards[0])
                sp.status = ParkingSpace.Status.OCCUPIED
                sp.save()
                active_count += 1
            else:
                ParkingTransaction.objects.create(vehicle=v, space=sp, category=v.category, entry_time=entry, exit_time=min(now, entry + timedelta(minutes=rng.randint(10, 60))), status="COMPLETED", entry_recorded_by=guards[0], exit_recorded_by=guards[0])

        IncidentReport.objects.create(reported_by=guards[0], kind=IncidentReport.Kind.WRONG_SPACE, subject="Vehicle parked in a different slot than recorded", description="Vehicle recorded at EN-03 was found parked at EN-04. Please verify and correct the record.", plate_number=people[0].plate_number)
        ActivityLog.objects.create(user=admin, action="SEED", description="Demo data seeded.")

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {ParkingSpace.objects.count()} spaces, {Vehicle.objects.count()} vehicles, "
            f"{ParkingTransaction.objects.count()} transactions ({active_count} active).\n"
            f"Logins (password {PASSWORD}): admin@campus.edu, student@campus.edu, faculty@campus.edu"
        ))
