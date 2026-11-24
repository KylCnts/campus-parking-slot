from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from parking.models import AuditLog, Notification, UserReport
from parking.testing import school_id_png

User = get_user_model()
PW = "Str0ng!Passw0rd"


def api(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


class UserReportTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@x.edu", password=PW, full_name="Head Admin")
        self.student = User.objects.create_user(email="sa@x.edu", password=PW, full_name="Student One", role="STUDENT", id_number="S1")
        self.faculty = User.objects.create_user(email="fa@x.edu", password=PW, full_name="Faculty One", role="FACULTY", id_number="F1")

    def submit(self, user, **over):
        body = {"category": "PARKING_SPACE", "title": "Motorcycle slot blocked", "description": "A car is parked across MC-02 every morning.", **over}
        return api(user).post("/api/user-reports/", body, format="multipart")

    def test_member_submits_and_tracks_own_report(self):
        r = self.submit(self.student, attachment=school_id_png("photo.png"))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["status"], r.data["reporter_name"], r.data["has_attachment"]), ("SUBMITTED", "Student One", True))
        self.assertTrue(r.data["reference"].startswith("RPT-"))
        self.assertIsNone(r.data["reporter_details"])  # account details are for administrators
        self.assertTrue(Notification.objects.filter(user=self.admin, link="/user-reports").exists())

        mine = api(self.student).get("/api/user-reports/")
        self.assertEqual(mine.data["count"], 1)
        attachment = api(self.student).get(f"/api/user-reports/{r.data['id']}/attachment/")
        self.assertEqual((attachment.status_code, attachment["Content-Type"]), (200, "image/png"))
        self.assertEqual(api(self.student).get("/api/user-reports/summary/").data["pending"], 1)

    def test_only_owner_and_admin_can_see_a_report(self):
        rid = self.submit(self.student).data["id"]
        other = api(self.faculty)
        self.assertEqual(other.get("/api/user-reports/").data["count"], 0)
        self.assertEqual(other.get(f"/api/user-reports/{rid}/").status_code, 404)
        self.assertEqual(other.get(f"/api/user-reports/{rid}/attachment/").status_code, 404)
        self.assertEqual(api().get("/api/user-reports/").status_code, 401)
        admin_view = api(self.admin).get(f"/api/user-reports/{rid}/")
        self.assertEqual(admin_view.status_code, 200)
        self.assertEqual(admin_view.data["reporter_details"]["id_number"], "S1")

    def test_validation_and_who_may_submit(self):
        self.assertIn("title", self.submit(self.student, title="Hi").data)
        self.assertIn("description", self.submit(self.student, description="short").data)
        self.assertIn("category", self.submit(self.student, category="NOPE").data)
        bad_file = self.submit(self.student, attachment=school_id_png("notes.txt"))
        self.assertIn("attachment", bad_file.data)
        self.assertEqual(self.submit(self.admin).status_code, 403)

    def test_member_cannot_change_status(self):
        rid = self.submit(self.student).data["id"]
        r = api(self.student).patch(f"/api/user-reports/{rid}/", {"status": "RESOLVED", "admin_response": "Done by myself"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(UserReport.objects.get(pk=rid).status, "SUBMITTED")

    def test_admin_reviews_responds_and_closes(self):
        rid = self.submit(self.faculty).data["id"]
        c = api(self.admin)
        r = c.patch(f"/api/user-reports/{rid}/", {"status": "UNDER_REVIEW"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data["status"], r.data["handled_by_name"]), ("UNDER_REVIEW", "Head Admin"))
        self.assertIsNone(r.data["resolved_at"])

        no_note = c.patch(f"/api/user-reports/{rid}/", {"status": "RESOLVED"}, format="json")
        self.assertIn("admin_response", no_note.data)
        done = c.patch(f"/api/user-reports/{rid}/", {"status": "RESOLVED", "admin_response": "Security now checks MC-02 at 7 AM."}, format="json")
        self.assertEqual(done.data["status"], "RESOLVED")
        self.assertIsNotNone(done.data["resolved_at"])
        self.assertIsNotNone(done.data["responded_at"])

        notes = Notification.objects.filter(user=self.faculty, link="/my-reports")
        self.assertEqual(notes.count(), 2)
        self.assertEqual(AuditLog.objects.filter(action="USER_REPORT_UPDATED", target_id=str(rid)).count(), 2)
        summary = c.get("/api/user-reports/summary/").data
        self.assertEqual((summary["resolved"], summary["closed"], summary["pending"]), (1, 1, 0))
        self.assertEqual(c.get("/api/user-reports/", {"status": "RESOLVED"}).data["count"], 1)
        self.assertEqual(c.get("/api/user-reports/", {"state": "closed"}).data["count"], 1)
        self.assertEqual(c.get("/api/user-reports/", {"state": "open"}).data["count"], 0)
        self.assertEqual(c.get("/api/dashboard/summary/").data["open_user_reports"], 0)

        reopened = c.patch(f"/api/user-reports/{rid}/", {"status": "IN_PROGRESS"}, format="json")
        self.assertIsNone(reopened.data["resolved_at"])
