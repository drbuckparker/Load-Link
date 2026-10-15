#!/usr/bin/env bash
# Invoked as one line from android-emulator-runner, which otherwise starts a
# new /bin/sh for every line and drops variables between them.
set -u
export MAESTRO_CLI_NO_ANALYTICS=1

APK=$(find "$GITHUB_WORKSPACE/android/app/build/outputs/apk/release" -name '*.apk' | head -n 1)
if [ -z "${APK:-}" ]; then
  echo "No release APK found"
  exit 1
fi

echo "Installing $APK"
adb install -r "$APK"

out="$GITHUB_WORKSPACE/maestro-results"
rm -rf "$out"
mkdir -p "$out"

set +e
"$HOME/.maestro/bin/maestro" test \
  --test-output-dir "$out" \
  "$GITHUB_WORKSPACE/.maestro"
code=$?
set -e

if [ -d "$HOME/.maestro/tests" ]; then
  mkdir -p "$out/default-tests"
  cp -a "$HOME/.maestro/tests/." "$out/default-tests/" || true
fi

python3 - <<'PY'
import os
from pathlib import Path

secrets = [
    v
    for k, v in os.environ.items()
    if k.startswith("MAESTRO_") and k.endswith(("_EMAIL", "_PASSWORD")) and len(v) >= 4
]
root = Path(os.environ["GITHUB_WORKSPACE"]) / "maestro-results"
text_suffixes = {".json", ".log", ".txt", ".html", ".xml", ".yaml", ".yml"}
for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in text_suffixes:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    redacted = text
    for secret in secrets:
        redacted = redacted.replace(secret, "[REDACTED]")
    if redacted != text:
        path.write_text(redacted, encoding="utf-8")
PY

echo "Maestro exit $code"
find "$out" -type f | head -300
exit "$code"
