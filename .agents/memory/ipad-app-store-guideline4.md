---
name: iPad Guideline 4 (phone-first Expo app)
description: How to resolve Apple "content cut off / crowded on iPad" rejections for a portrait phone-first Expo app without a per-screen responsive refactor.
---

# Apple Guideline 4 (Design) — iPad layout rejection for a phone-first Expo app

Apple can reject "content cut off / crowded on iPad" **even when the app is iPhone-only** (`ios.supportsTablet: false`). Being iPhone-only is NOT a reliable way past this review.

**The fix that works (low-risk, no 25-screen refactor):**
1. `app.json` → `ios.supportsTablet: true` + `ios.requireFullScreen: true`, keep `orientation: "portrait"`. `requireFullScreen` opts the iPad app out of Split View/Slide Over — the narrow multitasking columns are where phone-first fixed-width content gets crowded/cut off, and a reviewer dragging the app into a split column is a common trigger.
2. Root navigator wrapper (`app/_layout.tsx`): wrap the `<Stack>` in a centered `maxWidth` container (~520px) that only activates when `useWindowDimensions().width > 520`. Below that, return the original `<Stack>` unchanged → **zero iPhone regression**. On iPad the proven phone layout is centered with dark-background gutters.

**Why this is safe / why modals are fine:**
- React Navigation screens + modal *presentations* render inside the navigator tree → constrained by the 520 frame automatically.
- React Native `<Modal>` components render in a **separate full-screen native layer** (NOT constrained by the wrapper). That's fine because their content already caps at `maxWidth` or uses `Dimensions.width - margin` centered → never cut off on iPad.

**Watch out for:** any *inline* (non-`<Modal>`) absolutely-positioned overlay that sizes via `Dimensions.get('window').width` — that would overflow the 520 frame. In LoadLink all such overlays were inside real `<Modal>`s, so none needed patching.

**App Review note to include:** state that iPad is a full-screen portrait experience by design (`requireFullScreen`) to prevent multitasking layout truncation.

**Caveat:** `supportsTablet: true` means App Store Connect expects iPad screenshots/metadata — ensure submission assets are complete.
