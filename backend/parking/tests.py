from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application
from parking.testing import with_id
from parking.models import Category, ParkingArea, ParkingSpace, ParkingTransaction, Vehicle

User = get_user_model()
PW = "Str0ng!Passw0rd"


class ParkingFlowTests(TransactionTestCase):
    def setUp(self):
        ParkingSpace.objects.all().delete()  # start from an empty lot, without the migrated map
        ParkingArea.objects.all().delete()
        self.admin = User.objects.create_superuser(email="a@x.edu", password=PW)
        self.guard = User.objects.create_user(email="g@x.edu", password=PW, full_name="Guard", role="ADMIN")
        self.student = User.objects.create_user(email="s@x.edu", password=PW, full_name="Stu", role="STUDENT", id_number="S1")
        self.vehicle = Vehicle.objects.create(plate_number="abc 123", owner=self.student, category=Category.STUDENT, vehicle_type="MOTORCYCLE")
        area = ParkingArea.objects.create(name="Lot A", code="A")
        self.s1 = ParkingSpace.objects.create(slot_number="A-01", area=area, category=Category.STUDENT, slot_type="MOTORCYCLE")
        self.s2 = ParkingSpace.objects.create(slot_number="A-02", area=area, category=Category.STUDENT, slot_type="MOTORCYCLE")
        self.f1 = ParkingSpace.objects.create(slot_number="F-01", area=area, category=Category.FACULTY)

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_entry_and_exit_flow(self):
        c = self.client_for(self.guard)
        r = c.post("/api/transactions/entry/", {"plate_number": "ABC 123", "space": self.s1.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.status, "OCCUPIED")

        # Duplicate active transaction is rejected
        r2 = c.post("/api/transactions/entry/", {"plate_number": "abc 123", "space": self.s2.pk}, format="json")
        self.assertEqual(r2.status_code, 400)
        self.assertIn("already parked", str(r2.data))

        # Lookup shows the active transaction
        r3 = c.get("/api/vehicles/lookup/", {"plate": "abc 123"})
        self.assertIsNotNone(r3.data["results"][0]["active_transaction"])

        txn_id = r.data["id"]
        r4 = c.post(f"/api/transactions/{txn_id}/exit/")
        self.assertEqual(r4.status_code, 200)
        self.assertEqual(r4.data["status"], "COMPLETED")
        self.assertIsNotNone(r4.data["exit_time"])
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.status, "AVAILABLE")
        # Double exit rejected
        self.assertEqual(c.post(f"/api/transactions/{txn_id}/exit/").status_code, 400)
        # Owner was notified
        self.assertTrue(self.student.notifications.filter(title__icontains="exit").exists())

    def test_category_and_status_rules(self):
        c = self.client_for(self.guard)
        r = c.post("/api/transactions/entry/", {"plate_number": "ABC 123", "space": self.f1.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        self.s2.status = "EVENT_RESERVED"
        self.s2.save()
        r = c.post("/api/transactions/entry/", {"plate_number": "ABC 123", "space": self.s2.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        # Auto-assign picks an available student slot
        r = c.post("/api/transactions/entry/", {"plate_number": "ABC 123"}, format="json")
        self.assertEqual(r.data["slot_number"], "A-01")


    def test_permissions(self):
        sc = self.client_for(self.student)
        self.assertEqual(sc.post("/api/transactions/entry/", {"plate_number": "ABC 123"}, format="json").status_code, 403)
        self.assertEqual(sc.get("/api/transactions/").status_code, 403)
        self.assertEqual(sc.patch(f"/api/spaces/{self.s1.pk}/", {"status": "RESERVED"}, format="json").status_code, 403)
        self.assertEqual(sc.get("/api/users/").status_code, 403)
        # Student only sees student spaces
        slots = [s["slot_number"] for s in sc.get("/api/spaces/").data["results"]]
        self.assertNotIn("F-01", slots)
        # Admin cannot manually mark occupied
        ac = self.client_for(self.admin)
        ac.patch(f"/api/spaces/{self.s1.pk}/", {"status": "OCCUPIED"}, format="json")
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.status, "AVAILABLE")

    def test_websocket_receives_update_on_entry(self):
        from channels.db import database_sync_to_async

        token = str(AccessToken.for_user(self.student))
        guard_client = self.client_for(self.guard)

        async def run():
            comm = WebsocketCommunicator(application, f"/ws/parking/?token={token}", headers=[(b"origin", b"http://localhost")])
            ok, _ = await comm.connect()
            assert ok
            first = await comm.receive_json_from()
            assert first["event"] == "connected"
            r = await database_sync_to_async(guard_client.post)(
                "/api/transactions/entry/", {"plate_number": "ABC 123"}, format="json"
            )
            assert r.status_code == 201, r.data
            msgs = []
            for _ in range(3):
                try:
                    msgs.append(await comm.receive_json_from(timeout=2))
                except Exception:
                    break  # timeout cancels the app, so no disconnect needed
            else:
                await comm.disconnect()
            return msgs

        msgs = async_to_sync(run)()
        events = [m.get("event") for m in msgs if m["type"] == "parking.update"]
        self.assertIn("vehicle.entry", events)
        upd = next(m for m in msgs if m.get("event") == "vehicle.entry")
        self.assertEqual(upd["summary"]["student"]["occupied"], 1)
        self.assertTrue(any(m["type"] == "notification.new" for m in msgs))

    @override_settings(
        ALLOWED_HOSTS=["campus-parking-slot.onrender.com"],
        CORS_ALLOWED_ORIGINS=["https://campus-parking-slot.vercel.app"],
    )
    def test_websocket_accepts_the_separately_hosted_frontend(self):
        """Production: the frontend (Vercel) is on another domain than the backend (Render)."""
        token = str(AccessToken.for_user(self.student))

        async def connect(origin):
            comm = WebsocketCommunicator(application, f"/ws/parking/?token={token}", headers=[(b"origin", origin)])
            ok, _ = await comm.connect()
            if ok:
                await comm.disconnect()
            return ok

        self.assertTrue(async_to_sync(connect)(b"https://campus-parking-slot.vercel.app"))
        self.assertTrue(async_to_sync(connect)(b"https://campus-parking-slot.onrender.com"))
        self.assertFalse(async_to_sync(connect)(b"https://evil.example.com"))
        self.assertFalse(async_to_sync(connect)(b"http://campus-parking-slot.vercel.app"))  # scheme must match too

    def test_websocket_rejects_bad_token(self):
        async def run():
            comm = WebsocketCommunicator(application, "/ws/parking/?token=bad", headers=[(b"origin", b"http://localhost")])
            ok, _ = await comm.connect()
            return ok

        self.assertFalse(async_to_sync(run)())

    def test_reports_and_analytics(self):
        g = self.client_for(self.guard)
        tid = g.post("/api/transactions/entry/", {"plate_number": "ABC 123"}, format="json").data["id"]
        g.post(f"/api/transactions/{tid}/exit/")
        ac = self.client_for(self.admin)
        for period in ("daily", "weekly", "monthly"):
            r = ac.get("/api/reports/", {"period": period})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.data["totals"]["entries"], 1)
        r = ac.get("/api/reports/", {"period": "daily", "category": "FACULTY"})
        self.assertEqual(r.data["totals"]["entries"], 0)
        r = ac.get("/api/analytics/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["daily"]), 14)
        self.assertEqual(r.data["daily"][-1]["entries"], 1)


class AuthTests(TransactionTestCase):
    def test_register_login_refresh_deactivate(self):
        c = APIClient()
        payload = {
            "role": "STUDENT",
            "full_name": "New Student",
            "id_number": "2024-0001",
            "email": "New@x.edu",
            "password": PW,
            "confirm_password": PW,
            "department": "Bachelor of Science in Information Technology (BSIT)",
            "contact_number": "09171234567",
            "vehicle_type": "MOTORCYCLE",
            "vehicle_color": "Red",
            "vehicle_brand_model": "Honda Click 125i",
            "plate_number": "xyz 789",
        }
        r = c.post("/api/auth/register/", with_id(payload), format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["plate_number"], "XYZ 789")
        # duplicate rejected
        self.assertEqual(c.post("/api/auth/register/", with_id(payload), format="multipart").status_code, 400)
        # Security role can't self-register
        self.assertEqual(c.post("/api/auth/register/", with_id({**payload, "role": "SECURITY"}), format="multipart").status_code, 400)

        self.assertEqual(c.post("/api/auth/login/", {"email": "new@x.edu", "password": PW}, format="json").status_code, 401)  # pending
        approved = User.objects.get(email="new@x.edu")
        approved.account_status = "APPROVED"
        approved.save()
        r = c.post("/api/auth/login/", {"email": "new@x.edu", "password": PW}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["user"]["role"], "STUDENT")
        r2 = c.post("/api/auth/refresh/", {"refresh": r.data["refresh"]}, format="json")
        self.assertEqual(r2.status_code, 200)

        user = User.objects.get(email="new@x.edu")
        user.account_status = "SUSPENDED"
        user.save()
        self.assertEqual(c.post("/api/auth/login/", {"email": "new@x.edu", "password": PW}, format="json").status_code, 401)

    def _payload(self, **over):
        return {
            "role": "STUDENT", "full_name": "Pat Rivera", "id_number": "2025-0100", "email": "pat@x.edu",
            "password": PW, "confirm_password": PW, "department": "Bachelor of Science in Accountancy (BSA)", "contact_number": "09171234567",
            "vehicle_type": "MOTORCYCLE", "vehicle_color": "Blue", "vehicle_brand_model": "Yamaha Mio", "plate_number": "PAT 100", **over,
        }

    def test_registration_validation(self):
        c = APIClient()
        self.assertEqual(c.post("/api/auth/register/", with_id(self._payload()), format="multipart").status_code, 201)
        user = User.objects.get(email="pat@x.edu")
        self.assertTrue(user.password.startswith("pbkdf2_sha256$"))
        self.assertNotIn(PW, user.password)

        dup = c.post("/api/auth/register/", with_id(self._payload(id_number="2025-0101", plate_number="PAT 101", email="PAT@x.edu")), format="multipart")
        self.assertEqual(dup.status_code, 400)
        self.assertIn("email", dup.data)

        missing = c.post("/api/auth/register/", with_id({"email": "new@x.edu"}), format="multipart")
        self.assertEqual(missing.status_code, 400)
        for field in ("full_name", "id_number", "password", "plate_number"):
            self.assertIn(field, missing.data)

        bad = c.post("/api/auth/register/", with_id(self._payload(email="nope", confirm_password="different1!", contact_number="abc")), format="multipart")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("email", bad.data)
        self.assertIn("contact_number", bad.data)

    def test_login_failures_and_logout(self):
        c = APIClient()
        c.post("/api/auth/register/", with_id(self._payload()), format="multipart")
        approved = User.objects.get(email="pat@x.edu")
        approved.account_status = "APPROVED"
        approved.save()
        wrong = c.post("/api/auth/login/", {"email": "pat@x.edu", "password": "wrong-password"}, format="json")
        unknown = c.post("/api/auth/login/", {"email": "ghost@x.edu", "password": PW}, format="json")
        self.assertEqual((wrong.status_code, unknown.status_code), (401, 401))
        self.assertEqual(wrong.data["detail"], unknown.data["detail"])  # no account enumeration

        ok = c.post("/api/auth/login/", {"email": "pat@x.edu", "password": PW}, format="json")
        self.assertEqual(ok.status_code, 200)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {ok.data['access']}")
        self.assertEqual(c.get("/api/auth/me/").data["email"], "pat@x.edu")
        self.assertEqual(c.post("/api/auth/logout/", {"refresh": ok.data["refresh"]}, format="json").status_code, 205)
        c.credentials()
        self.assertEqual(c.post("/api/auth/refresh/", {"refresh": ok.data["refresh"]}, format="json").status_code, 401)
