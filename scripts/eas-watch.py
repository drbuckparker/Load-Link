#!/usr/bin/env python3
"""Poll one EAS build and one submission until both are finished."""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

BUILD_ID = "cdad8132-db72-49f3-840d-cd68823e13a1"
SUBMISSION_ID = "da66270a-408f-46f6-b0bc-03d4914d4ac5"
TERMINAL = {"FINISHED", "ERRORED", "CANCELED", "CANCELLED"}
INTERVAL_SECONDS = 180
MAX_CHECKS = 1 if os.environ.get("EAS_WATCH_ONCE") == "1" else 30


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def eas_json(args: list[str]) -> dict:
    result = subprocess.run(
        ["eas", *args, "--json"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stderr.strip():
        print(result.stderr.strip())
    if result.returncode != 0:
        print(f"COMMAND_FAILED {' '.join(args)} exit={result.returncode}")
        print(result.stdout[-4000:])
        return {}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"JSON_PARSE_FAILED {' '.join(args)}")
        print(result.stdout[-4000:])
        return {}


def status_of(payload: dict) -> str:
    value = payload.get("status") or payload.get("state") or ""
    return str(value).upper()


def summary_lines(label: str, payload: dict) -> None:
    for key in (
        "appVersion",
        "appBuildVersion",
        "platform",
        "createdAt",
        "updatedAt",
        "completedAt",
        "queueStartedAt",
    ):
        if payload.get(key):
            print(f"{label}_{key} {payload[key]}", flush=True)


def error_text(payload: dict) -> str:
    error = payload.get("error")
    if not error:
        return ""
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        parts = [error.get("errorCode"), error.get("message"), error.get("name")]
        return " ".join(str(part) for part in parts if part)
    return str(error)


def main() -> int:
    for attempt in range(1, MAX_CHECKS + 1):
        print(f"===== check {attempt} {now()} =====", flush=True)
        build = eas_json(["build:view", BUILD_ID])
        submission = eas_json(["submit:view", SUBMISSION_ID])
        build_status = status_of(build)
        submission_status = status_of(submission)
        print(f"BUILD_STATUS {build_status}", flush=True)
        summary_lines("BUILD", build)
        build_error = error_text(build)
        if build_error:
            print(f"BUILD_ERROR {build_error}", flush=True)
        print(f"SUBMISSION_STATUS {submission_status}", flush=True)
        summary_lines("SUBMISSION", submission)
        submission_error = error_text(submission)
        if submission_error:
            print(f"SUBMISSION_ERROR {submission_error}", flush=True)
        if submission and submission_status not in TERMINAL:
            compact = json.dumps(submission, default=str)
            print(f"SUBMISSION_JSON {compact[:2500]}", flush=True)

        build_done = build_status in TERMINAL
        submission_done = submission_status in TERMINAL
        if build_done and submission_done:
            print("BOTH_TERMINAL", flush=True)
            print(f"FINAL_BUILD_STATUS {build_status}", flush=True)
            print(f"FINAL_SUBMISSION_STATUS {submission_status}", flush=True)
            return 0
        if os.environ.get("EAS_WATCH_ONCE") == "1":
            print("STILL_RUNNING", flush=True)
            return 0 if build_status or submission_status else 1
        if attempt == MAX_CHECKS:
            break
        print(f"still running; next check in {INTERVAL_SECONDS}s", flush=True)
        time.sleep(INTERVAL_SECONDS)

    print("TIMED_OUT_STILL_RUNNING", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
