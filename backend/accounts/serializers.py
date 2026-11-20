import re

from django.contrib.auth import password_validation
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from parking.models import Vehicle, normalize_plate

from .constants import COURSES, STUDENT_LIMIT_MESSAGE
from .images import clean_school_id
from .limits import reserve_student_seat, student_registration_open
from .models import AccountVerification, User

BRAND_MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .\-/+]{1,99}$")
PLATE_RE = re.compile(r"^[A-Z0-9][A-Z0-9 \-]{1,18}[A-Z0-9]$")
PHONE_RE = re.compile(r"^\+?[0-9][0-9 \-]{6,18}$")


def validate_plate(value):
    plate = normalize_plate(value)
    if not PLATE_RE.match(plate):
        raise serializers.ValidationError("Enter a valid plate number (letters, digits, spaces or dashes).")
    return plate


def plate_is_free(plate):
    existing = Vehicle.objects.filter(plate_number=plate).first()
    return existing is None or existing.is_retired


def save_vehicle(user, plate, vehicle_type, color, brand_model):
    vehicle = Vehicle.objects.filter(plate_number=plate).first() or Vehicle(plate_number=plate)
    vehicle.owner = user
    vehicle.owner_name = ""
    vehicle.category = user.role
    vehicle.vehicle_type = vehicle_type
    vehicle.color = color.strip()
    vehicle.brand_model = brand_model
    vehicle.is_active = True
    vehicle.save()
    return vehicle


def clean_brand_model(value):
    value = " ".join(value.split())
    if not BRAND_MODEL_RE.match(value):
        raise serializers.ValidationError("Enter a valid vehicle brand or model, e.g. Honda Click 125i.")
    return value


class UserVehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ["id", "plate_number", "vehicle_type", "color", "brand_model", "category", "is_active", "created_at"]


class UserSerializer(serializers.ModelSerializer):
    vehicles = UserVehicleSerializer(many=True, read_only=True)
    plate_number = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "role_display",
            "id_number",
            "department",
            "year_level",
            "contact_number",
            "is_active",
            "account_status",
            "status_reason",
            "must_change_password",
            "created_at",
            "last_login",
            "plate_number",
            "vehicles",
        ]
        read_only_fields = fields

    def get_plate_number(self, obj):
        v = next(iter(obj.vehicles.all()), None)
        return v.plate_number if v else None


class RegisterSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[User.Role.STUDENT, User.Role.FACULTY])
    full_name = serializers.CharField(max_length=150)
    id_number = serializers.CharField(max_length=50)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)
    department = serializers.CharField(max_length=150)
    year_level = serializers.ChoiceField(choices=User.YearLevel.choices, required=False, allow_blank=True)
    school_id = serializers.FileField(write_only=True)
    contact_number = serializers.CharField(max_length=30)
    vehicle_type = serializers.ChoiceField(choices=Vehicle.VehicleType.choices)
    vehicle_color = serializers.CharField(max_length=40)
    vehicle_brand_model = serializers.CharField(max_length=100)
    plate_number = serializers.CharField(max_length=20)

    def to_internal_value(self, data):
        if data.get("role") == User.Role.STUDENT and not student_registration_open():
            raise serializers.ValidationError({"detail": STUDENT_LIMIT_MESSAGE})
        return super().to_internal_value(data)

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_id_number(self, value):
        value = value.strip().upper()
        if User.objects.filter(id_number__iexact=value).exists():
            raise serializers.ValidationError("This Student/Employee ID is already registered.")
        return value

    def validate_contact_number(self, value):
        if not PHONE_RE.match(value.strip()):
            raise serializers.ValidationError("Enter a valid contact number.")
        return value.strip()

    def validate_plate_number(self, value):
        plate = validate_plate(value)
        if not plate_is_free(plate):
            raise serializers.ValidationError("This plate number is already registered.")
        return plate

    def validate_school_id(self, value):
        return clean_school_id(value)

    def validate_vehicle_brand_model(self, value):
        return clean_brand_model(value)

    def validate(self, attrs):
        if attrs["role"] == User.Role.STUDENT:
            if attrs["department"] not in COURSES:
                raise serializers.ValidationError({"department": "Select a course from the list."})
            if not attrs.get("year_level"):
                raise serializers.ValidationError({"year_level": "Select your year level."})
            if attrs["vehicle_type"] != Vehicle.VehicleType.MOTORCYCLE:
                raise serializers.ValidationError({"vehicle_type": "Student assistants may only register motorcycles."})
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        tmp = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            password_validation.validate_password(attrs["password"], tmp)
        except Exception as e:
            raise serializers.ValidationError({"password": list(e.messages)})
        return attrs

    @transaction.atomic
    def create(self, data):
        if data["role"] == User.Role.STUDENT:
            reserve_student_seat()
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            full_name=data["full_name"].strip(),
            role=data["role"],
            id_number=data["id_number"],
            department=data["department"].strip(),
            year_level=data.get("year_level", "") if data["role"] == User.Role.STUDENT else "",
            contact_number=data["contact_number"],
            account_status=User.AccountStatus.PENDING,
        )
        AccountVerification.objects.create(
            user=user,
            applicant_name=user.full_name,
            applicant_email=user.email,
            user_type=user.role,
            school_id_image=data["school_id"],
        )
        save_vehicle(user, data["plate_number"], data["vehicle_type"], data["vehicle_color"], data["vehicle_brand_model"])
        return user


class AdminUserSerializer(serializers.ModelSerializer):
    """Used by administrators to create and edit any account (including admin/security)."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    vehicles = UserVehicleSerializer(many=True, read_only=True)
    plate_number = serializers.SerializerMethodField()
    # A new Student Assistant is created together with the registered motorcycle.
    vehicle_plate = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=20)
    vehicle_color = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=40)
    vehicle_brand_model = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=100)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "id_number",
            "department",
            "year_level",
            "contact_number",
            "is_active",
            "account_status",
            "status_reason",
            "password",
            "vehicle_plate",
            "vehicle_color",
            "vehicle_brand_model",
            "created_at",
            "last_login",
            "vehicles",
            "plate_number",
        ]
        read_only_fields = ["id", "is_active", "account_status", "status_reason", "created_at", "last_login", "vehicles", "plate_number"]

    def get_plate_number(self, obj):
        v = next(iter(obj.vehicles.all()), None)
        return v.plate_number if v else None

    def validate_email(self, value):
        value = value.lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_id_number(self, value):
        if not value:
            return None
        value = value.strip().upper()
        qs = User.objects.filter(id_number__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This ID is already in use.")
        return value

    def validate(self, attrs):
        role = attrs.get("role", getattr(self.instance, "role", None))
        department = attrs.get("department")
        if role == User.Role.STUDENT and department and department != getattr(self.instance, "department", None) and department not in COURSES:
            raise serializers.ValidationError({"department": "Select a course from the list."})
        if self.instance and "role" in attrs and attrs["role"] != self.instance.role and User.Role.STUDENT in (attrs["role"], self.instance.role):
            raise serializers.ValidationError({"role": "Student Assistant accounts cannot be converted. Create a separate account instead."})
        if not self.instance and role == User.Role.STUDENT:
            errors = {k: "This field is required for a Student Assistant." for k in ("vehicle_plate", "vehicle_color", "vehicle_brand_model") if not attrs.get(k, "").strip()}
            if errors:
                raise serializers.ValidationError(errors)
            attrs["vehicle_plate"] = validate_plate(attrs["vehicle_plate"])
            if not plate_is_free(attrs["vehicle_plate"]):
                raise serializers.ValidationError({"vehicle_plate": "This plate number is already registered."})
            attrs["vehicle_brand_model"] = clean_brand_model(attrs["vehicle_brand_model"])
        pw = attrs.get("password")
        if not self.instance and not pw:
            raise serializers.ValidationError({"password": "A password is required for new accounts."})
        if pw:
            try:
                password_validation.validate_password(pw)
            except Exception as e:
                raise serializers.ValidationError({"password": list(e.messages)})
        return attrs

    @transaction.atomic
    def create(self, data):
        pw = data.pop("password")
        plate, color, brand = data.pop("vehicle_plate", ""), data.pop("vehicle_color", ""), data.pop("vehicle_brand_model", "")
        role = data.get("role")
        if role == User.Role.ADMIN:
            data["is_staff"] = True
        if role == User.Role.STUDENT:
            reserve_student_seat()
        user = User.objects.create_user(password=pw, **data)
        if role == User.Role.STUDENT:
            save_vehicle(user, plate, Vehicle.VehicleType.MOTORCYCLE, color, brand)
        return user

    def update(self, instance, data):
        for field in ("vehicle_plate", "vehicle_color", "vehicle_brand_model"):
            data.pop(field, None)
        pw = data.pop("password", None)
        for k, v in data.items():
            setattr(instance, k, v)
        if pw:
            instance.set_password(pw)
        instance.save()
        return instance


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["full_name", "department", "contact_number"]

    def validate_department(self, value):
        if self.instance.role == User.Role.STUDENT and value != self.instance.department and value not in COURSES:
            raise serializers.ValidationError("Select a course from the list.")
        return value

    def validate_contact_number(self, value):
        if value and not PHONE_RE.match(value.strip()):
            raise serializers.ValidationError("Enter a valid contact number.")
        return value.strip()


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField()
    confirm_password = serializers.CharField()

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        try:
            password_validation.validate_password(attrs["new_password"], user)
        except Exception as e:
            raise serializers.ValidationError({"new_password": list(e.messages)})
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField()
    confirm_password = serializers.CharField()

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        try:
            password_validation.validate_password(attrs["new_password"])
        except Exception as e:
            raise serializers.ValidationError({"new_password": list(e.messages)})
        return attrs


class LoginSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        "no_active_account": "Invalid email or password."
    }
    STATUS_MESSAGES = {
        User.AccountStatus.PENDING: "Your registration is pending verification by an administrator.",
        User.AccountStatus.REJECTED: "Your registration was rejected. Reason: {reason}",
        User.AccountStatus.SUSPENDED: "Your account has been suspended. Please contact the administrator.",
        User.AccountStatus.ARCHIVED: "This account has been archived and can no longer sign in.",
    }

    def validate(self, attrs):
        attrs["email"] = attrs.get("email", "").lower()
        # The account status is revealed only to someone who proves they own the account.
        candidate = User.objects.filter(email__iexact=attrs["email"]).first()
        if candidate and candidate.account_status != User.AccountStatus.APPROVED and candidate.check_password(attrs.get("password", "")):
            message = self.STATUS_MESSAGES[candidate.account_status].format(reason=candidate.status_reason or "Not specified.")
            raise AuthenticationFailed(message, code="account_not_approved")
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["full_name"] = user.full_name
        return token
