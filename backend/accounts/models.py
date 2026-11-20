from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models import Q

from .storage import private_storage


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)  # PBKDF2 hashing
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        # Accounts made by an administrator are approved; public registration passes PENDING explicitly.
        extra.setdefault("account_status", User.AccountStatus.APPROVED)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("role", User.Role.ADMIN)
        extra.setdefault("full_name", "System Administrator")
        extra.setdefault("account_status", User.AccountStatus.APPROVED)
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin / Security Guard"
        STUDENT = "STUDENT", "Student Assistant"
        FACULTY = "FACULTY", "Faculty Member"

    class AccountStatus(models.TextChoices):
        PENDING = "PENDING", "Pending Verification"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        SUSPENDED = "SUSPENDED", "Suspended"
        ARCHIVED = "ARCHIVED", "Archived"

    class YearLevel(models.TextChoices):
        FIRST = "1ST", "1st Year"
        SECOND = "2ND", "2nd Year"
        THIRD = "3RD", "3rd Year"
        FOURTH = "4TH", "4th Year"

    username = None
    first_name = None
    last_name = None

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT)
    id_number = models.CharField(
        "Student / Employee ID", max_length=50, unique=True, null=True, blank=True
    )
    department = models.CharField("Department / Course", max_length=150, blank=True)
    year_level = models.CharField(max_length=3, choices=YearLevel.choices, blank=True)
    contact_number = models.CharField(max_length=30, blank=True)
    account_status = models.CharField(max_length=10, choices=AccountStatus.choices, default=AccountStatus.PENDING, db_index=True)
    status_reason = models.CharField(max_length=500, blank=True)
    must_change_password = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.full_name} <{self.email}>"

    def save(self, *args, **kwargs):
        # Only approved accounts can authenticate.
        self.is_active = self.account_status == self.AccountStatus.APPROVED
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "account_status" in update_fields:
            kwargs["update_fields"] = {*update_fields, "is_active"}
        super().save(*args, **kwargs)

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN or self.is_superuser


class AccountVerification(models.Model):
    """One registration review. The decision stays on record after the ID photo is deleted."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="verifications")
    applicant_name = models.CharField(max_length=150)
    applicant_email = models.EmailField()
    user_type = models.CharField(max_length=10, choices=User.Role.choices)
    school_id_image = models.FileField(storage=private_storage, upload_to="school_ids/", null=True, blank=True, max_length=255)
    image_deleted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    decided_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    decided_by_name = models.CharField(max_length=150, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=500, blank=True)
    email_status = models.CharField(max_length=10, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(fields=["user"], condition=Q(status="PENDING"), name="one_pending_verification_per_user"),
        ]
