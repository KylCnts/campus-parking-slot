from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from parking.events import deliver_notifications
from parking.models import Category, EventNotification, ParkingArea, ParkingEvent, ParkingSpace, Vehicle
from parking.testing import SmtpSink

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
        self.s1 = ParkingSpace.objects.create(slot_number="A-01", area=self.area, category=Category.FACULTY)
        self.s2 = ParkingSpace.objects.create(slot_number="A-02", area=self.area, category=Category.FACULTY)
        self.fac = self.faculty(1)

    def faculty(self, i, **extra):
        user = User.objects.create_user(email=f"f{i}@x.edu", password=PW, full_name=f"Faculty {i}", role="FACULTY", id_number=f"F{i}", **extra)
        user.car = Vehicle.objects.create(plate_number=f"FAC {i}00", owner=user, category=Category.FACULTY)
        return user

    def event_body(self, **over):
        day = timezone.localdate() + timedelta(days=3)
        return {
            "name": "Foundation Day", "description": "Campus program", "event_date": day.isoformat(), "start_time": "08:00",
            "end_time": "17:00", "space_ids": [self.s1.pk], "publish": True, **over,
        }


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EventEmailRuleTests(Base):
    def test_recipients_content_and_duplicates(self):
        student = User.objects.create_user(email="sa@x.edu", password=PW, full_name="SA", role="STUDENT", id_number="S1")
        User.objects.create_user(email="pending@x.edu", password=PW, full_name="P", role="FACULTY", id_number="P1", account_status="PENDING")
        User.objects.create_user(email="rejected@x.edu", password=PW, full_name="R", role="STUDENT", id_number="P2", account_status="REJECTED")
        User.objects.create_user(email="suspended@x.edu", password=PW, full_name="U", role="FACULTY", id_number="P3", account_status="SUSPENDED")
        User.objects.create_user(email="archived@x.edu", password=PW, full_name="A", role="FACULTY", id_number="P4", account_status="ARCHIVED")
        c = api(self.admin)
        draft = c.post("/api/events/", self.event_body(publish=False), format="json")
        self.assertEqual((draft.status_code, len(mail.outbox)), (201, 0))
        self.assertEqual(c.post(f"/api/events/{draft.data['id']}/publish/").status_code, 200)
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), [self.fac.email, student.email])
        message = mail.outbox[0]
        self.assertEqual(message.subject, "Campus Parking Advisory – Upcoming Event")
        for text in ("Dear Student / Faculty Member,", "Foundation Day", "Campus program", "Main Building Row", "A-01", "8:00 AM – 5:00 PM", "Campus Parking Management System"):
            self.assertIn(text, message.body)
        self.assertEqual(c.post(f"/api/events/{draft.data['id']}/publish/").status_code, 400)
        self.assertEqual(len(mail.outbox), 2)
        c.patch(f"/api/events/{draft.data['id']}/", {"space_ids": [self.s2.pk]}, format="json")
        self.assertEqual(mail.outbox[-1].subject, "Campus Parking Advisory – Updated Event Details")
        c.post(f"/api/events/{draft.data['id']}/cancel/")
        self.assertEqual(mail.outbox[-1].subject, "Campus Parking Advisory – Event Canceled")
        self.assertEqual(len(mail.outbox), 6)


class RealSmtpTests(Base):
    """These use Django's real SMTP backend against a local SMTP server."""

    def publish(self):
        with patch("parking.events.dispatch_notifications"):
            r = api(self.admin).post("/api/events/", self.event_body(), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return list(EventNotification.objects.values_list("pk", flat=True))

    def test_event_email_travels_over_smtp(self):
        with SmtpSink() as sink, override_settings(
            EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="127.0.0.1", EMAIL_PORT=sink.port,
            EMAIL_USE_TLS=False, EMAIL_HOST_USER="", EMAIL_HOST_PASSWORD="",
        ):
            deliver_notifications(self.publish())
        self.assertEqual(len(sink.messages), 1)
        self.assertEqual(sink.messages[0]["to"], [self.fac.email])
        self.assertIn("Foundation Day", sink.messages[0]["data"])
        n = EventNotification.objects.get()
        self.assertEqual((n.status, n.attempts), ("SENT", 1))

    def test_unreachable_server_is_recorded_and_event_stays_published(self):
        with override_settings(
            EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="127.0.0.1", EMAIL_PORT=1, EMAIL_USE_TLS=False, EMAIL_TIMEOUT=2,
        ):
            deliver_notifications(self.publish())
        n = EventNotification.objects.get()
        self.assertEqual((n.status, n.attempts), ("FAILED", 1))
        self.assertTrue(n.error)
        self.assertEqual(ParkingEvent.objects.get().status, "PUBLISHED")
