"""Validation and safe re-encoding of uploaded school ID photos."""
import io
import os
import uuid

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
MIN_SIDE = 200
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_FORMATS = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png")}


def clean_school_id(upload):
    """Check the real file content and return a freshly encoded copy without metadata."""
    if os.path.splitext(upload.name or "")[1].lower() not in ALLOWED_EXTENSIONS:
        raise serializers.ValidationError("Upload a JPG, JPEG, or PNG image.")
    if upload.size > MAX_UPLOAD_BYTES:
        raise serializers.ValidationError("The image must be 5 MB or smaller.")
    try:
        upload.seek(0)
        probe = Image.open(upload)
        image_format = probe.format
        width, height = probe.size
        if image_format not in ALLOWED_FORMATS:
            raise serializers.ValidationError("Upload a JPG, JPEG, or PNG image.")
        if width * height > MAX_PIXELS:
            raise serializers.ValidationError("The image dimensions are too large.")
        if min(width, height) < MIN_SIDE:
            raise serializers.ValidationError("The image is too small to read. Upload a clearer photo.")
        probe.verify()
        upload.seek(0)
        image = ImageOps.exif_transpose(Image.open(upload))
        image.load()
    except serializers.ValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise serializers.ValidationError("This file is not a valid image.")

    extension, _ = ALLOWED_FORMATS[image_format]
    output = io.BytesIO()
    if image_format == "JPEG":
        image.convert("RGB").save(output, "JPEG", quality=90)
    else:
        image.save(output, "PNG")
    return ContentFile(output.getvalue(), name=f"{uuid.uuid4().hex}.{extension}")
