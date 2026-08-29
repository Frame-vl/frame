#!/usr/bin/env python3
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCENARIOS = ROOT / "scenarios.json"
BASE_URL = os.getenv("FRAME_AI_URL", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.getenv("FRAME_AI_TOKEN", "").strip()


def post_json(path, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(BASE_URL + path, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def norm(s):
    return str(s or "").lower().replace("ё", "е")


def collect_text(data):
    chunks = []
    if isinstance(data, dict):
        for key in ("summary", "text", "message", "answer", "error"):
            if isinstance(data.get(key), str):
                chunks.append(data[key])
        if isinstance(data.get("actions"), list):
            chunks.append(json.dumps(data["actions"], ensure_ascii=False))
    return "\n".join(chunks)


def check_expect(data, expect):
    errors = []
    text = norm(collect_text(data))
    for x in expect.get("must_reference", []):
        if norm(x) not in text:
            errors.append(f"нет ожидаемого фрагмента: {x}")
    for x in expect.get("must_not_reference", []):
        if norm(x) in text:
            errors.append(f"запрещённый фрагмент: {x}")

    actions = data.get("actions") if isinstance(data, dict) else None
    actions = actions if isinstance(actions, list) else []
    required = expect.get("action_required")
    if required is True and not actions:
        errors.append("ожидался action, но actions пуст")
    if required is False and actions:
        errors.append("не ожидался action, но actions присутствуют")

    if actions and expect.get("action_type"):
        if not any(a.get("type") == expect["action_type"] for a in actions if isinstance(a, dict)):
            errors.append(f"нет action типа {expect['action_type']}")

    for field in ("quantity", "unit_price", "total"):
        if field in expect and actions:
            values = [a.get(field) for a in actions if isinstance(a, dict)]
            if expect[field] not in values:
                errors.append(f"{field}: ожидалось {expect[field]}, получено {values}")
    return errors


def run_scenario(sc):
    conversation = []
    last = None
    for msg in sc["messages"]:
        payload = {
            "text": msg,
            "context": {
                "current_target": sc.get("conversation_target", ""),
                "conversation_target": sc.get("conversation_target", ""),
                "conversation": conversation,
                "conversation_rules": [
                    "Stay on conversation_target until the user explicitly names another object.",
                    "Recent user facts in conversation are newer than stored progress until actions are applied.",
                    "Never switch to another object/order merely because it exists in context."
                ]
            }
        }
        last = post_json("/analyze", payload)
        conversation.append({"role": "user", "content": msg})
        conversation.append({"role": "assistant", "content": collect_text(last)})
    return last or {}


def main():
    suite = json.loads(SCENARIOS.read_text(encoding="utf-8"))
    scenarios = suite.get("scenarios", [])
    passed = 0
    print(f"FRAME AI Test Suite: {len(scenarios)} сценариев\n")
    for sc in scenarios:
        try:
            data = run_scenario(sc)
            errors = check_expect(data, sc.get("expect", {}))
            if errors:
                print(f"❌ {sc['id']} - {sc['title']}")
                for e in errors:
                    print(f"   - {e}")
            else:
                passed += 1
                print(f"✅ {sc['id']} - {sc['title']}")
        except Exception as e:
            print(f"💥 {sc['id']} - {sc['title']}")
            print(f"   - {type(e).__name__}: {e}")
    total = len(scenarios)
    print(f"\nИТОГ: {passed}/{total} пройдено")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
