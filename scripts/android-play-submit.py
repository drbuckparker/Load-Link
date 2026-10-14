#!/usr/bin/env python3
"""Assign the Play service account to com.loadlink.app, then submit one Android build.

The build is already on EAS. This script never starts a new build and never
submits to the production or open-testing tracks.
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

BUILD_ID = "557f42d2-ef15-4b88-8d7e-7eb1f251a4d4"
# Filled in after the first successful schedule. Empty means "submit if needed".
SUBMISSION_ID = "66535480-da89-4ff9-ad95-006bc75d3ead"
ACCOUNT = "load-link"
PROJECT = "@load-link/loadlink"
PACKAGE = "com.loadlink.app"
EXPECTED_VERSION = "1.0.8"
EXPECTED_VERSION_CODE = "18"
INTERVAL_SECONDS = 180
MAX_CHECKS = 1 if os.environ.get("EAS_WATCH_ONCE") == "1" else 28

SAFE_KEY_FIELDS = "id clientEmail createdAt"


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def redact(text: str) -> str:
    text = re.sub(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
        "[redacted private key]",
        text,
    )
    text = re.sub(r'"keyJson"\s*:\s*"(?:\\.|[^"\\])*"', '"keyJson":"[redacted]"', text)
    text = re.sub(r'"private_key"\s*:\s*"(?:\\.|[^"\\])*"', '"private_key":"[redacted]"', text)
    return text


def require_submit_profile() -> None:
    with open("eas.json", encoding="utf-8") as handle:
        profile = json.load(handle)["submit"]["production"]["android"]
    track = profile.get("track")
    release_status = profile.get("releaseStatus")
    changes = profile.get("changesNotSentForReview")
    print(
        f"SUBMIT_PROFILE track={track} releaseStatus={release_status} "
        f"changesNotSentForReview={changes}",
        flush=True,
    )
    if track != "internal" or release_status != "draft" or changes is not True:
        print("REFUSING_SUBMIT profile is not internal draft", flush=True)
        sys.exit(1)


def graphql(query: str, variables: dict) -> dict:
    if not os.environ.get("EXPO_TOKEN"):
        print("EXPO_TOKEN missing", flush=True)
        sys.exit(1)
    result = subprocess.run(
        [
            "node",
            "-e",
            """
            const fs = require("fs");
            const payload = JSON.parse(fs.readFileSync(0, "utf8"));
            fetch("https://api.expo.dev/graphql", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: "Bearer " + process.env.EXPO_TOKEN,
                "user-agent": "node-fetch/2.7.0",
              },
              body: JSON.stringify(payload),
            }).then(async (res) => {
              const text = await res.text();
              if (!res.ok) {
                process.stderr.write("GRAPHQL_HTTP " + res.status + " " + text.slice(0, 400));
                process.exit(2);
              }
              process.stdout.write(text);
            }).catch((err) => {
              process.stderr.write(String(err));
              process.exit(2);
            });
            """,
        ],
        input=json.dumps({"query": query, "variables": variables}),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(redact((result.stderr or result.stdout or "graphql failed")[:500]), flush=True)
        sys.exit(1)
    payload = json.loads(result.stdout)
    errors = payload.get("errors") or []
    if errors:
        messages = "; ".join(redact(str(item.get("message", item))) for item in errors)
        print(f"GRAPHQL_ERROR {messages}", flush=True)
        sys.exit(1)
    return payload["data"]


def list_credentials() -> tuple[list[dict], list[dict]]:
    data = graphql(
        f"""
        query($accountName: String!, $fullName: String!) {{
          account {{
            byName(accountName: $accountName) {{
              id
              googleServiceAccountKeysPaginated(first: 20) {{
                pageInfo {{ hasNextPage }}
                edges {{ node {{ {SAFE_KEY_FIELDS} }} }}
              }}
            }}
          }}
          app {{
            byFullName(fullName: $fullName) {{
              id
              androidAppCredentials {{
                id
                applicationIdentifier
                isLegacy
                googleServiceAccountKeyForSubmissions {{ {SAFE_KEY_FIELDS} }}
                googleServiceAccountKeyForFcmV1 {{ {SAFE_KEY_FIELDS} }}
              }}
            }}
          }}
        }}
        """,
        {"accountName": ACCOUNT, "fullName": PROJECT},
    )
    account = data["account"]["byName"]
    page = account["googleServiceAccountKeysPaginated"]
    if page["pageInfo"]["hasNextPage"]:
        print("REFUSING_ASSIGN more than one page of service account keys", flush=True)
        sys.exit(1)
    keys = [edge["node"] for edge in page["edges"]]
    credentials = [
        item
        for item in data["app"]["byFullName"]["androidAppCredentials"]
        if item.get("applicationIdentifier") == PACKAGE
    ]
    print(f"SERVICE_ACCOUNT_KEYS {len(keys)}", flush=True)
    for key in keys:
        print(f"KEY id={key['id']} email={key['clientEmail']}", flush=True)
    print(f"ANDROID_CREDENTIALS {len(credentials)}", flush=True)
    for item in credentials:
        assigned = item.get("googleServiceAccountKeyForSubmissions")
        fcm = item.get("googleServiceAccountKeyForFcmV1")
        print(
            f"CRED id={item['id']} legacy={item['isLegacy']} "
            f"submissionsKey={assigned['id'] if assigned else 'none'} "
            f"fcmKey={fcm['id'] if fcm else 'none'}",
            flush=True,
        )
    return keys, credentials


def assign_key(keys: list[dict], credentials: list[dict]) -> None:
    if len(credentials) != 1:
        print("REFUSING_ASSIGN expected exactly one credential for the package", flush=True)
        sys.exit(1)
    credential = credentials[0]
    assigned = credential.get("googleServiceAccountKeyForSubmissions")
    if assigned:
        print(f"KEY_ALREADY_ASSIGNED id={assigned['id']}", flush=True)
        return
    play_keys = [key for key in keys if "firebase-adminsdk" not in key["clientEmail"]]
    firebase_keys = [key for key in keys if "firebase-adminsdk" in key["clientEmail"]]
    if len(play_keys) != 1 or len(play_keys) + len(firebase_keys) != len(keys):
        print("REFUSING_ASSIGN could not identify the Play submission key", flush=True)
        sys.exit(1)
    key = play_keys[0]
    print(f"CHOSE_PLAY_KEY id={key['id']} email={key['clientEmail']}", flush=True)
    graphql(
        f"""
        mutation($androidAppCredentialsId: ID!, $googleServiceAccountKeyId: ID!) {{
          androidAppCredentials {{
            setGoogleServiceAccountKeyForSubmissions(
              id: $androidAppCredentialsId
              googleServiceAccountKeyId: $googleServiceAccountKeyId
            ) {{
              id
              googleServiceAccountKeyForSubmissions {{ {SAFE_KEY_FIELDS} }}
            }}
          }}
        }}
        """,
        {
            "androidAppCredentialsId": credential["id"],
            "googleServiceAccountKeyId": key["id"],
        },
    )
    print(f"KEY_ASSIGNED id={key['id']} email={key['clientEmail']}", flush=True)


def eas_json(args: list[str]) -> dict:
    result = subprocess.run(
        ["eas", *args, "--json"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(f"COMMAND_FAILED {' '.join(args)} exit={result.returncode}", flush=True)
        detail = redact((result.stderr or "") + "\n" + (result.stdout or ""))
        print(detail.strip()[-2000:], flush=True)
        return {}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"JSON_PARSE_FAILED {' '.join(args)}", flush=True)
        print(redact(result.stdout)[-2000:], flush=True)
        return {}


def status_of(payload: dict) -> str:
    return str(payload.get("status") or "").upper()


def error_text(payload: dict) -> str:
    error = payload.get("error")
    if not error:
        return ""
    if isinstance(error, str):
        return redact(error)
    if isinstance(error, dict):
        parts = [error.get("errorCode"), error.get("message")]
        return redact(" ".join(str(part) for part in parts if part))
    return redact(str(error))


def print_build(build: dict) -> str:
    build_status = status_of(build)
    print(f"BUILD_STATUS {build_status}", flush=True)
    print(f"BUILD_VERSION {build.get('appVersion', '')}", flush=True)
    print(f"BUILD_NUMBER {build.get('appBuildVersion', '')}", flush=True)
    print(f"BUILD_PLATFORM {build.get('platform', '')}", flush=True)
    commit = build.get("gitCommitHash") or ""
    if commit:
        print(f"BUILD_COMMIT {commit}", flush=True)
    build_error = error_text(build)
    if build_error:
        print(f"BUILD_ERROR {build_error}", flush=True)
    return build_status


def build_is_expected(build: dict) -> bool:
    version = str(build.get("appVersion") or "")
    code = str(build.get("appBuildVersion") or "")
    platform = str(build.get("platform") or "").upper()
    if version != EXPECTED_VERSION or code != EXPECTED_VERSION_CODE or platform != "ANDROID":
        print(
            f"REFUSING_SUBMIT expected Android {EXPECTED_VERSION} ({EXPECTED_VERSION_CODE})",
            flush=True,
        )
        return False
    return True


def schedule_submit() -> str:
    print(f"SCHEDULING_SUBMIT {BUILD_ID} {now()}", flush=True)
    result = subprocess.run(
        [
            "eas",
            "submit",
            "-p",
            "android",
            "--id",
            BUILD_ID,
            "--profile",
            "production",
            "--non-interactive",
            "--no-wait",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    output = redact((result.stdout or "") + "\n" + (result.stderr or ""))
    print(output.strip()[-4000:], flush=True)
    if result.returncode != 0:
        print("SUBMIT_COMMAND_FAILED", flush=True)
        sys.exit(1)
    match = re.search(
        r"submissions/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
        output,
        re.I,
    )
    if not match:
        print("SUBMISSION_ID_NOT_FOUND", flush=True)
        sys.exit(1)
    submission_id = match.group(1)
    print(f"SUBMISSION_ID {submission_id}", flush=True)
    return submission_id


def dump_submission_logs() -> None:
    data = graphql(
        """
        query($submissionId: ID!) {
          submissions {
            byId(submissionId: $submissionId) {
              id
              status
              logFiles
            }
          }
        }
        """,
        {"submissionId": SUBMISSION_ID},
    )
    logs = data["submissions"]["byId"].get("logFiles") or []
    print(f"LOG_FILES {len(logs)}", flush=True)
    for index, url in enumerate(logs):
        result = subprocess.run(
            [
                "node",
                "-e",
                """
                const url = process.argv[1];
                fetch(url, { headers: { "user-agent": "node-fetch/2.7.0" } })
                  .then(async (res) => {
                    const text = await res.text();
                    if (!res.ok) {
                      process.stderr.write("LOG_HTTP " + res.status);
                      process.exit(2);
                    }
                    process.stdout.write(text);
                  })
                  .catch((err) => {
                    process.stderr.write(String(err));
                    process.exit(2);
                  });
                """,
                url,
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            print(f"LOG_FETCH_FAILED {index} {redact(result.stderr)[:200]}", flush=True)
            continue
        lines = redact(result.stdout).splitlines()
        needles = (
            "error",
            "google api",
            "version code",
            "certificate",
            "permission",
            "forbidden",
            "track",
            "supply",
            "rejected",
        )
        interesting = [line for line in lines if any(needle in line.lower() for needle in needles)]
        print(f"----- log {index} interesting -----", flush=True)
        print("\n".join(interesting[-60:]), flush=True)
        print(f"----- log {index} tail -----", flush=True)
        print("\n".join(lines[-30:]), flush=True)


def print_submission(submission: dict) -> str:
    submission_status = status_of(submission)
    print(f"SUBMISSION_STATUS {submission_status}", flush=True)
    for key in ("track", "releaseStatus", "changesNotSentForReview"):
        if key in submission:
            print(f"SUBMISSION_{key} {submission[key]}", flush=True)
    config = submission.get("config") or submission.get("androidConfig") or {}
    if isinstance(config, dict):
        for key in ("track", "releaseStatus", "changesNotSentForReview"):
            if key in config:
                print(f"SUBMISSION_CONFIG_{key} {config[key]}", flush=True)
    submission_error = error_text(submission)
    if submission_error:
        print(f"SUBMISSION_ERROR {submission_error}", flush=True)
    return submission_status


def main() -> int:
    require_submit_profile()
    keys, credentials = list_credentials()
    assign_key(keys, credentials)
    build = eas_json(["build:view", BUILD_ID])
    build_status = print_build(build)
    if not build or not build_is_expected(build):
        return 1
    if build_status in {"ERRORED", "CANCELED", "CANCELLED"}:
        print("BUILD_FAILED", flush=True)
        return 1
    submission_id = SUBMISSION_ID
    if submission_id and "android-resubmit" in os.environ.get("GITHUB_REF", ""):
        existing = eas_json(["submit:view", submission_id])
        existing_status = status_of(existing)
        print(f"PREVIOUS_SUBMISSION_STATUS {existing_status}", flush=True)
        if existing_status == "ERRORED":
            print("RESUBMITTING_EXISTING_BUILD", flush=True)
            submission_id = schedule_submit()
        else:
            print("NOT_RESUBMITTING", flush=True)
    if not submission_id:
        if build_status == "FINISHED":
            submission_id = schedule_submit()
        elif build_status in {"IN_QUEUE", "IN_PROGRESS", "NEW", "PENDING"}:
            submission_id = schedule_submit()
        else:
            print(f"UNEXPECTED_BUILD_STATUS {build_status}", flush=True)
            return 1
    for attempt in range(1, MAX_CHECKS + 1):
        print(f"===== check {attempt} {now()} =====", flush=True)
        build = eas_json(["build:view", BUILD_ID])
        submission = eas_json(["submit:view", submission_id])
        build_status = print_build(build)
        submission_status = print_submission(submission)
        if build_status in {"ERRORED", "CANCELED", "CANCELLED"}:
            print("BUILD_FAILED", flush=True)
            return 1
        if submission_status in {"ERRORED", "CANCELED", "CANCELLED"}:
            print("SUBMISSION_FAILED", flush=True)
            dump_submission_logs()
            return 1
        if build_status == "FINISHED" and submission_status == "FINISHED":
            print("ANDROID_INTERNAL_DRAFT_SUBMITTED", flush=True)
            return 0
        if attempt == MAX_CHECKS:
            break
        print(f"still waiting; next check in {INTERVAL_SECONDS}s", flush=True)
        time.sleep(INTERVAL_SECONDS)
    print("STILL_WAITING", flush=True)
    return 0 if os.environ.get("EAS_WATCH_ONCE") == "1" else 1


if __name__ == "__main__":
    sys.exit(main())
