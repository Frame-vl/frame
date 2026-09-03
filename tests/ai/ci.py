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
        "нов\\w*\\s+объект",
    )
    missing = [needle for needle in required if needle not in source]
    if missing:
        raise RuntimeError("AI guard contract missing: " + ", ".join(missing))
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
    match = re.search(r'<pre\\s+id=["\\']result["\\'][^>]*>([\\s\\S]*?)</pre>', stdout, re.IGNORECASE)
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
