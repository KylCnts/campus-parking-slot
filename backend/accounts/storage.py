from django.conf import settings
from django.core.files.storage import FileSystemStorage


def private_storage():
    """School ID photos live outside any public URL and are served only through an admin endpoint."""
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT, base_url=None, file_permissions_mode=0o600)
