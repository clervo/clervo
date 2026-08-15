from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

CLERVO_CONTRACT_VERSION = "2026-07-29.1"


class ClervoError(Exception):
    """Base exception for the Clervo client."""


class ClervoTransportError(ClervoError):
    """The request could not reach the configured Clervo endpoint."""


class ClervoProtocolError(ClervoError):
    """The endpoint returned bytes that do not satisfy the API contract."""


class ClervoProblemError(ClervoError):
    def __init__(self, status: int, problem: Mapping[str, Any]) -> None:
        self.status = status
        self.problem = dict(problem)
        code = self.problem.get("code")
        super().__init__(code if isinstance(code, str) else f"clervo_http_{status}")


class ClervoPaymentRequiredError(ClervoProblemError):
    def __init__(
        self,
        problem: Mapping[str, Any],
        payment_required: str | None,
    ) -> None:
        self.payment_required = payment_required
        super().__init__(402, problem)


@dataclass(frozen=True)
class ClervoRecoveryAction:
    code: str
    action: str
    retry: str


_RECOVERY_ACTIONS = (
    (
        "insufficient_funds",
        {"insufficient_funds"},
        "Add enough of the quoted asset on the quoted network, then request a fresh quote.",
        "after_action",
    ),
    (
        "wrong_network_or_asset",
        {"wrong_network", "wrong_asset", "unsupported_network", "unsupported_asset"},
        "Switch to the quote's exact network and asset, then request a fresh quote.",
        "after_action",
    ),
    (
        "expired_quote",
        {"quote_expired", "expired_quote"},
        "Request a fresh quote and never reuse the expired authorization.",
        "after_action",
    ),
    (
        "rejected",
        {"authorization_rejected", "payment_rejected", "user_rejected"},
        "Review the maximum charge and approve again only if you still intend to pay.",
        "after_action",
    ),
    (
        "timeout",
        {"authorization_timeout", "payment_timeout"},
        "Reconcile the existing idempotency key before deciding whether to retry.",
        "prohibited_until_reconciled",
    ),
    (
        "unknown_settlement",
        {"settlement_unknown", "unknown_settlement"},
        "Reconcile the existing operation and do not authorize or retry until settlement is definitive.",
        "prohibited_until_reconciled",
    ),
)


def recovery_action_for(value: ClervoProblemError | str) -> ClervoRecoveryAction | None:
    problem_code: str | None
    if isinstance(value, ClervoProblemError):
        code = value.problem.get("code")
        problem_code = code if isinstance(code, str) else None
    elif isinstance(value, str):
        problem_code = value
    else:
        problem_code = None
    if problem_code is None:
        return None
    for code, problem_codes, action, retry in _RECOVERY_ACTIONS:
        if problem_code in problem_codes:
            return ClervoRecoveryAction(code=code, action=action, retry=retry)
    return None


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes


Transport = Callable[[str, str, Mapping[str, str], bytes, float, int], HttpResponse]


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def _urllib_transport(
    method: str,
    url: str,
    headers: Mapping[str, str],
    body: bytes,
    timeout: float,
    maximum_bytes: int,
) -> HttpResponse:
    request = Request(url, data=body, headers=dict(headers), method=method)
    opener = build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=timeout) as response:
            payload = response.read(maximum_bytes + 1)
            if len(payload) > maximum_bytes:
                raise ClervoProtocolError("clervo_response_too_large")
            return HttpResponse(
                status=response.status,
                headers={key.lower(): value for key, value in response.headers.items()},
                body=payload,
            )
    except HTTPError as error:
        payload = error.read(maximum_bytes + 1)
        if len(payload) > maximum_bytes:
            raise ClervoProtocolError("clervo_response_too_large") from error
        return HttpResponse(
            status=error.code,
            headers={key.lower(): value for key, value in error.headers.items()},
            body=payload,
        )
    except (OSError, URLError) as error:
        raise ClervoTransportError("clervo_transport_failed") from error


def _base_url(value: str) -> str:
    if not isinstance(value, str):
        raise TypeError("invalid_clervo_base_url")
    parsed = urlsplit(value)
    loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
        raise TypeError("unsafe_clervo_base_url")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise TypeError("invalid_clervo_base_url")
    if not parsed.hostname:
        raise TypeError("invalid_clervo_base_url")
    path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _request_body(
    product_id: str,
    query: str,
    max_results: int | None,
    language: str | None,
    region: str | None,
) -> dict[str, Any]:
    if (
        not isinstance(query, str)
        or not 1 <= len(query.strip()) <= 2_000
        or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", query) is not None
    ):
        raise TypeError("invalid_search_query")
    if max_results is not None and (
        isinstance(max_results, bool)
        or not isinstance(max_results, int)
        or not 1 <= max_results <= 10
    ):
        raise TypeError("invalid_search_max_results")
    if language is not None and (
        not isinstance(language, str) or re.fullmatch(r"[a-z]{2,3}", language) is None
    ):
        raise TypeError("invalid_search_language")
    if region is not None and (
        not isinstance(region, str) or re.fullmatch(r"[A-Z]{2}", region) is None
    ):
        raise TypeError("invalid_search_region")
    return {
        "query": query.strip(),
        **({} if max_results is None else {"maxResults": max_results}),
        "synthesize": False,
        **({} if language is None else {"language": language}),
        **({} if region is None else {"region": region}),
    }


def _json_object(payload: bytes) -> dict[str, Any]:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ClervoProtocolError("clervo_response_invalid_json") from error
    if not isinstance(value, dict):
        raise ClervoProtocolError("clervo_response_invalid_shape")
    return value


def _result(
    value: dict[str, Any],
    product_id: str,
    funding_mode: str,
) -> dict[str, Any]:
    if (
        value.get("contractVersion") != CLERVO_CONTRACT_VERSION
        or value.get("operation") != "search.query"
        or value.get("productId") != product_id
        or value.get("state") != "RECEIPTED"
        or value.get("fundingMode") != funding_mode
        or not isinstance(value.get("operationId"), str)
        or not isinstance(value.get("requestHash"), str)
        or not isinstance(value.get("replayed"), bool)
        or not isinstance(value.get("output"), dict)
    ):
        raise ClervoProtocolError("clervo_result_contract_mismatch")
    return value


class _Search:
    def __init__(self, client: Clervo) -> None:
        self._client = client

    def web(
        self,
        *,
        query: str,
        max_results: int | None = None,
        language: str | None = None,
        region: str | None = None,
        idempotency_key: str | None = None,
        mode: str = "preview",
        timeout: float | None = None,
    ) -> dict[str, Any]:
        return self._client._execute(
            "search.web",
            query,
            max_results,
            language,
            region,
            idempotency_key,
            mode,
            timeout,
        )

class _Models:
    def __init__(self, client: Clervo) -> None:
        self._client = client

    def list(self, *, timeout: float | None = None) -> dict[str, Any]:
        value = self._client._json_call("GET", "/v1/models", {}, None, timeout)
        data = value.get("data")
        metadata = value.get("clervo")
        if (
            value.get("object") != "list"
            or not isinstance(data, list)
            or not isinstance(metadata, dict)
            or not isinstance(metadata.get("inventory"), dict)
            or metadata["inventory"].get("callableIds") != len(data)
            or any(not isinstance(item, dict) or item.get("object") != "model" or item.get("owned_by") != "clervo" or not isinstance(item.get("id"), str) or not isinstance(item.get("clervo"), dict) for item in data)
        ):
            raise ClervoProtocolError("clervo_model_catalog_contract_mismatch")
        return value


class _Connect:
    """Local bridge to the shipped ``clervo proxy`` process.

    The bridge deliberately contains no wallet or signing implementation.  All
    paid calls cross loopback into the Router Connect core, so Python observes
    the same limits, operation records, ambiguity freeze, receipts and wallet as
    the CLI, MCP, TypeScript and OpenAI surfaces.
    """

    def __init__(self, client: Clervo) -> None:
        self._client = client

    def _call(self, method: str, target: str, value: Mapping[str, Any] | None = None, timeout: float | None = None) -> dict[str, Any]:
        return self._client._connect_call(method, target, value, timeout)

    def status(self, *, timeout: float | None = None) -> dict[str, Any]:
        return self._call("GET", "/clervo/status", timeout=timeout)

    def catalog(self, *, timeout: float | None = None) -> dict[str, Any]:
        return self._call("GET", "/clervo/catalog", timeout=timeout)

    def quote(self, *, product_id: str, body: Mapping[str, Any], idempotency_key: str | None = None, timeout: float | None = None) -> dict[str, Any]:
        return self._call("POST", "/clervo/quote", {"productId": product_id, "body": dict(body), **({} if idempotency_key is None else {"idempotencyKey": idempotency_key})}, timeout)

    def execute(self, *, product_id: str, body: Mapping[str, Any], idempotency_key: str | None = None, paid: bool = False, timeout: float | None = None) -> dict[str, Any]:
        return self._call("POST", "/clervo/execute", {"productId": product_id, "body": dict(body), "paid": paid, **({} if idempotency_key is None else {"idempotencyKey": idempotency_key})}, timeout)

    def reconcile(self, *, timeout: float | None = None) -> dict[str, Any]:
        return self._call("POST", "/clervo/reconcile", {}, timeout)

    def usage(self, *, timeout: float | None = None) -> dict[str, Any]:
        return self._call("GET", "/clervo/usage", timeout=timeout)

    def limits(self, *, timeout: float | None = None) -> dict[str, Any]:
        return self._call("GET", "/clervo/limits", timeout=timeout)

    def set_limits(self, *, per_operation_atomic: str | None = None, daily_atomic: str | None = None, timeout: float | None = None) -> dict[str, Any]:
        return self._call("POST", "/clervo/limits", {**({} if per_operation_atomic is None else {"perOperationAtomic": per_operation_atomic}), **({} if daily_atomic is None else {"dailyAtomic": daily_atomic})}, timeout)

    def doctor(self, *, timeout: float | None = None) -> dict[str, Any]:
        return self._call("GET", "/clervo/doctor", timeout=timeout)

    def create_wallet(self, *, timeout: float | None = None) -> dict[str, Any]:
        return self._call("POST", "/clervo/wallet/create", {}, timeout)

    def backup_wallet(self, *, confirm_secret_exposure: bool = False, timeout: float | None = None) -> dict[str, Any]:
        return self._call("POST", "/clervo/wallet/backup", {"confirm": confirm_secret_exposure}, timeout)

    def restore_wallet(self, *, recovery_phrase: str, timeout: float | None = None) -> dict[str, Any]:
        return self._call("POST", "/clervo/wallet/restore", {"recoveryPhrase": recovery_phrase}, timeout)


class _Ai:
    def __init__(self, client: Clervo) -> None:
        self._client = client

    def execute(
        self,
        *,
        model: str,
        input: Mapping[str, Any],
        maximum_output_tokens: int | None = None,
        maximum_reasoning_tokens: int | None = None,
        idempotency_key: str | None = None,
        payment_signature: str | None = None,
        payment_authorization: str | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        if not isinstance(model, str) or not 1 <= len(model) <= 160 or not isinstance(input, Mapping):
            raise TypeError("invalid_ai_request")
        if payment_signature is not None and payment_authorization is not None:
            raise TypeError("ambiguous_ai_payment_authorization")
        key = idempotency_key or f"clervo_{uuid.uuid4()}"
        if re.fullmatch(r"[\x21-\x7e]{8,128}", key) is None:
            raise TypeError("invalid_idempotency_key")
        body = {
            "model": model,
            "input": dict(input),
            **({} if maximum_output_tokens is None else {"maximumOutputTokens": maximum_output_tokens}),
            **({} if maximum_reasoning_tokens is None else {"maximumReasoningTokens": maximum_reasoning_tokens}),
        }
        if self._client._auto_pay:
            kind = input.get("kind")
            product_id = {
                "embedding": "ai.embed", "image": "ai.image", "speech": "ai.speech",
                "video": "ai.video", "music": "ai.music", "virtual_try_on": "ai.virtual_try_on",
            }.get(kind, "ai.chat")
            execution = self._client.connect.execute(product_id=product_id, body=body, idempotency_key=key, timeout=timeout)
            if execution.get("status") == "payment_required":
                raise ClervoPaymentRequiredError({"code": "payment_required", "payable": True, "quote": execution.get("quote")}, None)
            outcome = execution.get("outcome")
            if not isinstance(outcome, dict) or not isinstance(outcome.get("result"), dict):
                raise ClervoProtocolError("clervo_connect_result_contract_mismatch")
            return outcome["result"]
        headers = {
            "content-type": "application/json",
            "idempotency-key": key,
            **({} if payment_signature is None else {"payment-signature": payment_signature}),
            **({} if payment_authorization is None else {"authorization": payment_authorization}),
        }
        value = self._client._json_call("POST", "/v1/ai/execute", headers, body, timeout)
        free = value.get("fundingMode") == "free" and value.get("state") == "COMPLETED" and "receipt" not in value
        paid = value.get("fundingMode") == "paid" and value.get("state") == "RECEIPTED" and isinstance(value.get("receipt"), dict)
        if (
            value.get("contractVersion") != CLERVO_CONTRACT_VERSION
            or value.get("operation") != "ai.execute"
            or not isinstance(value.get("operationId"), str)
            or not isinstance(value.get("exactModelId"), str)
            or not isinstance(value.get("result"), dict)
            or not (free or paid)
        ):
            raise ClervoProtocolError("clervo_ai_result_contract_mismatch")
        return value

class Clervo:
    def __init__(
        self,
        *,
        base_url: str = "https://api.clervo.dev",
        transport: Transport | None = None,
        timeout: float = 30.0,
        max_response_bytes: int = 2_097_152,
        connect_url: str | None = None,
        auto_pay: bool = False,
    ) -> None:
        self._base_url = _base_url(base_url)
        self._transport = transport or _urllib_transport
        if not callable(self._transport):
            raise TypeError("invalid_clervo_transport")
        if not isinstance(timeout, (int, float)) or isinstance(timeout, bool) or timeout <= 0:
            raise TypeError("invalid_clervo_timeout")
        if (
            isinstance(max_response_bytes, bool)
            or not isinstance(max_response_bytes, int)
            or not 1_024 <= max_response_bytes <= 16_777_216
        ):
            raise TypeError("invalid_clervo_response_limit")
        self._timeout = float(timeout)
        self._max_response_bytes = max_response_bytes
        if not isinstance(auto_pay, bool):
            raise TypeError("invalid_clervo_auto_pay")
        if auto_pay and connect_url is None:
            raise TypeError("clervo_auto_pay_requires_local_connect")
        self._connect_url = None if connect_url is None else _base_url(connect_url)
        self._auto_pay = auto_pay
        self.search = _Search(self)
        self.models = _Models(self)
        self.ai = _Ai(self)
        self.connect = _Connect(self)

    def _connect_call(
        self,
        method: str,
        target: str,
        body_value: Mapping[str, Any] | None,
        timeout: float | None,
    ) -> dict[str, Any]:
        if self._connect_url is None:
            raise TypeError("clervo_connect_not_enabled")
        request_timeout = self._timeout if timeout is None else timeout
        body = b"" if body_value is None else json.dumps(body_value, separators=(",", ":")).encode("utf-8")
        response = self._transport(method, f"{self._connect_url}{target}", {"accept": "application/json", "content-type": "application/json", "user-agent": "clervo-sdk/0.4.2", "x-clervo-surface": "python"}, body, float(request_timeout), self._max_response_bytes)
        value = _json_object(response.body)
        if not 200 <= response.status < 300:
            raise ClervoProblemError(response.status, value.get("error", value) if isinstance(value, dict) else value)
        return value

    def _json_call(
        self,
        method: str,
        target: str,
        extra_headers: Mapping[str, str],
        body_value: Mapping[str, Any] | None,
        timeout: float | None,
    ) -> dict[str, Any]:
        request_timeout = self._timeout if timeout is None else timeout
        if not isinstance(request_timeout, (int, float)) or isinstance(request_timeout, bool) or request_timeout <= 0:
            raise TypeError("invalid_clervo_timeout")
        headers = {
            "accept": "application/json, application/problem+json",
            "user-agent": "clervo-sdk/0.4.2",
            "x-clervo-client": "clervo-sdk/0.4.2",
            **dict(extra_headers),
        }
        body = b"" if body_value is None else json.dumps(body_value, separators=(",", ":")).encode("utf-8")
        try:
            response = self._transport(method, f"{self._base_url}{target}", headers, body, float(request_timeout), self._max_response_bytes)
        except (ClervoProtocolError, ClervoTransportError):
            raise
        except Exception as error:
            raise ClervoTransportError("clervo_transport_failed") from error
        if len(response.body) > self._max_response_bytes:
            raise ClervoProtocolError("clervo_response_too_large")
        normalized_headers = {key.lower(): item for key, item in response.headers.items()}
        value = _json_object(response.body)
        if response.status == 402:
            raise ClervoPaymentRequiredError(value, normalized_headers.get("payment-required"))
        if not 200 <= response.status < 300:
            raise ClervoProblemError(response.status, value)
        return value

    def _execute(
        self,
        product_id: str,
        query: str,
        max_results: int | None,
        language: str | None,
        region: str | None,
        idempotency_key: str | None,
        mode: str,
        timeout: float | None,
    ) -> dict[str, Any]:
        if mode not in {"preview", "challenge"}:
            raise TypeError("invalid_clervo_execution_mode")
        if idempotency_key is not None and (
            not isinstance(idempotency_key, str)
            or re.fullmatch(r"[\x21-\x7e]{8,128}", idempotency_key) is None
        ):
            raise TypeError("invalid_idempotency_key")
        request_timeout = self._timeout if timeout is None else timeout
        if (
            not isinstance(request_timeout, (int, float))
            or isinstance(request_timeout, bool)
            or request_timeout <= 0
        ):
            raise TypeError("invalid_clervo_timeout")
        request_value = _request_body(product_id, query, max_results, language, region)
        if self._connect_url is not None and product_id == "search.web" and (mode == "preview" or self._auto_pay):
            execution = self.connect.execute(
                product_id=product_id,
                body=request_value,
                idempotency_key=idempotency_key,
                paid=mode == "challenge",
                timeout=timeout,
            )
            if execution.get("status") == "payment_required":
                raise ClervoPaymentRequiredError({"code": "payment_required", "payable": True, "quote": execution.get("quote")}, None)
            outcome = execution.get("outcome")
            if not isinstance(outcome, dict) or not isinstance(outcome.get("result"), dict):
                raise ClervoProtocolError("clervo_connect_result_contract_mismatch")
            return _result(outcome["result"], product_id, "free" if mode == "preview" else "paid")
        target = "/v1/search/free" if mode == "preview" else "/v1/search/paid"
        funding_mode = "free" if mode == "preview" else "paid"
        body = json.dumps(
            request_value,
            separators=(",", ":"),
        ).encode("utf-8")
        headers = {
            "accept": "application/json, application/problem+json",
            "content-type": "application/json",
            "idempotency-key": idempotency_key or f"clervo_{uuid.uuid4()}",
            "user-agent": "clervo-sdk/0.4.2",
            "x-clervo-client": "clervo-sdk/0.4.2",
        }
        try:
            response = self._transport(
                "POST",
                f"{self._base_url}{target}",
                headers,
                body,
                float(request_timeout),
                self._max_response_bytes,
            )
        except (ClervoProtocolError, ClervoTransportError):
            raise
        except Exception as error:
            raise ClervoTransportError("clervo_transport_failed") from error
        if len(response.body) > self._max_response_bytes:
            raise ClervoProtocolError("clervo_response_too_large")
        normalized_headers = {key.lower(): item for key, item in response.headers.items()}
        content_type = normalized_headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if content_type and content_type not in {"application/json", "application/problem+json"}:
            raise ClervoProtocolError("clervo_response_unsupported_media_type")
        value = _json_object(response.body)
        if response.status == 402:
            raise ClervoPaymentRequiredError(value, normalized_headers.get("payment-required"))
        if not 200 <= response.status < 300:
            raise ClervoProblemError(response.status, value)
        return _result(value, product_id, funding_mode)
