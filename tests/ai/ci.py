#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CASES = {
    "guard": ("guard-harness.html", "FRAME_GUARD_TEST_PASS", None),
    "ui": ("ui-harness.html", "FRAME_UI_E2E_PASS", 10000),
    "executor": ("executor-harness.html", "FRAME_EXECUTOR_E2E_PASS", 5000),
}


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


def assert_runner() -> None:
    expected = os.environ.get("FRAME_EXPECTED_RUNNER", "").strip()
    actual = os.environ.get("RUNNER_NAME", "").strip()
    if expected and actual != expected:
        raise RuntimeError(f"Wrong runner: expected {expected}, got {actual or 'unknown'}")


def auth_headers() -> dict[str, str]:
    token = load_machine_env("FRAME_AI_TOKEN")
    if not token:
        raise RuntimeError("FRAME_AI_TOKEN is missing from Machine environment")
    return {"Authorization": f"Bearer {token}"}


def health() -> None:
    base = os.environ.get("FRAME_AI_URL", "http://127.0.0.1:8787").rstrip("/")
    request = urllib.request.Request(base + "/health", headers=auth_headers(), method="GET")
    with urllib.request.urlopen(request, timeout=15) as response:
        data = json.loads(response.read().decode("utf-8-sig"))
    if not data.get("ok"):
        raise RuntimeError(f"FRAME AI health is not OK: {data}")
    print(json.dumps(data, ensure_ascii=False, separators=(",", ":")))


def contract() -> None:
    source = (ROOT / "ai-guard.js").read_text(encoding="utf-8-sig")
    required = (
        "deterministicAddWork",
        "type:'add_work'",
        "qty:quantity",
        "price:unitPrice",
        "total",
        "frameReconcileRecentUserStatements",
        "context_scope:'all_objects_with_active_target'",
        "нов[a-zа-яё0-9_]*\\s+объект",
    )
    missing = [needle for needle in required if needle not in source]
    if missing:
        raise RuntimeError("AI guard contract missing: " + ", ".join(missing))
    safety = (ROOT / "ai-safety.js").read_text(encoding="utf-8-sig")
    app = (ROOT / "app.js").read_text(encoding="utf-8-sig")
    chat = (ROOT / "ai-chat.js").read_text(encoding="utf-8-sig")
    safety_required = (
        "FIELD_PATH='/frame-field'",
        "configuredFieldSafe()?'field_safe'",
        "fieldSafeHealthVerified",
        "state:'displayed'",
        "current.state='authorized'",
        "event.isTrusted",
        "bindDisplayedDraftApply",
        "d?.type!=='brain_batch'",
        "targetLabel||''",
        "consumedDrafts.add(id)",
        "expose('aiConsumeDraftAuthorization',consumeDraftAuthorization)",
        "expose('aiConsumeAuthorizedDraft',consumeAuthorizedDraft)",
        "sanitizeAuditEntries",
        "writable:false,configurable:false",
    )
    missing = [needle for needle in safety_required if needle not in safety]
    if missing:
        raise RuntimeError("AI safety contract missing: " + ", ".join(missing))
    for start, end in (("async function applyBrainDraft", "async function applyAiDraft"), ("async function applyAiDraft", "async function undoBrainBatch")):
        segment = app[app.index(start):app.index(end)]
        consume = segment.find("aiConsumeAuthorizedDraft")
        first_await = segment.find("await ")
        if consume < 0 or first_await < 0 or consume > first_await:
            raise RuntimeError(f"AI authorization is not consumed synchronously at {start}")
    durable_patterns = ("storageGet(FRAME_CHAT_", "storageSet(FRAME_CHAT_")
    if any(pattern in chat for pattern in durable_patterns):
        raise RuntimeError("AI chat session state still uses durable storage")
    test_transcript_required = (
        "FRAME_TEST_TRANSCRIPT_KEY='frameAiTestTranscriptV278'",
        "FRAME_RETIRED_TEST_TRANSCRIPT_KEYS=['frameAiTestTranscriptV277']",
        "function frameTestActionsFromDraft",
        "function frameTestMessageProjection",
        "function frameBuildTestTrace",
        "function frameStartTestTranscript",
        "function frameStopTestTranscript",
        "function frameClearTestTranscript",
        "function frameTranscriptPayload",
        "function frameExportTestTranscript",
        "frameTestTranscriptSync(item)",
    )
    missing = [needle for needle in test_transcript_required if needle not in chat]
    if missing:
        raise RuntimeError("Explicit test-transcript contract missing: " + ", ".join(missing))
    start_segment = chat[chat.index("function frameStartTestTranscript"):chat.index("function frameStopTestTranscript")]
    if "frameChatMessages()" in start_segment:
        raise RuntimeError("Starting or resuming a test transcript can backfill pre-consent chat")
    projection = chat[chat.index("function frameTestMessageProjection"):chat.index("function frameTestTranscriptRead")]
    if "message.draft" in projection or "authorization" in projection.lower():
        raise RuntimeError("Executable draft data can reach the test transcript")
    if "aiServerToken" in projection or "aiServerUrl" in projection:
        raise RuntimeError("FRAME credentials can reach the test transcript")
    if "data-chat-authorization" in chat or "aiAuthorizeDisplayedDraft" in chat:
        raise RuntimeError("AI Apply authorization leaked into chat DOM/global flow")
    raw_utterance_patterns = ("text:d.text", "${d.text}", "utterance:d.")
    if any(pattern in app for pattern in raw_utterance_patterns):
        raise RuntimeError("Raw AI utterance still reaches durable app records")
    if "retireAiLogRawUtterances();" not in app or "aiSanitizeAuditEntries" not in app:
        raise RuntimeError("Legacy AI audit raw-text retirement is missing")
    init_segment = app[app.index("async function init()"):]
    if init_segment.index("retireAiLogRawUtterances();") > init_segment.index("await openDB()"):
        raise RuntimeError("Legacy raw AI audit is not scrubbed before IndexedDB startup")
    if "provider:d.provider" in app or "model:d.model" in app or "summary:d.summary" in app:
        raise RuntimeError("Provider-controlled text still reaches durable AI audit")
    if "const base=aiServerUrl(),token=aiServerToken(),current=" not in app or "{base,token}" not in app:
        raise RuntimeError("AI health/analyze requests are not bound to a URL/token snapshot")
    if "function frameLeaveAi()" not in chat or "typeof frameLeaveAi==='function'" not in app:
        raise RuntimeError("AI route does not tear down voice/wake state")
    index = (ROOT / "index.html").read_text(encoding="utf-8-sig")
    worker = (ROOT / "sw.js").read_text(encoding="utf-8-sig")
    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8-sig"))
    if manifest.get("start_url") != "./index.html?v=275":
        raise RuntimeError("FRAME PWA start_url identity changed; keep the installed-app identity stable")
    app_version_match = re.search(r"const VERSION='(\d+)\.(\d+)\.(\d+)'", app)
    cache_version_match = re.search(r"const CACHE='frame-v(\d+)-field-safe'", worker)
    build_version_match = re.search(r'<meta name="frame-version" content="(\d+)\.(\d+)\.(\d+)">', index)
    title_version_match = re.search(r'<title>FRAME (\d+)\.(\d+)\.(\d+) ', index)
    if not all((app_version_match, cache_version_match, build_version_match, title_version_match)):
        raise RuntimeError("FRAME version markers are incomplete")
    app_version = tuple(app_version_match.groups())
    app_cache_version = ''.join(app_version)
    if app_version != tuple(build_version_match.groups()) or app_version != tuple(title_version_match.groups()):
        raise RuntimeError("FRAME app, title, and build versions disagree")
    if cache_version_match.group(1) != app_cache_version:
        raise RuntimeError("FRAME service-worker cache version disagrees with app version")
    production_scripts = re.findall(r'(?:ai-safety|app|ai-chat|ai-guard)\.js\?v=(\d+)', index)
    worker_scripts = re.findall(r"(?:ai-safety|app|ai-chat|ai-guard)\.js\?v=(\d+)", worker)
    if len(production_scripts) != 4 or set(production_scripts) != {app_cache_version}:
        raise RuntimeError("FRAME index script versions disagree with app version")
    if len(worker_scripts) != 4 or set(worker_scripts) != {app_cache_version}:
        raise RuntimeError("FRAME service-worker script versions disagree with app version")
    if f"navigator.serviceWorker.register('./sw.js?v={app_cache_version}'" not in app:
        raise RuntimeError("FRAME service-worker registration version disagrees with app version")
    print("FRAME AI guard contract PASS")


def find_edge() -> Path:
    candidates = (
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    )
    for path in candidates:
        if path.exists():
            return path
    discovered = shutil.which("msedge.exe") or shutil.which("msedge")
    if discovered:
        return Path(discovered)
    raise RuntimeError("Microsoft Edge not found on FRAME-BACKEND-PC")


def browser(case: str) -> None:
    if case not in CASES:
        raise RuntimeError(f"Unknown browser case: {case}")
    file_name, marker, virtual_time = CASES[case]
    harness = (ROOT / "tests" / "ai" / file_name).resolve()
    edge = find_edge()
    with tempfile.TemporaryDirectory(prefix=f"frame-edge-{case}-") as profile:
        args = [
            str(edge),
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--disable-default-apps",
            "--allow-file-access-from-files",
            f"--user-data-dir={profile}",
        ]
        if virtual_time:
            args.append(f"--virtual-time-budget={virtual_time}")
        args.extend(["--dump-dom", harness.as_uri()])
        completed = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=75,
            check=False,
        )
    stdout = completed.stdout.decode("utf-8", errors="replace")
    stderr = completed.stderr.decode("utf-8", errors="replace")
    print(f"Edge: {edge}")
    print(f"Harness: {harness}")
    print(f"Edge exit code: {completed.returncode}")
    if stderr.strip():
        print("Edge stderr:")
        print(stderr)
    match = re.search(r"""<pre\s+id=["']result["'][^>]*>([\s\S]*?)</pre>""", stdout, re.IGNORECASE)
    rendered = match.group(1).strip() if match else ""
    if completed.returncode != 0 or rendered != marker or "_FAIL" in rendered:
        print("Edge DOM output:")
        print(stdout)
        raise RuntimeError(f"FRAME {case} browser harness failed: rendered={rendered!r}")
    print(f"FRAME {case} browser harness PASS")


def publish_status() -> None:
    token = os.environ.get("GH_TOKEN", "").strip()
    repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if not token or not repository:
        raise RuntimeError("GH_TOKEN or GITHUB_REPOSITORY is missing")
    job_status = os.environ.get("FRAME_CI_JOB_STATUS", "unknown").strip().lower()
    payload = {
        "schema_version": "1.0",
        "workflow": "FRAME AI Tests",
        "implementation": "python",
        "run_id": os.environ.get("GITHUB_RUN_ID", ""),
        "runner_name": os.environ.get("RUNNER_NAME", ""),
        "commit_sha": os.environ.get("GITHUB_SHA", ""),
        "status": "DONE" if job_status == "success" else "BLOCKED",
        "job_status": job_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    repo_path = "director/status/frame-ai-tests.json"
    url = f"https://api.github.com/repos/{repository}/contents/{repo_path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "frame-ai-python-ci",
    }
    current_sha = ""
    try:
        request = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(request, timeout=30) as response:
            current_sha = str(json.loads(response.read().decode("utf-8")).get("sha") or "")
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
    body = {
        "message": "director: update FRAME AI Python test status",
        "content": base64.b64encode((json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")).decode("ascii"),
        "branch": "main",
    }
    if current_sha:
        body["sha"] = current_sha
    request = urllib.request.Request(
        url,
        data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
        headers={**headers, "Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=60):
        pass
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("health")
    sub.add_parser("contract")
    sub.add_parser("status")
    browser_parser = sub.add_parser("browser")
    browser_parser.add_argument("case", choices=sorted(CASES))
    args = parser.parse_args()
    if args.command == "status":
        publish_status()
        return 0
    assert_runner()
    if args.command == "health":
        health()
    elif args.command == "contract":
        contract()
    else:
        browser(args.case)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FRAME AI CI FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
