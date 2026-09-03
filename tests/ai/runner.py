#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
SCENARIOS = ROOT / "scenarios.json"
FIXTURE = ROOT / "fixture_context.json"
BASE_URL = os.getenv("FRAME_AI_URL", "http://127.0.0.1:8787").rstrip("/")


def load_machine_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value or os.name != "nt":
        return value
    try:
        import winreg

        path = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
        access = winreg.KEY_READ | getattr(winreg, "KEY_WOW64_64KEY", 0)
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path, 0, access) as key:
            value, _ = winreg.QueryValueEx(key, name)
        return str(value).strip()
    except (ImportError, OSError):
        return ""


TOKEN = load_machine_env("FRAME_AI_TOKEN")


class TransportFailure(RuntimeError):
    """The FRAME endpoint was reachable, but a transient upstream path failed."""


def post_json(path: str, payload: Any) -> dict[str, Any]:
    if not TOKEN:
        raise RuntimeError("FRAME_AI_TOKEN is missing from Machine environment")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8", "Authorization": f"Bearer {TOKEN}"}
    transient_statuses = {429, 502, 503, 504}
    for attempt in range(1, 4):
        request = urllib.request.Request(BASE_URL + path, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = json.loads(response.read().decode("utf-8-sig"))
            if data.get("ok") is False:
                raise RuntimeError(str(data.get("message") or data.get("error") or "backend ok=false"))
            return data
        except urllib.error.HTTPError as exc:
            if exc.code not in transient_statuses:
                raise
            if attempt == 3:
                raise TransportFailure(f"HTTP {exc.code} after {attempt} attempts") from exc
            reason = f"HTTP {exc.code}"
        except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
            if attempt == 3:
                raise TransportFailure(f"network timeout after {attempt} attempts") from exc
            reason = "timeout" if isinstance(getattr(exc, "reason", exc), (TimeoutError, socket.timeout)) else "temporary network error"
        print(f"  transient {reason}, retry {attempt}/3")
        time.sleep(2 * attempt)
    raise RuntimeError("unreachable retry state")


def get_payload(data: Any) -> Any:
    if isinstance(data, dict) and data.get("result") is not None:
        return data["result"]
    return data


def collect_text(data: Any) -> str:
    data = get_payload(data)
    parts: list[str] = []
    if not isinstance(data, dict):
        return ""
    for key in ("summary", "text", "message", "answer", "error", "clarification", "claration"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value)
    if isinstance(data.get("actions"), list) and data["actions"]:
        parts.append(json.dumps(data["actions"], ensure_ascii=False, separators=(",", ":")))
    return "\n".join(parts)


def find_number_recursive(value: Any, expected: float) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return float(value) == expected
    if isinstance(value, dict):
        return any(find_number_recursive(v, expected) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(find_number_recursive(v, expected) for v in value)
    return False


def norm(value: Any) -> str:
    return str(value or "").lower().replace("ё", "е")


def check_expect(data: Any, expect: dict[str, Any]) -> list[str]:
    payload = get_payload(data)
    payload = payload if isinstance(payload, dict) else {}
    errors: list[str] = []
    text = norm(collect_text(payload))

    for value in expect.get("must_reference", []):
        if value and norm(value) not in text:
            errors.append(f"missing expected fragment: {value}")

    equivalents = [value for value in expect.get("must_reference_any", []) if value]
    if equivalents and not any(norm(value) in text for value in equivalents):
        errors.append("missing all equivalent expected fragments: " + " OR ".join(map(str, equivalents)))

    for value in expect.get("must_not_reference", []):
        if value and norm(value) in text:
            errors.append(f"forbidden fragment found: {value}")

    actions = payload.get("actions")
    actions = actions if isinstance(actions, list) else []
    if "action_required" in expect:
        if expect["action_required"] is True and not actions:
            errors.append("expected action but actions are empty")
        if expect["action_required"] is False and actions:
            errors.append("unexpected action returned")

    action_type = expect.get("action_type")
    if actions and action_type and not any(isinstance(a, dict) and a.get("type") == action_type for a in actions):
        errors.append(f"missing action type {action_type}")

    for field in ("quantity", "unit_price", "total"):
        if field in expect and actions and not find_number_recursive(actions, float(expect[field])):
            errors.append(f"numeric value not found: {field}={expect[field]}")
    return errors


def run_scenario(sc: dict[str, Any], fixture: dict[str, Any]) -> dict[str, Any]:
    conversation: list[dict[str, str]] = []
    last: dict[str, Any] = {}
    for message in sc["messages"]:
        context = copy.deepcopy(fixture)
        target = sc.get("conversation_target", fixture.get("conversation_target", ""))
        context["current_target"] = target
        context["conversation_target"] = target
        context["conversation"] = conversation
        context["conversation_rules"] = [
            "Stay on conversation_target until the user explicitly names another object.",
            "Recent user facts in conversation are newer than stored progress until actions are applied.",
            "When recent user statements conflict, the newest explicit statement is authoritative and replaces the older fact.",
            "A clear correction or negation is not ambiguous and must not trigger a clarification question.",
            "Never switch to another object/order merely because it exists in context.",
        ]
        recent_user_facts = [
            str(row.get("content", ""))
            for row in conversation
            if row.get("role") == "user" and str(row.get("content", "")).strip()
        ]
        context["recent_user_facts"] = (recent_user_facts + [str(message)])[-8:]
        # Match the browser contract: only the current utterance belongs in
        # `text`; conversation history and policy stay in structured context.
        last = post_json("/analyze", {"text": str(message), "context": context})
        conversation.append({"role": "user", "content": str(message)})
        conversation.append({"role": "assistant", "content": collect_text(last)})
    return last


def main() -> int:
    expected_runner = os.environ.get("FRAME_EXPECTED_RUNNER", "").strip()
    actual_runner = os.environ.get("RUNNER_NAME", "").strip()
    if expected_runner and actual_runner != expected_runner:
        raise RuntimeError(f"Wrong runner: expected {expected_runner}, got {actual_runner or 'unknown'}")
    suite = json.loads(SCENARIOS.read_text(encoding="utf-8-sig"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8-sig"))
    scenarios = suite.get("scenarios", [])
    passed = 0
    semantic_failures = 0
    transport_errors = 0
    infrastructure_errors = 0
    results: list[dict[str, Any]] = []
    print(f"FRAME AI Test Suite: {len(scenarios)} scenarios")
    print(f"AI Server: {BASE_URL}\n")
    for sc in scenarios:
        try:
            data = run_scenario(sc, fixture)
            errors = check_expect(data, sc.get("expect", {}))
            if errors:
                semantic_failures += 1
                results.append({"id": sc["id"], "status": "semantic_failure", "errors": errors})
                print(f"FAIL {sc['id']}")
                for error in errors:
                    print(f"  - {error}")
                print("  response: " + json.dumps(data, ensure_ascii=False, separators=(",", ":")))
            else:
                passed += 1
                results.append({"id": sc["id"], "status": "passed"})
                print(f"PASS {sc['id']}")
        except TransportFailure as exc:
            transport_errors += 1
            results.append({"id": sc["id"], "status": "transport_error", "error": str(exc)})
            print(f"ERROR {sc['id']}")
            print(f"  - provider transport: {exc}")
        except Exception as exc:
            infrastructure_errors += 1
            results.append({"id": sc["id"], "status": "infrastructure_error", "error": f"{type(exc).__name__}: {exc}"})
            print(f"ERROR {sc['id']}")
            print(f"  - {type(exc).__name__}: {exc}")
    total = len(scenarios)
    if not (semantic_failures or transport_errors or infrastructure_errors):
        status = "PASS"
        exit_code = 0
    elif transport_errors and (semantic_failures or infrastructure_errors):
        status = "MIXED_FAILURE"
        exit_code = 3
    elif transport_errors:
        status = "PROVIDER_TRANSPORT_FAILURE"
        exit_code = 2
    elif semantic_failures:
        status = "SEMANTIC_FAILURE"
        exit_code = 1
    else:
        status = "INFRASTRUCTURE_FAILURE"
        exit_code = 3
    report = {
        "schema_version": "1.0",
        "suite": suite.get("suite", "FRAME AI regression"),
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "ai_server": BASE_URL,
        "counts": {
            "total": total,
            "passed": passed,
            "semantic_failures": semantic_failures,
            "transport_errors": transport_errors,
            "infrastructure_errors": infrastructure_errors,
        },
        "results": results,
    }
    report_path = os.environ.get("FRAME_AI_REPORT", "").strip()
    if report_path:
        target = Path(report_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"\nRESULT: {passed}/{total} passed | semantic={semantic_failures} "
        f"transport={transport_errors} infrastructure={infrastructure_errors} | {status}"
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
