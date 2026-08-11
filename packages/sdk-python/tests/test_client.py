import json
import unittest
from pathlib import Path

from clervo import (
    CLERVO_CONTRACT_VERSION,
    CLERVO_RELEASE_CANDIDATE_ID,
    CLERVO_RELEASE_CANDIDATE_INTERFACE_HASH,
    Clervo,
    ClervoPaymentRequiredError,
    ClervoProblemError,
    ClervoProtocolError,
    HttpResponse,
    recovery_action_for,
)

TRANSCRIPT = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "distribution"
        / "fixtures"
        / "search-client-transcript.v1.json"
    ).read_text(encoding="utf-8")
)
ONBOARDING = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "distribution"
        / "onboarding.v1.json"
    ).read_text(encoding="utf-8")
)


def result(product_id: str, funding_mode: str) -> bytes:
    return json.dumps(
        {
            "contractVersion": CLERVO_CONTRACT_VERSION,
            "operationId": "op_fixture",
            "operation": "search.query",
            "productId": product_id,
            "state": "RECEIPTED",
            "replayed": False,
            "fundingMode": funding_mode,
            "requestHash": f"sha256:{'a' * 64}",
            "output": {"searchResponse": {}},
        }
    ).encode()


class ClientTests(unittest.TestCase):
    def test_package_identity_matches_shared_transcript(self) -> None:
        self.assertEqual(CLERVO_RELEASE_CANDIDATE_ID, TRANSCRIPT["releaseCandidateId"])
        self.assertEqual(
            CLERVO_RELEASE_CANDIDATE_INTERFACE_HASH,
            TRANSCRIPT["interfaceHash"],
        )

    def test_wire_behavior_matches_shared_cross_client_transcript(self) -> None:
        for fixture in TRANSCRIPT["cases"][:2]:
            observed = {}

            def transport(method, url, headers, body, _timeout, _maximum_bytes):
                observed.update(
                    {
                        "method": method,
                        "path": url.split("127.0.0.1:8080", 1)[1],
                        "idempotencyKey": headers["idempotency-key"],
                        "body": json.loads(body),
                    }
                )
                return HttpResponse(
                    200,
                    {"content-type": "application/json"},
                    json.dumps(fixture["response"]).encode(),
                )

            client = Clervo(base_url="http://127.0.0.1:8080", transport=transport)
            method = fixture["method"].split(".", 1)[1]
            input_value = fixture["input"]
            options = fixture["options"]
            value = getattr(client.search, method)(
                query=input_value["query"],
                max_results=input_value.get("maxResults"),
                language=input_value.get("language"),
                region=input_value.get("region"),
                idempotency_key=options["idempotencyKey"],
                mode=options["mode"],
            )
            self.assertEqual(value["productId"], fixture["response"]["productId"])
            self.assertEqual(
                observed,
                {
                    "method": fixture["wire"]["method"],
                    "path": fixture["wire"]["path"],
                    "idempotencyKey": options["idempotencyKey"],
                    "body": fixture["wire"]["body"],
                },
            )

    def test_web_and_answer_bind_exact_product(self) -> None:
        observed = []

        def transport(method, url, headers, body, timeout, maximum_bytes):
            observed.append((method, url, headers, json.loads(body), timeout, maximum_bytes))
            product_id = "search.answer" if json.loads(body)["synthesize"] else "search.web"
            return HttpResponse(200, {"content-type": "application/json"}, result(product_id, "free"))

        client = Clervo(base_url="http://127.0.0.1:8080/", transport=transport)
        self.assertEqual(client.search.web(query="evidence", idempotency_key="idem_web").get("productId"), "search.web")
        self.assertEqual(client.search.answer(query="evidence", idempotency_key="idem_answer").get("productId"), "search.answer")
        self.assertEqual([item[3]["synthesize"] for item in observed], [False, True])
        self.assertTrue(all(item[1].endswith("/v1/search/free") for item in observed))

    def test_402_remains_non_payable_and_visible(self) -> None:
        def transport(*_args):
            return HttpResponse(
                402,
                {"PAYMENT-REQUIRED": "fixture-header"},
                json.dumps({"code": "mock_payment_required", "payable": False}).encode(),
            )

        client = Clervo(base_url="https://preview.clervo.invalid", transport=transport)
        with self.assertRaises(ClervoPaymentRequiredError) as caught:
            client.search.web(query="evidence", mode="challenge")
        self.assertEqual(caught.exception.payment_required, "fixture-header")
        self.assertEqual(caught.exception.problem["payable"], False)

    def test_problem_and_contract_mismatch_fail_closed(self) -> None:
        client = Clervo(
            base_url="https://preview.clervo.invalid",
            transport=lambda *_args: HttpResponse(429, {}, b'{"code":"free_quota_exceeded"}'),
        )
        with self.assertRaises(ClervoProblemError) as caught:
            client.search.web(query="evidence")
        self.assertEqual(caught.exception.status, 429)

        mismatch = Clervo(
            base_url="https://preview.clervo.invalid",
            transport=lambda *_args: HttpResponse(200, {}, result("search.answer", "free")),
        )
        with self.assertRaises(ClervoProtocolError):
            mismatch.search.web(query="evidence")

    def test_base_url_and_response_limit_are_fail_closed(self) -> None:
        with self.assertRaises(TypeError):
            Clervo(base_url="http://metadata.google.internal")
        client = Clervo(
            base_url="https://preview.clervo.invalid",
            max_response_bytes=1024,
            transport=lambda *_args: HttpResponse(200, {}, b"x" * 1025),
        )
        with self.assertRaises(ClervoProtocolError):
            client.search.web(query="evidence")

    def test_recovery_actions_match_all_six_shared_classes(self) -> None:
        for expected in ONBOARDING["recovery"]:
            for problem_code in expected["problemCodes"]:
                action = recovery_action_for(
                    ClervoProblemError(402, {"code": problem_code})
                )
                self.assertIsNotNone(action)
                self.assertEqual(
                    {
                        "code": action.code,
                        "action": action.action,
                        "retry": action.retry,
                    },
                    {
                        "code": expected["code"],
                        "action": expected["action"],
                        "retry": expected["retry"],
                    },
                )
        self.assertIsNone(recovery_action_for("unrelated_failure"))

    def test_models_and_free_ai_share_the_public_contract(self) -> None:
        calls = []
        model_list = {"object": "list", "data": [{"id": "clervo/gpt-oss-20b", "object": "model", "owned_by": "clervo", "clervo": {"identityKind": "canonical", "billingMode": "free"}}], "clervo": {"inventory": {"canonicalModels": 1, "aliases": 0, "callableIds": 1}}}
        ai_result = {"contractVersion": CLERVO_CONTRACT_VERSION, "operationId": "op_ai_fixture", "operation": "ai.execute", "productId": "ai.chat", "model": "clervo/gpt-oss-20b", "exactModelId": "clervo/gpt-oss-20b", "state": "COMPLETED", "replayed": False, "fundingMode": "free", "requestHash": f"sha256:{'b' * 64}", "result": {"output": {"kind": "chat", "content": "ready"}}}

        def transport(method, url, headers, body, _timeout, _maximum_bytes):
            calls.append((method, url, headers, body))
            value = model_list if method == "GET" else ai_result
            return HttpResponse(200, {"content-type": "application/json"}, json.dumps(value).encode())

        client = Clervo(base_url="https://api.clervo.dev", transport=transport)
        self.assertEqual(client.models.list()["clervo"]["inventory"]["callableIds"], 1)
        result_value = client.ai.execute(model="clervo/gpt-oss-20b", input={"kind": "chat", "messages": [{"role": "user", "content": "ready"}], "responseFormat": "text", "stream": False}, idempotency_key="idem_ai_python")
        self.assertEqual(result_value["fundingMode"], "free")
        self.assertTrue(calls[0][1].endswith("/v1/models"))
        self.assertEqual(calls[0][2]["user-agent"], "clervo-sdk/0.4.2")
        self.assertTrue(calls[1][1].endswith("/v1/ai/execute"))
        self.assertEqual(calls[1][2]["user-agent"], "clervo-sdk/0.4.2")
        self.assertEqual(calls[1][2]["idempotency-key"], "idem_ai_python")

    def test_auto_pay_requires_the_shared_local_connect_core(self) -> None:
        with self.assertRaisesRegex(TypeError, "clervo_auto_pay_requires_local_connect"):
            Clervo(auto_pay=True)

    def test_python_paid_path_and_status_use_the_local_connect_bridge(self) -> None:
        calls = []
        ai_result = {
            "contractVersion": CLERVO_CONTRACT_VERSION,
            "operationId": "op_python_connect",
            "operation": "ai.execute",
            "productId": "ai.chat",
            "model": "clervo/exact-model",
            "exactModelId": "clervo/exact-model",
            "state": "RECEIPTED",
            "replayed": False,
            "fundingMode": "paid",
            "requestHash": f"sha256:{'c' * 64}",
            "result": {"output": {"kind": "chat", "content": "ready"}},
            "receipt": {"receiptId": "rcpt_python_connect"},
        }

        def transport(method, url, headers, body, _timeout, _maximum_bytes):
            calls.append((method, url, headers, json.loads(body) if body else None))
            if url.endswith("/clervo/status"):
                value = {"wallet": {"address": "0x" + "1" * 40}, "limits": {"perOperationAtomic": "20000"}, "unreconciled": 0}
            elif url.endswith("/clervo/execute"):
                value = {"status": "completed", "funding": "paid", "idempotencyKey": "idem_python_connect", "outcome": {"result": ai_result}}
            else:
                raise AssertionError(url)
            return HttpResponse(200, {"content-type": "application/json"}, json.dumps(value).encode())

        client = Clervo(connect_url="http://127.0.0.1:8402", auto_pay=True, transport=transport)
        status = client.connect.status()
        result_value = client.ai.execute(
            model="clervo/exact-model",
            input={"kind": "chat", "messages": [{"role": "user", "content": "ready"}], "responseFormat": "text", "stream": False},
            idempotency_key="idem_python_connect",
        )
        self.assertEqual(status["wallet"]["address"], "0x" + "1" * 40)
        self.assertEqual(result_value["exactModelId"], "clervo/exact-model")
        self.assertTrue(calls[0][1].startswith("http://127.0.0.1:8402/clervo/"))
        self.assertEqual(calls[1][3]["productId"], "ai.chat")
        self.assertEqual(calls[1][2]["user-agent"], "clervo-sdk/0.4.2")
        self.assertEqual(calls[1][2]["x-clervo-surface"], "python")


if __name__ == "__main__":
    unittest.main()
