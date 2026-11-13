import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError
from fastapi import HTTPException, status
from app.config import settings
from app.security.crypto import decrypt_bytes, encrypt_bytes


ALLOWED_SOURCE_IMAGE_FORMATS = {"PNG", "JPEG", "WEBP", "BMP", "TIFF", "GIF"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv"}
VIDEO_EXTENSION_TO_MIME = {
    ".mp4": ("video/mp4", "mp4"),
    ".webm": ("video/webm", "webm"),
    ".mov": ("video/mp4", "mp4"),
    ".mkv": ("video/webm", "webm"),
}
SUPPORTED_OUTPUT_FORMATS = {
    "webp": ("WEBP", "image/webp", ".webp"),
    "png": ("PNG", "image/png", ".png"),
    "jpeg": ("JPEG", "image/jpeg", ".jpg"),
}
SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9._-]+")


@dataclass(frozen=True)
class OptimizedAssetPayload:
    filename: str
    mime_type: str
    original_size_bytes: int
    optimized_size_bytes: int
    width: int
    height: int
    sha256: str
    encrypted_blob: bytes


def is_video_mime(mime_type: str | None) -> bool:
    return bool(mime_type and mime_type.lower().startswith("video/"))


def sanitize_asset_filename(original_name: str | None, ext: str) -> str:
    """Produces a path-traversal-free filename with target optimized extension."""
    base = os.path.basename((original_name or "evidencia").strip())
    stem, _ = os.path.splitext(base)
    clean_stem = SAFE_FILENAME_RE.sub("_", stem).strip("._-") or "evidencia"
    return f"{clean_stem[:80]}{ext}"


def _detect_video_container(raw_bytes: bytes, original_filename: str | None) -> tuple[str, str, str] | None:
    """Identifies supported video containers using magic bytes before extension checks."""
    if len(raw_bytes) >= 12 and raw_bytes[4:8] == b"ftyp":
        return "video/mp4", ".mp4", "mp4"
    if len(raw_bytes) >= 4 and raw_bytes[:4] == b"\x1a\x45\xdf\xa3":
        ext = os.path.splitext((original_filename or "").lower())[1]
        if ext == ".mkv":
            return "video/webm", ".webm", "webm"
        return "video/webm", ".webm", "webm"
    return None


def _optimize_animated_image(opened: Image.Image, raw_bytes: bytes, original_filename: str | None) -> OptimizedAssetPayload:
    """Downscales animated GIF/WebP frames cleanly, strips metadata, and keeps animation loop."""
    max_dim = settings.WRITEUP_MAX_ANIM_DIM
    max_frames = settings.WRITEUP_MAX_GIF_FRAMES
    frames: list[Image.Image] = []
    durations: list[int] = []

    for idx, frame in enumerate(ImageSequence.Iterator(opened)):
        if idx >= max_frames:
            break
        rgba = frame.convert("RGBA")
        if rgba.width > max_dim or rgba.height > max_dim:
            rgba.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        rgba.info.clear()
        frames.append(rgba)
        dur = int(frame.info.get("duration") or opened.info.get("duration") or 100)
        durations.append(max(20, min(dur, 5000)))

    if not frames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La animación no contiene cuadros válidos.")

    src_fmt = (opened.format or "").upper()
    out_buffer = io.BytesIO()
    if src_fmt == "WEBP":
        frames[0].save(
            out_buffer,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=0,
            quality=settings.WRITEUP_IMAGE_QUALITY,
            method=4,
        )
        mime_type, ext = "image/webp", ".webp"
    else:
        palette_frames = []
        for f in frames:
            pf = f.convert("P", palette=Image.Palette.ADAPTIVE, colors=255)
            pf.info.clear()
            palette_frames.append(pf)
        palette_frames[0].save(
            out_buffer,
            format="GIF",
            save_all=True,
            append_images=palette_frames[1:],
            duration=durations,
            loop=0,
            comment=b"",
            optimize=True,
        )
        mime_type, ext = "image/gif", ".gif"

    optimized_bytes = out_buffer.getvalue()
    sha256_hex = hashlib.sha256(optimized_bytes).hexdigest()
    return OptimizedAssetPayload(
        filename=sanitize_asset_filename(original_filename, ext),
        mime_type=mime_type,
        original_size_bytes=len(raw_bytes),
        optimized_size_bytes=len(optimized_bytes),
        width=frames[0].width,
        height=frames[0].height,
        sha256=sha256_hex,
        encrypted_blob=encrypt_bytes(optimized_bytes),
    )


def optimize_and_encrypt_image(raw_bytes: bytes, original_filename: str | None = None) -> OptimizedAssetPayload:
    """
    Validates real image bytes (anti-spoof / anti-decompression-bomb), preserves animation for GIF/animated WebP,
    normalizes orientation on static screenshots, downscales large dimensions, strips all EXIF/GPS/XMP metadata,
    compresses cleanly, computes SHA-256, and encrypts bytes with AES-256-GCM.
    """
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La imagen está vacía.")
    if len(raw_bytes) > settings.WRITEUP_MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"La imagen excede el límite configurado de {settings.WRITEUP_MAX_IMAGE_BYTES} bytes.",
        )

    Image.MAX_IMAGE_PIXELS = 40_000_000

    try:
        with Image.open(io.BytesIO(raw_bytes)) as opened:
            detected_format = (opened.format or "").upper()
            if detected_format not in ALLOWED_SOURCE_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="Formato no permitido. Usa PNG, JPEG, WebP, GIF, BMP, TIFF o video MP4/WebM.",
                )
            if getattr(opened, "is_animated", False) and getattr(opened, "n_frames", 1) > 1:
                return _optimize_animated_image(opened, raw_bytes, original_filename)

            transposed = ImageOps.exif_transpose(opened)
            has_alpha = transposed.mode in ("RGBA", "LA", "PA") or (
                transposed.mode == "P" and "transparency" in transposed.info
            )
            normalized = transposed.convert("RGBA" if has_alpha else "RGB")
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no corresponde a una imagen válida o está corrupto.",
        ) from exc

    max_dim = settings.WRITEUP_MAX_IMAGE_DIM
    if normalized.width > max_dim or normalized.height > max_dim:
        normalized.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

    target_key = settings.WRITEUP_IMAGE_FORMAT.lower()
    pil_format, mime_type, ext = SUPPORTED_OUTPUT_FORMATS.get(target_key, SUPPORTED_OUTPUT_FORMATS["webp"])
    if pil_format == "JPEG" and normalized.mode == "RGBA":
        background = Image.new("RGB", normalized.size, (255, 255, 255))
        background.paste(normalized, mask=normalized.getchannel("A"))
        normalized = background

    out_buffer = io.BytesIO()
    save_kwargs: dict = {}
    if pil_format in ("WEBP", "JPEG"):
        save_kwargs = {"quality": settings.WRITEUP_IMAGE_QUALITY, "method": 6} if pil_format == "WEBP" else {
            "quality": settings.WRITEUP_IMAGE_QUALITY,
            "optimize": True,
        }
    elif pil_format == "PNG":
        save_kwargs = {"optimize": True}

    normalized.save(out_buffer, format=pil_format, **save_kwargs)
    optimized_bytes = out_buffer.getvalue()
    sha256_hex = hashlib.sha256(optimized_bytes).hexdigest()
    encrypted_blob = encrypt_bytes(optimized_bytes)

    return OptimizedAssetPayload(
        filename=sanitize_asset_filename(original_filename, ext),
        mime_type=mime_type,
        original_size_bytes=len(raw_bytes),
        optimized_size_bytes=len(optimized_bytes),
        width=normalized.width,
        height=normalized.height,
        sha256=sha256_hex,
        encrypted_blob=encrypted_blob,
    )


def _require_ffmpeg() -> str:
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Conversión multimedia no disponible: ffmpeg no está instalado en este servidor.",
        )
    return ffmpeg_bin


def _probe_video_dimensions(input_path: str) -> tuple[int, int]:
    ffprobe_bin = shutil.which("ffprobe")
    if not ffprobe_bin:
        return 0, 0
    try:
        res = subprocess.run(
            [
                ffprobe_bin,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "json",
                input_path,
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if res.returncode == 0 and res.stdout:
            data = json.loads(res.stdout)
            streams = data.get("streams") or []
            if streams:
                return int(streams[0].get("width") or 0), int(streams[0].get("height") or 0)
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return 0, 0


def convert_video_bytes_to_gif(
    video_bytes: bytes,
    original_filename: str | None = None,
    fps: int | None = None,
    max_width: int | None = None,
) -> OptimizedAssetPayload:
    """Converts MP4/WebM/MOV video clips into an adaptive-palette Animated GIF without metadata and encrypts it."""
    if not video_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El video está vacío.")
    if len(video_bytes) > settings.WRITEUP_MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"El video excede el límite de {settings.WRITEUP_MAX_VIDEO_BYTES} bytes.",
        )

    detected = _detect_video_container(video_bytes, original_filename)
    if not detected:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Video inválido. Usa contenedores reales MP4, MOV, WebM o MKV.",
        )

    ffmpeg_bin = _require_ffmpeg()
    target_fps = max(1, min(30, fps or settings.WRITEUP_GIF_FPS))
    target_width = max(160, min(1920, max_width or settings.WRITEUP_MAX_ANIM_DIM))
    src_ext = detected[1]

    with tempfile.TemporaryDirectory() as tmpdir:
        in_path = os.path.join(tmpdir, f"input{src_ext}")
        out_path = os.path.join(tmpdir, "output.gif")
        with open(in_path, "wb") as f:
            f.write(video_bytes)

        vf = (
            f"fps={target_fps},scale='min({target_width},iw)':-1:flags=lanczos,"
            "split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3"
        )
        proc = subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-t",
                str(settings.WRITEUP_MAX_VIDEO_SECONDS),
                "-i",
                in_path,
                "-map_metadata",
                "-1",
                "-vf",
                vf,
                "-loop",
                "0",
                out_path,
            ],
            capture_output=True,
            timeout=90,
            check=False,
        )
        if proc.returncode != 0 or not os.path.exists(out_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo convertir el video a GIF animado. Verifica que contenga pista de video válida.",
            )
        with open(out_path, "rb") as out_f:
            gif_bytes = out_f.read()

    if not gif_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La conversión a GIF produjo un archivo vacío.")

    with Image.open(io.BytesIO(gif_bytes)) as gif_img:
        width, height = gif_img.width, gif_img.height

    sha256_hex = hashlib.sha256(gif_bytes).hexdigest()
    return OptimizedAssetPayload(
        filename=sanitize_asset_filename(original_filename, ".gif"),
        mime_type="image/gif",
        original_size_bytes=len(video_bytes),
        optimized_size_bytes=len(gif_bytes),
        width=width,
        height=height,
        sha256=sha256_hex,
        encrypted_blob=encrypt_bytes(gif_bytes),
    )


def optimize_and_encrypt_video(raw_bytes: bytes, original_filename: str | None = None) -> OptimizedAssetPayload:
    """Strips container metadata from MP4/WebM videos and encrypts them at rest."""
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El video está vacío.")
    if len(raw_bytes) > settings.WRITEUP_MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"El video excede el límite configurado de {settings.WRITEUP_MAX_VIDEO_BYTES} bytes.",
        )
    detected = _detect_video_container(raw_bytes, original_filename)
    if not detected:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Formato de video no permitido. Usa MP4, WebM, MOV o MKV.",
        )

    mime_type, ext, _container = detected
    clean_bytes = raw_bytes
    width, height = 0, 0
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        with tempfile.TemporaryDirectory() as tmpdir:
            in_path = os.path.join(tmpdir, f"in{ext}")
            out_path = os.path.join(tmpdir, f"clean{ext}")
            with open(in_path, "wb") as f:
                f.write(raw_bytes)
            width, height = _probe_video_dimensions(in_path)
            remux_cmd = [
                ffmpeg_bin,
                "-y",
                "-i",
                in_path,
                "-map_metadata",
                "-1",
                "-c",
                "copy",
            ]
            if ext == ".mp4":
                remux_cmd.extend(["-movflags", "+faststart"])
            remux_cmd.append(out_path)
            proc = subprocess.run(remux_cmd, capture_output=True, timeout=60, check=False)
            if proc.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                with open(out_path, "rb") as out_f:
                    clean_bytes = out_f.read()

    sha256_hex = hashlib.sha256(clean_bytes).hexdigest()
    return OptimizedAssetPayload(
        filename=sanitize_asset_filename(original_filename, ext),
        mime_type=mime_type,
        original_size_bytes=len(raw_bytes),
        optimized_size_bytes=len(clean_bytes),
        width=width,
        height=height,
        sha256=sha256_hex,
        encrypted_blob=encrypt_bytes(clean_bytes),
    )


def optimize_and_encrypt_media(
    raw_bytes: bytes,
    original_filename: str | None = None,
    convert_to_gif: bool = False,
) -> OptimizedAssetPayload:
    """Unified dispatcher for static images, animated GIF/WebP, and MP4/WebM/MOV videos."""
    if _detect_video_container(raw_bytes, original_filename) is not None:
        if convert_to_gif:
            return convert_video_bytes_to_gif(raw_bytes, original_filename)
        return optimize_and_encrypt_video(raw_bytes, original_filename)
    return optimize_and_encrypt_image(raw_bytes, original_filename)


def decrypt_asset_bytes(encrypted_blob: bytes) -> bytes:
    """Decrypts AES-256-GCM encrypted media bytes for authenticated serving or export embedding."""
    return decrypt_bytes(encrypted_blob)
