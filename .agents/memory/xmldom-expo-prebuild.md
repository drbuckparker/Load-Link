---
name: xmldom override breaks Expo iOS prebuild
description: Why an @xmldom/xmldom security override pinned to 0.9.x fails the Expo Launch / EAS iOS build, and how to pin it safely.
---

# @xmldom/xmldom override must stay on the 0.8.x line for Expo

**Symptom:** Expo Launch / EAS iOS build fails during `npx expo prebuild` with:
`TypeError: [ios.infoPlist]: withIosInfoPlistBaseMod: DOMParser.parseFromString: the provided mimeType "undefined" is not valid.`
(stack passes through `@expo/plist/build/parse.js` → `@xmldom/xmldom/lib/dom-parser.js`)

**Root cause:** A security audit added an `overrides` entry in `package.json` forcing `@xmldom/xmldom` to `^0.9.10`. In 0.9.x, `DOMParser.parseFromString` requires a valid mimeType argument, but `@expo/plist` (the lib Expo prebuild uses to read/write Info.plist) calls it WITHOUT one. Expo SDK 54's `@expo/plist@0.4.8` and `plist@3.1.0` both declare `@xmldom/xmldom: ^0.8.8` — there is NO 0.9.x-compatible plist in this SDK.

**Fix:** Pin the override (and add a matching direct dep so the lockfile re-resolves) to the latest 0.8.x — `^0.8.13`. The bash tool blocks `npm install`; use the packager tool (`installLanguagePackages` for nodejs) to install `@xmldom/xmldom@^0.8.13`, which rewrites `package-lock.json` honoring the override. Verify all consumers dedupe to 0.8.13 via `npm ls @xmldom/xmldom`.

**Why this is still secure:** All known `@xmldom/xmldom` CVEs (e.g. the multiple-root-node / misinterpretation advisories) were fixed within the 0.8.x line (≤0.8.4). 0.8.13 is the latest patched 0.8.x; npm `lts` dist-tag points at 0.8.10. So staying on 0.8.x keeps the security fixes without breaking Expo.

**General rule:** Auto-generated security overrides that bump a transitive dep to "latest" can silently break native builds. When an override touches a lib that an SDK pins to a specific major/minor (here Expo→0.8.x), constrain the override to that line, not blanket-latest.
