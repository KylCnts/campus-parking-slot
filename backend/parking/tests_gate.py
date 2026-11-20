import threading
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.constants import STUDENT_LIMIT_MESSAGE
from parking.layout import build_slots
from parking.models import AuditLog, Category, ParkingArea, ParkingSpace, ParkingTransaction, Vehicle
from parking.testing import with_id

User = get_user_model()
PW = "Str0ng!Passw0rd"


def api(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


class Base(TransactionTestCase):
    def setUp(self):
        ParkingSpace.objects.all().delete()
        ParkingArea.objects.all().delete()
        self.admin = User.objects.create_superuser(email="admin@x.edu", password=PW, full_name="Head Admin")
        self.area = ParkingArea.objects.create(name="Main Building Row", code="A")
        self.car_slot = ParkingSpace.objects.create(slot_number="A-01", area=self.area, category=Category.FACULTY)
        self.car_slot2 = ParkingSpace.objects.create(slot_number="A-02", area=self.area, category=Category.FACULTY)
        self.moto_slot = ParkingSpace.objects.create(slot_number="MC-01", area=self.area, category=Category.STUDENT, slot_type="MOTORCYCLE")
        self.faculty_user = self.person(1, "FACULTY", "CAR")

    def person(self, i, role, vehicle_type, **extra):
        user = User.objects.create_user(email=f"u{i}@x.edu", password=PW, full_name=f"User {i}", role=role, id_number=f"U{i}", **extra)
        user.vehicle = Vehicle.objects.create(plate_number=f"PLT {i}00", owner=user, category=role, vehicle_type=vehicle_type, brand_model="Toyota Vios")
        return user

    def enter(self, user, space):
        return api(self.admin).post("/api/transactions/entry/", {"plate_number": user.vehicle.plate_number, "space": space.pk}, format="json")


class GateEntryTests(Base):
    def test_admin_records_entry_and_exit(self):
        found = api(self.admin).get("/api/vehicles/lookup/", {"plate": "plt 100"}).data["results"][0]["vehicle"]
        self.assertEqual(
            (found["owner_display"], found["owner_email"], found["owner_role_display"], found["brand_model"]),
            ("User 1", "u1@x.edu", "Faculty Member", "Toyota Vios"),
        )
        r = self.enter(self.faculty_user, self.car_slot)
        self.assertEqual(r.status_code, 201, r.data)
        self.car_slot.refresh_from_db()
        self.assertEqual(self.car_slot.status, "OCCUPIED")
        session = ParkingTransaction.objects.get()
        self.assertEqual((session.entry_recorded_by, session.source), (self.admin, "GATE"))
        self.assertEqual(session.session_logs.first().action, "STARTED")
        self.assertEqual(api(self.faculty_user).get("/api/sessions/current/").data["slot_number"], "A-01")
        self.assertIn("already parked", str(self.enter(self.faculty_user, self.car_slot2).data))
        self.assertEqual(api(self.admin).post(f"/api/transactions/{session.pk}/exit/").status_code, 200)
        self.car_slot.refresh_from_db()
        self.assertEqual(self.car_slot.status, "AVAILABLE")

    def test_users_cannot_record_their_own_parking(self):
        sa = self.person(2, "STUDENT", "MOTORCYCLE")
        self.enter(self.faculty_user, self.car_slot)
        sid = ParkingTransaction.objects.get().pk
        for user in (self.faculty_user, sa):
            c = api(user)
            self.assertEqual(c.post("/api/transactions/entry/", {"plate_number": user.vehicle.plate_number}, format="json").status_code, 403)
            self.assertEqual(c.post(f"/api/transactions/{sid}/exit/").status_code, 403)
            self.assertEqual(c.post("/api/sessions/start/", {"space": self.car_slot2.pk}, format="json").status_code, 404)
            self.assertEqual(c.post(f"/api/sessions/{sid}/release/").status_code, 404)
            self.assertEqual(c.post(f"/api/sessions/{sid}/extend/", {}, format="json").status_code, 404)

    def test_only_registered_approved_vehicles_can_enter(self):
        r = api(self.admin).post("/api/transactions/entry/", {"plate_number": "NEW 999", "space": self.car_slot.pk}, format="json")
        self.assertIn("No registered vehicle", str(r.data))
        self.assertFalse(Vehicle.objects.filter(plate_number="NEW 999").exists())
        for i, status in enumerate(["PENDING", "REJECTED", "SUSPENDED", "ARCHIVED"], start=10):
            self.assertIn("approved and active", str(self.enter(self.person(i, "FACULTY", "CAR", account_status=status), self.car_slot).data))
        self.assertEqual(ParkingTransaction.objects.count(), 0)

    def test_student_assistant_motorcycle_rules(self):
        sa = self.person(2, "STUDENT", "MOTORCYCLE")
        self.assertEqual(self.enter(sa, self.car_slot).status_code, 400)
        faculty_moto = ParkingSpace.objects.create(slot_number="MC-04", area=self.area, category=Category.FACULTY, slot_type="MOTORCYCLE")
        self.assertEqual(self.enter(sa, faculty_moto).status_code, 400)
        self.assertEqual(self.enter(sa, self.moto_slot).status_code, 201)
        self.assertEqual(ParkingTransaction.objects.get().category, "STUDENT")
        car = User.objects.create_user(email="c@x.edu", password=PW, full_name="Car Student", role="STUDENT", id_number="C1")
        car.vehicle = Vehicle.objects.create(plate_number="CAR 123", owner=car, category="STUDENT", vehicle_type="CAR")
        self.assertIn("motorcycles", str(self.enter(car, self.car_slot).data))
        bad = api(self.admin).post("/api/vehicles/", {"plate_number": "SAC 111", "owner": sa.pk, "vehicle_type": "CAR", "category": "FACULTY", "color": "Red"}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_faculty_may_still_use_cars_and_motorcycles(self):
        moto_user = self.person(3, "FACULTY", "MOTORCYCLE")
        faculty_moto = ParkingSpace.objects.create(slot_number="MC-04", area=self.area, category=Category.FACULTY, slot_type="MOTORCYCLE")
        self.assertEqual(self.enter(moto_user, faculty_moto).status_code, 201)
        self.assertEqual(self.enter(self.faculty_user, self.car_slot).status_code, 201)

    def test_two_guards_cannot_fill_the_same_box(self):
        crowd = [self.person(i, "FACULTY", "CAR") for i in range(20, 26)]
        results = []
        barrier = threading.Barrier(len(crowd))

        def attempt(user):
            barrier.wait()
            try:
                results.append(self.enter(user, self.car_slot).status_code)
            finally:
                connection.close()

        threads = [threading.Thread(target=attempt, args=[u]) for u in crowd]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(sorted(results), [201, 400, 400, 400, 400, 400])

    def test_layout_and_roles(self):
        cars = [s for s in build_slots() if s["slot_type"] == "CAR"]
        self.assertEqual({(s["map_w"], s["map_h"]) for s in cars}, {(118, 150)})
        self.assertEqual(sorted(User.Role.values), ["ADMIN", "FACULTY", "STUDENT"])
        self.assertEqual(ParkingSpace.Status.values, ["AVAILABLE", "OCCUPIED", "EVENT_RESERVED"])


class StudentAssistantLimitTests(Base):
    def register(self, i):
        body = {
            "role": "STUDENT", "full_name": f"Assistant {i}", "id_number": f"SA-{i}", "email": f"sa{i}@x.edu", "password": PW, "confirm_password": PW,
            "department": "Bachelor of Science in Accountancy (BSA)", "contact_number": "09171234567", "vehicle_type": "MOTORCYCLE",
            "vehicle_color": "Red", "vehicle_brand_model": "Honda Beat", "plate_number": f"SAR {i}00",
        }
        return api().post("/api/auth/register/", with_id(body), format="multipart")

    def admin_body(self, i, **over):
        return {
            "full_name": f"Admin Made {i}", "email": f"made{i}@x.edu", "role": "STUDENT", "password": PW, "id_number": f"AM-{i}",
            "vehicle_plate": f"AMD {i}00", "vehicle_color": "Black", "vehicle_brand_model": "Yamaha Mio", **over,
        }

    def test_registration_closes_after_three(self):
        self.assertTrue(api().get("/api/meta/").data["student_assistant_registration_open"])
        for i in range(3):
            self.assertEqual(self.register(i).status_code, 201)
        closed = self.register(3)
        self.assertEqual(closed.status_code, 400)
        self.assertIn(STUDENT_LIMIT_MESSAGE, str(closed.data))
        self.assertFalse(api().get("/api/meta/").data["student_assistant_registration_open"])
        self.assertEqual(User.objects.filter(role="STUDENT").count(), 3)

    def test_admin_creates_accounts_within_the_limit(self):
        c = api(self.admin)
        missing = c.post("/api/users/", self.admin_body(0, vehicle_plate=""), format="json")
        self.assertIn("vehicle_plate", missing.data)
        for i in range(3):
            r = c.post("/api/users/", self.admin_body(i), format="json")
            self.assertEqual(r.status_code, 201, r.data)
        vehicle = Vehicle.objects.get(plate_number="AMD 000")
        self.assertEqual((vehicle.vehicle_type, vehicle.category, vehicle.owner.account_status), ("MOTORCYCLE", "STUDENT", "APPROVED"))
        self.assertIn(STUDENT_LIMIT_MESSAGE, str(c.post("/api/users/", self.admin_body(3), format="json").data))
        faculty = c.patch(f"/api/users/{self.faculty_user.pk}/", {"role": "STUDENT"}, format="json")
        self.assertEqual(faculty.status_code, 400)

    def test_archiving_frees_a_place_and_restore_respects_the_limit(self):
        c = api(self.admin)
        ids = [c.post("/api/users/", self.admin_body(i), format="json").data["id"] for i in range(3)]
        c.post(f"/api/users/{ids[0]}/archive/", {"reason": "No longer an assistant"}, format="json")
        self.assertEqual(c.post("/api/users/", self.admin_body(3), format="json").status_code, 201)
        self.assertIn(STUDENT_LIMIT_MESSAGE, str(c.post(f"/api/users/{ids[0]}/restore/").data))


class ResetCommandTests(Base):
    def test_removes_only_student_assistants_and_keeps_history(self):
        sa = self.person(2, "STUDENT", "MOTORCYCLE")
        self.enter(sa, self.moto_slot)
        session = ParkingTransaction.objects.get()
        api(self.admin).post(f"/api/transactions/{session.pk}/exit/")
        with self.assertRaises(Exception):
            call_command("reset_student_assistants", stdout=StringIO())
        call_command("reset_student_assistants", confirm=True, stdout=StringIO())
        self.assertFalse(User.objects.filter(role="STUDENT").exists())
        self.assertTrue(User.objects.filter(pk=self.faculty_user.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())
        vehicle = Vehicle.objects.get(plate_number="PLT 200")
        self.assertEqual((vehicle.owner, vehicle.owner_name, vehicle.is_active), (None, "User 2", False))
        self.assertTrue(ParkingTransaction.objects.filter(pk=session.pk).exists())
        self.assertEqual(AuditLog.objects.filter(action="STUDENT_ASSISTANT_REMOVED").count(), 1)
        self.assertIn("No registered vehicle", str(api(self.admin).post("/api/transactions/entry/", {"plate_number": "PLT 200"}, format="json").data))
        reused = api(self.admin).post("/api/users/", {
            "full_name": "New Assistant", "email": "new@x.edu", "role": "STUDENT", "password": PW,
            "vehicle_plate": "PLT 200", "vehicle_color": "Red", "vehicle_brand_model": "Honda Beat",
        }, format="json")
        self.assertEqual(reused.status_code, 201, reused.data)
        vehicle.refresh_from_db()
        self.assertEqual((vehicle.owner.email, vehicle.is_active), ("new@x.edu", True))


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", EMAIL_BLOCKED_DOMAINS=["campus.edu"])
class EmailRecipientTests(Base):
    def test_demo_domains_are_never_emailed(self):
        User.objects.create_user(email="demo@campus.edu", password=PW, full_name="Demo", role="FACULTY", id_number="D1")
        body = {
            "name": "Foundation Day", "event_date": (timezone.localdate() + timedelta(days=3)).isoformat(), "start_time": "08:00",
            "end_time": "17:00", "space_ids": [self.car_slot.pk], "publish": True,
        }
        self.assertEqual(api(self.admin).post("/api/events/", body, format="json").status_code, 201)
        self.assertEqual([m.to[0] for m in mail.outbox], ["u1@x.edu"])
