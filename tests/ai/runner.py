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
            if exc.code not in transient_statuses or attempt == 3:
                raise
            reason = f"HTTP {exc.code}"
        except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
            if attempt == 3:
                raise
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


def build_guarded_text(text: str, target: str, conversation: list[dict[str, str]]) -> str:
    lines = ["[FRAME INTERNAL CONTEXT]"]
    if target.strip():
        lines.append(f"Active object: {target}")
    lines.extend([
        "Rules:",
        "- The active object is authoritative until the user explicitly names another object.",
        "- Recent user statements are newer than stored progress until actions are applied.",
        "- If the user corrects or contradicts an earlier statement, the newest explicit statement is authoritative. Do not ask for clarification when the correction itself is clear.",
        "- Words such as no, actually, correction, not installed, not done, cancel that, and I was wrong can explicitly replace an earlier fact.",
        "- For an explicit create/add/update/delete request, return structured actions, not prose only.",
        "- For an add-work request, return an add_work action with quantity, unit price and total when they are stated.",
    ])
    recent = [m for m in conversation if m.get("role") == "user" and str(m.get("content", "")).strip()][-8:]
    if recent:
        lines.append("Recent user statements, oldest to newest:")
        lines.extend(f"- {m['content']}" for m in recent)
        lines.append("Resolve contradictions by recency: the newest explicit user statement wins.")
    lines.extend([
        "[CURRENT USER REQUEST]",
        text,
        "The current user request is the newest statement and has highest priority when it corrects earlier conversation facts.",
    ])
    return "\n".join(lines)


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
        guarded = build_guarded_text(str(message), str(target), conversation)
        last = post_json("/analyze", {"text": guarded, "context": context})
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
    print(f"FRAME AI Test Suite: {len(scenarios)} scenarios")
    print(f"AI Server: {BASE_URL}\n")
    for sc in scenarios:
        try:
            data = run_scenario(sc, fixture)
            errors = check_expect(data, sc.get("expect", {}))
            if errors:
                print(f"FAIL {sc['id']}")
                for error in errors:
                    print(f"  - {error}")
                print("  response: " + json.dumps(data, ensure_ascii=False, separators=(",", ":")))
            else:
                passed += 1
                print(f"PASS {sc['id']}")
        except Exception as exc:
            print(f"ERROR {sc['id']}")
            print(f"  - {type(exc).__name__}: {exc}")
    total = len(scenarios)
    print(f"\nRESULT: {passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
