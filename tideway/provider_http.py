"""HTTP transport boundary for cloud requests carrying provider credentials."""
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
