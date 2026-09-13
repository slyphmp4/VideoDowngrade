# VideoDowngrade visual direction

## Core idea

VideoDowngrade is a restrained Swiss-style desktop utility: typographic, modular, monochrome and grid-based.

The layout stays stable. The visual language evolves around a dark default theme with strong black/white inversion for interaction.

## Non-negotiable rules

1. Keep the current UI structure and element positions.
2. Use only black, white and grayscale values.
3. No colored accents.
4. No neon glow or decorative gradients.
5. The entire UI follows one 24px modular grid.
6. Motion remains subtle, continuous and functional.
7. Because dark mode is the default, primary surfaces should also be dark.
8. Surface transparency is allowed only to soften the background grid through restrained backdrop blur.

## Dark theme interaction model

- workspace: graphite / near-black
- primary panels: deeper near-black translucent surfaces
- text: white
- secondary information: neutral gray
- borders: thin gray/white rules
- primary actions: white surface with black text
- selected states: white/black inversion
- hover states: increase contrast, never add hue
- disabled states: low-contrast grayscale

This makes interactive elements readable without introducing color.

## Grid

- 24px modular grid across workspace, sidebar and panels
- spacing should snap to the same rhythm
- internal panel content aligns to the same system
- grid remains visible but subtle
- panel backdrop blur should soften the grid beneath important working surfaces rather than hide it completely

## Typography

- grotesk / neo-grotesk feeling
- hierarchy through scale, weight and inversion
- uppercase micro labels
- compact technical metadata
- confident large headings

## Components

- very small radii
- custom sliders and dropdowns stay custom
- controls should feel like instruments, not browser form widgets
- primary CTA uses white-on-dark contrast
- selected presets use inversion
- large panels may use translucent near-black fills with monochrome backdrop blur

## Motion

Motion is part of the product feel and should make state changes understandable.

Use motion for:
- initial panel entrance
- uploaded media reveal
- file metadata reveal
- hover clarification
- dropdown opening
- toast appearance
- inline errors and processing state
- preset selection
- slider movement
- progress feedback

Preferred motion language:
- 160–600 ms depending on scale
- cubic-bezier(.16, 1, .3, 1) for reveals
- small translation and opacity changes
- short blur-to-sharp transitions for newly mounted media/popup surfaces

Avoid:
- bouncy spring motion
- oversized scale effects
- decorative perpetual animation outside the subtle preview grid

Respect `prefers-reduced-motion`.

## Desktop WebView protection

Release builds should reduce casual extraction and browser-like behavior:
- disable text selection and copy/cut events
- disable image/video/icon drag extraction
- disable the context menu
- block common DevTools shortcuts
- disable Tauri WebView DevTools in the packaged window

This is deterrence and UI hardening, not cryptographic DRM. Code running on a user's own machine can still be reverse engineered by a sufficiently motivated user.

## Future additions

- custom video player controls
- before/after scrubber
- processing history archive
- frame comparison mode
