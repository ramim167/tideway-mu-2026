"""Optional transcription for microphone recordings. Audio is handled in memory."""
from __future__ import annotations

import base64
import binascii
import io
import json
import os
import secrets
import threading
from importlib.util import find_spec
from pathlib import Path
from urllib.request import Request

from .domain import ValidationError
from .provider_http import open_provider_request
from .security import RateLimiter

MAX_AUDIO_BYTES = 1_200_000
MAX_BASE64_CHARS = 4 * ((MAX_AUDIO_BYTES + 2) // 3)
MAX_AUDIO_BODY = MAX_BASE64_CHARS + 1024
MAX_SECONDS = 45
SAMPLE_RATE = 16_000
GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
FORMATS = {
    "audio/webm": ("webm", "matroska", 0, b"\x1a\x45\xdf\xa3"),
    "audio/ogg": ("ogg", "ogg", 0, b"OggS"),
    "audio/mp4": ("m4a", "mov", 4, b"ftyp"),
    "audio/wav": ("wav", "wav", 8, b"WAVE"),
}


class SpeechUnavailable(RuntimeError):
    pass


def audio_clip(encoded, mime):
    if not isinstance(mime, str) or mime not in FORMATS:
        raise ValidationError("Unsupported recording format.")
    if not isinstance(encoded, str) or not 0 < len(encoded) <= MAX_BASE64_CHARS:
        raise ValidationError("The voice clip is empty or too large.")
    try:
        clip = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValidationError("Invalid voice clip.") from exc
    _, _, offset, signature = FORMATS[mime]
    if not 0 < len(clip) <= MAX_AUDIO_BYTES or not clip.startswith(signature, offset):
        raise ValidationError("The audio does not match its recording format.")
    if mime == "audio/wav" and not clip.startswith(b"RIFF"):
        raise ValidationError("The audio does not match its recording format.")
    return clip


class SpeechTranscriber:
    def __init__(self):
        model_dir = os.getenv("TIDEWAY_SPEECH_MODEL_DIR", "").strip()
        self.model_dir = Path(model_dir).expanduser() if model_dir else None
        self.groq_key = os.getenv("TIDEWAY_SPEECH_GROQ_API_KEY", "").strip()
        self.model = None
        self.slot = threading.BoundedSemaphore(1)
        self.rate = RateLimiter(capacity=5, refill_per_second=0.1)

    def status(self):
        backend = None
        if self.model_dir is not None:
            if (self.model_dir / "model.bin").is_file() and find_spec("faster_whisper"):
                backend = "local"
        elif self.groq_key:
            backend = "groq"
        return {"available": backend is not None, "backend": backend,
                "max_seconds": MAX_SECONDS, "max_upload_bytes": MAX_AUDIO_BYTES}

    def transcribe(self, body, operator_id):
        backend = self.status()["backend"]
        if backend is None:
            raise SpeechUnavailable("Recording transcription is unavailable on this server.")
        if body["lang"] not in ("en", "bn"):
            raise ValidationError("Invalid dictation language.")
        if backend == "groq" and body.get("cloud_consent") is not True:
            raise ValidationError("Allow Groq transcription before sending a voice clip.")
        clip = audio_clip(body["audio"], body["mime_type"])
        if not self.slot.acquire(blocking=False):
            raise SpeechUnavailable("Another voice clip is being transcribed. Try again shortly.")
        try:
            if not self.rate.allow(operator_id):
                raise SpeechUnavailable("Too many voice clips. Try again shortly.")
            recognize = self._local if backend == "local" else self._groq
            text = recognize(clip, body["mime_type"], body["lang"])
            if not isinstance(text, str):
                raise SpeechUnavailable("Transcription did not return text. Try again.")
            return {"text": text.strip()[:2000]}
        finally:
            self.slot.release()

    def _local(self, clip, mime, lang):
        try:
            import av
            import numpy as np
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise SpeechUnavailable("The server’s local speech runtime could not start.") from exc

        samples = []
        length = 0
        try:
            with av.open(io.BytesIO(clip), format=FORMATS[mime][1]) as container:
                resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
                for frame in container.decode(audio=0):
                    for chunk in resampler.resample(frame):
                        length += chunk.samples
                        if length > (MAX_SECONDS + 1) * SAMPLE_RATE:
                            raise ValidationError(f"Keep each voice clip within {MAX_SECONDS} seconds.")
                        samples.append(chunk.to_ndarray().reshape(-1))
        except ValidationError:
            raise
        except (av.FFmpegError, IndexError, ValueError) as exc:
            raise ValidationError("The voice clip could not be read.") from exc
        if not samples:
            return ""
        audio = np.concatenate(samples).astype(np.float32) / 32768.0
        try:
            if self.model is None:
                self.model = WhisperModel(str(self.model_dir), device="cpu", compute_type="int8",
                                          cpu_threads=2, local_files_only=True)
            segments, _ = self.model.transcribe(audio, language=lang, beam_size=1,
                                                 condition_on_previous_text=False, vad_filter=True)
            return " ".join(segment.text.strip() for segment in segments)
        except (OSError, RuntimeError, ValueError) as exc:
            raise SpeechUnavailable("The server’s local speech model could not transcribe this clip.") from exc

    def _groq(self, clip, mime, lang):
        boundary = secrets.token_hex(24)
        parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
                 for name, value in (("model", "whisper-large-v3-turbo"), ("language", lang),
                                     ("response_format", "json"))]
        extension = FORMATS[mime][0]
        parts.extend([
            (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.{extension}"\r\n'
             f"Content-Type: {mime}\r\n\r\n").encode(), clip, f"\r\n--{boundary}--\r\n".encode(),
        ])
        request = Request(GROQ_URL, data=b"".join(parts), headers={
            "Authorization": f"Bearer {self.groq_key}", "Accept": "application/json",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        })
        try:
            with open_provider_request(request, timeout=20) as response:
                raw = response.read(65_537)
                if len(raw) > 65_536:
                    raise SpeechUnavailable("Groq returned an oversized transcription response.")
                result = json.loads(raw)
        except (OSError, ValueError) as exc:
            raise SpeechUnavailable("Groq transcription is temporarily unavailable. Try again shortly.") from exc
        return result.get("text") if isinstance(result, dict) else None
