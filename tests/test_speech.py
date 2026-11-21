"""Recording API contract without speech dependencies or network access."""
import base64
import io
import unittest
from contextlib import nullcontext
from unittest.mock import patch

from tideway.domain import ValidationError
from tideway.server import Application
from tideway.speech import GROQ_URL, MAX_AUDIO_BYTES, SpeechTranscriber, SpeechUnavailable, audio_clip


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.clip = b"\x1a\x45\xdf\xa3fixture"
        self.body = {"business_id": "shapla-services", "audio": base64.b64encode(self.clip).decode(),
                     "mime_type": "audio/webm", "lang": "bn", "cloud_consent": True}

    def test_checks_formats_and_byte_limit(self):
        for mime, data in {"audio/webm": self.clip, "audio/ogg": b"OggSfixture",
                           "audio/mp4": b"\x00\x00\x00\x14ftypM4A ", "audio/wav": b"RIFF\x00\x00\x00\x00WAVE"}.items():
            with self.subTest(mime=mime):
                self.assertEqual(audio_clip(base64.b64encode(data).decode(), mime), data)
        for encoded, mime in [(self.body["audio"], "audio/ogg"), ("***", "audio/webm"),
                              (self.body["audio"], []), ("", "audio/webm"),
                              (base64.b64encode(self.clip.ljust(MAX_AUDIO_BYTES + 1, b"0")).decode(), "audio/webm")]:
            with self.subTest(mime=mime), self.assertRaises(ValidationError):
                audio_clip(encoded, mime)

    def test_membership_consent_and_provider_request(self):
        with patch.dict("os.environ", {"TIDEWAY_SPEECH_MODEL_DIR": "", "TIDEWAY_SPEECH_GROQ_API_KEY": "test-key"}):
            app = Application(":memory:")
        self.addCleanup(app.store.close)
        path = "/api/speech/transcribe"
        operator = {"id": "nadia"}
        self.assertEqual(app.config(None)["speech"]["backend"], "groq")
        with patch("tideway.speech.open_provider_request") as fetch:
            with self.assertRaises(PermissionError):
                app.post(path, self.body, None, None)
            with self.assertRaises(PermissionError):
                app.post(path, self.body, {"id": "outsider"}, None)
            with self.assertRaises(ValidationError):
                app.post(path, {**self.body, "cloud_consent": 1}, operator, None)
            with self.assertRaises(ValidationError):
                app.post(path, {**self.body, "lang": "any"}, operator, None)
            fetch.assert_not_called()
            fetch.return_value = nullcontext(io.BytesIO(b'{"text": "  payroll question  "}'))
            self.assertEqual(app.post(path, self.body, operator, None), {"text": "payroll question"})
            request = fetch.call_args.args[0]
            self.assertEqual(request.full_url, GROQ_URL)
            self.assertEqual(request.headers["Authorization"], "Bearer test-key")
            self.assertIn(b'name="language"\r\n\r\nbn\r\n', request.data)
            self.assertIn(self.clip, request.data)

    def test_missing_backend_and_explicit_local_preference(self):
        with patch.dict("os.environ", {"TIDEWAY_SPEECH_MODEL_DIR": "", "TIDEWAY_SPEECH_GROQ_API_KEY": ""}):
            speech = SpeechTranscriber()
        self.assertFalse(speech.status()["available"])
        with self.assertRaises(SpeechUnavailable):
            speech.transcribe(self.body, "nadia")
        with patch.dict("os.environ", {"TIDEWAY_SPEECH_MODEL_DIR": "missing-model", "TIDEWAY_SPEECH_GROQ_API_KEY": "test-key"}):
            self.assertFalse(SpeechTranscriber().status()["available"])
