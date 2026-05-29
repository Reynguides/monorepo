# UI design direction

Reyn aims for an "advanced RPG / old-Blizzard companion" aesthetic — a
dense, paneled, slate-and-amber look. Not glassy Fluent / Acrylic, not
mobile-flat-material. Functional density over visual minimalism, with
the screen real estate filled by data once a session has happened.

## Palette

| Role | Dark theme | Light theme |
|------|-----------|-------------|
| Background | `#0F0F14` charcoal | `#FBF4E1` parchment |
| Surface | `#15151B` slate | `#F5EBD0` parchment-2 |
| Elevated surface | `#1B1B22` | `#EFE0BD` |
| Input background | `#222230` | `#E5D3A6` |
| Divider | `#3A3A4A` | `#B59465` |
| Text primary | `#E6E6F0` cream | `#2A1F0E` ink |
| Text secondary | `#B4B4C7` | `#5A4622` |
| Text tertiary | `#6C6C82` | `#8E764A` |
| Accent (primary) | `#E2A537` amber | `#B1812B` deep amber |
| Danger | `#C4585F` muted red | same |
| Success | `#6BB07A` muted green | same |
| Warning | `#E6C547` muted gold | same |

## Typography

Single sans-serif family — Segoe UI (ships with Windows; zero font
asset weight). Scale via weight + size, not family.

| Style | Size | Weight | Use |
|-------|------|--------|-----|
| Display | 32 | SemiBold | Brand mark, splash card |
| Title | 22 | SemiBold | Page title row |
| Heading | 16 | SemiBold | Card title, sync badge |
| Body | 13 | Regular | Default text |
| Caption | 11 | Regular | Metadata, ticker, timestamps |

## Layout primitives

- **4-pt rhythm** — `Space1..Space10` in `Resources/Spacing.xaml`.
- **Corner radii** — `Sm=4`, `Md=8`, `Lg=14` (`Spacing.xaml`).
- **Shadows** — `Sm/Md/Lg` in `Resources/Shadows.xaml`, black with
  3 opacity steps. Cards use Sm; floating windows (splash) use Md.
- **Cards** — `StatCardStyle` + `ChartCardStyle` in `Resources/Cards.xaml`.
  Background = SurfaceBrush, 1px DividerBrush border, Md radius, Md
  padding.

## Page anatomy

Every shell page has the same layout grammar:

```text
┌─────────────────────────────────────────────────────────┐
│  Title  (32–22pt SemiBold, TextPrimary)                 │
│  Subtitle (13pt Body, TextSecondary)                    │
├─────────────────────────────────────────────────────────┤
│  Page-specific content                                  │
│  (with PageStateControl overlay when not Ready)         │
└─────────────────────────────────────────────────────────┘
```

The shell adds a 240px left nav rail + a 56px top bar with the sync
badge in the top-right.

## State pattern

`PageStateControl` is the universal Loading / Empty / Error surface:

- **Loading**: indeterminate ProgressBar (amber) + "Loading…" caption.
- **Empty**: card with "Nothing here yet" + the page subtitle +
  "Start a Baldur's Gate 3 session to see your activity appear here."
- **Error**: red-tinted card with `ErrorMessage` text.
- **Ready**: control is hidden; the page's own content takes over via
  the `ReadyStateToVisibility` converter.

## Overlay HUD

The click-through overlay is intentionally minimal — single card
bottom-right at 380×~240. Contents:
1. **Reyn** brand text top-left in amber, mm:ss session timer top-right
   in monospace.
2. Party HP rings — 4-up UniformGrid, 44px circle with HP integer
   center, name caption below, fill bar at the bottom (success green).
3. Last-3-event ticker — timestamp (caption, 64px column) + label
   (body, fills remaining).

No interaction; the whole window is `WS_EX_TRANSPARENT` so clicks pass
through to BG3.

## Sync badge

Top-right of MainShell. Compact:
- Colored dot (success green when 0 pending, warning when pending,
  danger when LastError).
- "Sync" label.
- "· N pending" caption.
Click → routes to Settings with `FocusSection="Sync"`.

## Brand voice (copy)

- Empty state copy is in-character but sparse: "Nothing here yet" /
  "Start a Baldur's Gate 3 session to see your activity appear here."
- Error copy avoids tech jargon: "Network problem. Try again."
- Auth: "Sign in" / "Create account" — not "Login" / "Register".

## Aspirational reference

The aesthetic anchors are:
- The original WoW Recount/Skada window styling (dense, paneled).
- Diablo II's character / inventory panels (warm-on-dark, gold accents).
- Modern accessible high-contrast WPF without losing the warmth.

What it isn't:
- Glassmorphism / acrylic backgrounds.
- Mobile-style cards with huge whitespace.
- Pure flat material with primary blue.
