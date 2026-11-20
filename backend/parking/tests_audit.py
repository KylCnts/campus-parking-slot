import os

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, connection, transaction
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import AccountVerification
from parking.models import AuditLog
from parking.testing import school_id_png

User = get_user_model()
PW = "Str0ng!Passw0rd"


def api(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class VerificationTests(TransactionTestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@x.edu", password=PW, full_name="Head Admin")
        self.other = User.objects.create_user(email="fac@x.edu", password=PW, full_name="Fac", role="FACULTY", id_number="F0")

    def body(self, **over):
        return {
            "role": "FACULTY", "full_name": "Ana Cruz", "id_number": "EMP-1", "email": "ana@x.edu", "password": PW, "confirm_password": PW,
            "department": "College of Business", "contact_number": "09171234567", "vehicle_type": "CAR", "vehicle_color": "Red",
            "vehicle_brand_model": "Toyota Vios", "plate_number": "ANA 100", "school_id": school_id_png(), **over,
        }

    def register(self, **over):
        return api().post("/api/auth/register/", self.body(**over), format="multipart")

    def test_school_id_is_required_and_content_is_checked(self):
        body = self.body()
        del body["school_id"]
        self.assertIn("school_id", api().post("/api/auth/register/", body, format="multipart").data)
        fake = SimpleUploadedFile("id.png", b"<script>alert(1)</script>" * 40, content_type="image/png")
        self.assertIn("school_id", self.register(school_id=fake).data)
        pdf = SimpleUploadedFile("id.pdf", b"%PDF-1.7", content_type="application/pdf")
        self.assertIn("school_id", self.register(school_id=pdf).data)
        large = SimpleUploadedFile("id.png", b"0" * (5 * 1024 * 1024 + 1), content_type="image/png")
        self.assertIn("school_id", self.register(school_id=large).data)
        self.assertFalse(User.objects.filter(email="ana@x.edu").exists())

    def test_users_cannot_register_as_administrator(self):
        for role in ("ADMIN", "SECURITY"):
            self.assertEqual(self.register(role=role).status_code, 400)

    def test_pending_account_cannot_sign_in_or_be_used(self):
        self.assertEqual(self.register().status_code, 201)
        user = User.objects.get(email="ana@x.edu")
        self.assertEqual(user.account_status, "PENDING")
        self.assertFalse(user.is_active)
        login = api().post("/api/auth/login/", {"email": "ana@x.edu", "password": PW}, format="json")
        self.assertEqual(login.status_code, 401)
        self.assertIn("pending verification", str(login.data))
        wrong = api().post("/api/auth/login/", {"email": "ana@x.edu", "password": "wrong-pass-1"}, format="json")
        self.assertNotIn("pending", str(wrong.data))
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        self.assertEqual(c.get("/api/spaces/map/").status_code, 401)

    def test_only_admin_can_review_and_view_ids(self):
        self.register()
        v = AccountVerification.objects.get()
        for client in (api(), api(self.other)):
            self.assertIn(client.get("/api/verifications/").status_code, (401, 403))
            self.assertIn(client.get(f"/api/verifications/{v.pk}/image/").status_code, (401, 403))
            self.assertIn(client.post(f"/api/verifications/{v.pk}/approve/").status_code, (401, 403))
        row = api(self.admin).get("/api/verifications/", {"status": "PENDING"}).data["results"][0]
        self.assertEqual(row["vehicle"]["brand_model"], "Toyota Vios")
        self.assertNotIn("school_id_image", row)
        image = api(self.admin).get(f"/api/verifications/{v.pk}/image/")
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image["Content-Type"], "image/png")
        self.assertEqual(image["Cache-Control"], "no-store")
        b"".join(image.streaming_content)
        image.close()

    def test_approve_deletes_image_keeps_history_and_notifies(self):
        self.register()
        v = AccountVerification.objects.get()
        path = v.school_id_image.path
        self.assertTrue(os.path.exists(path))
        r = api(self.admin).post(f"/api/verifications/{v.pk}/approve/")
        self.assertEqual(r.status_code, 200, r.data)
        v.refresh_from_db()
        self.assertFalse(os.path.exists(path))
        self.assertFalse(v.school_id_image)
        self.assertIsNotNone(v.image_deleted_at)
        self.assertEqual((v.status, v.decided_by, v.email_status), ("APPROVED", self.admin, "SENT"))
        self.assertIsNotNone(v.decided_at)
        self.assertEqual(api(self.admin).get(f"/api/verifications/{v.pk}/image/").status_code, 404)
        self.assertIn("approved", mail.outbox[-1].body)
        entry = AuditLog.objects.get(action="ACCOUNT_APPROVED")
        self.assertEqual((entry.actor_email, entry.previous_value, entry.new_value), ("admin@x.edu", {"account_status": "PENDING"}, {"account_status": "APPROVED"}))
        self.assertEqual(api().post("/api/auth/login/", {"email": "ana@x.edu", "password": PW}, format="json").status_code, 200)
        self.assertEqual(api(self.admin).post(f"/api/verifications/{v.pk}/reject/", {"reason": "Too late now"}, format="json").status_code, 400)

    def test_reject_requires_reason_and_blocks_access(self):
        self.register()
        v = AccountVerification.objects.get()
        path = v.school_id_image.path
        self.assertEqual(api(self.admin).post(f"/api/verifications/{v.pk}/reject/", {"reason": ""}, format="json").status_code, 400)
        self.assertTrue(os.path.exists(path))
        reason = "The photo of the school ID is unreadable."
        self.assertEqual(api(self.admin).post(f"/api/verifications/{v.pk}/reject/", {"reason": reason}, format="json").status_code, 200)
        v.refresh_from_db()
        self.assertFalse(os.path.exists(path))
        self.assertEqual((v.status, v.rejection_reason), ("REJECTED", reason))
        self.assertIn(reason, mail.outbox[-1].body)
        self.assertEqual(AuditLog.objects.get(action="ACCOUNT_REJECTED").reason, reason)
        login = api().post("/api/auth/login/", {"email": "ana@x.edu", "password": PW}, format="json")
        self.assertEqual(login.status_code, 401)
        self.assertIn(reason, str(login.data))

    def test_suspend_archive_restore(self):
        c = api(self.admin)
        login = api().post("/api/auth/login/", {"email": "fac@x.edu", "password": PW}, format="json").data
        self.assertEqual(c.post(f"/api/users/{self.other.pk}/suspend/", {}, format="json").status_code, 400)
        self.assertEqual(c.post(f"/api/users/{self.other.pk}/suspend/", {"reason": "Parking violation"}, format="json").status_code, 200)
        user = APIClient()
        user.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")
        self.assertEqual(user.get("/api/auth/me/").status_code, 401)
        self.assertEqual(api().post("/api/auth/refresh/", {"refresh": login["refresh"]}, format="json").status_code, 401)
        self.assertIn("suspended", str(api().post("/api/auth/login/", {"email": "fac@x.edu", "password": PW}, format="json").data))
        self.assertEqual(c.post(f"/api/users/{self.other.pk}/reinstate/").status_code, 200)
        self.assertEqual(c.post(f"/api/users/{self.other.pk}/archive/", {"reason": "Retired faculty"}, format="json").status_code, 200)
        self.assertIn("archived", str(api().post("/api/auth/login/", {"email": "fac@x.edu", "password": PW}, format="json").data))
        self.assertTrue(User.objects.filter(pk=self.other.pk).exists())
        self.assertEqual(c.post(f"/api/users/{self.other.pk}/restore/").status_code, 200)
        self.assertEqual(api().post("/api/auth/login/", {"email": "fac@x.edu", "password": PW}, format="json").status_code, 200)
        self.assertEqual(c.post(f"/api/users/{self.admin.pk}/suspend/", {"reason": "Own account"}, format="json").status_code, 400)
        self.assertEqual(api(self.other).post(f"/api/users/{self.admin.pk}/suspend/", {"reason": "Not allowed"}, format="json").status_code, 403)
        self.assertEqual(
            list(AuditLog.objects.order_by("id").values_list("action", flat=True)),
            ["ACCOUNT_SUSPENDED", "ACCOUNT_REINSTATED", "ACCOUNT_ARCHIVED", "ACCOUNT_RESTORED"],
        )

    def test_temporary_password_must_be_changed(self):
        self.admin.must_change_password = True
        self.admin.save()
        login = api().post("/api/auth/login/", {"email": "admin@x.edu", "password": PW}, format="json").data
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")
        self.assertEqual(c.get("/api/users/").status_code, 403)
        self.assertEqual(c.get("/api/auth/me/").status_code, 200)
        new = "An0ther!Passw0rd"
        changed = c.post("/api/auth/change-password/", {"current_password": PW, "new_password": new, "confirm_password": new}, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(api().post("/api/auth/refresh/", {"refresh": login["refresh"]}, format="json").status_code, 401)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {changed.data['access']}")
        self.assertEqual(c.get("/api/users/").status_code, 200)

    def test_audit_trail_cannot_be_changed(self):
        self.register()
        api(self.admin).post(f"/api/verifications/{AccountVerification.objects.get().pk}/approve/")
        entry = AuditLog.objects.first()
        with self.assertRaises(PermissionError):
            entry.delete()
        with self.assertRaises(PermissionError):
            entry.save()
        for sql in ("UPDATE parking_auditlog SET reason = 'x'", "DELETE FROM parking_auditlog"):
            with self.assertRaises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
                cur.execute(sql)
        c = api(self.admin)
        self.assertEqual(c.delete(f"/api/audit-trail/{entry.pk}/").status_code, 405)
        self.assertEqual(c.patch(f"/api/audit-trail/{entry.pk}/", {"reason": "x"}, format="json").status_code, 405)
        self.assertEqual(c.post("/api/audit-trail/", {}, format="json").status_code, 405)
        self.assertEqual(api(self.other).get("/api/audit-trail/").status_code, 403)
