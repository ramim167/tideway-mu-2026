"""HTTP transport boundary for cloud requests carrying provider credentials."""
from contextlib import contextmanager
from http.client import HTTPConnection, HTTPSConnection
from socket import SHUT_RDWR
from queue import Empty, Queue
from threading import Thread, Timer
from time import monotonic
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPHandler, HTTPSHandler, HTTPRedirectHandler, build_opener


def _origin(url):
    parsed = urlsplit(url)
    port = parsed.port if parsed.port is not None else {"https": 443, "http": 80}.get(parsed.scheme)
    return parsed.scheme, parsed.hostname, port


class SameOriginRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if _origin(req.full_url) != _origin(newurl):
            raise HTTPError(req.full_url, code, "Cross-origin provider redirect refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


@contextmanager
def open_provider_request(request, timeout):
    """Bound the entire HTTP exchange, including trickling headers and bodies."""
    end = monotonic() + timeout
    timers = []
    expired = []

    def interrupt(sock):
        expired.append(True)
        try:
            sock.shutdown(SHUT_RDWR)
        except OSError:
            pass

    class BoundedConnection:
        def connect(self):
            if monotonic() >= end:
                raise TimeoutError("The provider request timed out.")
            self.timeout = end - monotonic()
            super().connect()
            if monotonic() >= end:
                self.close()
                raise TimeoutError("The provider request timed out.")
            timer = Timer(end - monotonic(), interrupt, args=(self.sock,))
            timer.daemon = True
            timers.append(timer)
            timer.start()

    class BoundedHTTP(BoundedConnection, HTTPConnection):
        pass

    class BoundedHTTPS(BoundedConnection, HTTPSConnection):
        pass

    class HttpHandler(HTTPHandler):
        def http_open(self, req):
            return self.do_open(BoundedHTTP, req)

    class HttpsHandler(HTTPSHandler):
        def https_open(self, req):
            return self.do_open(BoundedHTTPS, req, context=self._context)

    try:
        opener = build_opener(HttpHandler(), HttpsHandler(), SameOriginRedirect())
        with opener.open(request, timeout=timeout) as response:
            yield response
            if expired or monotonic() >= end:
                raise TimeoutError("The provider request timed out.")
    except HTTPError as exc:
        exc.close()
        if expired:
            raise TimeoutError("The provider request timed out.") from None
        raise
    except Exception:
        if expired:
            raise TimeoutError("The provider request timed out.") from None
        raise
    finally:
        for timer in timers:
            timer.cancel()


class DeadlineExpired(Exception):
    pass


def remaining_budget(deadline, limit):
    if deadline is None:
        return limit
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise DeadlineExpired("The 120-second answer budget was reached.")
    return min(limit, remaining)


def send_with_deadline(transport, payload, key, deadline):
    """Keep even a slow DNS lookup or trickling response from blocking the caller."""
    result = Queue(maxsize=1)

    def send():
        try:
            result.put((True, transport(payload, key, deadline=deadline)))
        except Exception as exc:
            result.put((False, exc))

    remaining_budget(deadline, 120)
    Thread(target=send, daemon=True).start()
    try:
        success, value = result.get(timeout=remaining_budget(deadline, 120))
    except Empty:
        raise DeadlineExpired("The 120-second answer budget was reached.") from None
    if not success:
        raise value
    return value
