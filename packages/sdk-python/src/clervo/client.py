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
CLERVO_RELEASE_CANDIDATE_ID = "clervo-private-core-2026-08-02.1"
CLERVO_RELEASE_CANDIDATE_INTERFACE_HASH = (
    "sha256:3a230339f444960f70c69e67c0b32dc600e7af8d7ae6c61101ee82226e536768"
)


class ClervoError(Exception):
    """Base exception for the Clervo client."""


class ClervoTransportError(ClervoError):
    """The request could not reach the configured Clervo endpoint."""


class ClervoProtocolError(ClervoError):
    """The endpoint returned bytes that do not satisfy the frozen contract."""


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
        "synthesize": product_id == "search.answer",
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

    def answer(
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
            "search.answer",
            query,
            max_results,
            language,
            region,
            idempotency_key,
            mode,
            timeout,
        )


class Clervo:
    def __init__(
        self,
        *,
        base_url: str,
        transport: Transport | None = None,
        timeout: float = 30.0,
        max_response_bytes: int = 2_097_152,
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
        self.search = _Search(self)

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
        target = "/v1/search/free" if mode == "preview" else "/v1/search/paid"
        funding_mode = "free" if mode == "preview" else "paid"
        body = json.dumps(
            _request_body(product_id, query, max_results, language, region),
            separators=(",", ":"),
        ).encode("utf-8")
        headers = {
            "accept": "application/json, application/problem+json",
            "content-type": "application/json",
            "idempotency-key": idempotency_key or f"clervo_{uuid.uuid4()}",
            "x-clervo-client": "clervo-sdk/0.2.0",
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
