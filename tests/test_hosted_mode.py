"""Hosted demo (for example on Render): only the configured public hostname is accepted besides loopback."""
import http.client
from http.server import ThreadingHTTPServer
import json
import os
import threading
import unittest
from unittest import mock

from tideway.server import Application, make_handler

PUBLIC = "tideway-demo.onrender.com"


class HostedMode(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Application(":memory:")
        with mock.patch.dict(os.environ, {"RENDER_EXTERNAL_HOSTNAME": PUBLIC}):
            handler = make_handler(cls.app)

        class Quiet(handler):
            def log_message(self, *_args):
                pass
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.app.store.close()

    def request(self, method, path, headers, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=15)
        conn.request(method, path, body, headers)
        response = conn.getresponse()
        response.read()
        conn.close()
        return response

    def login(self, host, origin, proto="https"):
        return self.request("POST", "/api/session/login", {
            "Host": host, "Origin": origin, "X-Forwarded-Proto": proto, "X-Forwarded-For": "203.0.113.7",
            "Content-Type": "application/json", "X-Tideway-Token": self.app.csrf},
            json.dumps({"operator_id": "nadia", "pin": "2468"}))

    def test_public_hostname_works_over_https_with_a_secure_cookie(self):
        self.assertEqual(self.request("GET", "/", {"Host": PUBLIC}).status, 200)
        response = self.login(PUBLIC, f"https://{PUBLIC}")
        self.assertEqual(response.status, 200)
        self.assertIn("; Secure", response.getheader("Set-Cookie"))

    def test_other_hosts_and_origins_are_refused(self):
        self.assertEqual(self.request("GET", "/", {"Host": "evil.example.com"}).status, 403)
        self.assertEqual(self.login(PUBLIC, "https://evil.example.com").status, 403)
        self.assertEqual(self.login(PUBLIC, f"http://{PUBLIC}").status, 403)  # plain http origin is not the deployment

    def test_local_use_is_unchanged(self):
        port = self.server.server_port
        response = self.login(f"127.0.0.1:{port}", f"http://127.0.0.1:{port}", proto="")
        self.assertEqual(response.status, 200)
        self.assertNotIn("Secure", response.getheader("Set-Cookie"))


if __name__ == "__main__":
    unittest.main()
