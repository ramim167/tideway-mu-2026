"""Several AI providers in order: a busy, broken or out-of-quota one never blocks the answer."""
import io
import json
import unittest
import urllib.error
from unittest import mock

from tideway import ai_providers
from tideway.agent import ProviderError
from tideway.ai_providers import label, make_transport, providers_from_env

PAYLOAD = {"model": "ignored", "instructions": "S", "input": [{"role": "user", "content": "hi"}], "tools": []}


class TransportBudget(unittest.TestCase):
    def test_trickling_response_closes_within_connection_budget(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Event, Thread
        from time import monotonic
        from urllib.request import Request

        from tideway.provider_http import open_provider_request

        closed = Event()

        class SlowResponse(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Length", "1000")
                self.end_headers()
                try:
                    for _ in range(100):
                        self.wfile.write(b"x")
                        closed.wait(.03)
                except OSError:
                    closed.set()

            def log_message(self, *_args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), SlowResponse) as server:
            worker = Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                started = monotonic()
                request = Request(f"http://127.0.0.1:{server.server_port}")
                with self.assertRaises(TimeoutError), open_provider_request(request, .2) as response:
                    response.read(1000)
                self.assertLess(monotonic() - started, 1.5)
                self.assertTrue(closed.wait(1))
            finally:
                server.shutdown()
                worker.join()


class Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def scripted(outcomes, calls):
    """outcomes: {(host, model): status or "ok"}; anything unlisted answers ok."""
    def urlopen(request, timeout):
        host, model = request.full_url.split("/")[2], json.loads(request.data)["model"]
        calls.append((host, model, request.get_header("Authorization")))
        outcome = outcomes.get((host, model), "ok")
        if outcome != "ok":
            raise urllib.error.HTTPError(request.full_url, outcome, "x", {}, None)
        return Response(json.dumps({"choices": [{"message": {"content": f"answer from {host} {model}"}}]}).encode())
    return urlopen


class Config(unittest.TestCase):
    def test_only_configured_providers_in_the_chosen_order(self):
        env = {"OPENROUTER_API_KEY": "or-k", "GROQ_API_KEY": "gq-k", "GEMINI_API_KEY": "gm-k", "TIDEWAY_AI_ORDER": "openrouter,gemini"}
        names = [p.name for p in providers_from_env(env)]
        self.assertEqual(names, ["openrouter", "gemini", "groq"])
        self.assertEqual(providers_from_env({}), [])
        self.assertIn("gemini (gemini-2.5-flash)", label(providers_from_env({"GEMINI_API_KEY": "k"})))

    def test_custom_provider_needs_https_and_a_model(self):
        ok = providers_from_env({"CUSTOM_AI_BASE_URL": "https://ai.example.com/v1", "CUSTOM_AI_API_KEY": "k", "CUSTOM_AI_MODEL": "m1,m2"})
        self.assertEqual(ok[0].url, "https://ai.example.com/v1/chat/completions")
        self.assertEqual(ok[0].models, ["m1", "m2"])
        local = providers_from_env({"CUSTOM_AI_BASE_URL": "http://127.0.0.1:9000/v1", "CUSTOM_AI_API_KEY": "k", "CUSTOM_AI_MODEL": "m"})
        self.assertEqual(local[0].url, "http://127.0.0.1:9000/v1/chat/completions")
        with self.assertRaises(ValueError):
            providers_from_env({"CUSTOM_AI_BASE_URL": "http://ai.example.com/v1", "CUSTOM_AI_API_KEY": "k", "CUSTOM_AI_MODEL": "m"})
        with self.assertRaises(ValueError):
            providers_from_env({"CUSTOM_AI_BASE_URL": "https://ai.example.com/v1", "CUSTOM_AI_API_KEY": "k"})

    def test_keys_are_not_printed(self):
        provider = providers_from_env({"GROQ_API_KEY": "secret-groq-key"})[0]
        self.assertNotIn("secret-groq-key", repr(provider))
        self.assertNotIn("secret-groq-key", label([provider]))


class RedirectPolicy(unittest.TestCase):
    def test_only_same_origin_redirects_are_followed(self):
        from urllib.error import HTTPError
        from urllib.request import Request
        from tideway.provider_http import SameOriginRedirect

        handler = SameOriginRedirect()
        request = Request("https://provider.example/v1", data=b"{}")
        same = handler.redirect_request(request, None, 302, "", {}, "https://PROVIDER.example:443/v2")
        self.assertEqual(same.full_url, "https://PROVIDER.example:443/v2")
        for url in ("https://other.example/v2", "http://provider.example/v2", "https://provider.example:8888/v2"):
            with self.subTest(url=url), self.assertRaises(HTTPError):
                handler.redirect_request(request, None, 302, "", {}, url)


class Fallback(unittest.TestCase):
    env = {"GEMINI_API_KEY": "gm-k", "GROQ_API_KEY": "gq-k", "OPENROUTER_API_KEY": "or-k", "OPENROUTER_MODEL": "a:free,b:free"}

    def run_with(self, outcomes):
        calls = []
        transport = make_transport(providers_from_env(self.env))
        with mock.patch.object(ai_providers, "open_provider_request", scripted(outcomes, calls)):
            try:
                return transport(PAYLOAD), calls
            except ProviderError as exc:
                return exc, calls

    def test_busy_first_provider_falls_through_to_the_next(self):
        out, calls = self.run_with({("generativelanguage.googleapis.com", "gemini-2.5-flash"): 429})
        self.assertEqual(out["output"][0]["content"][0]["text"], "answer from api.groq.com llama-3.3-70b-versatile")
        self.assertEqual([c[0] for c in calls], ["generativelanguage.googleapis.com", "api.groq.com"])
        self.assertEqual(calls[1][2], "Bearer gq-k")  # each provider gets only its own key

    def test_bad_key_skips_provider_and_busy_model_tries_next_model(self):
        out, calls = self.run_with({("generativelanguage.googleapis.com", "gemini-2.5-flash"): 401,
                                    ("api.groq.com", "llama-3.3-70b-versatile"): 503,
                                    ("openrouter.ai", "a:free"): 429})
        self.assertEqual(out["output"][0]["content"][0]["text"], "answer from openrouter.ai b:free")
        self.assertEqual([c[1] for c in calls], ["gemini-2.5-flash", "llama-3.3-70b-versatile", "a:free", "b:free"])

    def test_an_empty_reply_tries_the_next_model(self):
        calls = []
        base = scripted({}, calls)

        def urlopen(request, timeout):
            if json.loads(request.data)["model"] == "gemini-2.5-flash":
                calls.append(("generativelanguage.googleapis.com", "gemini-2.5-flash", None))
                return Response(json.dumps({"choices": [{"message": {"content": "  "}}]}).encode())
            return base(request, timeout)
        with mock.patch.object(ai_providers, "open_provider_request", urlopen):
            out = make_transport(providers_from_env(self.env))(PAYLOAD)
        self.assertEqual(out["output"][0]["content"][0]["text"], "answer from api.groq.com llama-3.3-70b-versatile")

    def test_deadline_caps_each_model_and_stops_the_fallback_chain(self):
        from tideway.provider_http import DeadlineExpired
        clock = [0.0]
        timeouts = []

        def busy(request, timeout):
            timeouts.append(timeout)
            clock[0] += timeout
            raise urllib.error.HTTPError(request.full_url, 429, "busy", {}, None)

        transport = make_transport(providers_from_env({"GROQ_API_KEY": "test", "GROQ_MODEL": "a,b,c,d,e,f"}))
        with mock.patch("tideway.provider_http.monotonic", side_effect=lambda: clock[0]), \
                mock.patch.object(ai_providers, "open_provider_request", busy), self.assertRaises(DeadlineExpired):
            transport(PAYLOAD, deadline=95)
        self.assertEqual(timeouts, [20, 20, 20, 20, 15])  # 20 s per model, never past the 95 s deadline

    def test_bangla_preview_shows_wire_body_with_lab_disabled(self):
        from tideway.server import Application
        calls = []
        providers = providers_from_env(self.env)
        app = Application(":memory:", "configured", "multiple providers", transport=make_transport(providers))
        self.addCleanup(app.store.close)
        app.lab_enabled = False
        operator = {"id": "nadia", "name": "Nadia", "role": "owner"}
        body = {"business_id": "shapla-services", "message": "Explain Nila Traders", "lang": "bn"}

        def send(request, timeout):
            calls.append(json.loads(request.data))
            return Response(json.dumps({"choices": [{"message": {"content": "নগদ দেখুন।"}}]}).encode())

        with mock.patch.object(ai_providers, "open_provider_request", send):
            preview = app.post("/api/chat/preview", body, operator, None)
            self.assertFalse(calls)
            app.post("/api/chat", {**body, "consent": True}, operator, None)
        self.assertEqual(preview["initial_payload"], calls[0])
        self.assertIn("Always reply in standard Bangla", calls[0]["messages"][0]["content"])
        self.assertEqual([d["model"] for d in preview["destinations"]], [m for p in providers for m in p.models])
        self.assertNotIn("gm-k", str(preview))

    def test_everyone_busy_gives_a_clear_message(self):
        out, _ = self.run_with({("generativelanguage.googleapis.com", "gemini-2.5-flash"): 429, ("api.groq.com", "llama-3.3-70b-versatile"): 429,
                                ("openrouter.ai", "a:free"): 429, ("openrouter.ai", "b:free"): 429})
        self.assertIsInstance(out, ProviderError)
        self.assertIn("Every AI provider is busy", str(out))
        self.assertIn("local agent still works", str(out))


if __name__ == "__main__":
    unittest.main()
