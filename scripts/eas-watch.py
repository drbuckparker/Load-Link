#!/usr/bin/env python3
"""Poll the 1.0.8 iOS build until TestFlight shows it as processing or valid."""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

BUILD_ID = "ee7b0628-e0b7-48c9-bac6-ad1bb9921aa3"
SUBMISSION_ID = "0707fc81-cdbe-4f7b-ba96-0fd74705be05"
TARGET_VERSION = "1.0.8"
TARGET_BUILD = "26"
WANTED = {"PROCESSING", "VALID"}
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
    if result.returncode != 0:
        print(f"COMMAND_FAILED {' '.join(args)} exit={result.returncode}", flush=True)
        if result.stderr.strip():
            print(result.stderr.strip()[-2000:], flush=True)
        if result.stdout.strip():
            print(result.stdout.strip()[-2000:], flush=True)
        return {}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"JSON_PARSE_FAILED {' '.join(args)}", flush=True)
        print(result.stdout[-2000:], flush=True)
        return {}


def status_of(payload: dict) -> str:
    return str(payload.get("status") or "").upper()


def error_text(payload: dict) -> str:
    error = payload.get("error")
    if not error:
        return ""
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        parts = [error.get("errorCode"), error.get("message")]
        return " ".join(str(part) for part in parts if part)
    return str(error)


def testflight_hits(store: dict) -> list[dict]:
    builds = ((store.get("ios") or {}).get("testFlightBuilds")) or []
    return [
        build
        for build in builds
        if str(build.get("appVersion")) == TARGET_VERSION
        and str(build.get("buildNumber")) == TARGET_BUILD
    ]


def main() -> int:
    for attempt in range(1, MAX_CHECKS + 1):
        print(f"===== check {attempt} {now()} =====", flush=True)
        build = eas_json(["build:view", BUILD_ID])
        submission = eas_json(["submit:view", SUBMISSION_ID])
        store = eas_json(["submit:status", "-p", "ios"])
        build_status = status_of(build)
        submission_status = status_of(submission)
        print(f"BUILD_STATUS {build_status}", flush=True)
        print(f"BUILD_NUMBER {build.get('appBuildVersion', '')}", flush=True)
        print(f"BUILD_VERSION {build.get('appVersion', '')}", flush=True)
        build_error = error_text(build)
        if build_error:
            print(f"BUILD_ERROR {build_error}", flush=True)
        print(f"SUBMISSION_STATUS {submission_status}", flush=True)
        submission_error = error_text(submission)
        if submission_error:
            print(f"SUBMISSION_ERROR {submission_error}", flush=True)
        hits = testflight_hits(store)
        if not hits:
            print("TESTFLIGHT_108_26 ABSENT", flush=True)
        for hit in hits:
            processing = str(hit.get("processingState") or "")
            print(
                "TESTFLIGHT_108_26 "
                f"processing={processing} "
                f"internal={hit.get('internalState')} "
                f"external={hit.get('externalState')} "
                f"uploaded={hit.get('uploadedDate')}",
                flush=True,
            )
            if processing.upper() in WANTED:
                print(f"TESTFLIGHT_READY {processing.upper()}", flush=True)
                return 0
        if build_status in {"ERRORED", "CANCELED", "CANCELLED"}:
            print("BUILD_FAILED", flush=True)
            return 1
        if submission_status in {"ERRORED", "CANCELED", "CANCELLED"}:
            print("SUBMISSION_FAILED", flush=True)
            return 1
        if attempt == MAX_CHECKS:
            break
        print(f"still waiting; next check in {INTERVAL_SECONDS}s", flush=True)
        time.sleep(INTERVAL_SECONDS)
    print("NOT_IN_TESTFLIGHT_YET", flush=True)
    return 0 if os.environ.get("EAS_WATCH_ONCE") == "1" else 1


if __name__ == "__main__":
    sys.exit(main())
