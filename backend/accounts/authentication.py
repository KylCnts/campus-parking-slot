from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

ALLOWED_WHILE_PASSWORD_EXPIRED = ("/api/auth/me/", "/api/auth/change-password/", "/api/auth/logout/", "/api/meta/")


class AccountJWTAuthentication(JWTAuthentication):
    """Standard JWT checks, plus the forced password change after a temporary password."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result and result[0].must_change_password and request.path not in ALLOWED_WHILE_PASSWORD_EXPIRED:
            raise PermissionDenied("Change your temporary password to continue.", code="password_change_required")
        return result
