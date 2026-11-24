from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from parking.services import audit, close_user_connections, log_activity, notify, notify_roles, snapshot

from .models import User
from .permissions import IsAdmin
from .serializers import (
    AdminUserSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    RegisterSerializer,
    UserSerializer,
)


USER_FIELDS = ("full_name", "email", "role", "id_number", "department", "year_level", "contact_number")


def revoke_refresh_tokens(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            user = User.objects.get(pk=response.data["user"]["id"])
            log_activity(user, "LOGIN", f"{user.full_name} signed in.", request)
        return response


class LogoutView(APIView):
    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass
        log_activity(request.user, "LOGOUT", f"{request.user.full_name} signed out.", request)
        return Response(status=status.HTTP_205_RESET_CONTENT)


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = RegisterSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = s.save()
        except IntegrityError:  # two simultaneous sign-ups with the same details
            return Response(
                {"detail": "This email, ID or plate number is already registered."},
                status=status.HTTP_409_CONFLICT,
            )
        log_activity(user, "REGISTER", f"New {user.get_role_display()} account registered: {user.email}", request)
        notify_roles(
            [User.Role.ADMIN],
            "Registration awaiting verification",
            f"{user.full_name} registered as {user.get_role_display()}.",
            link="/user-management?tab=verification",
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class MeView(APIView):
    def get(self, request):
        user = User.objects.prefetch_related("vehicles").get(pk=request.user.pk)
        return Response(UserSerializer(user).data)

    def patch(self, request):
        s = ProfileSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        log_activity(request.user, "PROFILE_UPDATE", "Updated profile information.", request)
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        s = ChangePasswordSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        request.user.set_password(s.validated_data["new_password"])
        request.user.must_change_password = False
        request.user.save()
        revoke_refresh_tokens(request.user)
        log_activity(request.user, "PASSWORD_CHANGE", "Changed account password.", request)
        fresh = RefreshToken.for_user(request.user)
        return Response({"detail": "Password updated successfully.", "access": str(fresh.access_token), "refresh": str(fresh)})


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        s = PasswordResetRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=s.validated_data["email"], is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            send_mail(
                "Campus Parking - Password Reset",
                f"Hello {user.full_name},\n\nUse the link below to reset your password:\n{link}\n\n"
                "If you did not request this, you can ignore this email.",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
            )
            log_activity(user, "PASSWORD_RESET_REQUEST", "Requested a password reset link.", request)
        # Same response either way so emails cannot be enumerated.
        return Response({"detail": "If the email is registered, a reset link has been sent."})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        s = PasswordResetConfirmSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(s.validated_data["uid"])))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if not user or not default_token_generator.check_token(user, s.validated_data["token"]):
            return Response({"detail": "This reset link is invalid or has expired."}, status=400)
        user.set_password(s.validated_data["new_password"])
        user.must_change_password = False
        user.save()
        revoke_refresh_tokens(user)
        log_activity(user, "PASSWORD_RESET", "Password reset via email link.", request)
        return Response({"detail": "Password has been reset. You can now sign in."})


class UserViewSet(viewsets.ModelViewSet):
    """Administrator-only user management."""

    permission_classes = [IsAdmin]
    serializer_class = AdminUserSerializer
    filterset_fields = ["role", "account_status"]
    search_fields = ["full_name", "email", "id_number", "department", "vehicles__plate_number"]
    ordering_fields = ["id", "full_name", "email", "role", "created_at"]
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        return User.objects.prefetch_related("vehicles").distinct()

    def perform_create(self, serializer):
        user = serializer.save()
        audit(self.request, "ACCOUNT_CREATED", user, new=snapshot(user, USER_FIELDS))
        log_activity(self.request.user, "USER_CREATE", f"Created {user.get_role_display()} account {user.email}.", self.request)

    def perform_update(self, serializer):
        before = snapshot(serializer.instance, USER_FIELDS)
        user = serializer.save()
        audit(self.request, "ACCOUNT_UPDATED", user, before, snapshot(user, USER_FIELDS))
        log_activity(self.request.user, "USER_UPDATE", f"Updated account {user.email}.", self.request)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response({"detail": "You cannot delete your own account."}, status=400)
        if user.vehicles.filter(transactions__isnull=False).exists():
            return Response(
                {"detail": "This user has parking history. Deactivate the account instead of deleting it."},
                status=400,
            )
        email = user.email
        audit(request, "ACCOUNT_DELETED", user, snapshot(user, USER_FIELDS))
        user.delete()
        log_activity(request.user, "USER_DELETE", f"Deleted account {email}.", request)
        return Response(status=204)

    def _change_status(self, request, allowed_from, new_status, action_name, reason_required):
        user = self.get_object()
        reason = " ".join(str(request.data.get("reason", "")).split())[:500]
        if user.pk == request.user.pk:
            raise ValidationError({"detail": "You cannot change the status of your own account."})
        if reason_required and len(reason) < 5:
            raise ValidationError({"reason": "Enter the reason for this action."})
        if user.account_status not in allowed_from:
            raise ValidationError({"detail": f"This action is not available for a {user.get_account_status_display().lower()} account."})
        previous = user.account_status
        with transaction.atomic():
            user.account_status = new_status
            user.status_reason = reason
            user.save(update_fields=["account_status", "status_reason", "updated_at"])
        if new_status != User.AccountStatus.APPROVED:
            revoke_refresh_tokens(user)
            close_user_connections(user.pk)
        audit(request, action_name, user, {"account_status": previous}, {"account_status": new_status}, reason)
        log_activity(request.user, action_name, f"{user.email}: {previous} to {new_status}.", request)
        return Response(self.get_serializer(user).data)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        return self._change_status(request, [User.AccountStatus.APPROVED], User.AccountStatus.SUSPENDED, "ACCOUNT_SUSPENDED", True)

    @action(detail=True, methods=["post"])
    def reinstate(self, request, pk=None):
        return self._change_status(request, [User.AccountStatus.SUSPENDED], User.AccountStatus.APPROVED, "ACCOUNT_REINSTATED", False)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        allowed = [User.AccountStatus.APPROVED, User.AccountStatus.SUSPENDED, User.AccountStatus.REJECTED]
        return self._change_status(request, allowed, User.AccountStatus.ARCHIVED, "ACCOUNT_ARCHIVED", True)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        return self._change_status(request, [User.AccountStatus.ARCHIVED], User.AccountStatus.APPROVED, "ACCOUNT_RESTORED", False)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        agg = User.objects.aggregate(
            total=Count("id"),
            students=Count("id", filter=Q(role=User.Role.STUDENT)),
            faculty=Count("id", filter=Q(role=User.Role.FACULTY)),
            admins=Count("id", filter=Q(role=User.Role.ADMIN)),
            pending=Count("id", filter=Q(account_status=User.AccountStatus.PENDING)),
            suspended=Count("id", filter=Q(account_status=User.AccountStatus.SUSPENDED)),
            archived=Count("id", filter=Q(account_status=User.AccountStatus.ARCHIVED)),
        )
        return Response(agg)
