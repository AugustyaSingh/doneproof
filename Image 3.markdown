---
name: Deterministic Monochrome
colors:
  surface: '#121316'
  surface-dim: '#121316'
  surface-bright: '#38393c'
  surface-container-lowest: '#0d0e11'
  surface-container-low: '#1b1b1f'
  surface-container: '#1f1f23'
  surface-container-high: '#292a2d'
  surface-container-highest: '#343538'
  on-surface: '#e3e2e6'
  on-surface-variant: '#c4c7c9'
  inverse-surface: '#e3e2e6'
  inverse-on-surface: '#303034'
  outline: '#8e9193'
  outline-variant: '#444749'
  surface-tint: '#c5c6c8'
  primary: '#ffffff'
  on-primary: '#2e3132'
  primary-container: '#e1e2e4'
  on-primary-container: '#626566'
  inverse-primary: '#5c5f60'
  secondary: '#c0c7d3'
  on-secondary: '#2a313b'
  secondary-container: '#404752'
  on-secondary-container: '#afb5c2'
  tertiary: '#ffffff'
  on-tertiary: '#362f2c'
  tertiary-container: '#ece0db'
  on-tertiary-container: '#6b635f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e2e4'
  primary-fixed-dim: '#c5c6c8'
  on-primary-fixed: '#191c1e'
  on-primary-fixed-variant: '#444749'
  secondary-fixed: '#dce3f0'
  secondary-fixed-dim: '#c0c7d3'
  on-secondary-fixed: '#151c25'
  on-secondary-fixed-variant: '#404752'
  tertiary-fixed: '#ece0db'
  tertiary-fixed-dim: '#d0c4bf'
  on-tertiary-fixed: '#201a18'
  on-tertiary-fixed-variant: '#4d4542'
  background: '#121316'
  on-background: '#e3e2e6'
  surface-variant: '#343538'
  status-verified: '#10B981'
  status-verified-bg: '#064E3B'
  status-partial: '#F59E0B'
  status-partial-bg: '#78350F'
  status-failed: '#EF4444'
  status-failed-bg: '#7F1D1D'
  code-surface: '#08090A'
  border-subtle: '#1F242D'
  border-prominent: '#2D333F'
typography:
  display-hero:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: -0.015em
  body-default:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-muted:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  mono-code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  mono-code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  badge-status:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
  table-header:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system embodies precise, zero-latency technical confidence. Tailored for engineers, QA teams, and autonomous agent overseers, the visual tone eliminates ornamental distractions in favor of high-density clarity, deterministic feedback, and razor-sharp typographic pacing.

The visual direction fuses **Minimalism** with modern **Developer Tool Brutalism**:
- Deep monochromatic surfaces defined by subtle 1px structural dividing lines rather than artificial depth.
- Razor-sharp, clinical precision reminiscent of modern engineering command centers (Linear, GitHub CLI, Raycast).
- High-contrast, unambiguous chromatic accents strictly reserved for terminal states: `VERIFIED`, `PARTIAL`, and `FAILED`.
- Dense, monospace-led evidence inspection with immediate visual legibility for structured JSON schemas and cryptographic proof logs.

## Colors

The palette operates under a dark-first, pure-utility model where 90% of the visual field remains neutral and desaturated, allowing critical verification telemetry to command instant focus.

### Chromatic Roles
- **Primary (`#F3F4F6`)**: High-contrast foreground white for core metrics, primary headings, terminal outputs, and interactive affirmative triggers.
- **Secondary (`#9CA3AF`)**: Balanced slate gray for secondary labels, metadata keys, breadcrumbs, and inactive controls.
- **Neutral (`#0D0E11`)**: Deep obsidian base canvas ensuring pitch-black terminal depth while preventing stark eye strain.

### State & Telemetry Tokens
- `status-verified` (`#10B981`) paired with `status-verified-bg` (`#064E3B`): Applied exclusively to affirmative validations, passing test suites, and verified claims.
- `status-partial` (`#F59E0B`) paired with `status-partial-bg` (`#78350F`): Warns of soft-passes, missing optional evidence, or non-deterministic assertions.
- `status-failed` (`#EF4444`) paired with `status-failed-bg` (`#7F1D1D`): Pinpoints contract violations, schema errors, and assertion failures.
- `code-surface` (`#08090A`): Recessed pure-black containers for raw JSON ingest, stack traces, and evidence logs.

## Typography

The type system creates an immediate dichotomy between human-readable dashboard navigation (`Geist`) and system-generated machine artifacts (`JetBrains Mono`).

### Hierarchy & Usage
- **Geist (Proportional)**: Drives application chrome, modal headers, layout sections, and claim summaries. Tight letter-spacing ensures a compact, engineered structure.
- **JetBrains Mono (Monospaced)**: Serves all data tables, key-value inspector panels, verification logs, JSON payloads, and status indicators. Tabular numerals are mandatory across all figures to prevent jitter during real-time verifications.
- **Transformations**: `badge-status` and `table-header` must always be rendered in uppercase with positive letter spacing (`0.04em`–`0.06em`) for terminal-grade readability.

## Layout & Spacing

The dashboard relies on a rigorous 12-column fluid grid system bounded by a max-width container of `1280px` to guarantee optimal scanning speeds for wide logs and diff tables.

### Layout Mechanics
- **Grid Architecture**: 12 columns with `1.5rem` gutters on desktop (`≥1024px`), compressing into a 6-column grid on tablet (`≥640px`), and a single column stacked layout on mobile.
- **Section Hierarchy**:
  - Top: Fixed `56px` global telemetry header containing system state, time-to-verify latency counter, and run actions.
  - Left / Upper Column (4 cols desktop): Payload ingestion dock housing the raw JSON editor and drag-drop upload zone.
  - Right / Main Column (8 cols desktop): Primary evidence table, status banner, and the "Claim vs. Reality" verification matrix.
- **Spacing Scale Rules**: Internal component gaps default strictly to `space-sm` (8px) or `space-md` (12px) to maintain developer CLI density. Structural section dividers use `space-xl` (32px).

## Elevation & Depth

This system intentionally rejects skeuomorphic drop shadows, blurred gradients, and ambient lighting in favor of **low-contrast outlines** and **monochrome surface stacking**.

### Surface Structure
- **Level 0 (Canvas Base)**: `#0D0E11` – Base application backdrop.
- **Level 1 (Card & Panel Surfaces)**: `#13151A` – Primary containers, tables, and ingestion cards bounded by a 1px border of `border-subtle` (`#1F242D`).
- **Level 2 (Recessed Terminals & Editors)**: `#08090A` – Code blocks, JSON text areas, and evidence inspection trays sunk 1px into Level 1 panels.
- **Level 3 (Overlays & Drawers)**: `#171A21` – Slide-over assertion drawers and command palettes with a crisp border of `border-prominent` (`#2D333F`).

### Outlines Over Elevation
Interactive elements (hover states, selected table rows) receive zero Y-axis shadow displacement. Depth feedback is delivered strictly via border color shifts (`#1F242D` → `#2D333F` → `#9CA3AF`) and subtle inline contrast fills.

## Shapes

The interface embraces a crisp, semi-sharp mechanical geometry using **Level 1 (Soft)** roundedness:

- **Interactive Core (Inputs, Buttons, Badges)**: Bound to `0.25rem` (4px). Preserves terminal-like boxiness without harsh raw brutalism.
- **Structural Cards & Panels**: Bound to `0.5rem` (8px / `rounded-lg`) to gently delineate cards and modular inspection zones.
- **Modal Viewports & Code Wrappers**: Bound to `0.75rem` (12px / `rounded-xl`).
- **Dividers & Table Separators**: Clean 1px solid lines spanning 100% of available width with square edge terminations.

## Components

### Buttons & Action Controls
- **Primary CTA**: Background `#F3F4F6`, text `#0D0E11`, font `Geist Medium`, padding `6px 14px`, radius `4px`. Hover triggers transition to `#FFFFFF` with no shadow.
- **Secondary / Action Ghost**: Background transparent, border `1px solid #1F242D`, text `#F3F4F6`. Hover triggers background `#171A21` and border `#2D333F`.
- **Keyboard Shortcut Tokens**: Monospace indicators styled inside buttons with background `#13151A`, text `#9CA3AF`, border `1px solid #2D333F`, padding `1px 4px`, font size `10px`.

### Status Badges
Badges are compact, fixed-height (`22px`), uppercase monospace chips:
- **`VERIFIED`**: Border `1px solid rgba(16, 185, 129, 0.35)`, background `rgba(6, 78, 59, 0.4)`, text `#10B981`. Prepended with `●` (ascii dot) or checkmark icon.
- **`PARTIAL`**: Border `1px solid rgba(245, 158, 11, 0.35)`, background `rgba(120, 53, 15, 0.4)`, text `#F59E0B`. Prepended with `▲` icon.
- **`FAILED`**: Border `1px solid rgba(239, 68, 68, 0.35)`, background `rgba(127, 29, 29, 0.4)`, text `#EF4444`. Prepended with `✕` icon.

### Raw JSON Input Card
- Sunk within `#08090A` with a 1px border of `#1F242D`.
- Features a pinned micro-header bar with file title (`task.json`), payload size counter, and a "Format / Paste" macro button.
- Code area uses `JetBrains Mono 13px`, syntax-highlighted monochrome tones with soft accents for invalid JSON syntax.

### Evidence & Verification Tables
- **Header Row**: Height `32px`, background `#0D0E11`, text `#9CA3AF`, uppercase monospace `11px`, border bottom `1px solid #1F242D`.
- **Rows**: Height `44px`, alternated with subtle hover background `#15181F`, border bottom `1px solid #171A21`.
- **Columns**: Check Index (`#`), Claim Description (`Geist 13px`), Target Assert (`JetBrains Mono 12px`), Result Badge, and Drill-down Action (`Inspect`).

### Claim vs. Reality Differential Card
- Two-column split card comparing `agent_claim` alongside runtime execution truth.
- Left column (Agent Claim) in neutral slate (`#9CA3AF`).
- Right column (Evidence Reality) framed with a left indicator border colored according to validation outcome (Green, Amber, or Red).

### Loading Indicator
- CLI-inspired pulsing status bar or minimalist indeterminate ASCII spinner (`/`, `-`, `\`, `|`) paired with precise latency telemetry (`Verifying: 412ms...`).