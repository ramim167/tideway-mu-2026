"""HTTP transport boundary for cloud requests carrying provider credentials."""
from queue import Empty, Queue
from threading import Thread
from time import monotonic
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, build_opener


def _origin(url):
    parsed = urlsplit(url)
    port = parsed.port if parsed.port is not None else {"https": 443, "http": 80}.get(parsed.scheme)
    return parsed.scheme, parsed.hostname, port


class SameOriginRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if _origin(req.full_url) != _origin(newurl):
            raise HTTPError(req.full_url, code, "Cross-origin provider redirect refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_provider_request(request, timeout):
    return build_opener(SameOriginRedirect()).open(request, timeout=timeout)

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
