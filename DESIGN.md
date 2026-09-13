# VideoDowngrade visual direction

## Core idea

VideoDowngrade should feel like a restrained Swiss editorial tool rather than a generic converter or SaaS dashboard. The interface stays technical and compact, but the visual language is based on grid discipline, typography, contrast and printed matter rather than glow, gradients and rounded cards.

## Layout rule

The current application layout is intentionally preserved:

- left navigation rail stays in place
- preview remains the dominant block
- Character presets stay directly below the preview
- manual controls remain in the right column
- existing spacing and responsive breakpoints stay close to the previous application

The redesign changes the visual system, not the information architecture.

## Palette

- shell/background: `#0B0B0B`
- editorial paper: `#EFEEE9`
- secondary paper: `#E5E4DF`
- ink: `#0B0B0B`
- primary light type: `#F7F6F2`
- muted type: `#77756F`
- Swiss grid/state accent: `#EF564D`

The red accent is intentionally rare. It is used for grid references, state, progress and small markers rather than large decorative surfaces.

## Typography

Primary stack:

`Arial, Helvetica, SF Pro Display, Segoe UI, sans-serif`

Rules:

1. Use strong grotesk weights for hierarchy.
2. Use compact uppercase metadata with modest tracking.
3. Prefer alignment and scale over decorative effects.
4. Keep technical values small and precise.
5. Avoid overly soft, friendly or rounded typography.

## Shape language

- radii: generally `0–3 px`
- borders: strict `1 px` rules
- no glassmorphism
- no neon glow
- no soft card shadows
- rectangular thumbs and controls
- black/white inversion is preferred for selected states

## Grid

The application shell may expose subtle red vertical construction lines. These are a structural reference, not decoration. UI elements themselves should align to the existing application grid and retain their current positions.

## Components

### Preview

The preview remains dark and visually dominant. Its supporting grid can use subtle red construction lines.

### Presets

Presets behave like small editorial specimens. Unselected cards are paper with black rules; selected cards invert to black with light type.

### Manual controls

The right panel is treated like a compact printed control sheet: off-white surface, black rules, red state markers, minimal rounding.

### Sliders

Thin black track, black fill and a small square red handle. No browser-native appearance.

### Dropdowns

Outlined editorial fields that invert when opened. Menus use black surfaces with strict separators.

### Process actions

Primary action is a black editorial bar. Completion state returns to paper/ink. Cancel remains dark with a red stop marker.

### Notifications

Notifications resemble a small printed label: off-white rectangle, black rule, narrow red registration bar.

## Motion

Motion stays short and functional. No bounce, floating cards or decorative spring animation. Transitions should feel closer to changing a printed state than to a mobile consumer app.

## Future evolution

- custom video-player chrome in the same Swiss system
- before/after frame comparison
- typographic waveform / histogram views
- optional visible construction-grid mode
- custom VideoDowngrade wordmark
- alternate pure black-and-white mode
