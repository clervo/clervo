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


if __name__ == "__main__":
    unittest.main()
