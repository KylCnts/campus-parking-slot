from datetime import datetime, time, timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from parking.layout import build_slots
from parking.models import (
    Category,
    EventNotification,
    ParkingArea,
    ParkingEvent,
    ParkingSettings,
    ParkingSpace,
    Vehicle,
)
from parking.scheduling import process_schedule
from parking.testing import with_id

User = get_user_model()
PW = "Str0ng!Passw0rd"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class ReservationAndEventTests(TransactionTestCase):
    def setUp(self):
        ParkingSpace.objects.all().delete()
        ParkingArea.objects.all().delete()
        self.admin = User.objects.create_superuser(email="admin@x.edu", password=PW)
        self.guard = User.objects.create_user(email="guard@x.edu", password=PW, full_name="Guard", role="ADMIN")
        self.stu = User.objects.create_user(email="stu@x.edu", password=PW, full_name="Stu", role="FACULTY", id_number="S1")
        self.stu2 = User.objects.create_user(email="stu2@x.edu", password=PW, full_name="Stu Two", role="FACULTY", id_number="S2")
        self.car = Vehicle.objects.create(plate_number="CAR 111", owner=self.stu, category=Category.FACULTY)
        self.car2 = Vehicle.objects.create(plate_number="CAR 222", owner=self.stu2, category=Category.FACULTY)
        area = ParkingArea.objects.create(name="Center", code="B")
        self.s1 = ParkingSpace.objects.create(slot_number="B-01", area=area, category=Category.FACULTY)
        self.s2 = ParkingSpace.objects.create(slot_number="B-02", area=area, category=Category.FACULTY)
        self.fac = ParkingSpace.objects.create(slot_number="A-01", area=area, category=Category.STUDENT)
        self.moto = ParkingSpace.objects.create(slot_number="MC-01", area=area, category=Category.FACULTY, slot_type="MOTORCYCLE")

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c


    def event_body(self, spaces, **over):
        day = timezone.localdate() + timedelta(days=3)
        return {
            "name": "Foundation Day", "description": "Program", "event_date": day.isoformat(),
            "start_time": "08:00", "end_time": "17:00", "space_ids": [s.pk for s in spaces], "publish": True, **over,
        }

    def status_of(self, space):
        space.refresh_from_db()
        return space.status

    def test_layout_matches_reference_drawing(self):
        slots = build_slots()
        counts = {}
        for s in slots:
            counts[s["area"]] = counts.get(s["area"], 0) + 1
        self.assertEqual(counts, {"MC": 25, "A": 6, "B": 7, "C": 7, "D": 4})
        self.assertEqual(len({s["slot_number"] for s in slots}), 49)
        self.assertEqual({s["slot_number"] for s in slots if s["category"] == "STUDENT"}, {"MC-01", "MC-02", "MC-03"})
        self.assertTrue(all(s["map_x"] + s["map_w"] <= 1800 and s["map_y"] + s["map_h"] <= 1400 for s in slots))

    def test_demo_seed_builds_the_reference_layout(self):
        call_command("seed_demo", reset=True, verbosity=0, stdout=StringIO())
        live = ParkingSpace.objects.filter(is_archived=False)
        self.assertEqual(live.filter(slot_type="CAR").count(), 24)
        self.assertEqual(live.filter(slot_type="MOTORCYCLE").count(), 25)
        offices = live.filter(area__code="D").order_by("slot_number")
        self.assertEqual({(s.map_w, s.map_h) for s in offices}, {(150, 118)})
        # Still one column in front of the Offices, D-01 nearest the Main Entrance.
        self.assertEqual({s.map_x for s in offices}, {1486})
        self.assertEqual([s.map_y for s in offices], [696, 536, 376, 216])




    def test_only_admin_manages_events(self):
        for user in (self.stu, self.stu2):
            c = self.api(user)
            self.assertEqual(c.post("/api/events/", self.event_body([self.s1]), format="json").status_code, 403)
            self.assertEqual(c.get("/api/events/").status_code, 403)
            self.assertEqual(c.get("/api/event-notifications/").status_code, 403)

    def test_publish_update_cancel_with_emails(self):
        c = self.api(self.admin)
        r = c.post("/api/events/", self.event_body([self.s1]), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        eid = r.data["id"]
        self.assertEqual(self.status_of(self.s1), "AVAILABLE")  # blue only on the event day
        event_day = timezone.make_aware(datetime.combine(timezone.localdate() + timedelta(days=3), time(10, 0)))
        patcher = patch("django.utils.timezone.now", return_value=event_day)
        patcher.start()
        self.addCleanup(patcher.stop)
        process_schedule()
        self.assertEqual(self.status_of(self.s1), "EVENT_RESERVED")

        users = User.objects.filter(is_active=True, role__in=["STUDENT", "FACULTY"]).count()
        self.assertEqual(len(mail.outbox), users)
        self.assertEqual(mail.outbox[0].subject, "Campus Parking Advisory – Upcoming Event")
        self.assertIn("B-01", mail.outbox[0].body)
        self.assertIn("Foundation Day", mail.outbox[0].body)
        self.assertEqual(len(mail.outbox[0].to), 1)  # recipients never see each other

        c.patch(f"/api/events/{eid}/", {"description": "Small wording change"}, format="json")
        self.assertEqual(len(mail.outbox), users)  # no duplicate notice

        r = c.patch(f"/api/events/{eid}/", {"space_ids": [self.s2.pk]}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(mail.outbox), users * 2)
        self.assertEqual(self.status_of(self.s1), "AVAILABLE")
        self.assertEqual(self.status_of(self.s2), "EVENT_RESERVED")

        self.assertEqual(c.post(f"/api/events/{eid}/cancel/").status_code, 200)
        self.assertEqual(self.status_of(self.s2), "AVAILABLE")
        self.assertEqual(len(mail.outbox), users * 3)
        self.assertEqual(EventNotification.objects.filter(status="SENT").count(), users * 3)
        self.assertEqual(c.post(f"/api/events/{eid}/cancel/").status_code, 400)
        self.assertEqual(len(mail.outbox), users * 3)

    def test_event_conflicts(self):
        c = self.api(self.admin)
        self.assertEqual(c.post("/api/events/", self.event_body([self.s1]), format="json").status_code, 201)
        clash = c.post("/api/events/", self.event_body([self.s1], name="Clash", start_time="16:00", end_time="18:00"), format="json")
        self.assertEqual(clash.status_code, 409)
        self.assertEqual(clash.data["conflicts"][0]["slot"], "B-01")
        self.assertFalse(ParkingEvent.objects.filter(name="Clash").exists())
        later = c.post("/api/events/", self.event_body([self.s1], name="Later", start_time="18:00", end_time="20:00"), format="json")
        self.assertEqual(later.status_code, 201)

        bad = c.post("/api/events/", self.event_body([self.s2], start_time="10:00", end_time="09:00"), format="json")
        self.assertEqual(bad.status_code, 400)



    def test_registration_course_and_brand_model(self):
        c = APIClient()
        body = {
            "role": "STUDENT", "full_name": "New Student", "id_number": "2026-1", "email": "new@x.edu", "password": PW, "confirm_password": PW,
            "department": "Bachelor of Science in Social Work (BSSW)", "contact_number": "09171234567", "vehicle_type": "MOTORCYCLE",
            "vehicle_color": "Red", "vehicle_brand_model": "Honda Click 125i", "plate_number": "NEW 100",
        }
        self.assertIn("department", c.post("/api/auth/register/", with_id({**body, "department": "Random Course"}), format="multipart").data)
        self.assertIn("vehicle_type", c.post("/api/auth/register/", with_id({**body, "vehicle_type": "CAR"}), format="multipart").data)
        self.assertIn("vehicle_brand_model", c.post("/api/auth/register/", with_id({**body, "vehicle_brand_model": ""}), format="multipart").data)
        self.assertIn("vehicle_brand_model", c.post("/api/auth/register/", with_id({**body, "vehicle_brand_model": "<script>"}), format="multipart").data)
        r = c.post("/api/auth/register/", with_id(body), format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["department"], body["department"])
        self.assertEqual(r.data["vehicles"][0]["brand_model"], "Honda Click 125i")
        faculty = {**body, "role": "FACULTY", "id_number": "EMP-9", "email": "fac@x.edu", "department": "College of Business", "vehicle_type": "CAR", "vehicle_brand_model": "Toyota Vios", "plate_number": "FAC 100"}
        r = c.post("/api/auth/register/", with_id(faculty), format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Vehicle.objects.get(plate_number="FAC 100").brand_model, "Toyota Vios")
        self.assertEqual(len(c.get("/api/meta/").data["courses"]), 9)

    def test_dashboard_lists_every_area_with_counts_for_students(self):
        student = User.objects.create_user(email="s4@x.edu", password=PW, full_name="Stu Four", role="STUDENT", id_number="S4")
        area = self.api(student).get("/api/dashboard/summary/").data["areas"][0]
        self.assertEqual((area["total_spaces"], area["available_spaces"], area["event_reserved_spaces"]), (4, 4, 0))

    def test_finished_event_releases_slots_unless_in_use(self):
        c = self.api(self.admin)
        self.api(self.guard).post("/api/transactions/entry/", {"plate_number": "CAR 222", "space": self.s2.pk}, format="json")
        eid = c.post("/api/events/", self.event_body([self.s1, self.s2]), format="json").data["id"]
        ParkingEvent.objects.filter(pk=eid).update(ends_at=timezone.now() - timedelta(minutes=1))
        process_schedule()
        self.assertEqual(ParkingEvent.objects.get(pk=eid).status, "COMPLETED")
        self.assertEqual(self.status_of(self.s1), "AVAILABLE")
        self.assertEqual(self.status_of(self.s2), "OCCUPIED")

    @override_settings(EMAIL_BACKEND="parking.tests_events.FailingBackend")
    def test_email_failure_is_recorded_and_does_not_block_publishing(self):
        from parking.events import deliver_notifications

        c = self.api(self.admin)
        r = c.post("/api/events/", self.event_body([self.s1]), format="json")
        self.assertEqual(r.status_code, 201)
        deliver_notifications(list(EventNotification.objects.values_list("pk", flat=True)))
        n = EventNotification.objects.first()
        self.assertEqual(n.status, "FAILED")
        self.assertIn("mail server down", n.error)
        self.assertEqual(ParkingEvent.objects.get().status, "PUBLISHED")



from django.core.mail.backends.base import BaseEmailBackend  # noqa: E402


class FailingBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        raise OSError("mail server down")
