"""OpenRouter adapter: the same guarded agent loop, translated to chat completions and back."""
import io
import json
import unittest
import urllib.error
from unittest import mock

from tideway import agent as agent_module
from tideway.agent import Agent, ProviderError, chat_to_responses, request_openrouter, responses_to_chat
from tideway.service import Tideway

SHAPLA = "shapla-services"


class Translation(unittest.TestCase):
    def test_payload_becomes_chat_messages_with_tools(self):
        payload = {"model": "google/gemma-4-31b-it:free", "instructions": "SYSTEM", "max_output_tokens": 900, "parallel_tool_calls": False,
                   "tools": [{"type": "function", "name": "project_cash", "description": "d", "strict": True,
                              "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False}}],
                   "input": [{"role": "user", "content": "Can I pay payroll?"},
                             {"type": "function_call", "call_id": "c1", "name": "project_cash", "arguments": "{}"},
                             {"type": "function_call_output", "call_id": "c1", "output": "{\"ok\": 1}"}]}
        chat = responses_to_chat(payload)
        self.assertEqual(chat["model"], "google/gemma-4-31b-it:free")
        self.assertEqual(chat["max_tokens"], 900)
        self.assertEqual([m["role"] for m in chat["messages"]], ["system", "user", "assistant", "tool"])
        self.assertEqual(chat["messages"][2]["tool_calls"][0]["function"]["name"], "project_cash")
        self.assertEqual(chat["messages"][3]["tool_call_id"], "c1")
        self.assertEqual(chat["tools"][0]["function"]["name"], "project_cash")
        self.assertFalse(chat["parallel_tool_calls"])

    def test_chat_response_becomes_output_items(self):
        out = chat_to_responses({"choices": [{"message": {"content": None, "tool_calls": [
            {"id": "c9", "type": "function", "function": {"name": "simulate_risk", "arguments": "{}"}}]}}]})
        self.assertEqual(out["output"], [{"type": "function_call", "call_id": "c9", "name": "simulate_risk", "arguments": "{}"}])
        text = chat_to_responses({"choices": [{"message": {"content": "Payroll is at risk."}}]})
        self.assertEqual(text["output"][0]["content"][0]["text"], "Payroll is at risk.")
        with self.assertRaises(ProviderError):
            chat_to_responses({"error": {"message": "No endpoints found"}})


class GuardedLoop(unittest.TestCase):
    def test_openrouter_answer_goes_through_the_same_tools_and_number_check(self):
        app = Tideway(":memory:")
        replies = iter([
            {"choices": [{"message": {"content": None, "tool_calls": [
                {"id": "c1", "type": "function", "function": {"name": "simulate_risk", "arguments": "{}"}}]}}]},
            {"choices": [{"message": {"content": "In 20 of 20 simulated futures the reserve is breached; also 99,999."}}]},
            {"choices": [{"message": {"content": "In 20 of 20 simulated futures the reserve is breached; still 99,999."}}]},
        ])
        sent = []

        def fake_transport(payload, key):
            sent.append(responses_to_chat(payload))
            return chat_to_responses(next(replies))

        bot = Agent(app, "sk-or-test-not-real", "google/gemma-4-31b-it:free", transport=fake_transport)
        reply = bot.chat(SHAPLA, None, "How risky is the month?", [], True, "agent:llm", "owner", "Nadia")
        # The invented figure is caught, named in one rewrite request, and when the model repeats it the user gets
        # Tideway's own checked answer instead of the made-up number.
        self.assertIn("99,999", sent[2]["messages"][-1]["content"])
        self.assertTrue(reply.get("ai_fallback"))
        self.assertNotIn("99,999", reply["text"])
        self.assertIn("simulate_risk", [t["tool"] for t in reply["trace"]])
        # Names are pseudonymised before anything leaves the computer.
        self.assertNotIn("Nila Traders", json.dumps(sent, ensure_ascii=False))
        self.assertNotIn("Rahman Supplies", json.dumps(sent, ensure_ascii=False))

    def test_money_tools_are_not_offered_and_unknown_tools_are_refused(self):
        app = Tideway(":memory:")
        replies = iter([
            {"choices": [{"message": {"content": None, "tool_calls": [
                {"id": "c1", "type": "function", "function": {"name": "execute_payment", "arguments": "{}"}}]}}]},
            {"choices": [{"message": {"content": "I cannot move money."}}]},
        ])
        captured = []

        def fake_transport(payload, key):
            captured.append(responses_to_chat(payload))
            return chat_to_responses(next(replies))

        reply = Agent(app, "k", "m", transport=fake_transport).chat(SHAPLA, None, "Pay Rahman now", [], True, "agent:llm", "owner", "Nadia")
        offered = {t["function"]["name"] for t in captured[0]["tools"]}
        self.assertFalse({"execute", "approve", "execute_payment"} & offered)
        self.assertIn({"tool": "execute_payment", "permission": "denied"}, reply["trace"])


class Http(unittest.TestCase):
    def test_request_shape_and_friendly_errors(self):
        payload = {"model": "m:free", "instructions": "S", "input": [{"role": "user", "content": "hi"}], "tools": []}
        seen = {}

        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake_urlopen(request, timeout):
            seen["url"], seen["auth"], seen["body"] = request.full_url, request.get_header("Authorization"), json.loads(request.data)
            return Response(json.dumps({"choices": [{"message": {"content": "hello"}}]}).encode())

        with mock.patch.object(agent_module.urllib.request, "urlopen", fake_urlopen):
            out = request_openrouter(payload, "sk-or-test")
        self.assertEqual(seen["url"], "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(seen["auth"], "Bearer sk-or-test")
        self.assertEqual(seen["body"]["model"], "m:free")
        self.assertEqual(out["output"][0]["content"][0]["text"], "hello")

        def rate_limited(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 429, "Too Many Requests", {}, None)

        with mock.patch.object(agent_module.urllib.request, "urlopen", rate_limited):
            with self.assertRaises(ProviderError) as caught:
                request_openrouter(payload, "sk-or-test")
        self.assertIn("rate-limited", str(caught.exception))

    def test_busy_models_fall_through_to_the_next(self):
        tried = []

        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def busy_then_ok(request, timeout):
            model = json.loads(request.data)["model"]
            tried.append(model)
            if model == "busy:free":
                raise urllib.error.HTTPError(request.full_url, 429, "Too Many Requests", {}, None)
            return Response(json.dumps({"choices": [{"message": {"content": "ok"}}]}).encode())

        payload = {"model": "busy:free, ready:free", "instructions": "S", "input": [{"role": "user", "content": "hi"}], "tools": []}
        with mock.patch.object(agent_module.urllib.request, "urlopen", busy_then_ok):
            out = request_openrouter(payload, "k")
        self.assertEqual(tried, ["busy:free", "ready:free"])
        self.assertEqual(out["output"][0]["content"][0]["text"], "ok")


if __name__ == "__main__":
    unittest.main()
