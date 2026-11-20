"""Browser security headers: the microphone works on Tideway's own pages ("Speak your question"); nothing else opens up."""
import http.client
from http.server import ThreadingHTTPServer
import threading
import unittest

from tideway.server import Application, make_handler


class SecurityHeaders(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Application(":memory:")

        class Quiet(make_handler(cls.app)):
            def log_message(self, *_args):
                pass
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.app.store.close()

    def headers(self, path):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=15)
        conn.request("GET", path)
        response = conn.getresponse()
        response.read()
        conn.close()
        return response

    def test_microphone_only_for_tideway_itself(self):
        policy = self.headers("/").getheader("Permissions-Policy")
        self.assertIn("microphone=(self)", policy)  # "Speak your question" needs it; other origins never get it
        self.assertIn("camera=()", policy)
        self.assertIn("geolocation=()", policy)

    def test_other_protections_unchanged(self):
        response = self.headers("/")
        self.assertEqual(response.getheader("X-Frame-Options"), "DENY")
        self.assertIn("frame-ancestors 'none'", response.getheader("Content-Security-Policy"))
        self.assertIn("script-src 'self'", response.getheader("Content-Security-Policy"))


if __name__ == "__main__":
    unittest.main()
