# LoadLink Design Assets & Style Guide

This document defines every visual element of the LoadLink app — colors, fonts, spacing, component styles, and status indicators. Use this to replicate the exact look and feel in the mobile app.

---

## 1. DESIGN PHILOSOPHY

**"Industrial Modern"** — A dark, high-contrast interface inspired by construction sites and heavy equipment. Clean lines, bold colors, and functional typography prioritize readability in bright outdoor conditions (job sites, truck cabs).

---

## 2. COLOR SYSTEM

All colors use HSL format. The app is **dark-mode only**.

### Core Palette

| Token | HSL | Hex (approx) | Usage |
|-------|-----|---------------|-------|
| **background** | `220 15% 10%` | `#161a22` | Page backgrounds — "Deep Asphalt" |
| **foreground** | `220 10% 95%` | `#f0f1f3` | Primary text — "Concrete White" |
| **card** | `220 15% 14%` | `#1e2330` | Card/panel backgrounds — "Lighter Asphalt" |
| **card-foreground** | `220 10% 95%` | `#f0f1f3` | Text on cards |
| **popover** | `220 15% 12%` | `#1a1e29` | Dropdown/modal backgrounds |
| **popover-foreground** | `220 10% 95%` | `#f0f1f3` | Text in popovers |
| **primary** | `36 100% 50%` | `#FF9900` | Primary actions — "Safety Orange" |
| **primary-foreground** | `220 15% 10%` | `#161a22` | Text on primary buttons (dark) |
| **secondary** | `220 10% 25%` | `#383c44` | Secondary elements — "Steel Grey" |
| **secondary-foreground** | `220 10% 95%` | `#f0f1f3` | Text on secondary elements |
| **muted** | `220 10% 20%` | `#2e3139` | Subdued backgrounds |
| **muted-foreground** | `220 10% 70%` | `#a6aab2` | Subdued text, labels |
| **accent** | `36 100% 50%` | `#FF9900` | Same as primary (accent highlights) |
| **accent-foreground** | `220 15% 10%` | `#161a22` | Text on accent elements |
| **destructive** | `0 85% 60%` | `#ef4444` | Delete/error actions |
| **destructive-foreground** | `0 0% 100%` | `#ffffff` | Text on destructive buttons |
| **border** | `220 10% 25%` | `#383c44` | Borders and dividers |
| **input** | `220 10% 25%` | `#383c44` | Input field borders |
| **ring** | `36 100% 50%` | `#FF9900` | Focus ring (Safety Orange) |

### Hardcoded Colors Used Throughout

| Color | Hex | Usage |
|-------|-----|-------|
| Safety Orange | `#FF5722` | Map routes, pins, highlighted elements |
| Deep Asphalt | `#1a1a2e` | Alternate dark backgrounds (modals, map) |
| Amber/Warning | `#FF9900` | Warnings, pending states |

### Status Colors (Tailwind Classes)

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| Available / Active / Online | `bg-green-500/20` | `text-green-400` | `border-green-500/30` |
| Pending / Warning | `bg-orange-500/20` or `bg-amber-500/20` | `text-orange-400` or `text-amber-400` | `border-orange-500/30` |
| Error / Rejected / Offline | `bg-red-500/20` | `text-red-400` | `border-red-500/30` |
| Info / Multi-day | `bg-blue-500/20` | `text-blue-400` | `border-blue-500/30` |
| Approved | `bg-green-600` (solid) | `text-white` | — |

### Opacity Patterns
- Glass panels: `bg-card/80` with `backdrop-blur-md`
- Subtle borders: `border-white/5` or `border-white/10`
- Selected items: `bg-primary/15` (orange tint)
- Text selection: `bg-primary/30`

---

## 3. TYPOGRAPHY

### Font Families

| Role | Font | Weights | Google Fonts URL |
|------|------|---------|------------------|
| **Headings** (display) | Chakra Petch | 400, 500, 600, 700 | `family=Chakra+Petch:wght@400;500;600;700` |
| **Body** (sans) | Inter | 300, 400, 500, 600, 700 | `family=Inter:wght@300;400;500;600;700` |

### Heading Style
- Font: Chakra Petch
- Tracking: tight (`letter-spacing: -0.025em`)
- Transform: UPPERCASE
- This gives headings an industrial, mechanical feel

### Body Style
- Font: Inter
- Antialiased rendering
- Standard letter spacing

### Mobile Font Equivalents
- **Chakra Petch**: Available on Google Fonts — can be bundled with the app
- **Inter**: Available as a system font on iOS 17+ or can be bundled

---

## 4. BORDER RADIUS

| Token | Value |
|-------|-------|
| `--radius` (base) | `0.5rem` (8px) |
| `--radius-sm` | `0.2rem` (3.2px) |
| `--radius-md` | `0.4rem` (6.4px) |
| `--radius-lg` | `0.6rem` (9.6px) |

Used for: buttons, cards, inputs, badges, modals

---

## 5. COMPONENT STYLES

### Glass Panels (Sidebar, Header, Bottom Nav)
```css
background: hsl(220 15% 14% / 0.8);  /* card at 80% opacity */
backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.05);
```

### Cards
```css
background: hsl(220 15% 14%);  /* card color */
border: 1px solid hsl(220 10% 25%);  /* border color */
border-radius: 0.5rem;
```

### Buttons
- **Primary**: `bg-primary text-primary-foreground` (orange background, dark text)
- **Secondary**: `bg-secondary text-secondary-foreground` (steel grey background, light text)
- **Destructive**: `bg-destructive text-destructive-foreground` (red background, white text)
- **Outline**: Transparent background, border matches variant color
- **Ghost**: Transparent background, no border, text-only

### Input Fields
```css
background: transparent;
border: 1px solid hsl(220 10% 25%);  /* input color */
border-radius: 0.4rem;
color: hsl(220 10% 95%);  /* foreground */
```
- Focus: Orange ring (`ring: hsl(36 100% 50%)`)

### Badges
- Small, rounded, semi-transparent backgrounds
- Pattern: `bg-{color}-500/20 text-{color}-400 border-{color}-500/30`
- Used for job status, truck type, driver status

### Modals/Dialogs
```css
background: hsl(220 15% 14%);  /* card color */
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 0.6rem;
max-height: 90vh;
overflow-y: auto;
```

---

## 6. LAYOUT STRUCTURE

### Desktop (Web)
```
┌─────────────────────────────────────────┐
│  Sidebar (64px wide, glass panel)       │
│  ┌──────────────────────────────────┐   │
│  │  Logo                            │   │
│  │  Nav Items (icons + labels)      │   │
│  │  ...                             │   │
│  │  User Profile / Logout           │   │
│  └──────────────────────────────────┘   │
│           Main Content Area              │
└─────────────────────────────────────────┘
```

### Mobile (Web — and model for native)
```
┌─────────────────────┐
│  Top Bar (64px)      │  ← Glass panel, logo + hamburger
│                      │
│  Main Content        │
│                      │
│                      │
│                      │
│  Bottom Nav (64px)   │  ← Glass panel, 4-5 icons
└─────────────────────┘
```

### Mobile Navigation
- Bottom tab bar with icon + label for each section
- Glass-morphism background (`bg-card/80 backdrop-blur-lg`)
- Active tab: orange icon + text
- Inactive tab: muted grey icon + text
- Top bar: logo on left, notification bell on right

---

## 7. JOB TYPE BADGES

| Job Type | Label | Badge Style |
|----------|-------|-------------|
| `single_load` | "Single Load / Partial Day" | `bg-green-500/20 text-green-400 border-green-500/30` |
| `full_day` | "Full Day Job" | `bg-amber-500/20 text-amber-400 border-amber-500/30` |
| `multi_day` (estimatedDays > 1) | "Multi-Day Job" | `bg-blue-500/20 text-blue-400 border-blue-500/30` |
| `multi_day` (estimatedDays ≤ 1) | "Full Day Job" | Same as full_day |

---

## 8. JOB STATUS BADGES

| Status | Badge Style |
|--------|-------------|
| `open` | Orange/amber badge |
| `pending` | Orange/amber badge |
| `accepted` | Green badge |
| `in_progress` | Blue badge |
| `completed` | Green solid badge |
| `cancelled` | Red badge |

---

## 9. DRIVER STATUS INDICATORS

| Status | Dot Color | Text Color |
|--------|-----------|------------|
| Online | `bg-green-500` | `text-green-400` |
| In Transit | `bg-green-500` | `text-green-400` |
| On Job | `bg-green-500` | `text-green-400` |
| Unavailable | `bg-red-500` | `text-red-400` |
| Offline | `bg-red-500` | `text-red-400` |
| Available | `bg-green-500` | `text-green-400` |

---

## 10. MAP STYLING

### Google Maps Dark Theme
The Fleet Map uses a custom dark style that matches the app:
```json
[
  { "elementType": "geometry", "stylers": [{ "color": "#1a1a2e" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#1a1a2e" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#1a1a2e" }] }
]
```

### Route Lines
- Color: `#FF5722` (Safety Orange)
- Stroke width: 4px

### Driver Markers
- Use Safety Orange as the pin/marker color
- Active drivers: solid orange
- Inactive drivers: grey or dimmed

---

## 11. SPECIAL EFFECTS

### Text Glow
Used sparingly for emphasis (e.g., earnings, important numbers):
```css
text-shadow: 0 0 20px rgba(255, 165, 0, 0.3);
```

### Industrial Grid Background
Subtle grid pattern on some pages:
```css
background-image: 
  linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
background-size: 40px 40px;
```

---

## 12. ICON LIBRARY

The web app uses **Lucide React** icons throughout. For the mobile app:
- iOS: Use SF Symbols as equivalents where possible
- Android: Use Material Icons or bundle Lucide icons

### Common Icons Used
| Feature | Icon |
|---------|------|
| Dashboard | `LayoutDashboard` |
| Jobs / Loads | `Truck` |
| Messages | `MessageSquare` |
| Calendar | `Calendar` |
| Settings | `Settings` |
| Notifications | `Bell` |
| Map | `Map` |
| Search | `Search` |
| Filter | `Filter` |
| Navigation | `Navigation` |
| Clock (timer) | `Clock` |
| Dollar (earnings) | `DollarSign` |
| User/Profile | `User` |
| Company | `Building2` |
| Phone | `Phone` |
| Location | `MapPin` |
| Check/Approve | `Check` |
| X/Reject | `X` |
| Star (favorite) | `Star` |
| Camera (photos) | `Camera` |
| File (documents) | `FileText` |

---

## 13. SPACING & SIZING CONVENTIONS

### Padding
- Cards: `p-4` (16px) or `p-6` (24px)
- Buttons: `px-4 py-2` (16px horizontal, 8px vertical)
- List items: `p-3` (12px) or `p-4` (16px)
- Modal content: `p-6` (24px)

### Gaps
- Between cards: `gap-4` (16px)
- Between form fields: `gap-4` (16px)
- Between sections: `gap-6` (24px) or `gap-8` (32px)
- Between inline elements: `gap-2` (8px) or `gap-3` (12px)

### Sizing
- Top bar height: `h-16` (64px)
- Bottom nav height: `h-16` (64px)
- Sidebar width: `w-64` (256px)
- Avatar/profile images: `w-10 h-10` (40px) or `w-12 h-12` (48px)
- Status dots: `w-3 h-3` (12px)

---

## 14. ANIMATION & TRANSITIONS

### Transitions
- Background color: `transition: background-color 0.15s ease`
- General hover: `transition: all 0.2s ease`
- Keep animations subtle and fast — this is a work tool, not a consumer app

### Loading States
- Skeleton loaders with muted background pulse
- Spinner for async operations

---

## 15. MOBILE-SPECIFIC DESIGN NOTES

### Safe Areas
- Respect iOS safe areas (notch, home indicator)
- Bottom nav should sit above the home indicator
- Top bar should extend behind the status bar with proper insets

### Touch Targets
- Minimum tap target: 44x44 points (Apple HIG)
- Buttons and interactive elements should be comfortable to tap with gloves (construction workers)

### Outdoor Readability
- High contrast is critical — workers use this in direct sunlight
- The dark theme with bright orange accents is intentionally chosen for visibility
- Avoid light greys or low-contrast text

### Haptic Feedback
Consider adding haptic feedback for:
- Job acceptance
- Clock in / Clock out
- Completing a stop
- Receiving a notification
