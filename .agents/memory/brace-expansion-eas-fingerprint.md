---
name: brace-expansion blanket override breaks EAS fingerprint
description: Why a blanket brace-expansion override fails the EAS "Computing project fingerprint" step, and why blanket overrides on multi-major transitive deps are unsafe.
---

# A blanket `brace-expansion` override breaks the EAS iOS build

**Symptom:** Expo Launch / EAS build fails at `- Computing project fingerprint` with:
`✗ Failed to compute project fingerprint` / `(0 , brace_expansion_1.expand) is not a function` / `Error: build:internal command failed.`

**Root cause:** A security audit added `"brace-expansion": "^2.0.3"` to `package.json` `overrides`. But the project has THREE minimatch majors, each needing a DIFFERENT brace-expansion major:
- `minimatch@3.x` → `brace-expansion@^1.1.7`
- `minimatch@9.x` → `brace-expansion@^2.0.2`
- `minimatch@10.x` (used by `@expo/fingerprint` and `glob`) → `brace-expansion@^5.0.5`

brace-expansion 1.x/2.x export a bare function (`module.exports = expand`, NO named `.expand`). brace-expansion 5.x exports a NAMED `expand`, and minimatch 10 imports `{ expand }`. The blanket `^2.0.3` override forced minimatch 10's brace-expansion down to 2.x → `.expand` is undefined → fingerprint crashes.

A single semver value in `overrides` cannot satisfy 2.x AND 5.x consumers — that is the fundamental problem with a blanket override here.

**Fix:** REMOVE the blanket `brace-expansion` override (and the inert `@isaacs/brace-expansion` override — that scoped fork isn't installed; minimatch 10 here uses unscoped `brace-expansion@5`). Each minimatch's own dep range then resolves to a CVE-patched version automatically: 1.1.15 (≥1.1.12), 2.1.1 (≥2.0.2), 5.0.6. So removing the override fixes the build AND stays patched against the brace-expansion ReDoS advisory (fixed in 1.1.12 / 2.0.2 / 3.0.1 / 4.0.1).

**Verify before burning an EAS build:** the failing step is reproducible locally —
`node -e "require('@expo/fingerprint').createFingerprintAsync(process.cwd()).then(f=>console.log('ok',f.hash)).catch(e=>{console.error(e);process.exit(1)})"`
(it's slow; wrap in `timeout 110`). Also `npm ls brace-expansion` to confirm each major resolves to a patched version.

**General rule (same family as the xmldom-expo-prebuild lesson):** auto-generated security overrides that blanket-pin a transitive dep to ONE major silently break native builds when multiple majors of that dep legitimately coexist. Prefer letting the consumers' own ranges resolve (they usually already point at patched versions), or use version-scoped override keys (`"pkg@1": "^1.1.12"`), never a single blanket major.
