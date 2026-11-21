"""Several AI providers, tried in order, so a busy or failing one never blocks an answer.

Every provider here speaks the OpenAI chat-completions format. MoneyGuard tries them in order (and each
provider's models in order) and moves on when one is busy (429), down (5xx, timeout), missing a model
(404) or out of quota / wrongly keyed (401, 402, 403). The agent's guards are unchanged whichever
provider answers: names are pseudonymised, only read/propose tools exist, every number is checked.

Configure in .env (all optional; keys never leave this computer except to the provider they belong to):
  GEMINI_API_KEY      Google AI Studio (free tier)            GEMINI_MODEL      default gemini-2.5-flash
  GROQ_API_KEY        Groq (free tier)                        GROQ_MODEL        default llama-3.3-70b-versatile
  OPENROUTER_API_KEY  OpenRouter (:free models cost nothing)  OPENROUTER_MODEL  comma-separated list
  CUSTOM_AI_BASE_URL  any other OpenAI-compatible service (https only), with CUSTOM_AI_API_KEY and CUSTOM_AI_MODEL
  TIDEWAY_AI_ORDER    order to try, default gemini,groq,openrouter,custom
Each MODEL setting may be a comma-separated list.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from .provider_http import open_provider_request, remaining_budget
from .agent import OPENROUTER_DEFAULT_MODEL, OPENROUTER_URL, ProviderError, chat_to_responses, responses_to_chat

KNOWN = {
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "gemini-2.5-flash",
               "GEMINI_API_KEY", "GEMINI_MODEL"),
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile", "GROQ_API_KEY", "GROQ_MODEL"),
    "openrouter": (OPENROUTER_URL, OPENROUTER_DEFAULT_MODEL, "OPENROUTER_API_KEY", "OPENROUTER_MODEL"),
}
DEFAULT_ORDER = ("gemini", "groq", "openrouter", "custom")
NEXT_MODEL = (404, 408, 409, 429, 500, 502, 503, 504)   # try this provider's next model
NEXT_PROVIDER = (401, 402, 403)                          # key or quota problem: skip to the next provider
TIMEOUT_SECONDS = 20  # a stuck model gives way to the next one sooner


@dataclass
class Provider:
    name: str
    url: str
    key: str = field(repr=False)
    models: list


def _models(value, default):
    models = [m.strip() for m in str(value or "").split(",") if m.strip()]
    return models or [m.strip() for m in default.split(",") if m.strip()]


def _custom_url(base):
    base = str(base or "").strip()
    parsed = urllib.parse.urlparse(base)
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
        raise ValueError("CUSTOM_AI_BASE_URL must use https:// (http is allowed only for localhost).")
    if not parsed.netloc:
        raise ValueError("CUSTOM_AI_BASE_URL is not a valid URL.")
    return base if base.rstrip("/").endswith("/chat/completions") else base.rstrip("/") + "/chat/completions"


def providers_from_env(env):
    """The configured providers, in the order to try them. Empty when no key is set."""
    found = {}
    for name, (url, default_model, key_var, model_var) in KNOWN.items():
        key = str(env.get(key_var, "")).strip().strip("\"'")
        if key:
            found[name] = Provider(name, url, key, _models(env.get(model_var), default_model))
    custom_key = str(env.get("CUSTOM_AI_API_KEY", "")).strip().strip("\"'")
    if custom_key and str(env.get("CUSTOM_AI_BASE_URL", "")).strip():
        models = _models(env.get("CUSTOM_AI_MODEL"), "")
        if not models:
            raise ValueError("Set CUSTOM_AI_MODEL for the custom AI provider.")
        found["custom"] = Provider(str(env.get("CUSTOM_AI_NAME", "")).strip() or "custom", _custom_url(env.get("CUSTOM_AI_BASE_URL")),
                                   custom_key, models)
    order = [n.strip() for n in str(env.get("TIDEWAY_AI_ORDER", "")).split(",") if n.strip()] or list(DEFAULT_ORDER)
    ordered = [found[n] for n in order if n in found]
    return ordered + [p for n, p in found.items() if p not in ordered]


def label(providers):
    return " → ".join(f"{p.name} ({p.models[0]}{' +' + str(len(p.models) - 1) if len(p.models) > 1 else ''})" for p in providers)


def _post(provider, chat, deadline):
    headers = {"Authorization": f"Bearer {provider.key}", "Content-Type": "application/json"}
    if provider.name == "openrouter":
        headers.update({"HTTP-Referer": "https://github.com/ramim167/moneyguard-mu-2026", "X-Title": "MoneyGuard"})
    request = urllib.request.Request(provider.url, data=json.dumps(chat, ensure_ascii=False).encode(), headers=headers, method="POST")
    with open_provider_request(request, timeout=remaining_budget(deadline, TIMEOUT_SECONDS)) as response:
        raw = response.read(262145)
    if len(raw) > 262144:
        raise ProviderError("The AI response exceeded the 256 KiB limit.")
    return chat_to_responses(json.loads(raw))


def _has_content(result):
    """True when a reply has a tool call or some non-blank text."""
    for item in result.get("output") or []:
        if item.get("type") == "function_call":
            return True
        for part in item.get("content") or []:
            if isinstance(part, dict) and str(part.get("text") or "").strip():
                return True
    return False


def make_transport(providers):
    """A transport for Agent: same payload in, same {"output": [...]} out, with provider and model fallback."""
    if not providers:
        raise ValueError("No AI provider is configured.")

    def attempts(payload):
        chat = responses_to_chat(payload)
        for provider in providers:
            yield provider, [{**chat, "model": model} for model in provider.models]

    def transport(payload, _key=None, deadline=None):
        if deadline is None:
            deadline = time.monotonic() + 120
        tried = []
        for provider, bodies in attempts(payload):
            for chat in bodies:
                try:
                    result = _post(provider, chat, deadline)
                    if _has_content(result):
                        return result
                    tried.append(f"{provider.name}: empty reply")  # some free models answer with nothing: try the next
                    continue
                except urllib.error.HTTPError as exc:
                    tried.append(f"{provider.name} {exc.code}")
                    if exc.code in NEXT_PROVIDER:
                        break
                    if exc.code in NEXT_MODEL:
                        continue
                    break
                except ProviderError as exc:
                    tried.append(f"{provider.name}: {str(exc)[:60]}")
                    continue
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
                    tried.append(f"{provider.name} unreachable")
                    break
        busy = all(" 429" in t for t in tried)
        raise ProviderError(("Every AI provider is busy right now" if busy else "No AI provider answered")
                            + f" ({', '.join(tried[:8])}). The local agent still works; try again in a minute.")

    def preview_attempts(payload):
        return [{"provider": provider.name, "payload": body} for provider, bodies in attempts(payload) for body in bodies]

    transport.preview_attempts = preview_attempts
    transport.providers = providers
    return transport
