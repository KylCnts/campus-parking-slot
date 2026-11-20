from rest_framework.permissions import SAFE_METHODS, BasePermission


def _ok(request):
    return bool(request.user and request.user.is_authenticated and request.user.is_active)


class IsAdmin(BasePermission):
    message = "Administrator access required."

    def has_permission(self, request, view):
        return _ok(request) and request.user.is_admin


class IsAdminOrReadOnly(BasePermission):
    """Any authenticated user may read; only administrators may write."""

    def has_permission(self, request, view):
        if not _ok(request):
            return False
        return request.method in SAFE_METHODS or request.user.is_admin
